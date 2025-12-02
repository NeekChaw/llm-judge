/**
 * E2B与任务处理器集成模块
 * 将代码执行功能集成到现有的任务处理流程中
 */

import { codeEvaluationIntegrator, CodeEvaluationTask, CodeEvaluationTaskResult } from './evaluation-integration';
import { logger } from '@/lib/monitoring';
import { supabase } from '@/lib/supabase';

export interface CodeEvaluationSubTask {
  id: string;
  task_id: string;
  model_id: string;
  model_response: string;
  template_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

/**
 * 检查评测模板是否包含代码评测维度
 */
export async function hasCodeEvaluationDimensions(templateId: string): Promise<boolean> {
  try {
    if (!supabase) {
      logger.warn('Supabase未配置，无法检查代码评测维度', { templateId });
      return false;
    }

    const { data, error } = await supabase
      .from('template_code_dimensions')
      .select('id')
      .eq('template_id', templateId)
      .limit(1);

    if (error) {
      logger.error('检查代码评测维度失败', error, { templateId });
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    logger.error('检查代码评测维度异常', error, { templateId });
    return false;
  }
}

/**
 * 获取模板的代码评测维度
 */
export async function getTemplateCodeDimensions(templateId: string) {
  try {
    if (!supabase) {
      logger.warn('Supabase未配置，无法获取代码评测维度', { templateId });
      return [];
    }

    const { data, error } = await supabase
      .from('template_code_dimensions')
      .select(`
        dimension_id,
        order_index,
        code_evaluation_dimensions (
          id,
          name,
          description,
          language,
          test_cases,
          setup_code,
          teardown_code,
          weight
        )
      `)
      .eq('template_id', templateId)
      .order('order_index');

    if (error) {
      logger.error('获取代码评测维度失败', error, { templateId });
      return [];
    }

    return data?.map(item => ({
      id: item.code_evaluation_dimensions.id,
      name: item.code_evaluation_dimensions.name,
      description: item.code_evaluation_dimensions.description,
      language: item.code_evaluation_dimensions.language as 'python' | 'javascript' | 'typescript' | 'bash',
      testCases: item.code_evaluation_dimensions.test_cases || [],
      setupCode: item.code_evaluation_dimensions.setup_code,
      teardownCode: item.code_evaluation_dimensions.teardown_code,
      weight: item.code_evaluation_dimensions.weight || 1.0
    })) || [];
  } catch (error) {
    logger.error('获取代码评测维度异常', error, { templateId });
    return [];
  }
}

/**
 * 执行代码评测子任务
 */
export async function executeCodeEvaluationSubTask(subtask: CodeEvaluationSubTask): Promise<{
  success: boolean;
  score: number;
  feedback: string;
  executionTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    logger.info('开始执行代码评测子任务', {
      subtaskId: subtask.id,
      taskId: subtask.task_id,
      modelId: subtask.model_id,
      templateId: subtask.template_id
    });

    // 检查是否有代码评测维度
    const hasCodeDimensions = await hasCodeEvaluationDimensions(subtask.template_id);
    if (!hasCodeDimensions) {
      logger.info('模板不包含代码评测维度，跳过代码执行', {
        subtaskId: subtask.id,
        templateId: subtask.template_id
      });
      
      return {
        success: true,
        score: 0,
        feedback: '此模板不包含代码评测维度',
        executionTime: Date.now() - startTime
      };
    }

    // 获取代码评测维度
    const dimensions = await getTemplateCodeDimensions(subtask.template_id);
    if (dimensions.length === 0) {
      logger.warn('未找到代码评测维度', {
        subtaskId: subtask.id,
        templateId: subtask.template_id
      });
      
      return {
        success: false,
        score: 0,
        feedback: '未找到有效的代码评测维度',
        executionTime: Date.now() - startTime,
        error: '配置错误：缺少代码评测维度'
      };
    }

    // 构建代码评测任务
    const codeTask: CodeEvaluationTask = {
      taskId: subtask.task_id,
      subtaskId: subtask.id,
      modelResponse: subtask.model_response,
      dimensions,
      context: {
        metadata: {
          modelId: subtask.model_id,
          templateId: subtask.template_id
        }
      }
    };

    // 执行代码评测
    const result: CodeEvaluationTaskResult = await codeEvaluationIntegrator.evaluateCodeTask(codeTask);

    // 更新子任务状态和结果
    await updateSubTaskWithCodeResult(subtask.id, result);

    logger.info('代码评测子任务完成', {
      subtaskId: subtask.id,
      success: result.success,
      score: result.overallScore,
      executionTime: result.totalExecutionTime,
      dimensionsEvaluated: result.dimensionResults.length
    });

    return {
      success: result.success,
      score: result.overallScore,
      feedback: result.feedback,
      executionTime: result.totalExecutionTime
    };

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error('代码评测子任务执行失败', error, {
      subtaskId: subtask.id,
      taskId: subtask.task_id,
      executionTime
    });

    // 更新子任务为失败状态
    await updateSubTaskStatus(subtask.id, 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime
    });

    return {
      success: false,
      score: 0,
      feedback: `代码评测执行失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
      executionTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * 更新子任务状态和代码评测结果
 */
async function updateSubTaskWithCodeResult(
  subtaskId: string,
  result: CodeEvaluationTaskResult
): Promise<void> {
  try {
    if (!supabase) {
      logger.warn('Supabase未配置，跳过更新子任务结果', { subtaskId });
      return;
    }

    // 更新evaluation_results表
    const { error: updateError } = await supabase
      .from('evaluation_results')
      .update({
        status: result.success ? 'completed' : 'failed',
        score: result.overallScore,
        justification: result.feedback,
        updated_at: new Date().toISOString(),
        execution_details: {
          codeEvaluation: {
            dimensionsEvaluated: result.dimensionResults.length,
            successfulDimensions: result.dimensionResults.filter(d => d.result.success).length,
            totalExecutionTime: result.totalExecutionTime
          }
        }
      })
      .eq('id', subtaskId);

    if (updateError) {
      logger.error('更新子任务结果失败', updateError, { subtaskId });
    } else {
      logger.info('子任务结果已更新', {
        subtaskId,
        score: result.overallScore,
        success: result.success
      });
    }
  } catch (error) {
    logger.error('更新子任务结果异常', error, { subtaskId });
  }
}

/**
 * 更新子任务状态
 */
async function updateSubTaskStatus(
  subtaskId: string,
  status: 'pending' | 'running' | 'completed' | 'failed',
  metadata?: Record<string, any>
): Promise<void> {
  try {
    if (!supabase) {
      logger.warn('Supabase未配置，跳过更新子任务状态', { subtaskId, status });
      return;
    }

    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (metadata) {
      updateData.metadata = metadata;
    }

    const { error } = await supabase
      .from('evaluation_results')
      .update(updateData)
      .eq('id', subtaskId);

    if (error) {
      logger.error('更新子任务状态失败', error, { subtaskId, status });
    } else {
      logger.info('子任务状态已更新', { subtaskId, status });
    }
  } catch (error) {
    logger.error('更新子任务状态异常', error, { subtaskId, status });
  }
}

/**
 * 检查子任务是否需要代码评测
 */
export async function shouldExecuteCodeEvaluation(subtask: CodeEvaluationSubTask): Promise<boolean> {
  try {
    // 检查模型响应是否包含代码
    const hasCode = containsCode(subtask.model_response);
    if (!hasCode) {
      logger.info('模型响应不包含代码，跳过代码评测', {
        subtaskId: subtask.id,
        responseLength: subtask.model_response.length
      });
      return false;
    }

    // 检查模板是否配置了代码评测维度
    const hasCodeDimensions = await hasCodeEvaluationDimensions(subtask.template_id);
    if (!hasCodeDimensions) {
      logger.info('模板未配置代码评测维度，跳过代码评测', {
        subtaskId: subtask.id,
        templateId: subtask.template_id
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('检查是否需要代码评测失败', error, {
      subtaskId: subtask.id
    });
    return false;
  }
}

/**
 * 检查文本是否包含代码
 */
function containsCode(text: string): boolean {
  // 检查是否包含代码块标记
  if (text.includes('```')) {
    return true;
  }

  // 检查是否包含常见的编程关键字
  const codeKeywords = [
    'def ', 'class ', 'import ', 'from ', 'function', 'const ', 'let ', 'var ',
    'if __name__', 'return ', 'print(', 'console.log', 'for ', 'while ', 'try:'
  ];

  return codeKeywords.some(keyword => text.includes(keyword));
}

/**
 * 获取代码评测统计信息
 */
export async function getCodeEvaluationStats(timeRange: 'hour' | 'day' | 'week' = 'day') {
  try {
    if (!supabase) {
      logger.warn('Supabase未配置，无法获取代码评测统计');
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        timeoutExecutions: 0,
        languageDistribution: {},
        averageExecutionTime: 0
      };
    }

    const timeRangeMap = {
      hour: "NOW() - INTERVAL '1 hour'",
      day: "NOW() - INTERVAL '1 day'",
      week: "NOW() - INTERVAL '1 week'"
    };

    const { data, error } = await supabase
      .from('code_execution_results')
      .select('execution_status, language, execution_time_ms')
      .gte('created_at', timeRangeMap[timeRange]);

    if (error) {
      logger.error('获取代码评测统计失败', error);
      return null;
    }

    const stats = {
      totalExecutions: data.length,
      successfulExecutions: data.filter(r => r.execution_status === 'success').length,
      failedExecutions: data.filter(r => r.execution_status === 'error').length,
      timeoutExecutions: data.filter(r => r.execution_status === 'timeout').length,
      languageDistribution: {} as Record<string, number>,
      averageExecutionTime: 0
    };

    // 计算语言分布
    data.forEach(result => {
      stats.languageDistribution[result.language] =
        (stats.languageDistribution[result.language] || 0) + 1;
    });

    // 计算平均执行时间
    const totalTime = data.reduce((sum, r) => sum + (r.execution_time_ms || 0), 0);
    stats.averageExecutionTime = data.length > 0 ? Math.round(totalTime / data.length) : 0;

    return stats;
  } catch (error) {
    logger.error('获取代码评测统计异常', error);
    return null;
  }
}
