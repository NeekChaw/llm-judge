/**
 * 任务队列系统初始化和管理
 */

import { startAllWorkers, closeAllWorkers } from '@/lib/worker';
import { closeAllQueues } from '@/lib/queue';
import { closeRedisConnection } from '@/lib/redis';

/**
 * 启动任务队列系统
 */
export async function startTaskQueueSystem(): Promise<void> {
  try {
    console.log('🚀 Starting Task Queue System...');
    
    // 启动所有Workers
    startAllWorkers();
    
    console.log('✅ Task Queue System started successfully');
  } catch (error) {
    console.error('❌ Failed to start Task Queue System:', error);
    throw error;
  }
}

/**
 * 优雅关闭任务队列系统
 */
export async function shutdownTaskQueueSystem(): Promise<void> {
  try {
    console.log('🛑 Shutting down Task Queue System...');
    
    // 关闭Workers
    await closeAllWorkers();
    
    // 关闭队列
    await closeAllQueues();
    
    // 关闭Redis连接
    await closeRedisConnection();
    
    console.log('✅ Task Queue System shutdown complete');
  } catch (error) {
    console.error('❌ Error during Task Queue System shutdown:', error);
    throw error;
  }
}

/**
 * 系统健康检查
 */
export async function healthCheck(): Promise<{
  status: 'healthy' | 'unhealthy';
  details: Record<string, any>;
}> {
  try {
    const { checkRedisHealth } = await import('@/lib/redis');
    const { getQueuesHealth } = await import('@/lib/queue');
    const { getWorkersHealth } = await import('@/lib/worker');
    
    const [redisHealth, queuesHealth, workersHealth] = await Promise.all([
      checkRedisHealth(),
      getQueuesHealth(),
      Promise.resolve(getWorkersHealth()),
    ]);
    
    const isHealthy = redisHealth.connected && 
      Object.values(queuesHealth).every(q => q.status === 'healthy') &&
      Object.values(workersHealth).every(w => w.status === 'running');
    
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      details: {
        redis: redisHealth,
        queues: queuesHealth,
        workers: workersHealth,
      },
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// 进程退出时的清理
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    console.log('📡 Received SIGINT, shutting down gracefully...');
    await shutdownTaskQueueSystem();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('📡 Received SIGTERM, shutting down gracefully...');
    await shutdownTaskQueueSystem();
    process.exit(0);
  });
}