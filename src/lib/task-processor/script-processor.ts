/**
 * 脚本模式任务处理器实现
 * 基于现有的自动处理器脚本逻辑
 */

// 🔧 修复：显式加载环境变量
import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@/lib/supabase';
import {
  ITaskProcessor,
  TaskData,
  SubTaskData,
  ProcessingResult,
  ProcessorStatus,
  ProcessorConfig
} from './interfaces';
import { generateSubTasksForTask } from '@/lib/subtask-generator';
import { llmConfigManager } from '@/lib/llm-config-manager';
import { logger } from '@/lib/monitoring';
import { EvaluatorEngine, EvaluationContext } from '@/lib/evaluator-engine';
import { scoringEngine } from '@/lib/scoring-engine';

/**
 * 🆕 Bug #6 修复: 检查多模态兼容性（警告模式，不阻止执行）
 * 基于模型的 tags 字段判断是否支持多模态输入
 */
async function checkMultimodalCompatibility(
  testCase: any,
  evaluatorModelId: string,
  supabase: any
): Promise<{
  hasWarning: boolean;
  warningMessage?: string;
  details?: any;
}> {
  // 检查参考答案是否包含视觉附件
  const visualAttachments = testCase.reference_answer_multimodal?.attachments?.filter(
    (att: any) => att.type === 'image' || att.type === 'video'
  );

  if (!visualAttachments || visualAttachments.length === 0) {
    // 没有视觉附件，无需警告
    return { hasWarning: false };
  }

  // 查询评分器模型的标签
  const { data: evaluatorModel, error } = await supabase
    .from('models')
    .select('id, name, tags')
    .eq('id', evaluatorModelId)
    .single();

  if (error || !evaluatorModel) {
    // 无法查询模型信息，记录但不影响执行
    console.warn(`⚠️ 无法查询评分器模型 ${evaluatorModelId} 的标签信息`);
    return { hasWarning: false };
  }

  // 🎯 检查模型是否有 '多模态' 标签
  const isMultimodal = evaluatorModel.tags?.includes('多模态');

  if (!isMultimodal) {
    const warningMessage = [
      `参考答案包含 ${visualAttachments.length} 个视觉附件（${visualAttachments.map((a: any) => a.type).join(', ')}），`,
      `但评分器模型 "${evaluatorModel.name}" 不支持多模态输入（缺少"多模态"标签）。`,
      `评分器将只能看到参考答案的文本部分，无法评价视觉内容。`
    ].join('');

    console.warn(`⚠️ 多模态兼容性警告: ${warningMessage}`);

    return {
      hasWarning: true,
      warningMessage,
      details: {
        evaluator_model_id: evaluatorModel.id,
        evaluator_model_name: evaluatorModel.name,
        evaluator_model_tags: evaluatorModel.tags || [],
        visual_attachments_count: visualAttachments.length,
        visual_attachments_types: visualAttachments.map((a: any) => a.type)
      }
    };
  }

  // 模型支持多模态
  console.log(`✅ 评分器模型 "${evaluatorModel.name}" 支持多模态输入`);
  return { hasWarning: false };
}

export class ScriptTaskProcessor implements ITaskProcessor {
  readonly mode = 'script' as const;
  
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private config: ProcessorConfig;
  // 懒加载 Supabase 客户端，避免构建时初始化
  private get supabase() {
    return createClient();
  }
  private processedToday = 0;
  private lastActivity = new Date().toISOString();

  constructor(config: ProcessorConfig) {
    this.config = config;
  }

