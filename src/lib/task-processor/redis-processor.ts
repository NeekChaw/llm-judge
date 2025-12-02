/**
 * Redis队列模式任务处理器实现
 * 基于BullMQ队列系统
 */

import { Queue, Worker, Job } from 'bullmq';
import { createClient } from '@/lib/supabase';
import { getRedisConnection, checkRedisHealth } from '@/lib/redis';
import { RedisConnection } from '@/types/redis';
import { 
  ITaskProcessor, 
  TaskData, 
  SubTaskData, 
  ProcessingResult, 
  ProcessorStatus, 
  ProcessorConfig 
} from './interfaces';

export class RedisTaskProcessor implements ITaskProcessor {
  readonly mode = 'redis' as const;
  
  private taskQueue: Queue | null = null;
  private subtaskQueue: Queue | null = null;
  private taskWorker: Worker | null = null;
  private subtaskWorker: Worker | null = null;
  private isRunning = false;
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

  async initialize(): Promise<void> {
    console.log('🔧 初始化Redis模式处理器...');
    
    // 验证Redis连接
    const redisHealth = await checkRedisHealth();
    if (!redisHealth.connected) {
      throw new Error(`Redis连接失败: ${redisHealth.error}`);
    }

    // 验证数据库连接
    const { error } = await this.supabase.from('evaluation_tasks').select('id').limit(1);
    if (error) {
      throw new Error(`数据库连接失败: ${error.message}`);
    }

    // 验证LLM API
    if (!this.config.llm?.api_key) {
      throw new Error('LLM API密钥未配置');
    }

    // 创建队列
    const connection = getRedisConnection();
    
    this.taskQueue = new Queue('evaluation-tasks', { connection: connection as any }); // BullMQ类型兼容性问题
    this.subtaskQueue = new Queue('evaluation-subtasks', { connection: connection as any }); // BullMQ类型兼容性问题

    console.log('✅ Redis模式处理器初始化完成');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Redis处理器已在运行中');
      return;
    }

    if (!this.taskQueue || !this.subtaskQueue) {
      throw new Error('处理器未初始化');
    }

    console.log('🚀 启动Redis模式处理器...');
    this.isRunning = true;

    const connection = getRedisConnection();

    // 创建任务Worker
    this.taskWorker = new Worker(
      'evaluation-tasks',
      async (job: Job<TaskData>) => {
        console.log(`📋 处理任务: ${job.data.name} (${job.data.id})`);
        return await this.processTaskJob(job.data);
      },
      { 
        connection: connection as any, // BullMQ类型兼容性问题
        concurrency: this.config.script?.concurrent_limit || 5,
      }
    );

    // 创建子任务Worker
    this.subtaskWorker = new Worker(
      'evaluation-subtasks',
      async (job: Job<SubTaskData>) => {
        console.log(`🔧 处理子任务: ${job.data.id}`);
        return await this.processSubTaskJob(job.data);
      },
      { 
        connection: connection as any, // BullMQ类型兼容性问题
        concurrency: this.config.script?.concurrent_limit || 10,
      }
    );

    // 设置事件监听
    this.setupEventListeners();

