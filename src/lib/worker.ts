import { Worker, Job, WorkerOptions } from 'bullmq';
import { getRedisConnection } from './redis';
import { createWorker, isDevelopmentMode } from './mock-bullmq';
import { WorkerConfig, EvaluationTask, EvaluationSubTask, TaskStatus } from '@/types/task';
import { evaluationSubTaskQueue } from './queue';
import { evaluatorEngine, EvaluationContext } from './evaluator-engine';

// Worker配置
const workerConfigs: Record<string, WorkerConfig> = {
  'evaluation-tasks': {
    concurrency: 3,
    limiter: {
      max: 10,
      duration: 60000, // 1分钟
    },
    settings: {
      stalledInterval: 30000,
      maxStalledCount: 3,
    },
  },
  'evaluation-subtasks': {
    concurrency: 5,
    limiter: {
      max: 20,
      duration: 60000, // 1分钟
    },
    settings: {
      stalledInterval: 15000,
      maxStalledCount: 2,
    },
  },
};

// Worker实例缓存
const workers: Map<string, Worker> = new Map();

/**
 * 创建评测任务Worker
 */
export function createEvaluationTaskWorker(): Worker {
  const config = workerConfigs['evaluation-tasks'];
  const connection = getRedisConnection();
  
  let worker: Worker;

  if (isDevelopmentMode) {
    // 开发模式使用Mock Worker
    worker = createWorker('evaluation-tasks', async (job: Job<EvaluationTask>) => {
      console.log(`🚀 [MOCK] Processing evaluation task: ${job.data.id}`);
      
      try {
        // 更新任务状态为运行中
        await updateTaskStatus(job.data.id, TaskStatus.RUNNING);
        
        // 执行任务分解逻辑
        const result = await processEvaluationTask(job.data);
        
        // 更新任务状态为完成
        await updateTaskStatus(job.data.id, TaskStatus.COMPLETED);
        
        return result;
      } catch (error) {
        console.error(`❌ [MOCK] Evaluation task ${job.data.id} failed:`, error);
        await updateTaskStatus(job.data.id, TaskStatus.FAILED);
        throw error;
      }
    }, connection) as Worker;
  } else {
    // 生产模式使用真实Worker
    const options: WorkerOptions = {
      connection: connection as any, // BullMQ类型兼容性问题，需要MockRedis实现BullMQ接口
      concurrency: config.concurrency,
      limiter: config.limiter,
    };

    worker = new Worker(
      'evaluation-tasks',
      async (job: Job<EvaluationTask>) => {
        console.log(`🚀 Processing evaluation task: ${job.data.id}`);
        
        try {
          // 更新任务状态为运行中
          await updateTaskStatus(job.data.id, TaskStatus.RUNNING);
          
          // 执行任务分解逻辑
          const result = await processEvaluationTask(job.data);
          
          // 更新任务状态为完成
          await updateTaskStatus(job.data.id, TaskStatus.COMPLETED);
          
          return result;
        } catch (error) {
          console.error(`❌ Evaluation task ${job.data.id} failed:`, error);
          await updateTaskStatus(job.data.id, TaskStatus.FAILED);
          throw error;
        }
      },
      options
    );
  }

  // 事件监听
  worker.on('completed', (job) => {
    console.log(`✅ Evaluation task completed: ${job.id}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`❌ Evaluation task failed: ${job?.id}`, error);
  });

  worker.on('error', (error) => {
    console.error('❌ Evaluation task worker error:', error);
  });

  workers.set('evaluation-tasks', worker);
  return worker;
}

/**
 * 创建评测子任务Worker
 */
export function createEvaluationSubTaskWorker(): Worker {
  const config = workerConfigs['evaluation-subtasks'];
  const connection = getRedisConnection();

  let worker: Worker;

  if (isDevelopmentMode) {
    // 开发模式使用Mock Worker
    worker = createWorker('evaluation-subtasks', async (job: Job<EvaluationSubTask>) => {
      console.log(`🔧 [MOCK] Processing evaluation subtask: ${job.data.id}`);
      
      try {
        // 更新子任务状态为运行中
        await updateSubTaskStatus(job.data.id, TaskStatus.RUNNING);
        
        // 执行具体的评分逻辑
        const result = await processEvaluationSubTask(job.data);
        
        // 更新子任务状态为完成
        await updateSubTaskStatus(job.data.id, TaskStatus.COMPLETED);
        
        return result;
      } catch (error) {
        console.error(`❌ [MOCK] Evaluation subtask ${job.data.id} failed:`, error);
        
        // 检查是否还有重试次数
        if (job.data.retry_count < job.data.max_retries) {
          // 增加重试计数
          job.data.retry_count++;
          await updateSubTaskRetryCount(job.data.id, job.data.retry_count);
          
          console.log(`🔄 [MOCK] Retrying subtask ${job.data.id}, attempt ${job.data.retry_count}`);
          throw error; // 让Mock处理重试
        } else {
          // 达到最大重试次数，标记为失败
          await updateSubTaskStatus(job.data.id, TaskStatus.FAILED, 
            error instanceof Error ? error.message : 'Unknown error');
          throw error;
        }
      }
    }, connection) as Worker;
  } else {
    // 生产模式使用真实Worker
    const options: WorkerOptions = {
      connection: connection as any, // BullMQ类型兼容性问题，需要MockRedis实现BullMQ接口
      concurrency: config.concurrency,
      limiter: config.limiter,
    };

    worker = new Worker(
      'evaluation-subtasks',
      async (job: Job<EvaluationSubTask>) => {
        console.log(`🔧 Processing evaluation subtask: ${job.data.id}`);
        
        try {
          // 更新子任务状态为运行中
          await updateSubTaskStatus(job.data.id, TaskStatus.RUNNING);
          
          // 执行具体的评分逻辑
          const result = await processEvaluationSubTask(job.data);
          
          // 更新子任务状态为完成
          await updateSubTaskStatus(job.data.id, TaskStatus.COMPLETED);
          
          return result;
        } catch (error) {
          console.error(`❌ Evaluation subtask ${job.data.id} failed:`, error);
          
          // 检查是否还有重试次数
          if (job.data.retry_count < job.data.max_retries) {
            // 增加重试计数
            job.data.retry_count++;
            await updateSubTaskRetryCount(job.data.id, job.data.retry_count);
            
            console.log(`🔄 Retrying subtask ${job.data.id}, attempt ${job.data.retry_count}`);
            throw error; // 让BullMQ处理重试
          } else {
            // 达到最大重试次数，标记为失败
            await updateSubTaskStatus(job.data.id, TaskStatus.FAILED, 
              error instanceof Error ? error.message : 'Unknown error');
            throw error;
          }
        }
      },
      options
    );
  }

  // 事件监听
  worker.on('completed', (job) => {
    console.log(`✅ Evaluation subtask completed: ${job.id}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`❌ Evaluation subtask failed: ${job?.id}`, error);
  });

  worker.on('error', (error) => {
    console.error('❌ Evaluation subtask worker error:', error);
  });

  workers.set('evaluation-subtasks', worker);
  return worker;
}

