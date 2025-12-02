import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * 计算总token使用量
 * 优先使用新的total_tokens字段，然后计算prompt+completion，最后从metadata提取
 */
function calculateTotalTokens(result: any): number {
  // 方法1: 直接使用新的total_tokens字段（最优先）
  if (result.total_tokens && result.total_tokens > 0) {
    return result.total_tokens;
  }
  
  // 方法2: 计算prompt_tokens + completion_tokens
  const promptTokens = result.prompt_tokens || 0;
  const completionTokens = result.completion_tokens || 0;
  if (promptTokens > 0 || completionTokens > 0) {
    return promptTokens + completionTokens;
  }
  
  // 方法3: 从metadata中的token_stats提取（向后兼容）
  if (result.metadata?.token_stats?.total_tokens) {
    return result.metadata.token_stats.total_tokens;
  }
  
  return 0;
}

/**
 * 估算API调用成本（修正版）
 * 基于token使用量和实际模型成本配置计算
 */
function calculateCost(result: any, modelConfigs?: any[]): number {
  const promptTokens = result.prompt_tokens || 0;
  const completionTokens = result.completion_tokens || 0;
  
  // 🚨 修复：使用实际模型成本配置而不是硬编码费率
  if ((promptTokens > 0 || completionTokens > 0) && modelConfigs) {
    // 尝试通过model_id找到模型配置
    let modelConfig = null;
    if (result.model_id) {
      modelConfig = modelConfigs.find(m => m.id === result.model_id);
    }
    
    if (modelConfig) {
      // 使用我们修正后的成本计算逻辑：provider_*字段优先，fallback到基础成本
      const inputCostPer1k = modelConfig.provider_input_cost_per_1k_tokens ?? modelConfig.input_cost_per_1k_tokens ?? 0;
      const outputCostPer1k = modelConfig.provider_output_cost_per_1k_tokens ?? modelConfig.output_cost_per_1k_tokens ?? 0;
      
      const inputCost = (promptTokens / 1000) * inputCostPer1k;
      const outputCost = (completionTokens / 1000) * outputCostPer1k;
      
      return inputCost + outputCost;
    }
  }
  
  // 从metadata中提取成本信息（fallback）
  if (result.metadata?.token_stats?.estimated_cost) {
    return result.metadata.token_stats.estimated_cost;
  }
  
  // ⚠️ 如果没有模型配置，返回0而不是使用错误的硬编码费率
  console.warn(`⚠️ 无法计算准确成本 - 缺少模型配置信息: model_id=${result.model_id}, tokens=${promptTokens + completionTokens}`);
  return 0;
}

/**
 * 计算每秒token处理速度
 * 基于总token数和LLM响应时间
 */
function calculateTokensPerSecond(result: any): number {
  // 方法1: 使用新的字段
  const totalTokens = result.total_tokens || calculateTotalTokens(result);
  const responseTime = result.llm_response_time;
  
  if (totalTokens > 0 && responseTime > 0) {
    return Math.round((totalTokens / (responseTime / 1000)) * 100) / 100;
  }
  
  // 方法2: 从metadata中提取（向后兼容）
  if (result.metadata?.token_stats?.tokens_per_second) {
    return result.metadata.token_stats.tokens_per_second;
  }
  
  return 0;
}

/**
 * GET /api/tasks/[id]/subtasks - 获取任务的详细子任务结果
 */