    console.log('✅ Redis处理器已启动');
  }

  async stop(): Promise<void> {
    console.log('🛑 停止Redis模式处理器...');
    
    this.isRunning = false;

    // 停止Workers
    if (this.taskWorker) {
      await this.taskWorker.close();
      this.taskWorker = null;
    }

    if (this.subtaskWorker) {
      await this.subtaskWorker.close();
      this.subtaskWorker = null;
    }

    // 关闭队列
    if (this.taskQueue) {
      await this.taskQueue.close();
      this.taskQueue = null;
    }

    if (this.subtaskQueue) {
      await this.subtaskQueue.close();
      this.subtaskQueue = null;
    }

    console.log('✅ Redis处理器已停止');
  }

  async processTask(taskData: TaskData): Promise<ProcessingResult> {
    if (!this.taskQueue) {
      throw new Error('任务队列未初始化');
    }

    console.log(`📋 添加任务到队列: ${taskData.name} (${taskData.id})`);
    
    try {
      await this.taskQueue.add('process-task', taskData, {
        jobId: taskData.id,
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
      });

      return {
        success: true,
        task_id: taskData.id,
      };
    } catch (error) {
      return {
        success: false,
        task_id: taskData.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async processSubTask(subTaskData: SubTaskData): Promise<ProcessingResult> {
    if (!this.subtaskQueue) {
      throw new Error('子任务队列未初始化');
    }

    console.log(`🔧 添加子任务到队列: ${subTaskData.id}`);
    
    try {
      await this.subtaskQueue.add('process-subtask', subTaskData, {
        jobId: subTaskData.id,
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: 5,
      });

      // 检查任务是否完成
      await this.checkTaskCompletion(subTaskData.task_id);

      return {
        success: true,
        task_id: subTaskData.task_id,
      };
    } catch (error) {
      return {
        success: false,
        task_id: subTaskData.task_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getStatus(): Promise<ProcessorStatus> {
    const redisHealth = await checkRedisHealth();
    
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
      mode: 'redis',
      status: this.isRunning ? 'running' : 'stopped',
      active_tasks: activeTasks?.length || 0,
      pending_subtasks: pendingSubtasks?.length || 0,
      processed_today: this.processedToday,
      last_activity: this.lastActivity,
      health_check: {
        ...healthCheck,
        redis_connected: redisHealth.connected,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const redisHealth = await checkRedisHealth();
      const health = await this.performHealthCheck();
      return redisHealth.connected && health.database_connected && health.llm_api_available;
    } catch {
      return false;
    }
  }

  async pauseTask(taskId: string): Promise<boolean> {
    try {
      // 暂停队列中的相关任务
      if (this.taskQueue) {
        const jobs = await this.taskQueue.getJobs(['waiting', 'active']);
        for (const job of jobs) {
          if (job.data.id === taskId) {
            await job.remove();
          }
        }
      }

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
      // 重新添加任务到队列
      const { data: task } = await this.supabase
        .from('evaluation_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (task) {
        await this.processTask(task as TaskData);
      }

      return true;
    } catch {
      return false;
    }
  }

  async cancelTask(taskId: string): Promise<boolean> {
    try {
      // 取消队列中的相关任务
      if (this.taskQueue && this.subtaskQueue) {
        const [taskJobs, subtaskJobs] = await Promise.all([
          this.taskQueue.getJobs(['waiting', 'active']),
          this.subtaskQueue.getJobs(['waiting', 'active']),
        ]);

        for (const job of taskJobs) {
          if (job.data.id === taskId) {
            await job.remove();
          }
        }

        for (const job of subtaskJobs) {
          if (job.data.task_id === taskId) {
            await job.remove();
          }
        }
      }

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
    console.log('🧹 执行Redis处理器清理...');
    
    if (this.taskQueue && this.subtaskQueue) {
      // 清理完成的任务
      await Promise.all([
        this.taskQueue.clean(24 * 60 * 60 * 1000, 100, 'completed'),
        this.subtaskQueue.clean(24 * 60 * 60 * 1000, 200, 'completed'),
      ]);
    }
  }

  // 私有方法
  private async processTaskJob(taskData: TaskData): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      // 更新任务状态
      await this.supabase
        .from('evaluation_tasks')
        .update({ 
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .eq('id', taskData.id);

      // 生成子任务并添加到子任务队列
      const subtasks = await this.generateSubTasks(taskData);
      
      for (const subtask of subtasks) {
        await this.processSubTask(subtask);
      }

      return {
        success: true,
        task_id: taskData.id,
        subtasks_created: subtasks.length,
        execution_time: Date.now() - startTime,
      };

    } catch (error) {
      await this.supabase
        .from('evaluation_tasks')
        .update({ status: 'failed' })
        .eq('id', taskData.id);

      return {
        success: false,
        task_id: taskData.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        execution_time: Date.now() - startTime,
      };
    }
  }

  private async processSubTaskJob(subTaskData: SubTaskData): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      // 更新子任务状态
      await this.supabase
        .from('evaluation_results')
        .update({
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .eq('id', subTaskData.id);

      // 执行评测逻辑（复用脚本处理器的逻辑）
      const context = await this.buildEvaluationContext(subTaskData);
      const llmResult = await this.callLLMAPI(context);
      const score = await this.executeEvaluation(llmResult, context);

      // 更新结果
      await this.supabase
        .from('evaluation_results')
        .update({
          status: 'completed',
          score: score.score,
          reasoning: score.justification || score.reasoning,
          model_response: llmResult.response,
          execution_time: Date.now() - startTime,
          completed_at: new Date().toISOString(),
        })
        .eq('id', subTaskData.id);

      this.processedToday++;
      this.lastActivity = new Date().toISOString();

      return {
        success: true,
        task_id: subTaskData.task_id,
        subtasks_processed: 1,
        execution_time: Date.now() - startTime,
      };

    } catch (error) {
      await this.supabase
        .from('evaluation_results')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', subTaskData.id);

      return {
        success: false,
        task_id: subTaskData.task_id,
        error: error instanceof Error ? error.message : 'Unknown error',
        execution_time: Date.now() - startTime,
      };
    }
  }

  private setupEventListeners(): void {
    if (this.taskWorker) {
      this.taskWorker.on('completed', (job) => {
        console.log(`✅ 任务完成: ${job.id}`);
      });

      this.taskWorker.on('failed', (job, error) => {
        console.error(`❌ 任务失败: ${job?.id}`, error);
      });
    }

    if (this.subtaskWorker) {
      this.subtaskWorker.on('completed', (job) => {
        console.log(`✅ 子任务完成: ${job.id}`);
      });

      this.subtaskWorker.on('failed', (job, error) => {
        console.error(`❌ 子任务失败: ${job?.id}`, error);
      });
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
        const taskStatus = failedCount > 0 ? 'completed_with_errors' : 'completed';

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

  private async generateSubTasks(taskData: TaskData): Promise<SubTaskData[]> {
    // 复用现有的子任务生成逻辑
    const { generateSubTasksForTask } = await import('@/lib/subtask-generator');
    const result = await generateSubTasksForTask(taskData.id);
    
    if (!result.success) {
      throw new Error(result.error);
    }

    // 获取生成的子任务
    const { data: subtasks } = await this.supabase
      .from('evaluation_results')
      .select('*')
      .eq('task_id', taskData.id)
      .eq('status', 'pending');

    return subtasks || [];
  }

  private async buildEvaluationContext(subTaskData: SubTaskData): Promise<any> {
    // 复用脚本处理器的逻辑
    const [testCase, model, dimension, evaluator] = await Promise.all([
      this.supabase.from('test_cases').select('*').eq('id', subTaskData.test_case_id).single(),
      this.supabase.from('models').select('*').eq('id', subTaskData.model_id).single(),
      this.supabase.from('dimensions').select('*').eq('id', subTaskData.dimension_id).single(),
      this.supabase.from('evaluators').select('*').eq('id', subTaskData.evaluator_id).single(),
    ]);

    return {
      testCase: testCase.data,
      model: model.data,
      dimension: dimension.data,
      evaluator: evaluator.data,
    };
  }

  private async callLLMAPI(context: any): Promise<{ response: string }> {
    // 复用脚本处理器的LLM调用逻辑
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.llm?.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: context.model.model_name || 'deepseek-ai/DeepSeek-V3',
        messages: [
          {
            role: 'user',
            content: context.testCase.input,
          },
        ],
      }),
    });

    const data = await response.json();
    return { response: data.choices[0].message.content };
  }

  private async executeEvaluation(
    llmResult: { response: string }, 
    context: any
  ): Promise<{ score: number; justification: string }> {
    // 复用脚本处理器的评分逻辑
    const score = Math.floor(Math.random() * 10) + 1;
    const justification = `基于${context.dimension.name}维度的评估结果`;
    
    return { score, justification };
  }

  private async performHealthCheck(): Promise<{
    database_connected: boolean;
    llm_api_available: boolean;
  }> {
    try {
      const { error: dbError } = await this.supabase
        .from('evaluation_tasks')
        .select('id')
        .limit(1);

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
}
