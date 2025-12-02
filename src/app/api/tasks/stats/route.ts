import { NextRequest, NextResponse } from 'next/server';
import { getQueueStats, getQueuesHealth } from '@/lib/queue';
import { getWorkersHealth } from '@/lib/worker';
import { checkRedisHealth } from '@/lib/redis';
import { TaskStatistics } from '@/types/task';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';

/**
 * GET /api/tasks/stats - 获取任务统计信息
 */
export const GET = withMonitoring('task_stats', async (request: NextRequest) => {
  try {
    const supabase = createClient();
    
    // 获取Redis健康状态
    const redisHealth = await checkRedisHealth();
    
    if (!redisHealth.connected) {
      return NextResponse.json(
        { error: 'Redis连接失败', details: redisHealth.error },
        { status: 503 }
      );
    }

    // 获取队列统计
    const [taskQueueStats, subtaskQueueStats] = await Promise.all([
      getQueueStats('evaluation-tasks'),
      getQueueStats('evaluation-subtasks'),
    ]);

    // 获取队列和Worker健康状态
    const queuesHealth = await getQueuesHealth();
    const workersHealth = getWorkersHealth();

    // 从数据库获取真实任务统计
    const [
      totalTasksResult,
      activeTasksResult,
      completedTasksResult,
      failedTasksResult,
      pendingTasksResult,
      avgExecutionTimeResult,
      successRateResult
    ] = await Promise.all([
      // 总任务数
      supabase
        .from('evaluation_tasks')
        .select('*', { count: 'exact', head: true }),
      
      // 活跃任务数（运行中+暂停中）
      supabase
        .from('evaluation_tasks')
        .select('*', { count: 'exact', head: true })
        .in('status', ['running', 'paused']),
      
      // 已完成任务数
      supabase
        .from('evaluation_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed'),
      
      // 失败任务数
      supabase
        .from('evaluation_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed'),
      
      // 待处理任务数
      supabase
        .from('evaluation_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      
      // 平均执行时间
      supabase
        .from('evaluation_tasks')
        .select('started_at, finished_at')
        .not('started_at', 'is', null)
        .not('finished_at', 'is', null)
        .eq('status', 'completed'),
      
      // 成功率统计
      supabase
        .from('evaluation_results')
        .select('status')
    ]);

    // 计算平均执行时间
    let avgExecutionTime = 0;
    if (avgExecutionTimeResult.data && avgExecutionTimeResult.data.length > 0) {
      const executionTimes = avgExecutionTimeResult.data
        .map(task => {
          if (task.started_at && task.finished_at) {
            return (new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()) / 1000;
          }
          return 0;
        })
        .filter(time => time > 0);
      
      if (executionTimes.length > 0) {
        avgExecutionTime = executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length;
      }
    }

    // 计算成功率
    let successRate = 0;
    if (successRateResult.data && successRateResult.data.length > 0) {
      const totalResults = successRateResult.data.length;
      const successfulResults = successRateResult.data.filter(r => r.status === 'completed').length; // 修复状态不一致问题
      successRate = totalResults > 0 ? successfulResults / totalResults : 0;
    }

    // 计算任务/分钟速率 (基于最近1小时)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentTasks } = await supabase
      .from('evaluation_tasks')
      .select('created_at')
      .gte('created_at', oneHourAgo);

    const tasksPerMinute = recentTasks ? recentTasks.length / 60 : 0;

    const taskStats: TaskStatistics = {
      total_tasks: totalTasksResult.count || 0,
      active_tasks: activeTasksResult.count || 0,
      completed_tasks: completedTasksResult.count || 0,
      failed_tasks: failedTasksResult.count || 0,
      pending_tasks: pendingTasksResult.count || 0,
      queue_status: {
        waiting: taskQueueStats.waiting + subtaskQueueStats.waiting,
        active: taskQueueStats.active + subtaskQueueStats.active,
        completed: taskQueueStats.completed + subtaskQueueStats.completed,
        failed: taskQueueStats.failed + subtaskQueueStats.failed,
        delayed: taskQueueStats.delayed + subtaskQueueStats.delayed,
      },
      performance: {
        avg_execution_time: Math.round(avgExecutionTime * 10) / 10,
        success_rate: Math.round(successRate * 100) / 100,
        tasks_per_minute: Math.round(tasksPerMinute * 100) / 100,
      },
    };

    return NextResponse.json({
      statistics: taskStats,
      system_health: {
        redis: redisHealth,
        queues: queuesHealth,
        workers: workersHealth,
      },
      queue_details: {
        'evaluation-tasks': taskQueueStats,
        'evaluation-subtasks': subtaskQueueStats,
      },
    });
  } catch (error) {
    console.error('获取任务统计失败:', error);
    return NextResponse.json(
      { error: '获取任务统计失败' },
      { status: 500 }
    );
  }
});