/**
 * 处理评测任务（任务分解）
 */
async function processEvaluationTask(task: EvaluationTask): Promise<{ 
  subtasks_created: number; 
  estimated_duration: number;
}> {
  console.log(`📋 Decomposing task ${task.name} into subtasks...`);
  
  // TODO: 从数据库获取模板的维度-评分器映射
  // 这里使用演示数据
  const templateMappings = await getTemplateMappings(task.template_id);
  
  const subtasks: EvaluationSubTask[] = [];
  
  // 为每个测试用例 × 模型 × 维度-评分器组合创建子任务
  for (const testCaseId of task.test_case_ids) {
    for (const modelId of task.model_ids) {
      for (const mapping of templateMappings) {
        const subtask: EvaluationSubTask = {
          id: `subtask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // 临时ID，用于队列
          parent_task_id: task.id,
          test_case_id: testCaseId,
          model_id: modelId,
          dimension_id: mapping.dimension_id,
          evaluator_id: mapping.evaluator_id,
          status: TaskStatus.PENDING,
          priority: task.priority,
          retry_count: 0,
          max_retries: task.config.retry_count || 3,
          created_at: new Date().toISOString(),
        };

        subtasks.push(subtask);
      }
    }
  }
  
  // 将子任务添加到队列
  const queue = evaluationSubTaskQueue();
  const addPromises = subtasks.map(subtask => 
    queue.add('evaluation-subtask', subtask, {
      jobId: subtask.id,
      priority: subtask.priority,
    })
  );
  
  await Promise.all(addPromises);
  
  console.log(`✅ Created ${subtasks.length} subtasks for task ${task.id}`);
  
  return {
    subtasks_created: subtasks.length,
    estimated_duration: subtasks.length * 30, // 每个子任务预估30秒
  };
}

/**
 * 处理评测子任务（具体评分逻辑）
 */
async function processEvaluationSubTask(subTask: EvaluationSubTask): Promise<{
  score: number;
  justification: string;
  execution_time: number;
  metadata?: Record<string, any>;
}> {
  console.log(`🎯 Executing evaluation for subtask ${subTask.id}`);
  
  try {
    // 获取评分所需的上下文信息
    const context = await buildEvaluationContext(subTask);
    
    // 使用评分器引擎执行评分
    const result = await evaluatorEngine.executeEvaluator(context);
    
    console.log(`📊 Subtask ${subTask.id} scored: ${result.score}`);
    
    // 保存评分结果到数据库
    await saveEvaluationResult(subTask, result);
    
    return {
      score: result.score,
      justification: result.justification,
      execution_time: result.execution_time,
      metadata: result.metadata,
    };
  } catch (error) {
    console.error(`❌ Subtask ${subTask.id} evaluation failed:`, error);
    throw error;
  }
}

/**
 * 构建评分上下文
 */
async function buildEvaluationContext(subTask: EvaluationSubTask): Promise<EvaluationContext> {
  // TODO: 实际实现应该从数据库获取这些信息
  // 这里使用模拟数据
  
  const testCase = await getTestCase(subTask.test_case_id);
  const dimension = await getDimension(subTask.dimension_id);
  const evaluator = await getEvaluator(subTask.evaluator_id);
  const modelResponse = await getModelResponse(subTask.test_case_id, subTask.model_id);
  
  return {
    test_case: {
      id: testCase.id,
      input: testCase.input,
      reference_answer: testCase.reference_answer,
      metadata: testCase.metadata,
    },
    model_response: modelResponse,
    dimension: {
      id: dimension.id,
      name: dimension.name,
      description: dimension.description,
    },
    evaluator: {
      id: evaluator.id,
      name: evaluator.name,
      type: evaluator.type,
      config: evaluator.config,
    },
  };
}

/**
 * 获取模板映射关系（真实数据库实现）
 */
async function getTemplateMappings(templateId: string): Promise<Array<{
  dimension_id: string;
  evaluator_id: string;
  weight: number;
}>> {
  try {
    const { createClient } = await import('@/lib/supabase');
    const supabase = createClient();

    const { data: mappings, error } = await supabase
      .from('template_mappings')
      .select('dimension_id, evaluator_id, weight')
      .eq('template_id', templateId);

    if (error) {
      console.error(`❌ Failed to fetch template mappings for ${templateId}:`, error);
      return [];
    }

    if (!mappings || mappings.length === 0) {
      console.warn(`⚠️ No template mappings found for template ${templateId}`);
      return [];
    }

    console.log(`✅ Found ${mappings.length} template mappings for ${templateId}`);
    return mappings;
  } catch (error) {
    console.error(`❌ Error fetching template mappings:`, error);
    return [];
  }
}

/**
 * 获取测试用例（真实数据库实现）
 */
async function getTestCase(testCaseId: string): Promise<any> {
  try {
    const { createClient } = await import('@/lib/supabase');
    const supabase = createClient();

    const { data: testCase, error } = await supabase
      .from('test_cases')
      .select('*')
      .eq('id', testCaseId)
      .single();

    if (error) {
      console.error(`❌ Failed to fetch test case ${testCaseId}:`, error);
      return null;
    }

    return testCase;
  } catch (error) {
    console.error(`❌ Error fetching test case:`, error);
    return null;
  }
}

/**
 * 获取维度信息（模拟实现）
 */
async function getDimension(dimensionId: string): Promise<any> {
  return {
    id: dimensionId,
    name: '代码质量',
    description: '评估代码的可读性、效率和最佳实践',
  };
}

/**
 * 获取评分器信息（模拟实现）
 */
async function getEvaluator(evaluatorId: string): Promise<any> {
  return {
    id: evaluatorId,
    name: 'LLM代码评分器',
    type: 'PROMPT',
    config: {
      model_id: 'gpt-3.5-turbo',
      system_prompt: '你是一个专业的代码评分专家。',
      evaluation_prompt: '请评估以下代码的质量：\n输入：{{test_input}}\n模型响应：{{model_response}}\n参考答案：{{reference_answer}}',
      temperature: 0.3,
      max_tokens: 500,
      score_min: 0,
      score_max: 100,
      score_step: 1,
    },
  };
}

/**
 * 获取模型响应（模拟实现）
 */
async function getModelResponse(testCaseId: string, modelId: string): Promise<string> {
  // TODO: 实际实现应该调用被评测的模型
  return `def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a`;
}

/**
 * 保存评分结果（真实数据库实现）
 */
async function saveEvaluationResult(subTask: EvaluationSubTask, result: any): Promise<void> {
  try {
    const { createClient } = await import('@/lib/supabase');
    const supabase = createClient();

    const { error } = await supabase
      .from('evaluation_results')
      .insert({
        // 不设置id，让数据库自动生成
        task_id: subTask.parent_task_id,
        test_case_id: subTask.test_case_id,
        model_id: subTask.model_id,
        dimension_id: subTask.dimension_id,
        evaluator_id: subTask.evaluator_id,
        score: result.score,
        justification: result.justification,
        model_response: result.metadata,
        status: 'success',
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error(`❌ Failed to save evaluation result for ${subTask.id}:`, error);
      throw error;
    }

    console.log(`💾 Saved evaluation result for subtask ${subTask.id}: ${result.score}`);
  } catch (error) {
    console.error(`❌ Error saving evaluation result:`, error);
    throw error;
  }
}

/**
 * 更新任务状态（真实数据库实现）
 */
async function updateTaskStatus(taskId: string, status: TaskStatus, errorMessage?: string): Promise<void> {
  try {
    const { createClient } = await import('@/lib/supabase');
    const supabase = createClient();

    const updateData: any = {
      status: status,
      updated_at: new Date().toISOString(),
    };

    if (status === TaskStatus.RUNNING && !errorMessage) {
      updateData.started_at = new Date().toISOString();
    } else if (status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) {
      updateData.finished_at = new Date().toISOString();
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabase
      .from('evaluation_tasks')
      .update(updateData)
      .eq('id', taskId);

    if (error) {
      console.error(`❌ Failed to update task status for ${taskId}:`, error);
      throw error;
    }

    console.log(`📝 Task ${taskId} status updated to: ${status}${errorMessage ? ` (${errorMessage})` : ''}`);
  } catch (error) {
    console.error(`❌ Error updating task status:`, error);
    throw error;
  }
}

/**
 * 更新子任务状态（真实数据库实现）
 */
async function updateSubTaskStatus(subTaskId: string, status: TaskStatus, errorMessage?: string): Promise<void> {
  try {
    const { createClient } = await import('@/lib/supabase');
    const supabase = createClient();

    const updateData: any = {
      status: status,
      updated_at: new Date().toISOString(),
    };

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabase
      .from('evaluation_results')
      .update(updateData)
      .eq('id', subTaskId);

    if (error) {
      console.error(`❌ Failed to update subtask status for ${subTaskId}:`, error);
      throw error;
    }

    console.log(`📝 Subtask ${subTaskId} status updated to: ${status}${errorMessage ? ` (${errorMessage})` : ''}`);
  } catch (error) {
    console.error(`❌ Error updating subtask status:`, error);
    throw error;
  }
}



/**
 * 更新子任务重试计数（模拟数据库操作）
 */
async function updateSubTaskRetryCount(subTaskId: string, retryCount: number): Promise<void> {
  // TODO: 实际实现应该更新数据库
  console.log(`🔄 SubTask ${subTaskId} retry count updated to: ${retryCount}`);
}

/**
 * 启动所有Workers
 */
export function startAllWorkers(): void {
  console.log('🚀 Starting all workers...');
  
  createEvaluationTaskWorker();
  createEvaluationSubTaskWorker();
  
  console.log('✅ All workers started successfully');
}

/**
 * 优雅关闭所有Workers
 */
export async function closeAllWorkers(): Promise<void> {
  console.log('🛑 Stopping all workers...');
  
  const closePromises = Array.from(workers.values()).map(worker => worker.close());
  await Promise.all(closePromises);
  workers.clear();
  
  console.log('✅ All workers closed gracefully');
}

/**
 * 获取Workers健康状态
 */
export function getWorkersHealth() {
  const health: Record<string, any> = {};
  
  for (const [name, worker] of workers.entries()) {
    health[name] = {
      status: worker.isRunning() ? 'running' : 'stopped',
      concurrency: workerConfigs[name].concurrency,
    };
  }
  
  return health;
}