export async function GET(
  request: NextRequest,
  context: Context
) {
  try {
    const { id } = await context.params;
    const supabase = createClient();
    
    // 🆕 获取查询参数，用于聚合分析筛选
    const { searchParams } = new URL(request.url);
    const modelId = searchParams.get('model_id');
    const dimensionId = searchParams.get('dimension_id');

    // 检查任务是否存在，并获取配置信息
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .select('id, name, status, config')
      .eq('id', id)
      .single();

    if (taskError) {
      if (taskError.code === 'PGRST116') {
        return NextResponse.json({ error: '任务不存在' }, { status: 404 });
      }
      return NextResponse.json({ error: '查询任务失败' }, { status: 500 });
    }

    // 🆕 检测是否为多次运行任务
    const runCount = task.config?.run_count || 1;
    const isMultiRun = runCount > 1;

    // 构建查询，支持聚合分析的筛选参数
    let query = supabase
      .from('evaluation_results')
      .select(`
        *,
        models (id, name, logical_name, provider, input_cost_per_1k_tokens, output_cost_per_1k_tokens, cost_currency, provider_input_cost_per_1k_tokens, provider_output_cost_per_1k_tokens, provider_cost_currency),
        test_cases (id, input, reference_answer, max_score),
        dimensions (id, name, description),
        evaluators (id, name, type, description)
      `)
      .eq('task_id', id);
    
    // 🆕 应用筛选条件（用于聚合分析）
    if (modelId) {
      query = query.eq('model_id', modelId);
    }
    if (dimensionId) {
      query = query.eq('dimension_id', dimensionId);
    }
    
    // 获取完整的评测结果
    const { data: results, error: resultsError } = await query
      .order('repetition_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (resultsError) {
      console.error('获取评测结果失败:', resultsError);
      return NextResponse.json({ error: '获取评测结果失败' }, { status: 500 });
    }

    // 🔧 提取模型配置信息用于准确的成本计算
    const modelConfigs = new Map();
    (results || []).forEach(result => {
      if (result.models && !modelConfigs.has(result.models.id)) {
        modelConfigs.set(result.models.id, result.models);
      }
    });
    const modelConfigsArray = Array.from(modelConfigs.values());

    // 🆕 根据是否为多次运行任务，采用不同的数据组织方式
    let subtasks: any[];

    if (isMultiRun) {
      // 多次运行：按 (model, dimension, run_index) 分组，以便计算每次运行的维度平均分
      const groupedResults = new Map<string, any[]>();

      (results || []).forEach(result => {
        const key = `${result.model_id}|${result.dimension_id}|${result.repetition_index || 1}`;
        if (!groupedResults.has(key)) {
          groupedResults.set(key, []);
        }
        groupedResults.get(key)!.push(result);
      });

      // 为每个分组创建一个聚合的子任务条目
      subtasks = Array.from(groupedResults.entries()).map(([key, runResults]) => {
        const firstResult = runResults[0];
        const [modelId, dimensionId, runIndex] = key.split('|');
        
        // 🔧 计算该次运行中维度内所有题目的加权百分制分数
        // 使用加权平均：(总得分 / 总满分) * 100，与详细结果tab保持一致
        const completedResults = runResults.filter(r => r.status === 'completed' && r.score !== null);
        const totalScore = completedResults.reduce((sum, r) => sum + (r.score || 0), 0);
        const totalMaxScore = completedResults.reduce((sum, r) => sum + (r.test_cases?.max_score || 100), 0);
        const dimensionAverage = totalMaxScore > 0
          ? Math.round((totalScore / totalMaxScore) * 100 * 10) / 10
          : null;

        // 🆕 统计信息现在表示该次运行的维度情况
        const stats = {
          dimension_average: dimensionAverage,
          test_cases_count: runResults.length, // 该维度包含的题目数
          completed_cases: completedResults.length, // 已完成的题目数
          run_index: parseInt(runIndex),
          total_cases_in_dimension: runResults.length
        };

        return {
          id: `run-${key}`, // 标识为单次运行的维度平均分
          // 基本信息
          model_name: firstResult.models?.logical_name || firstResult.models?.name || `未知模型 (${firstResult.model_id})`,
          model_provider: firstResult.models?.provider || '未知',
          dimension_name: firstResult.dimensions?.name || `未知维度 (${firstResult.dimension_id})`,
          dimension_description: firstResult.dimensions?.description || '',

          // 🆕 单次运行的维度聚合数据
          is_multi_run: false, // 每个条目代表一次运行
          run_index: parseInt(runIndex),
          
          // 该次运行的维度平均分作为主要分数
          score: dimensionAverage,
          status: completedResults.length === runResults.length ? 'completed' : 
                  completedResults.length > 0 ? 'partial' : 
                  runResults.some(r => r.status === 'running') ? 'running' : 
                  runResults.some(r => r.status === 'failed') ? 'failed' : 'pending',
          
          // 保留原始评测详情用于前端显示（修复丢失问题）
          _raw_results: runResults.map(r => ({
            id: r.id,
            test_case_id: r.test_case_id, // 🔥 添加test_case_id字段用于获取max_score
            test_case_max_score: r.test_cases?.max_score || 5, // 🔥 添加max_score字段
            test_case_input: r.test_cases?.input || '',
            model_response: r.model_response || r.response || '',
            reasoning: r.justification || r.reasoning || '',
            score: r.score,
            status: r.status,
            created_at: r.created_at,
            started_at: r.started_at,
            completed_at: r.completed_at
          })),

          // 维度详情
          dimension_stats: stats,
          test_cases_in_dimension: runResults.length,
          completed_test_cases: completedResults.length,

          // 该次运行的详细信息（保留所有测试用例的信息）
          test_case_inputs: runResults.map(r => r.test_cases?.input || '测试用例已删除'),
          model_responses: runResults.map(r => r.model_response || r.response || ''),
          individual_scores: runResults.map(r => r.score),
          reasoning_details: runResults.map(r => r.justification || r.reasoning || ''),

          // 执行信息
          created_at: firstResult.created_at,
          started_at: runResults.find(r => r.started_at)?.started_at,
          completed_at: runResults.filter(r => r.completed_at).pop()?.completed_at,

          // 聚合性能统计
          execution_time: completedResults.length > 0 ?
            Math.round(completedResults.reduce((sum, r) => sum + (r.execution_time || 0), 0) / completedResults.length) : 0,
          tokens_used: completedResults.reduce((sum, r) => sum + calculateTotalTokens(r), 0),
          cost: completedResults.reduce((sum, r) => sum + calculateCost(r, modelConfigsArray), 0),

          // 原始数据ID（用于调试）
          _result_ids: runResults.map(r => r.id),
          _model_id: firstResult.model_id,
          _dimension_id: firstResult.dimension_id,
          _run_index: parseInt(runIndex)
        };
      });

      // 🆕 重新按 (model, dimension) 分组，每组包含多次运行的维度平均分
      const groupedByModelDimension = new Map<string, any[]>();
      subtasks.forEach(subtask => {
        const key = `${subtask._model_id}|${subtask._dimension_id}`;
        if (!groupedByModelDimension.has(key)) {
          groupedByModelDimension.set(key, []);
        }
        groupedByModelDimension.get(key)!.push(subtask);
      });

      // 为每个 (model, dimension) 组合创建包含多次运行平均分的最终数据
      subtasks = Array.from(groupedByModelDimension.entries()).map(([key, runs]) => {
        runs.sort((a, b) => a.run_index - b.run_index); // 按运行次序排序
        
        const firstRun = runs[0];
        const validRuns = runs.filter(r => r.score !== null);
        
        return {
          id: `multi-${key}`, // 最终的多次运行条目ID
          // 基本信息
          model_name: firstRun.model_name,
          model_provider: firstRun.model_provider,
          dimension_name: firstRun.dimension_name,
          dimension_description: firstRun.dimension_description,

          // 🆕 多次运行特有字段
          is_multi_run: true,
          run_count: runCount,
          runs: runs.map(run => ({
            run_index: run.run_index,
            dimension_average: run.score, // 该次运行的维度平均分
            test_cases_count: run.test_cases_in_dimension,
            completed_cases: run.completed_test_cases,
            status: run.status,
            created_at: run.created_at,
            started_at: run.started_at,
            completed_at: run.completed_at,
            // 性能数据聚合
            execution_time: run.execution_time,
            tokens_used: run.tokens_used,
            cost: run.cost,
            // 详细信息（修复数据保留）
            individual_scores: run.individual_scores,
            model_responses: run.model_responses,
            reasoning_details: run.reasoning_details,
            // 原始结果保留（修复评测回复丢失）
            raw_results: run._raw_results
          })),
          
          // 跨运行统计信息
          multi_run_stats: {
            run_averages: validRuns.map(r => r.score), // 每次运行的维度平均分
            overall_average: validRuns.length > 0
              ? Math.round((validRuns.reduce((sum, r) => sum + r.score, 0) / validRuns.length) * 100) / 100
              : null,
            best_run: validRuns.length > 0 ? Math.max(...validRuns.map(r => r.score)) : null,
            worst_run: validRuns.length > 0 ? Math.min(...validRuns.map(r => r.score)) : null,
            completed_runs: validRuns.length,
            total_runs: runs.length
          },

          // 聚合状态
          status: runs.every(r => r.status === 'completed') ? 'completed' :
                  runs.some(r => r.status === 'running') ? 'running' :
                  runs.some(r => r.status === 'partial') ? 'partial' : 
                  runs.some(r => r.status === 'failed') ? 'failed' : 'pending',

          // 兼容性字段（使用总体平均分，修复精度一致性）
          score: validRuns.length > 0
            ? Math.round((validRuns.reduce((sum, r) => sum + r.score, 0) / validRuns.length) * 100) / 100
            : null,

          // 执行信息（使用最早和最晚的时间）
          created_at: runs[0]?.created_at,
          started_at: runs.find(r => r.started_at)?.started_at,
          completed_at: runs.filter(r => r.completed_at).pop()?.completed_at,

          // 聚合性能统计
          execution_time: validRuns.length > 0 ?
            Math.round(validRuns.reduce((sum, r) => sum + r.execution_time, 0) / validRuns.length) : 0,
          tokens_used: validRuns.reduce((sum, r) => sum + r.tokens_used, 0),
          cost: validRuns.reduce((sum, r) => sum + r.cost, 0),

          // 调试信息
          _model_id: firstRun._model_id,
          _dimension_id: firstRun._dimension_id,
          _total_test_cases: firstRun.test_cases_in_dimension
        };
      });
    } else {
      // 单次运行：保持原有逻辑
      subtasks = (results || []).map((result, index) => {
        return {
          id: result.id,
          // 基本信息
          model_name: result.models?.logical_name || result.models?.name || `未知模型 (${result.model_id})`,
          model_provider: result.models?.provider || '未知',
          test_case_input: result.test_cases?.input || '测试用例已删除',
          test_case_reference: result.test_cases?.reference_answer || '',
          dimension_name: result.dimensions?.name || `未知维度 (${result.dimension_id})`,
          dimension_description: result.dimensions?.description || '',
          evaluator_name: result.evaluators?.name || `未知评分器 (${result.evaluator_id})`,
          evaluator_type: result.evaluators?.type || 'unknown',

          // 🆕 单次运行标识
          is_multi_run: false,
          run_index: result.run_index || 1,

          // 执行状态
          status: result.status,

          // 评测结果
          score: result.score,
          reasoning: result.justification || result.reasoning || '',

          // 模型回复（这是用户最想看到的）
          model_response: result.model_response || result.response || '',

          // 🔥 测试用例信息（用于前端加权平均计算）
          test_case_id: result.test_case_id,  // 前端需要这个字段来获取max_score
          test_case_max_score: result.test_cases?.max_score || 100,  // 直接提供max_score

          // 执行信息
          created_at: result.created_at,
          started_at: result.started_at,
          completed_at: result.completed_at,

          // 性能统计 - 使用新字段提供完整数据
          execution_time: result.execution_time,
          tokens_used: calculateTotalTokens(result),
          cost: calculateCost(result, modelConfigsArray),

          // 新增：详细的token和性能数据
          prompt_tokens: result.prompt_tokens || 0,
          completion_tokens: result.completion_tokens || 0,
          total_tokens: result.total_tokens || calculateTotalTokens(result),
          llm_response_time: result.llm_response_time || 0,
          tokens_per_second: calculateTokensPerSecond(result),

          // 错误信息
          error_message: result.error_message,
          error_details: result.error_details,

          // 原始数据ID（用于调试）
          _result_id: result.id,
          _model_id: result.model_id,
          _test_case_id: result.test_case_id,
          _dimension_id: result.dimension_id,
          _evaluator_id: result.evaluator_id
        };
      });
    }

    // 按状态分组统计（修复状态不一致问题）
    const stats = {
      total: subtasks.length,
      completed: subtasks.filter(s => s.status === 'completed').length, // 修复: 使用'completed'而不是'success'
      failed: subtasks.filter(s => s.status === 'failed').length,
      pending: subtasks.filter(s => s.status === 'pending').length,
      running: subtasks.filter(s => s.status === 'running').length,
    };

    return NextResponse.json({
      task: {
        id: task.id,
        name: task.name,
        status: task.status,
        // 🆕 多次运行信息
        is_multi_run: isMultiRun,
        run_count: runCount
      },
      subtasks,
      stats,
      total_count: subtasks.length,
      // 🆕 多次运行元数据
      multi_run_info: isMultiRun ? {
        run_count: runCount,
        grouped_count: subtasks.length, // 分组后的条目数
        total_runs: (results || []).length // 实际的运行总数
      } : null
    });

  } catch (error) {
    console.error('获取子任务详情失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}