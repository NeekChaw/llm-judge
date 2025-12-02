import { Queue, QueueOptions } from 'bullmq';
import { getRedisConnection } from './redis';
import { createQueue, isDevelopmentMode } from './mock-bullmq';
import type { QueueConfig, EvaluationTask, EvaluationSubTask } from '@/types/task';

// 队列配置
const queueConfigs: Record<string, QueueConfig> = {
  'evaluation-tasks': {
    name: 'evaluation-tasks',
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
    settings: {
      stalledInterval: 30000,
      maxStalledCount: 3,
    },
  },
  'evaluation-subtasks': {
    name: 'evaluation-subtasks',
    defaultJobOptions: {
      removeOnComplete: 200,
      removeOnFail: 100,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
    settings: {
      stalledInterval: 15000,
      maxStalledCount: 2,
    },
  },
};

// 队列实例缓存
const queues: Map<string, Queue> = new Map();

/**
 * 创建或获取队列实例
 */
export function getQueue(queueName: string): Queue {
  if (!queues.has(queueName)) {
    const config = queueConfigs[queueName];
    if (!config) {
      throw new Error(`Queue configuration not found for: ${queueName}`);
    }

    const connection = getRedisConnection();
    let queue: Queue;

    if (isDevelopmentMode) {
      // 开发模式使用Mock队列
      queue = createQueue(queueName, connection) as Queue;
    } else {
      // 生产模式使用真实BullMQ
      const options: QueueOptions = {
        connection: connection as any, // BullMQ类型兼容性问题，需要MockRedis实现BullMQ接口
        defaultJobOptions: config.defaultJobOptions,
      };
      queue = new Queue(queueName, options);
    }
    
    // 事件监听
    queue.on('error', (error) => {
      console.error(`❌ Queue ${queueName} error:`, error);
    });

    queues.set(queueName, queue);
  }

  return queues.get(queueName)!;
}

/**
 * 评测任务队列
 */
export const evaluationTaskQueue = () => getQueue('evaluation-tasks');

/**
 * 评测子任务队列
 */
export const evaluationSubTaskQueue = () => getQueue('evaluation-subtasks');

/**
 * 添加评测任务到队列
 */
export async function addEvaluationTask(
  task: EvaluationTask,
  options?: {
    delay?: number;
    priority?: number;
  }
) {
  const queue = evaluationTaskQueue();
  
  return await queue.add(
    'evaluation-task',
    task,
    {
      jobId: task.id,
      priority: options?.priority || task.priority,
      delay: options?.delay,
    }
  );
}

/**
 * 添加评测子任务到队列
 */
export async function addEvaluationSubTask(
  subTask: EvaluationSubTask,
  options?: {
    delay?: number;
    priority?: number;
  }
) {
  const queue = evaluationSubTaskQueue();
  
  return await queue.add(
    'evaluation-subtask',
    subTask,
    {
      jobId: subTask.id,
      priority: options?.priority || subTask.priority,
      delay: options?.delay,
    }
  );
}

/**
 * 获取队列统计信息
 */
export async function getQueueStats(queueName: string) {
  const queue = getQueue(queueName);
  
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaiting(),
    queue.getActive(),
    queue.getCompleted(),
    queue.getFailed(),
    queue.getDelayed(),
  ]);

  return {
    waiting: waiting.length,
    active: active.length,
    completed: completed.length,
    failed: failed.length,
    delayed: delayed.length,
  };
}

/**
 * 暂停队列
 */
export async function pauseQueue(queueName: string) {
  const queue = getQueue(queueName);
  await queue.pause();
  console.log(`⏸️ Queue ${queueName} paused`);
}

/**
 * 恢复队列
 */
export async function resumeQueue(queueName: string) {
  const queue = getQueue(queueName);
  await queue.resume();
  console.log(`▶️ Queue ${queueName} resumed`);
}

/**
 * 清空队列
 */
export async function cleanQueue(queueName: string, grace: number = 5000) {
  const queue = getQueue(queueName);
  await queue.drain();
  console.log(`🧹 Queue ${queueName} cleaned`);
}

/**
 * 优雅关闭所有队列
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(queues.values()).map(queue => queue.close());
  await Promise.all(closePromises);
  queues.clear();
  console.log('✅ All queues closed gracefully');
}

/**
 * 获取所有队列的健康状态
 */
export async function getQueuesHealth() {
  const health: Record<string, any> = {};
  
  for (const [name, queue] of queues.entries()) {
    try {
      const stats = await getQueueStats(name);
      const isPaused = await queue.isPaused();
      
      health[name] = {
        status: 'healthy',
        paused: isPaused,
        stats,
      };
    } catch (error) {
      health[name] = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  return health;
}