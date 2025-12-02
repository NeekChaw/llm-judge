import { NextRequest, NextResponse } from 'next/server';
import { taskScheduler } from '@/lib/task-scheduler';

/**
 * GET /api/tasks/realtime/progress - 获取实时任务进度
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('task_id');

    if (taskId) {
      // 获取特定任务的进度
      const progress = await taskScheduler.getTaskProgress(taskId);
      
      if (!progress) {
        return NextResponse.json(
          { error: '任务不存在或已过期' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        task_progress: progress,
        timestamp: new Date().toISOString()
      });
    } else {
      // 获取所有活跃任务的进度
      const allProgress = await taskScheduler.getAllActiveTasksProgress();
      
      return NextResponse.json({
        active_tasks: allProgress,
        total_active: allProgress.length,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('获取任务进度失败:', error);
    return NextResponse.json(
      { error: '获取任务进度失败' },
      { status: 500 }
    );
  }
}