  /**
   * 从系统配置API获取并发限制配置
   */
  private async getSystemConcurrentLimit(): Promise<number> {
    try {
      console.log('🔍 正在从系统配置API获取并发限制...');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/system/config`);
      
      if (!response.ok) {
        console.warn(`⚠️ 系统配置API响应失败 (${response.status}), 使用默认并发限制: 15`);
        return 15;
      }
      
      const data = await response.json();
      const concurrentLimit = data.config?.task_default_concurrent_limit;
      
      if (typeof concurrentLimit !== 'number' || concurrentLimit < 1) {
        console.warn(`⚠️ 系统配置中的并发限制无效 (${concurrentLimit}), 使用默认值: 15`);
        return 15;
      }
      
      console.log(`✅ 成功加载系统并发限制配置: ${concurrentLimit}`);
      console.log(`🎯 当前配置来源: 数据库系统配置 (task_default_concurrent_limit)`);
      
      return concurrentLimit;
    } catch (error) {
      console.error('❌ 获取系统配置时发生错误:', error);
      console.warn('⚠️ 降级使用默认并发限制: 15');
      return 15;
    }
  }

  /**
   * 从系统配置API获取僵尸任务超时配置
   */
  private async getZombieTaskTimeoutMinutes(): Promise<number> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiUrl}/api/system/config`);
      
      if (!response.ok) {
        console.warn(`⚠️ 系统配置API响应失败 (${response.status}), 使用默认僵尸任务超时: 25分钟`);
        return 25;
      }
      
      const data = await response.json();
      const timeoutMinutes = data.config?.zombie_task_timeout_minutes;
      
      if (typeof timeoutMinutes !== 'number' || timeoutMinutes < 1) {
        console.warn(`⚠️ 系统配置中的僵尸任务超时无效 (${timeoutMinutes}), 使用默认值: 25分钟`);
        return 25;
      }
      
      console.log(`✅ 成功加载僵尸任务超时配置: ${timeoutMinutes}分钟`);
      return timeoutMinutes;
    } catch (error) {
      console.error('❌ 获取僵尸任务超时配置时发生错误:', error);
      console.warn('⚠️ 降级使用默认僵尸任务超时: 25分钟');
      return 25;
    }
  }

  /**
   * 🆕 获取模型配置参数（支持模型默认配置或任务自定义配置）
   */
  private async getModelConfiguration(modelId: string, taskConfig: any): Promise<{
    max_tokens?: number;
    temperature: number;
    thinking_budget?: number;
  }> {
    try {
      // 如果任务配置指定使用模型默认配置
      if (taskConfig?.use_model_defaults) {
        console.log('🔧 使用模型默认配置');
        
        // 从数据库获取模型默认配置（支持UUID或逻辑名称查询）
        console.log(`🔍 查询模型配置: ${modelId}`);

        // 检查是否为UUID格式，如果是则按ID查询，否则按logical_name查询
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(modelId);

        let queryResult;
        if (isUUID) {
          queryResult = await this.supabase
            .from('models')
            .select('default_max_tokens, default_temperature, default_thinking_budget, tags')
            .eq('id', modelId)
            .single();
        } else {
          // For logical names, multiple providers may exist, so get the first one
          queryResult = await this.supabase
            .from('models')
            .select('default_max_tokens, default_temperature, default_thinking_budget, tags')
            .eq('logical_name', modelId)
            .limit(1)
            .single();
        }

        const { data: model, error } = queryResult;
          
        if (error || !model) {
          console.warn(`⚠️ 无法获取模型 ${modelId} 的默认配置，使用系统默认值`);
          if (error) {
            console.warn(`   🔍 查询错误详情:`, error);
          }
          console.warn(`   🔍 查询结果:`, model);
          return { temperature: 0.7 };
        }
        
        console.log(`✅ 获取到模型配置:`, {
          max_tokens: model.default_max_tokens,
          temperature: model.default_temperature,
          thinking_budget: model.default_thinking_budget
        });
        
        // 🔧 修复：使用系统级默认值确保配置完整性
        const SYSTEM_DEFAULTS = {
          max_tokens: 4000,
          temperature: 0.7,
          thinking_budget: 20000
        };

        return {
          max_tokens: model.default_max_tokens ?? SYSTEM_DEFAULTS.max_tokens,
          temperature: model.default_temperature ?? SYSTEM_DEFAULTS.temperature,
          thinking_budget: model.default_thinking_budget ?? (
            model.tags?.includes('推理') ? SYSTEM_DEFAULTS.thinking_budget : undefined
          )
        };
      } else {
        // 使用任务自定义配置
        console.log('🔧 使用任务自定义配置');
        return {
          max_tokens: taskConfig?.max_tokens,
          temperature: taskConfig?.temperature || 0.7,
          thinking_budget: taskConfig?.thinking_budget
        };
      }
    } catch (error) {
      console.warn('⚠️ 获取模型配置失败，使用默认配置:', error);
      return { temperature: 0.7 };
    }
  }

  /**
   * 🆕 智能模型ID解析 - 支持逻辑模型名或具体模型ID
   * 
   * @param model 模型对象，可能包含id（具体模型ID）或logical_name（逻辑模型名）
   * @returns 解析后的具体模型ID
   */
  private async resolveModelId(model: any): Promise<string> {
    if (!model) {
      throw new Error('Model object is null or undefined');
    }

    // 🔧 优先返回逻辑模型名，让SmartLLMClient处理多提供商故障转移
    if (model.logical_name && typeof model.logical_name === 'string') {
      console.log('🎯 返回逻辑模型名，启用SmartLLMClient多提供商故障转移:', model.logical_name);
      return model.logical_name;
    }

    // 情况1：如果有具体的模型ID，直接使用（向后兼容模式）
    if (model.id && typeof model.id === 'string') {
      console.log('🔧 使用具体模型ID（兼容模式）:', model.id);
      return model.id;
    }

    // 情况3：尝试从name字段推导（兼容旧版本）
    if (model.name && typeof model.name === 'string') {
      console.log('🔄 尝试从模型名推导逻辑名称:', model.name);
      
      // 先检查是否存在匹配的逻辑模型名，如果有则返回逻辑名让SmartLLMClient处理
      try {
        const { data: logicalModels, error: logicalError } = await this.supabase
          .from('models')
          .select('logical_name')
          .eq('logical_name', model.name)
          .eq('status', 'active')
          .limit(1);

        if (!logicalError && logicalModels && logicalModels.length > 0) {
          console.log('🎯 找到匹配的逻辑模型名，启用SmartLLMClient多提供商故障转移:', model.name);
          return model.name;
        }
      } catch (error) {
        console.warn('⚠️ 逻辑模型名查找失败:', error);
      }

      // 如果不是逻辑模型名，尝试直接从数据库查找匹配的具体模型
      try {
        const { data: models, error } = await this.supabase
          .from('models')
          .select('id, logical_name')
          .eq('name', model.name)
          .eq('status', 'active')
          .limit(1);

        if (error) throw error;

        if (models && models.length > 0) {
          const foundModel = models[0];
          // 如果找到的模型有逻辑名，优先返回逻辑名
          if (foundModel.logical_name) {
            console.log('🎯 找到具体模型的逻辑名，启用SmartLLMClient多提供商故障转移:', foundModel.logical_name);
            return foundModel.logical_name;
          } else {
            console.log('📋 找到匹配的具体模型:', foundModel.id);
            return foundModel.id;
          }
        }
      } catch (error) {
        console.error('❌ 数据库查找失败:', error);
      }
    }

    // 所有方法都失败了
    throw new Error(`无法解析模型ID: ${JSON.stringify(model)}`);
  }

  async initialize(): Promise<void> {
    console.log('🔧 初始化脚本模式处理器...');
    
    // 验证数据库连接
    const { error } = await this.supabase.from('evaluation_tasks').select('id').limit(1);
    if (error) {
      throw new Error(`数据库连接失败: ${error.message}`);
    }

    // 验证LLM API
    if (!this.config.llm?.api_key) {
      throw new Error('LLM API密钥未配置');
    }

    console.log('✅ 脚本模式处理器初始化完成');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ 脚本处理器已在运行中');
      return;
    }

    console.log('🚀 启动脚本模式处理器...');
    this.isRunning = true;
    
    const checkInterval = this.config.script?.check_interval || 10000; // 默认10秒
    
    this.intervalId = setInterval(async () => {
      try {
        await this.processNextSubTaskInternal();
      } catch (error) {
        console.error('❌ 处理子任务时出错:', error);
      }
    }, checkInterval);

    console.log(`✅ 脚本处理器已启动，检查间隔: ${checkInterval}ms`);
  }

  async stop(): Promise<void> {
    console.log('🛑 停止脚本模式处理器...');
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('✅ 脚本处理器已停止');
  }

  async processTask(taskData: TaskData): Promise<ProcessingResult> {
    console.log(`📋 处理任务: ${taskData.name} (${taskData.id})`);
    
    const startTime = Date.now();
    
    try {
      // 使用现有的子任务生成逻辑
      const result = await generateSubTasksForTask(taskData.id);
      
      if (!result.success) {
        return {
          success: false,
          task_id: taskData.id,
          error: result.error,
          execution_time: Date.now() - startTime,
        };
      }

      return {
        success: true,
        task_id: taskData.id,
        subtasks_created: result.subtasks_created,
        execution_time: Date.now() - startTime,
      };

    } catch (error) {
      return {
        success: false,
        task_id: taskData.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        execution_time: Date.now() - startTime,
      };
    }
  }

  async processSubTask(subTaskData: SubTaskData): Promise<ProcessingResult> {
    console.log(`🔧 处理子任务: ${subTaskData.id}`);
    
    const startTime = Date.now();
    
    try {
      // 更新子任务状态为运行中
      await this.updateSubTaskStatus(subTaskData.id, 'running');

      // 🔧 检查是否是CODE重新执行请求或重新评分请求，并获取最新的evaluator_id
      const { data: subtaskInfo, error: subtaskError } = await this.supabase
        .from('evaluation_results')
        .select('metadata, model_response, evaluator_id')
        .eq('id', subTaskData.id)
        .single();
      
      if (subtaskError) {
        console.error('获取子任务信息失败:', subtaskError);
      }

      // 🆕 如果数据库中有更新的evaluator_id，使用最新的evaluator_id
      if (subtaskInfo?.evaluator_id && subtaskInfo.evaluator_id !== subTaskData.evaluator_id) {
        console.log(`🔄 检测到evaluator_id更新: ${subTaskData.evaluator_id} -> ${subtaskInfo.evaluator_id}`);
        subTaskData.evaluator_id = subtaskInfo.evaluator_id;
      }

      // 🆕 检查是否有临时评分器配置
      const hasTempEvaluator = subtaskInfo?.metadata?.temp_evaluator;
      if (hasTempEvaluator) {
        console.log(`🔄 检测到临时评分器配置，使用模型: ${hasTempEvaluator.new_model_id || hasTempEvaluator.config?.model_id}`);
        // 将临时评分器信息保存到subTaskData中供后续使用
        subTaskData.temp_evaluator = hasTempEvaluator;
      }

      const isCodeReExecution = subtaskInfo?.metadata?.re_execution?.skip_llm_call === true;
      const isReEvaluationOnly = subtaskInfo?.metadata?.re_evaluation_only === true;

      // 🔍 调试日志：检查 re_evaluation_only 参数
      console.log(`🔍 检查重新评分参数:`);
      console.log(`   - subtaskInfo.metadata: ${JSON.stringify(subtaskInfo?.metadata || {})}`);
      console.log(`   - isReEvaluationOnly: ${isReEvaluationOnly}`);
      console.log(`   - model_response存在: ${!!subtaskInfo?.model_response}`);
      let evaluationResult: any;
      let context: any;

      if ((isCodeReExecution || isReEvaluationOnly) && subtaskInfo?.model_response) {
        if (isReEvaluationOnly) {
          console.log(`🔄 检测到仅重新评分请求，跳过LLM调用，直接使用现有响应`);
          console.log(`   - 保持原有模型响应: ${subtaskInfo.model_response.length} 字符`);
          console.log(`   - 执行类型: 仅重新评分`);
        } else {
          console.log(`🔄 检测到CODE重新执行请求，跳过LLM调用，直接使用现有代码`);
          console.log(`   - 保持原有模型响应: ${subtaskInfo.model_response.length} 字符`);
          console.log(`   - 执行类型: CODE重新评分`);
        }
        
        // 构造一个假的evaluationResult，使用已有的model_response
        evaluationResult = {
          response: subtaskInfo.model_response,
          prompt_tokens: 0, // 重新执行/重新评分不产生新token
          completion_tokens: 0,
          total_tokens: 0,
          response_time: 0,
          model: isReEvaluationOnly ? 'RE_EVALUATION_ONLY' : 'CODE_RE_EXECUTION',
          finish_reason: isReEvaluationOnly ? 're_evaluation_only' : 'code_reexecution'
        };
        
        // 即使是重新执行也需要context用于评分
        context = await this.buildEvaluationContext(subTaskData);
      } else {
        // 获取评测所需的数据
        context = await this.buildEvaluationContext(subTaskData);
        
        // 调用LLM API进行评测
        evaluationResult = await this.callLLMAPI(context);
      }
      
      // 🔧 Token数据传递验证日志 - 在callLLMAPI返回后立即验证
      console.log('🔍 processSubTask Token数据传递验证 (callLLMAPI -> executeEvaluation):', {
        subtaskId: subTaskData.id,
        callLLMAPI_result: {
          response_length: evaluationResult.response?.length || 0,
          token_data: {
            prompt_tokens: evaluationResult.prompt_tokens,
            completion_tokens: evaluationResult.completion_tokens,
            total_tokens: evaluationResult.total_tokens,
            response_time: evaluationResult.response_time,
            types: {
              prompt_tokens: typeof evaluationResult.prompt_tokens,
              completion_tokens: typeof evaluationResult.completion_tokens,
              total_tokens: typeof evaluationResult.total_tokens,
              response_time: typeof evaluationResult.response_time
            }
          },
          has_valid_tokens: !!(evaluationResult.prompt_tokens > 0 || evaluationResult.completion_tokens > 0 || evaluationResult.total_tokens > 0)
        }
      });
      
      // 执行评分逻辑
      const evaluationScore = await this.executeEvaluation(evaluationResult, context);

      // 🔧 Token数据传递验证日志 - 在准备传递给updateSubTaskResult前的最终验证
      // 🛡️ 超时兜底机制：对于超时情况，标记为失败状态但记录0分和原因
      const isTimeoutResult = evaluationScore.executionDetails?.error_type === 'timeout';
      const updateData = {
        status: isTimeoutResult ? 'failed' : 'completed', // 超时情况标记为失败，保证重试功能
        score: evaluationScore.score,
        reasoning: evaluationScore.justification,
        model_response: evaluationResult.response,
        execution_time: Date.now() - startTime,
        executionDetails: evaluationScore.executionDetails,
        // 添加被评测模型的token使用统计
        prompt_tokens: evaluationResult.prompt_tokens,
        completion_tokens: evaluationResult.completion_tokens,
        total_tokens: evaluationResult.total_tokens,
        llm_response_time: evaluationResult.response_time, // LLM API响应时间(ms)
      };
      
      console.log('🔍 processSubTask Token数据传递验证 (传递给updateSubTaskResult前):', {
        subtaskId: subTaskData.id,
        final_update_data: {
          has_model_response: !!updateData.model_response,
          model_response_length: updateData.model_response?.length || 0,
          token_data: {
            prompt_tokens: updateData.prompt_tokens,
            completion_tokens: updateData.completion_tokens,
            total_tokens: updateData.total_tokens,
            llm_response_time: updateData.llm_response_time,
            types: {
              prompt_tokens: typeof updateData.prompt_tokens,
              completion_tokens: typeof updateData.completion_tokens,
              total_tokens: typeof updateData.total_tokens,
              llm_response_time: typeof updateData.llm_response_time
            }
          },
          has_valid_tokens: !!(updateData.prompt_tokens > 0 || updateData.completion_tokens > 0 || updateData.total_tokens > 0),
          data_looks_consistent: !!(updateData.model_response && (updateData.prompt_tokens > 0 || updateData.completion_tokens > 0 || updateData.total_tokens > 0))
        }
      });
      
      // 🚨 最终数据一致性检查
      if (updateData.model_response && !(updateData.prompt_tokens > 0 || updateData.completion_tokens > 0 || updateData.total_tokens > 0)) {
        console.log('🚨 关键警告: 即将保存有回复但无Token数据的记录');
        console.log('   这说明问题发生在 callLLMAPI 方法内部或返回过程中');
        console.log('   请检查 callLLMAPI 方法的返回值结构和token提取逻辑');
      }

      // 更新子任务结果 - 包含token统计信息
      try {
        await this.updateSubTaskResult(subTaskData.id, updateData);
        
        // 🛡️ 超时兜底机制：对于超时情况，额外更新错误状态信息
        if (isTimeoutResult) {
          await this.updateSubTaskStatus(subTaskData.id, 'failed', evaluationScore.justification);
        }
      } catch (updateError) {
        console.error(`❌ 更新子任务结果失败 ${subTaskData.id}:`, updateError);
        
        // 🛡️ 如果正常更新失败，使用最基本的方式确保状态正确
        try {
          const basicStatus = isTimeoutResult ? 'failed' : 'completed';
          const basicMessage = isTimeoutResult ? evaluationScore.justification : null;
          
          await this.supabase
            .from('evaluation_results')
            .update({ 
              status: basicStatus,
              score: evaluationScore.score,
              justification: evaluationScore.justification,
              error_message: basicMessage,
              updated_at: new Date().toISOString()
            })
            .eq('id', subTaskData.id);
          console.log(`✅ 基本更新子任务 ${subTaskData.id} 状态为 ${basicStatus}`);
        } catch (basicUpdateError) {
          console.error(`🚨 基本更新也失败，子任务可能成为僵尸:`, basicUpdateError);
          throw updateError; // 重新抛出原始错误，让外层catch处理
        }
      }

      this.processedToday++;
      this.lastActivity = new Date().toISOString();

      // 检查任务是否完成
      await this.checkTaskCompletion(subTaskData.task_id);

      return {
        success: true,
        task_id: subTaskData.task_id,
        subtasks_processed: 1,
        execution_time: Date.now() - startTime,
      };

    } catch (error) {
      console.error(`❌ 处理子任务 ${subTaskData.id} 时发生异常:`, error);
      
      // 🔧 增强错误处理：确保无论如何都能更新子任务状态
      try {
        await this.updateSubTaskStatus(subTaskData.id, 'failed', 
          error instanceof Error ? error.message : 'Unknown error');
      } catch (statusUpdateError) {
        console.error(`🚨 更新子任务状态也失败了，使用最基本的更新方式:`, statusUpdateError);
        
        // 🛡️ 最后的兜底：直接更新数据库，避免僵尸任务
        try {
          await this.supabase
            .from('evaluation_results')
            .update({ 
              status: 'failed',
              error_message: `处理异常: ${error instanceof Error ? error.message : 'Unknown error'}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', subTaskData.id);
          console.log(`✅ 强制更新子任务 ${subTaskData.id} 状态为failed`);
        } catch (finalError) {
          console.error(`🔥 连最基本的状态更新也失败了，子任务可能变成僵尸:`, finalError);
        }
      }

      // ✅ 修复: 失败时也需要检查任务完成状态
      try {
        await this.checkTaskCompletion(subTaskData.task_id);
      } catch (completionCheckError) {
        console.error(`⚠️ 检查任务完成状态失败:`, completionCheckError);
      }

      return {
        success: false,
        task_id: subTaskData.task_id,
        error: error instanceof Error ? error.message : 'Unknown error',
        execution_time: Date.now() - startTime,
      };
    }
  }

  async getStatus(): Promise<ProcessorStatus> {
    const { data: activeTasks } = await this.supabase
      .from('evaluation_tasks')
      .select('id')
      .eq('status', 'running');

    const { data: pendingSubtasks } = await this.supabase
      .from('evaluation_results')
      .select('id')
      .eq('status', 'pending');

    const healthCheck = await this.performHealthCheck();

    return {
      mode: 'script',
      status: this.isRunning ? 'running' : 'stopped',
      active_tasks: activeTasks?.length || 0,
      pending_subtasks: pendingSubtasks?.length || 0,
      processed_today: this.processedToday,
      last_activity: this.lastActivity,
      health_check: healthCheck,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const health = await this.performHealthCheck();
      return health.database_connected && health.llm_api_available;
    } catch {
      return false;
    }
  }

  async pauseTask(taskId: string): Promise<boolean> {
    try {
      await this.supabase
        .from('evaluation_tasks')
        .update({ status: 'pending' })
        .eq('id', taskId);
      return true;
    } catch {
      return false;
    }
  }

  async resumeTask(taskId: string): Promise<boolean> {
    try {
      await this.supabase
        .from('evaluation_tasks')
        .update({ status: 'running' })
        .eq('id', taskId);
      return true;
    } catch {
      return false;
    }
  }

  async cancelTask(taskId: string): Promise<boolean> {
    try {
      await this.supabase
        .from('evaluation_tasks')
        .update({ status: 'cancelled' })
        .eq('id', taskId);
      
      await this.supabase
        .from('evaluation_results')
        .update({ status: 'cancelled' })
        .eq('task_id', taskId)
        .eq('status', 'pending');
      
      return true;
    } catch {
      return false;
    }
  }

  async getTaskProgress(taskId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    progress_percentage: number;
  }> {
    const { data: subtasks } = await this.supabase
      .from('evaluation_results')
      .select('status')
      .eq('task_id', taskId);

    const total = subtasks?.length || 0;
    const completed = subtasks?.filter(st => st.status === 'completed').length || 0;
    const failed = subtasks?.filter(st => st.status === 'failed').length || 0;
    
    return {
      total,
      completed,
      failed,
      progress_percentage: total > 0 ? Math.round((completed + failed) / total * 100) : 0,
    };
  }

  async cleanup(): Promise<void> {
    // 清理完成的任务数据（可选实现）
    console.log('🧹 执行脚本处理器清理...');
  }

  // 公开方法用于调试
  async processNextSubTask(): Promise<void> {
    return this.processNextSubTaskInternal();
  }


  // 私有方法
  private async processNextSubTaskInternal(): Promise<void> {
    try {
      // 添加调试日志
      console.log('🔍 检查待处理子任务...');

      // 导入依赖管理器
      const { evaluatorDependencyManager } = await import('@/lib/evaluator-dependency-manager');

      // 获取僵尸任务超时配置
      const zombieTimeoutMinutes = await this.getZombieTaskTimeoutMinutes();
      const zombieTimeoutMs = zombieTimeoutMinutes * 60 * 1000;
      
      // 使用新的依赖关系字段查询可执行的子任务
      const { data: pendingSubtasks, error } = await this.supabase
        .from('evaluation_results')
        .select(`
          *,
          evaluation_tasks!inner(id, name, status),
          evaluators!inner(type)
        `)
        .or(`status.eq.pending,and(status.eq.running,updated_at.lt.${new Date(Date.now() - zombieTimeoutMs).toISOString()})`) // pending 或 运行超过配置时间的
        .in('evaluation_tasks.status', ['running', 'completed']) // 允许已完成任务的重试
        // 放宽依赖条件：允许依赖已解析或为空（兼容旧数据/无依赖场景）
        .or('dependencies_resolved.eq.true,dependencies_resolved.is.null')
        .order('execution_priority', { ascending: true }) // 按优先级排序
        .order('created_at', { ascending: true })
        .limit(10);

      if (error) {
        console.error('❌ 查询待处理子任务失败:', error);
        return;
      }

      console.log(`📋 找到 ${pendingSubtasks?.length || 0} 个待处理子任务`);

      if (pendingSubtasks && pendingSubtasks.length > 0) {
        // 使用数据库中的执行优先级排序
        const sortedSubtasks = pendingSubtasks.sort((a, b) => {
          const aPriority = a.execution_priority || 1;
          const bPriority = b.execution_priority || 1;

          // 优先级相同时，CODE类型优先
          if (aPriority === bPriority) {
            const aTypePriority = a.evaluators.type === 'CODE' ? 1 :
                                a.evaluators.type === 'PROMPT' ? 2 : 1.5;
            const bTypePriority = b.evaluators.type === 'CODE' ? 1 :
                                b.evaluators.type === 'PROMPT' ? 2 : 1.5;
            return aTypePriority - bTypePriority;
          }

          return aPriority - bPriority;
        });

        // 🚀 并发处理多个可执行的子任务
        // 优先使用系统配置的并发限制，而不是环境变量的默认值
        const concurrentLimit = await this.getSystemConcurrentLimit();
        const executableTasks: any[] = [];
        
        // 🔧 修复并发控制：预先批量选择任务，避免重复处理
        // 🛡️ 首先独立执行僵尸任务检测，不受并发限制影响
        await this.detectAndResetZombieTasks(zombieTimeoutMs, zombieTimeoutMinutes);
        
        // 先获取当前运行中的任务详细状态（僵尸重置后重新查询）
        const { data: runningTasks } = await this.supabase
          .from('evaluation_results')
          .select('id, created_at, updated_at, model_id, test_case_id')
          .eq('status', 'running');
        
        const currentRunningCount = runningTasks?.length || 0;
        const availableSlots = Math.max(0, concurrentLimit - currentRunningCount);
        
        // 🕐 分析运行中任务的时间分布，帮助判断API响应状态
        const now = Date.now();
        const runningTasksAnalysis = runningTasks ? runningTasks.map(task => {
          const createdTime = new Date(task.created_at).getTime();
          const updatedTime = new Date(task.updated_at).getTime();
          const runningDuration = Math.floor((now - updatedTime) / 1000); // 从最后更新开始的运行时间
          const totalDuration = Math.floor((now - createdTime) / 1000); // 总运行时间
          
          return {
            id: task.id,
            model_id: task.model_id.substring(0, 8),
            test_case_id: task.test_case_id.substring(0, 8),
            running_seconds: runningDuration,
            total_seconds: totalDuration,
            status_category: runningDuration < 30 ? 'just_started' : 
                           runningDuration < 120 ? 'normal_processing' :
                           runningDuration < 300 ? 'long_processing' : 'potentially_stuck'
          };
        }) : [];

        // 📊 按状态分类统计
        const tasksByStatus = {
          just_started: runningTasksAnalysis.filter(t => t.status_category === 'just_started').length,
          normal_processing: runningTasksAnalysis.filter(t => t.status_category === 'normal_processing').length,
          long_processing: runningTasksAnalysis.filter(t => t.status_category === 'long_processing').length,
          potentially_stuck: runningTasksAnalysis.filter(t => t.status_category === 'potentially_stuck').length
        };
        
        console.log(`📊 =============并发状态详情=============`);
        console.log(`🎯 系统并发限制配置: ${concurrentLimit}`);
        console.log(`🔄 当前运行中子任务数量: ${currentRunningCount}`);
        console.log(`📦 可用并发槽位: ${availableSlots}`);
        console.log(`📋 待处理子任务数量: ${sortedSubtasks.length}`);
        
        // 🆕 运行中任务详细状态分析
        if (currentRunningCount > 0) {
          console.log(`📈 运行中任务状态分布:`);
          console.log(`   🚀 刚开始处理 (<30s): ${tasksByStatus.just_started}个`);
          console.log(`   ⚡ 正常处理中 (30s-2m): ${tasksByStatus.normal_processing}个`);
          console.log(`   ⏳ 长时间处理 (2m-5m): ${tasksByStatus.long_processing}个`);
          console.log(`   ⚠️ 可能卡住 (>5m): ${tasksByStatus.potentially_stuck}个`);
          
          // 显示最长运行时间的几个任务
          const longestRunning = runningTasksAnalysis
            .sort((a, b) => b.running_seconds - a.running_seconds)
            .slice(0, 3);
          
          if (longestRunning.length > 0) {
            console.log(`   🕐 运行时间最长的任务:`);
            longestRunning.forEach((task, index) => {
              const minutes = Math.floor(task.running_seconds / 60);
              const seconds = task.running_seconds % 60;
              console.log(`     ${index + 1}. 任务${task.id} (${task.model_id}...): ${minutes}分${seconds}秒`);
            });
          }
        }
        console.log(`==========================================`);
        
        if (availableSlots <= 0) {
          console.log('⏸️ 已达到并发限制，等待现有任务完成');
          return;
        }
        
        // 查找所有可以执行的子任务（只检查依赖，不检查running状态）
        for (const subtask of sortedSubtasks) {
          if (executableTasks.length >= availableSlots) {
            break; // 达到可用槽位限制
          }
          
          // 跳过已完成的任务
          if (subtask.status === 'completed') {
            continue;
          }
          
          // 跳过运行中的任务（僵尸检测已在前面独立处理）
          if (subtask.status === 'running') {
            continue;
          }
          
          // 🎯 关键修复：只检查依赖关系，不检查状态
          // 因为我们即将更新状态为running
          if (subtask.dependencies_resolved) {
            executableTasks.push(subtask);
            console.log(`🚀 准备处理子任务: ${subtask.id} (类型: ${subtask.evaluators.type})`);
          } else {
            // 动态检查依赖关系
            const canExecute = await evaluatorDependencyManager.canExecuteSubTask(subtask.id);
            if (canExecute.canExecute) {
              executableTasks.push(subtask);
              console.log(`🚀 准备处理子任务: ${subtask.id} (类型: ${subtask.evaluators.type}) - 依赖动态检查通过`);
            } else {
              console.log(`⏳ 子任务 ${subtask.id} 暂不可执行: ${canExecute.reason}`);
              if (canExecute.dependsOn) {
                console.log(`   依赖子任务: ${canExecute.dependsOn.join(', ')}`);
              }
            }
          }
        }

        if (executableTasks.length > 0) {
          console.log(`🎯 开始并发处理 ${executableTasks.length} 个子任务 (并发限制: ${concurrentLimit})`);
          
          // 使用Promise.allSettled确保所有任务都能完成，即使有失败的
          const results = await Promise.allSettled(
            executableTasks.map(subtask => 
              this.processSubTask(subtask as SubTaskData).catch(error => {
                console.error(`❌ 子任务 ${subtask.id} 处理失败:`, error);
                throw error;
              })
            )
          );
          
          // 统计执行结果
          const fulfilled = results.filter(r => r.status === 'fulfilled').length;
          const rejected = results.filter(r => r.status === 'rejected').length;
          console.log(`✅ 并发处理完成: ${fulfilled} 成功, ${rejected} 失败`);
          
          if (rejected > 0) {
            console.log('🔍 失败的子任务将在下次检查时重试');
          }
        } else {
          console.log('⏸️ 当前没有可执行的子任务，等待依赖完成');
        }
      }
    } catch (error) {
      console.error('❌ 处理子任务检查时出错:', error);
    }
  }

  private async updateSubTaskStatus(
    subtaskId: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    const updateData: any = {
      status,
    };

    if (status === 'running') {
      updateData.started_at = new Date().toISOString();
    } else if (status === 'completed' || status === 'failed') {
      updateData.completed_at = new Date().toISOString();
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { error } = await this.supabase
      .from('evaluation_results')
      .update(updateData)
      .eq('id', subtaskId);

    if (error) {
      console.error(`❌ 更新子任务状态 ${subtaskId} -> ${status} 失败:`, error);
      throw error;
    }

    console.log(`📝 子任务状态更新: ${subtaskId} -> ${status}`);
  }

  private async updateSubTaskResult(subtaskId: string, result: any): Promise<void> {
    console.log(`💾 更新子任务结果: ${subtaskId} -> ${result.status}`);
    
    // 🔧 Token数据传递验证日志 - 在接收到结果数据后立即验证
    console.log('🔍 updateSubTaskResult Token数据接收验证:', {
      subtaskId,
      received_data: {
        status: result.status,
        has_model_response: !!result.model_response,
        model_response_length: result.model_response?.length || 0,
        has_error: !!(result.error || result.error_message),
        error_message: result.error || result.error_message || null
      },
      token_data: {
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
        total_tokens: result.total_tokens,
        llm_response_time: result.llm_response_time,
        types: {
          prompt_tokens: typeof result.prompt_tokens,
          completion_tokens: typeof result.completion_tokens,
          total_tokens: typeof result.total_tokens,
          llm_response_time: typeof result.llm_response_time
        }
      },
      validation: {
        has_valid_tokens: !!(result.prompt_tokens > 0 || result.completion_tokens > 0 || result.total_tokens > 0),
        has_response_time: !!(result.llm_response_time && result.llm_response_time > 0),
        data_consistency_issue: !!(result.model_response && !(result.prompt_tokens > 0 || result.completion_tokens > 0 || result.total_tokens > 0))
      }
    });
    
    // 🚨 数据一致性警告
    if (result.model_response && !(result.prompt_tokens > 0 || result.completion_tokens > 0 || result.total_tokens > 0)) {
      console.log('🚨 Token数据丢失警告: 有模型回复但缺少Token统计数据');
      console.log('   这表明数据在 callLLMAPI -> processSubTask -> updateSubTaskResult 传递过程中丢失');
      console.log('   需要检查中间环节的数据处理逻辑');
    }

    // 🔧 修复：首先获取评分器信息以判断类型
    const { data: evaluationResult, error: queryError } = await this.supabase
      .from('evaluation_results')
      .select(`
        id,
        evaluators!inner(id, name, type)
      `)
      .eq('id', subtaskId)
      .single();

    if (queryError) {
      console.error(`❌ 查询子任务评分器信息失败 ${subtaskId}:`, queryError);
      throw queryError;
    }

    const evaluatorType = evaluationResult?.evaluators?.type;
    console.log(`📋 子任务 ${subtaskId} 使用评分器类型: ${evaluatorType}`);

    // 🔧 增强并发安全：检查子任务是否已经被处理
    const { data: currentStatus } = await this.supabase
      .from('evaluation_results')
      .select('status')
      .eq('id', subtaskId)
      .single();

    if (currentStatus?.status === 'completed') {
      console.log(`⚠️ 子任务 ${subtaskId} 已完成，跳过重复处理`);
      return;
    }

    // 🎯 修复：检查是否有错误信息，特别是超时错误
    let finalStatus = result.status;
    let errorMessage = null;
    
    // 检查各种错误情况
    if (result.error || result.error_message) {
      errorMessage = result.error || result.error_message;
      finalStatus = 'failed';
      console.log(`⚠️ 子任务 ${subtaskId} 有错误信息，状态修正为 failed: ${errorMessage}`);
    } else if (result.status === 'completed' && (result.score === undefined && !result.model_response)) {
      // 如果状态是completed但没有实际结果，也认为是失败
      // 注意：分数为0是有效结果，只有undefined才表示没有结果
      finalStatus = 'failed';
      errorMessage = 'No results produced despite completed status';
      console.log(`⚠️ 子任务 ${subtaskId} 状态为completed但无结果，修正为 failed`);
    }

    // 准备更新数据
    const updateData: any = {
      status: finalStatus,
      score: result.score,
      justification: result.reasoning || result.justification,
      execution_time: result.execution_time,
      completed_at: new Date().toISOString(),
    };

    // 🆕 优化：仅重新评分模式下不更新model_response（避免不必要的数据库写入）
    // 检查是否是RE_EVALUATION_ONLY模式
    const isReEvaluationOnly = result.model === 'RE_EVALUATION_ONLY';
    if (!isReEvaluationOnly) {
      // 只有非重新评分模式才更新model_response
      updateData.model_response = result.model_response;
      console.log(`📝 更新模型响应: ${result.model_response?.length || 0} 字符`);
    } else {
      console.log(`🔄 重新评分模式：跳过model_response更新，保留原有响应`);
    }
    
    // 如果有错误信息，添加到更新数据中
    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    // ✅ 核心修复：包含被评测模型的token使用统计
    // 直接使用新添加的数据库字段保存token数据
    if (result.prompt_tokens !== undefined) {
      updateData.prompt_tokens = result.prompt_tokens;
    }
    if (result.completion_tokens !== undefined) {
      updateData.completion_tokens = result.completion_tokens;
    }
    if (result.total_tokens !== undefined) {
      updateData.total_tokens = result.total_tokens;
    }
    if (result.llm_response_time !== undefined) {
      updateData.llm_response_time = result.llm_response_time;
    }
    
    // 记录token数据保存情况
    const tokenData = {
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens, 
      total_tokens: result.total_tokens,
      llm_response_time: result.llm_response_time
    };
    console.log(`💾 Token数据直接保存到数据库字段: ${JSON.stringify(tokenData)}`);
    
    // 计算每秒token数用于日志
    if (result.llm_response_time > 0 && result.total_tokens > 0) {
      const tokensPerSecond = Math.round((result.total_tokens / (result.llm_response_time / 1000)) * 100) / 100;
      console.log(`⚡ 性能统计: ${result.total_tokens} tokens in ${result.llm_response_time}ms = ${tokensPerSecond} tokens/s`);
    }

    // 🔧 核心修复：移除过于严格的状态过滤条件，允许更新已完成但缺少Token数据的任务
    // 原来的 .eq('status', 'running') 会导致Token数据无法保存到已完成的子任务中
    const { data, error } = await this.supabase
      .from('evaluation_results')
      .update(updateData)
      .eq('id', subtaskId)
      // 🚨 关键修复：移除 .eq('status', 'running') 条件
      // 允许更新任何状态的子任务，特别是已完成但缺少Token数据的任务
      .select('id, status')
      .maybeSingle(); // 使用 maybeSingle 避免多行错误

    if (error) {
      console.error(`❌ 更新子任务 ${subtaskId} 失败:`, error);
      throw error;
    }

    if (!data) {
      console.warn(`⚠️ 子任务 ${subtaskId} 状态更新无效（可能已被其他进程处理）`);
      return;
    }

    console.log(`✅ 子任务 ${subtaskId} 状态更新成功`);

    // 🎯 核心修复：根据评分器类型处理执行详情
    if (result.executionDetails) {
      try {
        if (evaluatorType === 'CODE') {
          // CODE类型：保存到代码执行详情表
          await this.saveCodeExecutionDetails(subtaskId, result.executionDetails);
        } else {
          // PROMPT/REGEX类型：记录执行统计但不保存到代码执行详情表
          console.log(`📊 ${evaluatorType}类型评分器执行完成:`, {
            subtaskId,
            evaluatorType,
            execution_time: result.executionDetails.execution_time,
            has_metadata: !!result.executionDetails.metadata,
            has_model_response: !!result.executionDetails.model_response
          });
        }
      } catch (detailError) {
        console.error(`⚠️ 处理${evaluatorType}执行详情异常:`, detailError);
        // 不影响主流程，只记录错误
      }
    } else {
      console.log(`📋 子任务 ${subtaskId} (${evaluatorType}类型) 无执行详情`);
    }
  }

  /**
   * 根据评分器类型构造合适的executionDetails结构
   */
  private buildExecutionDetails(evaluatorType: string, result: any): any {
    switch (evaluatorType) {
      case 'CODE':
        // CODE类型：包含沙盒执行信息
        return {
          execution_time: result.execution_time,
          metadata: result.metadata,
          // 从metadata中提取CODE相关信息
          executionTime: result.execution_time,
          stdout: result.metadata?.stdout || '',
          stderr: result.metadata?.stderr || '',
          exit_code: result.metadata?.exit_code || 0,
          testsPassed: result.metadata?.test_results?.passed || 0,
          testsTotal: result.metadata?.test_results?.total || 0,
          syntaxCorrect: result.metadata?.test_results?.syntax_correct || false,
          functionalCorrect: result.metadata?.test_results?.functional_correct || false,
          executionStatus: result.metadata?.exit_code === 0 ? 'success' : 'failed',
          sandboxId: result.metadata?.sandbox_id,
          memoryUsage: result.metadata?.memory_usage_mb
        };

      case 'PROMPT':
        // PROMPT类型：包含LLM调用统计信息
        return {
          execution_time: result.execution_time,
          metadata: result.metadata,
          model_response: result.model_response,
          prompt_tokens: result.prompt_tokens || 0,
          completion_tokens: result.completion_tokens || 0,
          // 从metadata中提取评分器模型统计
          evaluator_model_stats: result.metadata?.evaluator_model_stats
        };

      case 'REGEX':
        // REGEX类型：包含匹配结果统计
        return {
          execution_time: result.execution_time,
          metadata: result.metadata,
          // 从metadata中提取正则匹配信息
          total_matches: result.metadata?.total_matches || 0,
          max_possible: result.metadata?.max_possible || 0,
          pattern_details: result.metadata?.pattern_details || []
        };

      case 'HUMAN':
        // HUMAN类型：包含人工评分任务信息
        return {
          execution_time: result.execution_time,
          metadata: result.metadata,
          human_task_id: result.metadata?.human_task_id,
          status: result.metadata?.status || 'pending_human_review'
        };

      default:
        // 默认：通用结构
        return {
          execution_time: result.execution_time,
          metadata: result.metadata,
          model_response: result.model_response,
          prompt_tokens: result.prompt_tokens || 0,
          completion_tokens: result.completion_tokens || 0
        };
    }
  }

  /**
   * 专门保存CODE类型评分器的代码执行详情
   */
  private async saveCodeExecutionDetails(subtaskId: string, executionDetails: any): Promise<void> {
    console.log('📊 开始保存CODE类型评分器的代码执行详情...');
    console.log(`   子任务ID: ${subtaskId}`);
    console.log(`   执行详情结构: ${JSON.stringify(executionDetails, null, 2)}`);

    const execDetails = executionDetails;

    // 检查是否包含真正的CODE执行数据
    const hasCodeExecution = !!(
      execDetails.stdout || 
      execDetails.stderr || 
      execDetails.testsPassed ||
      execDetails.testsTotal ||
      execDetails.sandboxId ||
      execDetails.sessionId
    );

    if (!hasCodeExecution) {
      console.log('   ⚠️ 执行详情中没有代码执行数据，跳过保存');
      return;
    }

    console.log('   🔍 CODE执行详情字段分析:');
    console.log(`     executionTime: ${execDetails.executionTime || 'N/A'}`);
    console.log(`     testsPassed: ${execDetails.testsPassed || 'N/A'}`);
    console.log(`     testsTotal: ${execDetails.testsTotal || 'N/A'}`);
    console.log(`     stdout: ${(execDetails.stdout || '').length} 字符`);
    console.log(`     stderr: ${(execDetails.stderr || '').length} 字符`);
    console.log(`     executionStatus: ${execDetails.executionStatus || 'N/A'}`);
    console.log(`     sandboxId: ${execDetails.sandboxId || 'N/A'}`);

    // 构建插入数据
    const insertData = {
      evaluation_result_id: parseInt(subtaskId),
      sandbox_id: execDetails.sandboxId || 
                 execDetails.sessionId || 
                 `session_${Date.now()}`,
      stdout: execDetails.stdout || '',
      stderr: execDetails.stderr || '',
      execution_time_ms: execDetails.executionTime || 0,
      memory_usage_mb: execDetails.memoryUsage || null,
      exit_code: execDetails.executionStatus === 'success' ? 0 : 1,
      test_results: {
        passed: execDetails.testsPassed || 0,
        total: execDetails.testsTotal || 0,
        syntax_correct: execDetails.syntaxCorrect || false,
        functional_correct: execDetails.functionalCorrect || false
      },
      files_created: execDetails.filesCreated || null
    };

    console.log('   📊 准备插入的数据:', JSON.stringify(insertData, null, 2));

    // 检查是否已经保存过（防重复）
    const { data: existing } = await this.supabase
      .from('code_execution_details')
      .select('id')
      .eq('evaluation_result_id', parseInt(subtaskId))
      .maybeSingle();

    if (existing) {
      console.log(`   ℹ️ 代码执行详情已存在 (ID: ${existing.id})，跳过重复保存`);
      return;
    }

    // 保存到数据库
    const { data: insertResult, error: detailsError } = await this.supabase
      .from('code_execution_details')
      .insert(insertData)
      .select();

    if (detailsError) {
      console.error('❌ 保存代码执行详情失败:', detailsError);
      console.error('   错误详情:', JSON.stringify(detailsError, null, 2));
      
      if (detailsError.message?.includes('column')) {
        console.error('   💡 可能是数据库字段不匹配问题');
      } else if (detailsError.message?.includes('unique')) {
        console.error('   💡 可能是重复插入问题');
      }
      
      // 不抛出错误，避免影响主流程
    } else {
      console.log(`✅ 代码执行详情保存成功`);
      console.log(`   新记录ID: ${insertResult?.[0]?.id}`);
    }
  }

  private async buildEvaluationContext(subTaskData: SubTaskData): Promise<any> {
    // 🆕 如果有临时评分器配置，使用临时配置，否则查询数据库
    let evaluatorPromise;
    if ((subTaskData as any).temp_evaluator) {
      console.log(`🔄 使用临时评分器配置`);
      // 创建一个模拟的evaluator对象
      evaluatorPromise = Promise.resolve({
        data: {
          id: subTaskData.evaluator_id, // 使用原有的evaluator_id
          type: (subTaskData as any).temp_evaluator.type,
          config: (subTaskData as any).temp_evaluator.config
        },
        error: null
      });
    } else {
      evaluatorPromise = this.supabase.from('evaluators').select('*').eq('id', subTaskData.evaluator_id).single();
    }

    // 获取测试用例、模型、维度、评分器、任务信息和evaluation_results的metadata
    const [testCase, model, dimension, evaluator, task, evaluationResults] = await Promise.all([
      this.supabase.from('test_cases').select('*').eq('id', subTaskData.test_case_id).single(),
      this.supabase.from('models').select(`
        *,
        api_providers (
          name,
          display_name,
          base_url,
          api_key_env_var,
          timeout_ms,
          rate_limit_rpm,
          auth_type
        )
      `).eq('id', subTaskData.model_id).single(),
      this.supabase.from('dimensions').select('*').eq('id', subTaskData.dimension_id).single(),
      evaluatorPromise,
      this.supabase.from('evaluation_tasks').select('id, name, system_prompt, template_id, config').eq('id', subTaskData.task_id).single(),
      // 🔧 获取evaluation_results的metadata以读取fresh_start参数
      this.supabase
        .from('evaluation_results')
        .select('metadata')
        .eq('task_id', subTaskData.task_id)
        .eq('model_id', subTaskData.model_id)
        .eq('dimension_id', subTaskData.dimension_id)
        .eq('test_case_id', subTaskData.test_case_id)
        .single()
    ]);

    // 验证数据完整性
    if (testCase.error) {
      throw new Error(`测试用例获取失败: ${testCase.error.message}`);
    }
    if (model.error) {
      throw new Error(`模型获取失败: ${model.error.message}`);
    }
    if (dimension.error) {
      throw new Error(`维度获取失败: ${dimension.error.message}`);
    }
    if (evaluator.error) {
      throw new Error(`评分器获取失败: ${evaluator.error.message}`);
    }
    if (task.error) {
      throw new Error(`任务获取失败: ${task.error.message}`);
    }

    // 验证模型ID
    if (!model.data?.id || typeof model.data.id !== 'string') {
      console.error('模型数据异常:', {
        modelData: model.data,
        modelId: model.data?.id,
        modelIdType: typeof model.data?.id,
        subTaskData: subTaskData
      });
      throw new Error(`模型ID无效: ${model.data?.id} (类型: ${typeof model.data?.id})`);
    }

    // 查询自定义模板映射（如果存在）
    let customMapping = null;
    if (task.data?.template_id) {
      try {
        const { templateService } = await import('@/lib/template-service');
        customMapping = await templateService.getCustomMapping(
          task.data.template_id,
          subTaskData.dimension_id
        );
        console.log(`🔍 查询自定义模板映射: template=${task.data.template_id}, dimension=${subTaskData.dimension_id}, result=${customMapping ? 'found' : 'not found'}`);
      } catch (error) {
        console.log('⚠️ 查询自定义模板映射失败 (可能是统一模板):', error);
        // 不影响统一模板的正常运行
      }
    }

    // 添加详细的调试信息
    console.log('🔍 buildEvaluationContext 调试信息:', {
      subTaskData: {
        id: subTaskData.id,
        task_id: subTaskData.task_id,
        model_id: subTaskData.model_id,
        model_id_type: typeof subTaskData.model_id
      },
      modelQueryResult: {
        data: model.data,
        error: model.error,
        modelId: model.data?.id,
        modelIdType: typeof model.data?.id,
        modelKeys: model.data ? Object.keys(model.data) : 'null'
      },
      taskQueryResult: {
        data: task.data,
        error: task.error,
        taskConfig: task.data?.config,
        maxTokens: task.data?.config?.max_tokens,
        configKeys: task.data?.config ? Object.keys(task.data.config) : 'null'
      },
      customMapping: customMapping ? {
        id: customMapping.id,
        has_system_prompt: !!customMapping.system_prompt
      } : null
    });

    // 处理模型数据，添加provider字段
    const modelData = model.data;
    const providerData = modelData?.api_providers;
    
    // 添加详细的调试信息
    console.log('🔍 模型数据处理调试:', {
      originalProvider: modelData?.provider,
      providerDataName: providerData?.name,
      hasProviderData: !!providerData,
      modelDataKeys: modelData ? Object.keys(modelData) : 'null'
    });
    
    const processedModel = {
      ...modelData,
      // 兼容新旧两种provider配置方式
      provider: providerData?.name || modelData?.provider || '',  // 优先使用关联的provider，否则使用直接存储的provider
      provider_name: providerData?.name || modelData?.provider || '',
      provider_display_name: providerData?.display_name || '',
      provider_timeout: providerData?.timeout_ms || 30000,
      provider_rate_limit: providerData?.rate_limit_rpm || 60,
      provider_auth_type: providerData?.auth_type || 'bearer',
    };
    
    console.log('🔍 处理后的provider字段:', {
      provider: processedModel.provider,
      provider_name: processedModel.provider_name
    });

    // 🔧 从evaluation_results的metadata中提取fresh_start和disable_enable_thinking参数
    const metadata = evaluationResults.data?.metadata || {};
    const freshStart = metadata.fresh_start || false;
    const disableEnableThinking = metadata.disable_enable_thinking || false;
    
    console.log('🔧 buildEvaluationContext 元数据状态:', {
      subtaskId: subTaskData.id,
      metadata_exists: !!evaluationResults.data?.metadata,
      fresh_start_value: freshStart,
      disable_enable_thinking_value: disableEnableThinking,
      metadata_keys: Object.keys(metadata)
    });

    return {
      taskId: subTaskData.task_id,
      subtaskId: subTaskData.id,
      testCase: testCase.data,
      model: processedModel,
      dimension: dimension.data,
      evaluator: evaluator.data,
      task: task.data,
      customMapping: customMapping,
      fresh_start: freshStart, // 🔧 添加fresh_start参数到context
      disable_enable_thinking: disableEnableThinking, // 🆕 添加disable_enable_thinking参数到context
    };
  }

  private async callLLMAPI(context: any): Promise<{ response: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; response_time: number; model: string; finish_reason?: string; timeout_error_message?: string }> {
    console.log('🚀 callLLMAPI 开始执行，详细调试信息:', {
      contextType: typeof context,
      contextKeys: context ? Object.keys(context) : 'context is null',
      model: context?.model,
      modelType: typeof context?.model,
      modelId: context?.model?.id,
      modelIdType: typeof context?.model?.id,
      fullContext: JSON.stringify(context, null, 2).substring(0, 500) + '...'
    });

    const methodStartTime = Date.now(); // 记录整个方法的开始时间
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const retryStartTime = Date.now();
      try {
        // 🆕 智能厂商选择 - 支持逻辑模型名或具体模型ID
        let modelId = await this.resolveModelId(context.model);

        console.log(`✅ 模型ID解析完成 - 尝试 ${attempt}/${maxRetries}:`, modelId);


        // 🔧 修复：使用智能LLM客户端，支持多提供商故障转移
        // 这确保了token配置的一致性处理和高可用性
        const { getSmartLLMClient } = await import('@/lib/smart-llm-client');

        // 使用升级后的兼容性函数获取系统提示词，支持自定义模板的维度级别角色
        const { getSystemPrompt } = await import('@/lib/system-prompt-compatibility');
        const systemPrompt = getSystemPrompt(context.task, context.evaluator, context.customMapping);

        // 🆕 获取模型配置参数（支持模型默认配置或任务自定义配置）
        const modelConfig = await this.getModelConfiguration(modelId, context.task.config);
        
        console.log(`🎯 模型配置: max_tokens=${modelConfig.max_tokens || '无限制'}, temperature=${modelConfig.temperature}, thinking_budget=${modelConfig.thinking_budget || '无'}`);
        console.log(`🔧 使用智能LLM客户端调用，支持多提供商故障转移`);

        const requestStartTime = Date.now();
        const smartClient = getSmartLLMClient();

        // 🔧 从context中获取fresh_start和disable_enable_thinking参数
        const freshStart = context.fresh_start || false;
        const disableEnableThinking = context.disable_enable_thinking || false;
        console.log(`🔧 CallLLMAPI 参数控制模式: fresh_start=${freshStart}, disable_enable_thinking=${disableEnableThinking} (subtaskId: ${context.subtaskId})`);

        // 使用智能LLM客户端，支持多提供商故障转移和负载均衡
        const smartResponse = await smartClient.callLLM({
          model_id: modelId,
          system_prompt: systemPrompt,
          user_prompt: context.testCase.input,
          temperature: modelConfig.temperature,
          max_tokens: modelConfig.max_tokens,
          thinking_budget: modelConfig.thinking_budget,
          attachments: context.testCase.attachments || [], // 🖼️ 传递测试用例的attachments用于multimodal支持
          fallback_enabled: true,
          max_retries: 2,
          fresh_start: freshStart, // 🔧 传递fresh_start参数到SmartLLMClient
          disable_enable_thinking: disableEnableThinking // 🆕 传递disable_enable_thinking参数到SmartLLMClient
        });

        // 转换SmartLLMResponse到原有格式以保持兼容性
        const llmResponse = {
          content: smartResponse.content,
          reasoning_content: smartResponse.reasoning_content,
          prompt_tokens: smartResponse.prompt_tokens,
          completion_tokens: smartResponse.completion_tokens,
          total_tokens: smartResponse.total_tokens,
          model: smartResponse.model,
          finish_reason: smartResponse.finish_reason,
          response_time: smartResponse.response_time
        };

        // ⏱️ 记录API响应时间
        const apiResponseTime = Date.now() - requestStartTime;

        // 🔧 计算实际响应长度（包括推理模型的reasoning_content）
        const actualResponseLength = (() => {
          const content = llmResponse.content || llmResponse.response;
          if (content && content.trim()) return content.length;
          if (llmResponse.reasoning_content && llmResponse.reasoning_content.trim()) return llmResponse.reasoning_content.length;
          return 0;
        })();

        // 🔧 修复：处理LLM客户端的响应格式
        console.log(`📥 LLM客户端响应 (API响应时间: ${apiResponseTime}ms)`);
        console.log(`✅ API调用成功: ${actualResponseLength} 字符`);

        console.log(`⏱️ 响应时间分析:`, {
          api_response_time_ms: apiResponseTime,
          content_length: actualResponseLength,
          tokens: llmResponse.completion_tokens || 0,
          tokens_per_second: llmResponse.completion_tokens ?
            Math.round(llmResponse.completion_tokens / (apiResponseTime / 1000) * 100) / 100 : 0
        });

        // 🔍 增强日志：详细记录reasoning_content和content字段状态
        console.log('🔍 LLM响应字段详细分析:', {
          model: llmResponse.model || context.model.name,
          subtaskId: context.subtaskId,
          content: {
            exists: !!llmResponse.content,
            length: llmResponse.content?.length || 0,
            isEmpty: !llmResponse.content || llmResponse.content.trim() === '',
            preview: llmResponse.content ? llmResponse.content.substring(0, 100) + '...' : 'N/A'
          },
          reasoning_content: {
            exists: !!llmResponse.reasoning_content,
            length: llmResponse.reasoning_content?.length || 0,
            isEmpty: !llmResponse.reasoning_content || llmResponse.reasoning_content.trim() === '',
            preview: llmResponse.reasoning_content ? llmResponse.reasoning_content.substring(0, 100) + '...' : 'N/A'
          },
          finish_reason: llmResponse.finish_reason,
          tokens: {
            prompt: llmResponse.prompt_tokens,
            completion: llmResponse.completion_tokens,
            total: llmResponse.total_tokens
          }
        });

        logger.info('LLM API调用成功', {
          model: llmResponse.model || context.model.name,
          response_length: actualResponseLength,
          attempt: attempt,
          api_name: 'llm_api_call'
        });

        // 🔧 修复：使用LLM客户端返回的标准格式
        // 🆕 推理模型支持：优先使用content，如果content为空但reasoning_content有内容，则使用reasoning_content
        let modelResponse = llmResponse.content || llmResponse.response;
        
        // 🧠 推理模型特殊处理：如果content为空但reasoning_content有内容，使用reasoning_content作为实际回答
        if (!modelResponse || modelResponse.trim() === '') {
          if (llmResponse.reasoning_content && llmResponse.reasoning_content.trim() !== '') {
            modelResponse = llmResponse.reasoning_content;
            console.log('🧠 推理模型响应处理: content为空，使用reasoning_content作为模型回答', {
              model: context.model.name,
              subtaskId: context.subtaskId,
              reasoning_content_length: llmResponse.reasoning_content.length,
              reasoning_content_preview: llmResponse.reasoning_content.substring(0, 200) + '...'
            });
          }
        }
        
        // 🔥 关键修复：如果被测模型没有返回有效内容，应该抛出错误而不是继续评测
        if (!modelResponse || modelResponse.trim() === '') {
          // 🔍 增强错误信息：显示字段状态帮助诊断
          console.error('❌ 被测模型返回空响应详细分析:', {
            model: context.model.name,
            subtaskId: context.subtaskId,
            content_field: {
              exists: !!llmResponse.content,
              length: llmResponse.content?.length || 0,
              value: llmResponse.content || 'NULL',
              isEmpty: !llmResponse.content || llmResponse.content.trim() === ''
            },
            reasoning_content_field: {
              exists: !!llmResponse.reasoning_content,
              length: llmResponse.reasoning_content?.length || 0,
              hasValue: !!(llmResponse.reasoning_content && llmResponse.reasoning_content.trim()),
              preview: llmResponse.reasoning_content ? llmResponse.reasoning_content.substring(0, 200) + '...' : 'NULL'
            },
            response_field: {
              exists: !!(llmResponse as any).response,
              length: (llmResponse as any).response?.length || 0
            },
            finish_reason: llmResponse.finish_reason,
            raw_response_keys: Object.keys(llmResponse),
            tokens: {
              prompt: llmResponse.prompt_tokens,
              completion: llmResponse.completion_tokens,
              total: llmResponse.total_tokens
            }
          });
          throw new Error(`被测模型 ${context.model.name} 返回完全空响应，无法进行评测 (content和reasoning_content字段均为空)`);
        }
        
        // 🔥 额外检查：如果finish_reason表明调用失败，也应该抛出错误
        if (llmResponse.finish_reason && ['error', 'failed', 'timeout'].includes(llmResponse.finish_reason.toLowerCase())) {
          throw new Error(`被测模型 ${context.model.name} API调用失败 (${llmResponse.finish_reason})，无法进行评测`);
        }
        
        const finalResult = {
          response: modelResponse,
          prompt_tokens: llmResponse.prompt_tokens || 0,
          completion_tokens: llmResponse.completion_tokens || 0,
          total_tokens: llmResponse.total_tokens || 0,
          response_time: apiResponseTime,
          model: llmResponse.model || context.model.name,
          finish_reason: llmResponse.finish_reason
        };

        // 🔧 Token数据传递验证日志 - 验证LLM客户端返回的数据
        console.log('🔍 LLM客户端Token数据验证:', {
          model: finalResult.model,
          llm_client_response: {
            has_response: !!(llmResponse.content || llmResponse.response || llmResponse.reasoning_content),
            has_token_data: !!(llmResponse.prompt_tokens || llmResponse.completion_tokens),
            raw_data: {
              content: llmResponse.content,
              response: llmResponse.response,
              prompt_tokens: llmResponse.prompt_tokens,
              completion_tokens: llmResponse.completion_tokens,
              total_tokens: llmResponse.total_tokens,
              finish_reason: llmResponse.finish_reason
            }
          },
          extracted_token_data: {
            prompt_tokens: finalResult.prompt_tokens,
            completion_tokens: finalResult.completion_tokens,
            total_tokens: finalResult.total_tokens,
            response_time: finalResult.response_time,
            finish_reason: finalResult.finish_reason
          },
          has_valid_tokens: !!(finalResult.prompt_tokens > 0 || finalResult.completion_tokens > 0 || finalResult.total_tokens > 0),
          response_content_length: finalResult.response?.length || 0,
          token_limit_applied: modelConfig.max_tokens ? `${modelConfig.max_tokens} tokens` : 'unlimited'
        });

        return finalResult;

      } catch (error) {
        const retryTime = Date.now() - retryStartTime;
        const retryTimeSeconds = (retryTime / 1000).toFixed(2);
        lastError = error as Error;
        
        const isTimeout = error instanceof Error &&
          (error.message.includes('timeout') || error.message.includes('aborted') ||
           error.message.includes('超时') || error.name === 'AbortError');

        const isConnectionError = error instanceof Error && (
          error.message.includes('ECONNRESET') ||
          error.message.includes('Connection reset') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('connection_reset') ||
          error.message.includes('connection_refused') ||
          error.message.includes('dns_error')
        );

        if (isTimeout) {
          console.error(`⏰ LLM API调用超时 (尝试 ${attempt}/${maxRetries}, 耗时 ${retryTimeSeconds}秒):`, error);
        } else if (isConnectionError) {
          console.error(`🌐 网络连接失败 (尝试 ${attempt}/${maxRetries}, 耗时 ${retryTimeSeconds}秒):`, error);
        } else {
          console.error(`❌ LLM API调用失败 (尝试 ${attempt}/${maxRetries}, 耗时 ${retryTimeSeconds}秒):`, error);
        }
        
        logger.error('LLM API调用失败', error, {
          model: context?.model?.name || 'unknown',
          attempt: attempt,
          maxRetries: maxRetries,
          retry_time_ms: retryTime,
          retry_time_seconds: parseFloat(retryTimeSeconds),
          is_timeout: isTimeout,
          is_connection_error: isConnectionError,
          api_name: 'llm_api_call'
        });

        // 判断是否应该重试：最后一次尝试 OR 不是可重试错误类型
        const isRetryableError = isTimeout || isConnectionError;
        if (attempt === maxRetries || !isRetryableError) {
          console.log(`🛑 ${isRetryableError ? '已达最大重试次数' : '错误类型不可重试'}，停止重试`);
          break;
        }

        // 可重试错误，等待后重试
        const errorTypeLabel = isTimeout ? '超时' : isConnectionError ? '网络连接' : '未知';
        console.log(`⏳ ${errorTypeLabel}错误，等待重试... (${attempt}/${maxRetries})`);
        if (attempt < maxRetries) {
          const delayMs = isConnectionError ? 3000 * attempt : 2000 * attempt; // 连接错误延时更长
          console.log(`⏰ 延时 ${delayMs}ms 后重试`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // 重试失败，记录失败原因和总体统计
    const totalRetryTime = Date.now() - methodStartTime; // 实际的总重试时间

    // 🔧 增强错误分类检测
    const isTimeoutFailure = lastError && (
      lastError.message.includes('timeout') || lastError.message.includes('aborted') ||
      lastError.message.includes('超时') || lastError.name === 'AbortError' ||
      lastError.name === 'SmartLLMTimeoutError' || lastError.message.includes('TIMEOUT:')
    );

    const isConnectionFailure = lastError && (
      lastError.message.includes('ECONNRESET') || lastError.message.includes('Connection reset') ||
      lastError.message.includes('ECONNREFUSED') || lastError.message.includes('ENOTFOUND') ||
      lastError.message.includes('connection_reset') || lastError.message.includes('connection_refused') ||
      lastError.message.includes('dns_error')
    );

    let failureType = '其他错误';
    if (isTimeoutFailure) {
      failureType = '超时失败';
    } else if (isConnectionFailure) {
      failureType = '网络连接失败';
    }

    console.error(`\n🚨 === API 调用失败汇总 ===`);
    console.error(`模型: ${context.model.name} (${context.model.id})`);
    console.error(`重试次数: ${maxRetries}次`);
    console.error(`总耗时: ${(totalRetryTime / 1000).toFixed(2)}秒`);
    console.error(`失败类型: ${failureType}`);
    console.error(`最后错误:`, lastError?.message || '未知错误');
    console.error(`================================\n`);
    
    if (isTimeoutFailure) {
      console.error(`⏰ 超时分析:`);
      console.error(`   - 这可能表明模型响应过慢或网络连接不稳定`);
      console.error(`   - 建议检查网络连接或增加超时时间`);
      console.error(`   - 当前超时设置可在系统配置中查看和调整`);
    }
    
    console.error(`📝 重要：此失败将被记录为测试失败，保证评测结果的准确性`);

    // 🆕 超时兜底机制：返回特殊响应用于0分处理，而不是直接抛出错误
    const isTimeoutError = isTimeoutFailure;
    if (isTimeoutError) {
      console.log('🛡️ 超时兜底机制激活：返回特殊响应用于0分处理');
      return {
        response: '[TIMEOUT_ERROR]', // 特殊标记，表示超时失败
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        response_time: totalRetryTime || 900000, // 使用实际超时时间
        model: context.model.name,
        finish_reason: 'timeout_error',
        timeout_error_message: lastError?.message || '超时错误'
      };
    }
    
    // 对于非超时错误，仍然抛出异常（保持原有逻辑）
    throw lastError || new Error(`被测模型 ${context.model.name} API调用失败，无法完成评测`);
  }

  // ❌ 已删除 fallbackLLMCall 方法
  // 原因：该方法会在超时时错误地切换到 deepseek-ai/DeepSeek-V3
  // 这违反了评测系统的基本原则：测试失败就是失败，不应该换模型

  private async executeEvaluation(
    llmResult: { response: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; response_time: number; model: string; finish_reason?: string; timeout_error_message?: string },
    context: any
  ): Promise<{ score: number; justification: string; executionDetails?: any }> {
    try {
      // 🛡️ 超时兜底机制：检测并处理超时情况
      if (llmResult.response === '[TIMEOUT_ERROR]' || llmResult.finish_reason === 'timeout_error') {
        console.log('🛡️ 检测到超时错误，直接返回0分');
        const timeoutJustification = `模型响应超时失败。${llmResult.timeout_error_message || '超时错误'}。响应时间: ${(llmResult.response_time / 1000).toFixed(2)}秒。为保证评测进度，此项给予0分，支持后续重试。`;
        
        return {
          score: 0,
          justification: timeoutJustification,
          executionDetails: {
            error_type: 'timeout',
            error_message: llmResult.timeout_error_message || '超时错误',
            response_time: llmResult.response_time,
            is_retryable: true // 标记为可重试
          }
        };
      }

      // 使用统一的评分器引擎
      const evaluatorEngine = new EvaluatorEngine();
      
      // 计算成本估算
      let estimatedCost = 0;
      try {
        // 动态导入 llmClient 以避免循环依赖
        const { llmClient } = await import('@/lib/llm-client');
        estimatedCost = llmClient.estimateCost(
          context.model.id,
          llmResult.prompt_tokens,
          llmResult.completion_tokens
        );
      } catch (error) {
        console.warn('成本估算失败，使用默认值0:', error);
      }

      // 🆕 Bug #6: 多模态兼容性检查（警告模式，不阻止执行）
      const compatibilityCheck = await checkMultimodalCompatibility(
        context.testCase,
        context.evaluator.config.model_id, // PROMPT类型评分器的模型ID
        this.supabase
      );

      // 初始化结果metadata，用于记录警告信息
      let resultMetadata: any = {};

      if (compatibilityCheck.hasWarning) {
        // 记录警告到metadata，将在评测结果中显示
        resultMetadata.multimodal_compatibility_warning = {
          message: compatibilityCheck.warningMessage,
          timestamp: new Date().toISOString(),
          ...compatibilityCheck.details
        };

        console.warn(`🚨 多模态兼容性警告（继续执行）:`);
        console.warn(`   ${compatibilityCheck.warningMessage}`);
      }

      // 构建评估上下文，包含被评测模型的性能统计
      const evaluationContext: EvaluationContext = {
        test_case: {
          id: context.testCase.id,
          input: context.testCase.input,
          reference_answer: context.testCase.reference_answer,
          reference_answer_multimodal: context.testCase.reference_answer_multimodal, // 🆕 Bug #6: 传递多模态参考答案
          max_score: context.testCase.max_score,
          metadata: context.testCase.metadata
        },
        model_response: llmResult.response,
        dimension: {
          id: context.dimension.id,
          name: context.dimension.name,
          description: context.dimension.description
        },
        evaluator: {
          id: context.evaluator.id,
          name: context.evaluator.name,
          type: context.evaluator.type,
          config: context.evaluator.config
        },
        // 🎯 关键修复：添加被评测模型的性能统计数据
        tested_model_stats: {
          prompt_tokens: llmResult.prompt_tokens,
          completion_tokens: llmResult.completion_tokens,
          total_tokens: llmResult.total_tokens,
          execution_time_ms: llmResult.response_time,
          cost_usd: estimatedCost,
          model_name: context.model.name,
          provider: context.model.provider
        }
      };
      
      // 📊 详细日志：EvaluationContext构建完成
      console.log('📊 EvaluationContext构建完成:', {
        test_case_input_preview: evaluationContext.test_case.input.substring(0, 50) + '...',
        model_response_length: evaluationContext.model_response.length,
        tested_model_stats: evaluationContext.tested_model_stats,
        evaluator_info: {
          name: evaluationContext.evaluator.name,
          type: evaluationContext.evaluator.type
        }
      });
      
      console.log(`📊 开始执行${context.evaluator.type}类型评分器: ${context.evaluator.name}`);
      
      const result = await evaluatorEngine.executeEvaluator(evaluationContext);

      // 🆕 Bug #6: 合并兼容性警告metadata到结果中
      if (Object.keys(resultMetadata).length > 0) {
        result.metadata = {
          ...result.metadata,
          ...resultMetadata
        };
      }

      // 🔧 规范化：根据评分器类型构造合适的executionDetails
      const executionDetails = this.buildExecutionDetails(
        context.evaluator.type,
        result
      );

      return {
        score: result.score,
        justification: result.justification,
        executionDetails,
        metadata: result.metadata // 🆕 包含警告信息的metadata
      };
    } catch (error) {
      console.error('❌ 评分执行失败:', error);
      return {
        score: 0,
        justification: `评分失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }




  /**
   * 检查任务是否完成并更新状态
   */
  private async checkTaskCompletion(taskId: string): Promise<void> {
    try {
      // 查询该任务的所有子任务
      const { data: subtasks, error } = await this.supabase
        .from('evaluation_results')
        .select('status')
        .eq('task_id', taskId);

      if (error || !subtasks || subtasks.length === 0) {
        return;
      }

      // 🔧 修复：使用白名单方式，只有最终状态才视为完成
      // 最终状态定义：completed（成功）, failed（失败）, cancelled（已取消）
      const FINAL_STATES = ['completed', 'failed', 'cancelled'];

      // 统计子任务状态
      const completedCount = subtasks.filter(st => st.status === 'completed').length;
      const failedCount = subtasks.filter(st => st.status === 'failed').length;
      const cancelledCount = subtasks.filter(st => st.status === 'cancelled').length;
      const nonFinalCount = subtasks.filter(st => !FINAL_STATES.includes(st.status)).length;

      // 🔧 关键修复：只有当所有子任务都处于最终状态时，才标记任务完成
      // 这样可以正确处理 pending_human_review、success 等中间状态
      if (nonFinalCount === 0) {
        const taskStatus = 'completed'; // 统一使用completed状态，避免字段长度限制

        // 更新主任务状态
        const { error: updateError } = await this.supabase
          .from('evaluation_tasks')
          .update({
            status: taskStatus,
            finished_at: new Date().toISOString(),
          })
          .eq('id', taskId);

        if (!updateError) {
          console.log(`🎉 任务 ${taskId} 已完成 (状态: ${taskStatus})`);
          console.log(`   完成: ${completedCount}, 失败: ${failedCount}, 已取消: ${cancelledCount}`);
        }
      } else {
        // 输出调试信息，方便排查中间状态
        const nonFinalStatuses = subtasks
          .filter(st => !FINAL_STATES.includes(st.status))
          .map(st => st.status);
        const uniqueNonFinal = [...new Set(nonFinalStatuses)];
        console.log(`⏸️ 任务 ${taskId} 尚未完成: ${nonFinalCount} 个非最终状态 (${uniqueNonFinal.join(', ')})`);
      }
    } catch (error) {
      console.error('❌ 检查任务完成状态失败:', error);
    }
  }

  private async performHealthCheck(): Promise<{
    database_connected: boolean;
    llm_api_available: boolean;
  }> {
    try {
      // 检查数据库连接
      const { error: dbError } = await this.supabase
        .from('evaluation_tasks')
        .select('id')
        .limit(1);

      // 检查LLM API
      const llmAvailable = !!this.config.llm?.api_key;

      return {
        database_connected: !dbError,
        llm_api_available: llmAvailable,
      };
    } catch {
      return {
        database_connected: false,
        llm_api_available: false,
      };
    }
  }

  /**
   * 解析评分结果（增强版 - 支持多种格式和题目满分）
   */
  private parseScore(response: string, scoreRange: [number, number], maxScore?: number): number {
    try {
      // 使用新的强化评分提取逻辑
      const extractedScore = scoringEngine.extractScoreFromText(response, maxScore || scoreRange[1]);
      
      // 确保分数在有效范围内
      const [min, max] = scoreRange;
      const clampedScore = Math.max(min, Math.min(max, extractedScore));
      
      logger.info('评分提取结果', {
        originalText: response.substring(0, 100) + '...',
        extractedScore,
        maxScore: maxScore || scoreRange[1],
        clampedScore,
        scoreRange
      });
      
      return clampedScore;
    } catch (error) {
      console.error('解析评分失败:', error);
      logger.error('评分解析错误', {
        error: error instanceof Error ? error.message : '未知错误',
        response: response.substring(0, 200),
        scoreRange,
        maxScore
      });
      return scoreRange[0];
    }
  }

  /**
   * 新增：解析标准化评分结果
   * 专门用于新的得分点评分体系
   */
  private parseStandardizedScore(
    response: string, 
    testCaseMaxScore: number = 100
  ): { rawScore: number; normalizedScore: number; percentage: number } {
    try {
      // 从LLM响应中提取原始分数
      const rawScore = scoringEngine.extractScoreFromText(response, testCaseMaxScore);
      
      // 计算标准化得分
      const scoringResult = scoringEngine.calculateQuestionScore(rawScore, testCaseMaxScore);
      
      return {
        rawScore: scoringResult.raw_score,
        normalizedScore: scoringResult.normalized_score,
        percentage: scoringResult.percentage_score
      };
    } catch (error) {
      console.error('标准化评分解析失败:', error);
      return {
        rawScore: 0,
        normalizedScore: 0,
        percentage: 0
      };
    }
  }

  /**
   * 🛡️ 独立的僵尸任务检测和重置方法
   * 不受并发限制影响，优先执行
   */
  private async detectAndResetZombieTasks(zombieTimeoutMs: number, zombieTimeoutMinutes: number): Promise<void> {
    try {
      console.log(`🔍 独立执行僵尸任务检测 (超时阈值: ${zombieTimeoutMinutes}分钟)...`);
      
      // 查询所有运行中且超时的子任务
      const { data: zombieTasks, error } = await this.supabase
        .from('evaluation_results')
        .select('id, updated_at, task_id')
        .eq('status', 'running')
        .lt('updated_at', new Date(Date.now() - zombieTimeoutMs).toISOString());

      if (error) {
        console.error('❌ 查询僵尸任务失败:', error);
        return;
      }

      if (!zombieTasks || zombieTasks.length === 0) {
        console.log('✅ 没有发现僵尸任务');
        return;
      }

      console.log(`🚨 发现 ${zombieTasks.length} 个僵尸任务，开始重置...`);
      
      // 批量重置僵尸任务
      for (const zombie of zombieTasks) {
        const timeSinceUpdate = new Date().getTime() - new Date(zombie.updated_at).getTime();
        const minutesRunning = Math.round(timeSinceUpdate / 60000);
        
        console.log(`⚠️ 重置僵尸子任务 ${zombie.id}，运行时间: ${minutesRunning}分钟，超过阈值 ${zombieTimeoutMinutes}分钟`);
        
        try {
          await this.supabase
            .from('evaluation_results')
            .update({ 
              status: 'pending',
              updated_at: new Date().toISOString(),
              error_message: `僵尸任务自动重置 (运行了${minutesRunning}分钟)`
            })
            .eq('id', zombie.id);
        } catch (resetError) {
          console.error(`❌ 重置僵尸任务 ${zombie.id} 失败:`, resetError);
        }
      }
      
      console.log(`✅ 僵尸任务重置完成，共处理 ${zombieTasks.length} 个任务`);
    } catch (error) {
      console.error('❌ 僵尸任务检测过程失败:', error);
    }
  }

}
