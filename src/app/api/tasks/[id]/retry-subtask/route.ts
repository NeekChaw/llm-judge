import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

interface RetrySubtaskRequest {
  subtask_id: string;
  evaluator_id?: string; // 可选：更换评分器
  reason?: string; // 重试原因
  fresh_start?: boolean; // 🔧 新增：支持Legacy模型的fresh_start模式
  disable_enable_thinking?: boolean; // 🆕 enable_thinking参数控制
  force_retry?: boolean; // 🆕 强制重试，即使任务已成功
  re_evaluation_only?: boolean; // 🆕 仅重新评分，保留现有模型响应
}

/**
 * POST /api/tasks/[id]/retry-subtask
 * 重试失败的子任务
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const body: RetrySubtaskRequest = await request.json();
    const { subtask_id, evaluator_id, reason, fresh_start, disable_enable_thinking, force_retry, re_evaluation_only } = body;

    if (!subtask_id) {
      return NextResponse.json({ error: '缺少必需的subtask_id参数' }, { status: 400 });
    }

    console.log('🔄 POST retry-subtask - taskId:', taskId, 'subtaskId:', subtask_id);

    const supabase = createClient();

    // 1. 验证任务状态 - 必须是已完成状态才能重试
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .select('id, status')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    if (task.status !== 'completed' && task.status !== 'failed') {
      return NextResponse.json({ 
        error: '只有已完成或失败的任务才可以重试子任务' 
      }, { status: 400 });
    }

    // 2. 解析复合ID，获取需要重试的实际数据库ID
    const { realIds, isComposite, compositeType } = await parseSubtaskId(String(subtask_id), taskId, supabase);
    
    if (realIds.length === 0) {
      return NextResponse.json({ error: '子任务不存在' }, { status: 404 });
    }

    console.log(`🔍 准备重试 ${realIds.length} 个子任务，复合类型: ${compositeType || '无'}`);

    // 3. 获取所有需要重试的失败子任务
    const { data: subtasks, error: subtasksError } = await supabase
      .from('evaluation_results')
      .select(`
        id,
        status,
        task_id,
        model_id,
        test_case_id,
        dimension_id,
        evaluator_id,
        run_index,
        error_message,
        model_response,
        score,
        reasoning,
        justification
      `)
      .in('id', realIds)
      .eq('task_id', taskId);

    if (subtasksError || !subtasks || subtasks.length === 0) {
      console.error('🚨 获取子任务信息失败:', subtasksError);
      return NextResponse.json({ error: '获取子任务信息失败' }, { status: 500 });
    }

    // 🔍 详细日志：分析所有子任务数据
    console.log(`🔍 找到 ${subtasks.length} 个子任务，开始分析:`);
    subtasks.slice(0, 3).forEach((s, index) => {
      console.log(`🔍 子任务 ${index + 1} (ID: ${s.id}):`);
      console.log(`  - status: ${s.status}`);
      console.log(`  - score: ${s.score}`);
      console.log(`  - model_response: ${s.model_response ? `存在 (${s.model_response.length} chars)` : '无'}`);
      console.log(`  - reasoning: ${s.reasoning ? `存在 (${s.reasoning.substring(0, 100)}...)` : '无'}`);
      console.log(`  - error_message: ${s.error_message || '无'}`);
    });

    // 4. 筛选出需要重试的子任务
    let retryableSubtasks;
    if (force_retry) {
      // 强制重试模式：允许重试所有子任务（包括成功的）
      retryableSubtasks = subtasks;
      console.log(`✅ 强制重试模式：找到 ${retryableSubtasks.length} 个子任务可以重试`);
    } else {
      // 正常模式：重试失败的子任务 + 评分失败的已完成子任务
      retryableSubtasks = subtasks.filter(s => {
        console.log(`🔍 检查子任务 ${s.id}:`);
        console.log(`  - status: ${s.status}`);
        console.log(`  - model_response: ${s.model_response ? '有' : '无'}`);
        console.log(`  - reasoning: ${s.reasoning ? `有 (${s.reasoning.substring(0, 50)}...)` : '无'}`);
        console.log(`  - justification: ${s.justification ? `有 (${s.justification.substring(0, 50)}...)` : '无'}`);
        console.log(`  - score: ${s.score}`);

        // 1. 传统失败子任务
        if (s.status === 'failed') {
          console.log(`  ✅ 传统失败子任务: ${s.id}`);
          return true;
        }

        // 2. 🆕 评分失败的已完成子任务（有model_response但评分失败）
        if (s.status === 'completed' && s.model_response) {
          const hasValidScore = s.score !== null && s.score !== 0;

          if (!hasValidScore) {
            // 🆕 包含所有类型的评分失败:
            // 1. 明确的错误信息
            const hasJustificationError1 = s.justification?.includes('评分失败');
            const hasJustificationError2 = s.justification?.includes('Evaluator execution failed');
            const hasReasoningError1 = s.reasoning?.includes('评分失败');
            const hasReasoningError2 = s.reasoning?.includes('Evaluator execution failed');

            // 2. 无AI评分反馈 (justification和reasoning都是空的)
            const hasNoFeedback = (!s.justification || s.justification.trim() === '') &&
                                  (!s.reasoning || s.reasoning.trim() === '');

            // 3. 其他包含"failed"关键词的情况
            const hasFailedKeyword = s.justification?.includes('failed') || s.reasoning?.includes('failed');

            console.log(`  - 评分失败检查1 (justification包含'评分失败'): ${hasJustificationError1}`);
            console.log(`  - 评分失败检查2 (justification包含'Evaluator execution failed'): ${hasJustificationError2}`);
            console.log(`  - 评分失败检查3 (reasoning包含'评分失败'): ${hasReasoningError1}`);
            console.log(`  - 评分失败检查4 (reasoning包含'Evaluator execution failed'): ${hasReasoningError2}`);
            console.log(`  - 评分失败检查5 (无AI评分反馈): ${hasNoFeedback}`);
            console.log(`  - 评分失败检查6 (包含failed关键词): ${hasFailedKeyword}`);

            const hasEvaluationError = hasJustificationError1 || hasJustificationError2 || hasReasoningError1 || hasReasoningError2 || hasNoFeedback || hasFailedKeyword;

            if (hasEvaluationError) {
              console.log(`  ✅ 发现评分失败的已完成子任务: ${s.id}`);
              return true;
            } else {
              console.log(`  ❌ 不是评分失败: ${s.id}`);
            }
          }
        } else {
          console.log(`  ❌ 不符合条件: status=${s.status}, model_response=${s.model_response ? '有' : '无'}`);
        }

        return false;
      });

      if (retryableSubtasks.length === 0) {
        return NextResponse.json({
          error: '没有失败的子任务或评分失败的子任务可以重试'
        }, { status: 400 });
      }

      const traditionalFailed = retryableSubtasks.filter(s => s.status === 'failed').length;
      const evaluationFailed = retryableSubtasks.length - traditionalFailed;
      console.log(`✅ 正常模式：找到 ${retryableSubtasks.length} 个子任务可以重试 (传统失败: ${traditionalFailed}, 评分失败: ${evaluationFailed})`);
    }

    // 5. 处理评分器ID
    let retryResults: any[] = [];

    for (const retryableSubtask of retryableSubtasks) {
      let newEvaluatorId = retryableSubtask.evaluator_id;
      let tempEvaluatorConfig: any = null;
      let originalEvaluator: any = null;
      let model: any = null; // 🔧 将model变量定义移到循环开始处，确保整个循环都能访问

      // 如果原始evaluator_id为null，从维度获取默认评分器
      if (!newEvaluatorId && retryableSubtask.dimension_id) {
        const { data: dimension, error: dimError } = await supabase
          .from('dimensions')
          .select('evaluator_id')
          .eq('id', retryableSubtask.dimension_id)
          .single();

        if (!dimError && dimension && dimension.evaluator_id) {
          newEvaluatorId = dimension.evaluator_id;
        }
      }

      // 如果用户提供了新的评分器ID，验证并使用
      if (evaluator_id && evaluator_id !== newEvaluatorId) {
        // 🆕 首先检查是否是evaluator_id
        const { data: evaluator, error: evaluatorError } = await supabase
          .from('evaluators')
          .select('id, name, type')
          .eq('id', evaluator_id)
          .single();

        if (!evaluatorError && evaluator) {
          // 找到了评分器，直接使用
          newEvaluatorId = evaluator_id;
          console.log(`✅ 使用指定的评分器: ${evaluator.name} (${evaluator_id})`);
        } else {
          // 🆕 检查是否是模型ID或逻辑模型名，如果是则创建临时评分器配置
          const { data: modelData, error: modelError } = await supabase
            .from('models')
            .select('id, name, logical_name')
            .eq('id', evaluator_id)
            .single();

          model = modelData; // 赋值给循环作用域的model变量

          // 如果按ID找不到，尝试按逻辑模型名查找
          if (modelError || !model) {
            const { data: modelByLogicalName, error: logicalNameError } = await supabase
              .from('models')
              .select('id, name, logical_name')
              .eq('logical_name', evaluator_id)
              .limit(1)
              .single();

            if (!logicalNameError && modelByLogicalName) {
              model = modelByLogicalName;
              console.log(`🔍 按逻辑模型名 [${evaluator_id}] 找到模型: ${model.name} (ID: ${model.id})`);
            }
          }

          if (model) {
            // 找到了模型，为重新评分创建临时评分器配置
            console.log(`🔄 检测到模型: ${model.logical_name || model.name}，创建临时评分器配置`);

            // 获取原评分器配置作为模板
            const { data: origEval, error: origEvalError } = await supabase
              .from('evaluators')
              .select('config, type')
              .eq('id', newEvaluatorId)
              .single();

            if (!origEvalError && origEval) {
              // 设置变量供后续使用
              originalEvaluator = origEval;
              // 创建使用新模型的临时评分器
              tempEvaluatorConfig = {
                ...originalEvaluator.config,
                model_id: model.logical_name || model.id // 🔧 优先使用逻辑模型名，以支持多提供商
              };

              // 🔧 保持原有的evaluator_id，通过metadata来标识这是临时配置
              // 我们将在子任务的metadata中存储临时评分器配置
              // 任务处理器会读取这个配置来使用新模型
              console.log(`✅ 创建临时评分器配置，使用模型: ${model.logical_name || model.name}`);
              // 不修改newEvaluatorId，保持原有值
            } else {
              console.error(`⚠️ 无法获取原评分器配置，使用原评分器`);
            }
          } else {
            console.error(`⚠️ 指定的ID ${evaluator_id} 既不是评分器也不是模型，使用原评分器`);
          }
        }
      }

      // 如果仍然没有有效的evaluator_id，跳过这个子任务
      if (!newEvaluatorId) {
        console.error(`⚠️ 子任务 ${retryableSubtask.id} 无法确定评分器，跳过重试`);
        continue;
      }

      // 6. 跳过第一次更新，直接进行最终更新（避免双重更新导致的竞态条件）

      // 6. 直接更新数据库状态，让独立的处理器进程处理
      try {
        // 准备更新数据
        const finalUpdateData: any = {
          status: 'pending',
          started_at: null,
          completed_at: null,
          score: null,
          justification: null,
          error_message: null,
          evaluator_id: newEvaluatorId,
          // 🔧 添加重试标记和fresh_start标志
          metadata: {
            ...(fresh_start && { fresh_start: true }),
            ...(reason && { retry_reason: reason }),
            // 🆕 添加enable_thinking参数控制
            ...(disable_enable_thinking !== undefined && { disable_enable_thinking }),
            ...(force_retry && { force_retry: true }), // 🆕 添加强制重试标记
            ...(re_evaluation_only && { re_evaluation_only: true }), // 🆕 添加仅重新评分标记
            // 🆕 如果有临时评分器配置，保存配置
            ...(tempEvaluatorConfig && {
              temp_evaluator: {
                config: tempEvaluatorConfig,
                type: originalEvaluator.type,
                original_evaluator_id: retryableSubtask.evaluator_id,
                new_model_id: evaluator_id, // 保存用户选择的ID（可能是逻辑名或具体ID）
                resolved_model_id: model?.logical_name || model?.id // 🆕 保存解析后的模型ID
              }
            })
          },
          updated_at: new Date().toISOString()
        };

        // 🆕 如果不是仅重新评分模式，则清除模型响应
        if (!re_evaluation_only) {
          finalUpdateData.model_response = null;
        }

        // 更新evaluation_results状态为pending，独立处理器会自动检测并处理
        const { error: updateError } = await supabase
          .from('evaluation_results')
          .update(finalUpdateData)
          .eq('id', retryableSubtask.id);

        if (updateError) {
          throw new Error(`数据库更新失败: ${updateError.message}`);
        }

        console.log(`✅ 子任务 ${retryableSubtask.id} 已重置为pending状态，等待智能处理器处理`);
        console.log(`🎯 重试将使用智能厂商选择，支持多提供商故障转移`);

        retryResults.push({
          subtask_id: retryableSubtask.id,
          original_evaluator_id: retryableSubtask.evaluator_id,
          new_evaluator_id: newEvaluatorId,
          status: 'submitted'
        });

      } catch (processorError) {
        console.error(`❌ 更新子任务 ${retryableSubtask.id} 状态失败:`, processorError);

        // 回滚子任务状态
        await supabase
          .from('evaluation_results')
          .update({
            status: retryableSubtask.status || 'failed', // 恢复原状态
            evaluator_id: retryableSubtask.evaluator_id
          })
          .eq('id', retryableSubtask.id);

        retryResults.push({
          subtask_id: retryableSubtask.id,
          status: 'failed',
          error: processorError instanceof Error ? processorError.message : '数据库更新失败'
        });
      }
    }

    // 8. 返回重试结果
    const successCount = retryResults.filter(r => r.status === 'submitted').length;
    const failureCount = retryResults.filter(r => r.status === 'failed').length;
    
    // 分析失败原因
    const errorTypes = new Map<string, number>();
    const errorDetails: string[] = [];
    
    retryResults.forEach(result => {
      if (result.status === 'failed' && result.error) {
        const errorMsg = result.error.toString();
        
        // 分类常见错误
        if (errorMsg.includes('任务处理器未初始化')) {
          errorTypes.set('processor_not_initialized', (errorTypes.get('processor_not_initialized') || 0) + 1);
        } else if (errorMsg.includes('评分器')) {
          errorTypes.set('evaluator_issue', (errorTypes.get('evaluator_issue') || 0) + 1);
        } else if (errorMsg.includes('数据库')) {
          errorTypes.set('database_error', (errorTypes.get('database_error') || 0) + 1);
        } else {
          errorTypes.set('unknown_error', (errorTypes.get('unknown_error') || 0) + 1);
          if (!errorDetails.includes(errorMsg)) {
            errorDetails.push(errorMsg);
          }
        }
      }
    });

    // 生成用户友好的错误消息
    let friendlyMessage = '';
    let systemAdvice = '';
    let userAction = '';

    if (errorTypes.has('processor_not_initialized')) {
      const count = errorTypes.get('processor_not_initialized')!;
      friendlyMessage = `任务处理系统暂时不可用 (${count} 个子任务受影响)`;
      systemAdvice = '系统后台处理服务需要重新启动';
      userAction = '请联系管理员检查任务处理器状态，或稍后再试';
    } else if (errorTypes.has('evaluator_issue')) {
      const count = errorTypes.get('evaluator_issue')!;
      friendlyMessage = `评分器配置问题 (${count} 个子任务受影响)`;
      systemAdvice = '评分器配置或权限问题';
      userAction = '请检查评分器设置或选择其他评分器';
    } else if (errorTypes.has('database_error')) {
      const count = errorTypes.get('database_error')!;
      friendlyMessage = `数据库连接问题 (${count} 个子任务受影响)`;
      systemAdvice = '数据库连接或权限问题';
      userAction = '请稍后再试，如问题持续请联系技术支持';
    } else {
      friendlyMessage = `重试过程中发生未知错误 (${failureCount} 个子任务受影响)`;
      systemAdvice = '系统遇到了预期外的问题';
      userAction = '请记录错误信息并联系技术支持';
    }

    if (successCount === 0) {
      return NextResponse.json({ 
        success: false,
        error: friendlyMessage,
        details: {
          total_attempts: retryableSubtasks.length,
          successful_submissions: successCount,
          failed_submissions: failureCount,
          system_advice: systemAdvice,
          user_action: userAction,
          error_breakdown: Object.fromEntries(errorTypes),
          technical_details: errorDetails.slice(0, 3), // 最多显示3个技术错误
          is_composite: isComposite,
          composite_type: compositeType,
          retry_status: 'all_failed'
        }
      }, { status: 500 });
    }

    // 部分成功的情况
    const partialSuccessMessage = successCount === retryableSubtasks.length
      ? `成功提交 ${successCount} 个子任务重试`
      : `部分成功: ${successCount} 个子任务已提交重试，${failureCount} 个失败`;

    return NextResponse.json({
      success: true,
      message: partialSuccessMessage,
      data: {
        subtask_id: subtask_id, // 保持兼容性
        is_composite: isComposite,
        composite_type: compositeType,
        retry_count: 1,
        submitted_count: successCount,
        failed_count: failureCount,
        total_count: retryableSubtasks.length,
        retry_status: successCount === retryableSubtasks.length ? 'all_success' : 'partial_success',
        // 如果有失败，提供友好的错误信息
        failure_summary: failureCount > 0 ? {
          message: friendlyMessage,
          system_advice: systemAdvice,
          user_action: userAction,
          error_breakdown: Object.fromEntries(errorTypes)
        } : null,
        details: retryResults
      }
    });

  } catch (error) {
    console.error('重试子任务请求处理失败:', error);
    return NextResponse.json({ 
      error: '服务器内部错误' 
    }, { status: 500 });
  }
}

/**
 * 解析复合ID格式，提取实际的数据库ID
 * 支持的格式：
 * - 普通ID：直接返回
 * - multi-*：多次运行聚合ID，需要获取所有相关的evaluation_results ID
 * - run-*：单次运行维度聚合ID，需要获取该次运行的所有ID  
 */
