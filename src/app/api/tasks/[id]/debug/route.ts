import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tasks/[id]/debug - 获取任务调试信息
 */
export async function GET(
  request: NextRequest,
  context: Context
) {
  try {
    const { id } = await context.params;
    const supabase = createClient();

    // 获取任务基本信息
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (taskError) {
      if (taskError.code === 'PGRST116') {
        return NextResponse.json({ error: '任务不存在' }, { status: 404 });
      }
      return NextResponse.json({ error: '查询任务失败' }, { status: 500 });
    }

    const debugInfo: any = {
      task_basic: {
        id: task.id,
        name: task.name,
        status: task.status,
        created_at: task.created_at,
        started_at: task.started_at,
        finished_at: task.finished_at,
        updated_at: task.updated_at
      },
      configuration: task.config || {},
      validation_results: {},
      resource_status: {},
      execution_analysis: {}
    };

    // 验证任务配置
    if (task.config) {
      const config = task.config;
      
      // 检查模板
      if (config.template_id) {
        const { data: template, error: templateError } = await supabase
          .from('templates')
          .select(`
            id, name,
            template_mappings (
              id,
              dimension_id,
              evaluator_id,
              dimensions (id, name),
              evaluators (id, name, type)
            )
          `)
          .eq('id', config.template_id)
          .single();

        debugInfo.validation_results.template = {
          exists: !templateError,
          valid: !!template, // 简化验证逻辑，只要模板存在就认为有效
          dimensions_count: template?.template_mappings?.length || 0,
          error: templateError?.message
        };

        if (template) {
          debugInfo.resource_status.template = {
            id: template.id,
            name: template.name,
            mappings: template.template_mappings?.map((m: any) => ({
              dimension: { id: m.dimensions?.id, name: m.dimensions?.name },
              evaluator: { id: m.evaluators?.id, name: m.evaluators?.name, type: m.evaluators?.type }
            })) || []
          };
        }
      }

      // 检查模型
      if (config.model_ids && config.model_ids.length > 0) {
        const { data: models, error: modelsError } = await supabase
          .from('models')
          .select('id, name, provider, status')
          .in('id', config.model_ids);

        debugInfo.validation_results.models = {
          requested_count: config.model_ids.length,
          found_count: models?.length || 0,
          all_active: models?.every(m => m.status === 'active') || false,
          error: modelsError?.message
        };

        debugInfo.resource_status.models = models || [];
      }

      // 检查测试用例
      if (config.test_case_ids && config.test_case_ids.length > 0) {
        const { data: testCases, error: testCasesError } = await supabase
          .from('test_cases')
          .select('id, input, reference_answer, metadata')
          .in('id', config.test_case_ids);

        debugInfo.validation_results.test_cases = {
          requested_count: config.test_case_ids.length,
          found_count: testCases?.length || 0,
          error: testCasesError?.message
        };

        debugInfo.resource_status.test_cases = testCases?.map(tc => ({
          id: tc.id,
          input_length: tc.input?.length || 0,
          has_expected_output: !!tc.reference_answer,
          metadata: tc.metadata
        })) || [];
      }
    }

    // 分析执行状态
    const { data: results } = await supabase
      .from('evaluation_results')
      .select('*')
      .eq('task_id', id);

    // 检查LLM API调用记录
    const { logger } = await import('@/lib/monitoring');
    const recentLogs = logger.getLogs({
      minTimestamp: Date.now() - 3600000 // 最近1小时
    });

    const llmApiCalls = recentLogs.filter(log =>
      log.message.includes('LLM API') ||
      log.message.includes('callLLM') ||
      log.message.includes('🔍 调用LLM API') ||
      log.message.includes('✅ API调用成功') ||
      log.message.includes('❌ LLM API调用失败') ||
      log.context?.api_name?.includes('llm')
    );

    debugInfo.llm_api_status = {
      recent_calls_count: llmApiCalls.length,
      recent_errors: llmApiCalls.filter(log => log.level === 'ERROR').length,
      last_call_time: llmApiCalls.length > 0 ?
        new Date(Math.max(...llmApiCalls.map(log => log.timestamp))).toISOString() : null,
      sample_calls: llmApiCalls.slice(-5).map(log => ({
        timestamp: new Date(log.timestamp).toISOString(),
        level: log.level,
        message: log.message,
        error: log.error?.message
      }))
    };

    debugInfo.execution_analysis = {
      total_subtasks: results?.length || 0,
      completed_subtasks: results?.filter(r => r.status === 'completed').length || 0, // 修复状态不一致问题
      failed_subtasks: results?.filter(r => r.status === 'failed').length || 0,
      pending_subtasks: results?.filter(r => r.status === 'pending').length || 0,
      running_subtasks: results?.filter(r => r.status === 'running').length || 0,
      
      // 性能统计
      avg_execution_time: (results && results.length > 0) 
        ? results.reduce((sum, r) => sum + (r.execution_time || 0), 0) / results.length 
        : 0,
      total_tokens: results?.reduce((sum, r) => sum + (r.tokens_used || 0), 0) || 0,
      total_cost: results?.reduce((sum, r) => sum + (r.cost || 0), 0) || 0,
      
      // 错误分析
      error_summary: results?.filter(r => r.status === 'failed').reduce((acc: any, r) => {
        const errorType = r.error_message || 'Unknown Error';
        acc[errorType] = (acc[errorType] || 0) + 1;
        return acc;
      }, {}) || {}
    };

    // 计算预期子任务数量和详细分解
    const templateId = task.template_id || task.config?.template_id; // 优先使用主字段，兼容旧数据
    if (templateId && task.config?.model_ids && task.config?.test_case_ids) {
      const { data: template } = await supabase
        .from('templates')
        .select('template_mappings(dimension_id)')
        .eq('id', templateId)
        .single();

      const dimensionsCount = template?.template_mappings?.length || 0;
      const modelsCount = task.config.model_ids.length;
      const testCasesCount = task.config.test_case_ids.length;
      const expectedSubtasks = modelsCount * testCasesCount * dimensionsCount;

      // 添加详细的任务分解信息
      debugInfo.execution_analysis.expected_subtasks = expectedSubtasks;
      debugInfo.execution_analysis.task_breakdown = {
        models_count: modelsCount,
        test_cases_count: testCasesCount,
        dimensions_count: dimensionsCount,
        calculation: `${modelsCount} × ${testCasesCount} × ${dimensionsCount} = ${expectedSubtasks}`,
        zero_reason: expectedSubtasks === 0 ?
          (modelsCount === 0 ? '没有配置模型' :
           testCasesCount === 0 ? '没有配置测试用例' :
           dimensionsCount === 0 ? '模板没有配置维度' : '未知原因') : null
      };

      // 计算生成进度
      debugInfo.execution_analysis.generation_progress = expectedSubtasks > 0 ?
        (debugInfo.execution_analysis.total_subtasks / expectedSubtasks * 100).toFixed(1) + '%' : '0%';
    }

    // 系统健康检查
    const now = new Date();
    const taskAge = task.created_at ? (now.getTime() - new Date(task.created_at).getTime()) / 1000 / 60 : 0; // minutes
    const isStuck = task.status === 'running' && taskAge > 30 && debugInfo.execution_analysis.total_subtasks === 0;
    
    debugInfo.health_check = {
      task_age_minutes: Math.round(taskAge),
      is_stuck: isStuck,
      recommendations: []
    };

    if (isStuck) {
      debugInfo.health_check.recommendations.push('任务可能卡住了，建议检查任务队列或重启任务');
    }

    if (debugInfo.validation_results.models?.found_count !== debugInfo.validation_results.models?.requested_count) {
      debugInfo.health_check.recommendations.push('部分模型不存在或不可用');
    }

    if (debugInfo.validation_results.template?.dimensions_count === 0) {
      debugInfo.health_check.recommendations.push('模板没有配置维度，无法生成子任务');
    }

    return NextResponse.json({ debug_info: debugInfo });

  } catch (error) {
    console.error('获取任务调试信息失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}