async function parseSubtaskId(subtaskId: string, taskId: string, supabase: any): Promise<{
  realIds: string[];
  isComposite: boolean;
  compositeType?: 'multi' | 'run';
}> {
  console.log('🔍 parseSubtaskId - subtaskId:', subtaskId);
  
  // 普通数据库ID（支持数字或UUID格式）
  if (subtaskId.match(/^\d+$/) || subtaskId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    console.log('✅ 普通数据库ID格式 (数字或UUID)');
    return { realIds: [subtaskId], isComposite: false };
  }
  
  // multi-{modelId}-{dimensionId} 格式 - 多次运行的模型-维度聚合
  // UUID格式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36字符，包含4个连字符)
  if (subtaskId.startsWith('multi-')) {
    console.log('🔍 检测到multi复合ID格式');
    const key = subtaskId.replace('multi-', '');
    
    // UUID格式的ID用连字符分隔，需要正确解析
    // 格式应该是: modelUUID-dimensionUUID
    // 每个UUID是36字符，所以modelId占前36字符，dimensionId占后36字符
    if (key.length < 73) { // 36 + 1 + 36 = 73 最小长度
      console.error('🚨 multi复合ID格式不正确，长度不足');
      return { realIds: [], isComposite: true, compositeType: 'multi' };
    }
    
    const modelId = key.slice(0, 36); // 前36个字符是modelId
    const dimensionId = key.slice(37); // 跳过连字符，取后36个字符是dimensionId
    
    console.log('🔍 解析出modelId:', modelId, 'dimensionId:', dimensionId);
    
    // 查询所有相关的evaluation_results
    const { data: results, error } = await supabase
      .from('evaluation_results')
      .select('id, status')
      .eq('task_id', taskId)
      .eq('model_id', modelId)
      .eq('dimension_id', dimensionId);
    
    if (error || !results || results.length === 0) {
      console.error('🚨 multi复合ID查询失败:', error);
      return { realIds: [], isComposite: true, compositeType: 'multi' };
    }
    
    const realIds = results.map(r => r.id.toString());
    console.log('✅ multi复合ID解析成功，找到', realIds.length, '个实际ID:', realIds);
    return { realIds, isComposite: true, compositeType: 'multi' };
  }
  
  // run-{modelId}-{dimensionId}-{runIndex} 格式 - 单次运行的维度聚合
  if (subtaskId.startsWith('run-')) {
    console.log('🔍 检测到run复合ID格式');
    const key = subtaskId.replace('run-', '');
    
    // 格式: modelUUID-dimensionUUID-runIndex
    // modelId: 前36字符，dimensionId: 第37-72字符，runIndex: 第74字符开始
    if (key.length < 75) { // 36 + 1 + 36 + 1 + 1 = 75 最小长度
      console.error('🚨 run复合ID格式不正确，长度不足');
      return { realIds: [], isComposite: true, compositeType: 'run' };
    }
    
    const modelId = key.slice(0, 36); // 前36个字符
    const dimensionId = key.slice(37, 73); // 第37-72字符
    const runIndex = key.slice(74); // 第74字符开始的runIndex
    
    console.log('🔍 解析出modelId:', modelId, 'dimensionId:', dimensionId, 'runIndex:', runIndex);
    
    // 查询特定运行次数的evaluation_results
    const { data: results, error } = await supabase
      .from('evaluation_results')
      .select('id, status')
      .eq('task_id', taskId)
      .eq('model_id', modelId)
      .eq('dimension_id', dimensionId)
      .eq('run_index', parseInt(runIndex) || 1);
    
    if (error || !results || results.length === 0) {
      console.error('🚨 run复合ID查询失败:', error);
      return { realIds: [], isComposite: true, compositeType: 'run' };
    }
    
    const realIds = results.map(r => r.id.toString());
    console.log('✅ run复合ID解析成功，找到', realIds.length, '个实际ID:', realIds);
    return { realIds, isComposite: true, compositeType: 'run' };
  }
  
  console.log('⚠️  未识别的ID格式，尝试作为普通ID处理');
  return { realIds: [subtaskId], isComposite: false };
}

/**
 * GET /api/tasks/[id]/retry-subtask?subtask_id=xxx
 * 获取子任务重试信息
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { searchParams } = new URL(request.url);
    const subtaskId = searchParams.get('subtask_id');

    if (!subtaskId) {
      return NextResponse.json({ error: '缺少subtask_id参数' }, { status: 400 });
    }

    console.log('🔍 GET retry-subtask - taskId:', taskId, 'subtaskId:', subtaskId);

    const supabase = createClient();

    // 解析复合ID
    const { realIds, isComposite, compositeType } = await parseSubtaskId(subtaskId, taskId, supabase);
    
    if (realIds.length === 0) {
      console.error('🚨 无法解析ID或找不到相关记录');
      return NextResponse.json({ error: '子任务不存在' }, { status: 404 });
    }

    // 获取第一个子任务的详细信息（用于重试配置）
    const { data: subtask, error } = await supabase
      .from('evaluation_results')
      .select(`
        id,
        status,
        score,
        justification,
        error_message,
        created_at,
        started_at,
        completed_at,
        dimension_id,
        evaluator_id,
        evaluators(id, name, type)
      `)
      .eq('id', realIds[0])
      .eq('task_id', taskId)
      .single();

    if (error || !subtask) {
      console.error('🚨 Subtask not found - error:', error, 'subtask:', subtask);
      console.error('🚨 Query params - taskId:', taskId, 'realIds:', realIds);
      return NextResponse.json({ error: '子任务不存在' }, { status: 404 });
    }

    const maxRetries = 3;
    
    // 对于复合ID，检查是否有失败的子任务可以重试
    let canRetry = false;
    let failedCount = 0;
    
    if (isComposite) {
      // 检查所有相关的evaluation_results的状态
      const { data: allSubtasks, error: allError } = await supabase
        .from('evaluation_results')
        .select('id, status, error_message')
        .in('id', realIds)
        .eq('task_id', taskId);
      
      if (!allError && allSubtasks) {
        failedCount = allSubtasks.filter(s => s.status === 'failed').length;
        canRetry = failedCount > 0;
        console.log(`✅ 复合ID包含 ${allSubtasks.length} 个子任务，其中 ${failedCount} 个失败`);
      }
    } else {
      // 单个子任务，检查是否失败
      canRetry = subtask.status === 'failed';
      failedCount = canRetry ? 1 : 0;
    }

    // 处理evaluator_id为null的情况，从维度获取默认评分器
    let currentEvaluator = subtask.evaluators;
    
    if (!currentEvaluator && subtask.dimension_id) {
      // 从维度表获取默认评分器
      const { data: dimension, error: dimError } = await supabase
        .from('dimensions')
        .select('evaluator_id, evaluators(id, name, type)')
        .eq('id', subtask.dimension_id)
        .single();
      
      if (!dimError && dimension && dimension.evaluators) {
        currentEvaluator = dimension.evaluators;
      }
    }

    // 如果仍然没有评分器，创建一个默认的
    if (!currentEvaluator) {
      currentEvaluator = {
        id: 'default-prompt-evaluator',
        name: '默认PROMPT评分器',
        type: 'PROMPT'
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        subtask_id: subtaskId, // 返回原始ID，保持前端兼容性
        status: subtask.status,
        retry_count: 0, // 暂时固定为0，数据库没有此字段
        max_retries: maxRetries,
        can_retry: canRetry,
        failed_count: failedCount, // 新增：失败的子任务数量
        total_count: realIds.length, // 新增：总子任务数量
        is_composite: isComposite, // 新增：是否为复合ID
        composite_type: compositeType, // 新增：复合ID类型
        real_ids: isComposite ? realIds : [subtask.id], // 新增：实际的数据库ID
        error_message: subtask.error_message,
        current_evaluator: currentEvaluator,
        last_attempt: {
          started_at: subtask.started_at,
          finished_at: subtask.completed_at,
          score: subtask.score,
          justification: subtask.justification
        }
      }
    });

  } catch (error) {
    console.error('获取子任务重试信息失败:', error);
    return NextResponse.json({ 
      error: '服务器内部错误' 
    }, { status: 500 });
  }
}