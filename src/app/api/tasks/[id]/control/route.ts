import { NextRequest, NextResponse } from 'next/server';
import { taskScheduler } from '@/lib/task-scheduler';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/control - 任务控制操作
 */
export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json(
        { error: '缺少操作类型参数' },
        { status: 400 }
      );
    }

    if (!['pause', 'resume', 'cancel'].includes(action)) {
      return NextResponse.json(
        { error: '无效的操作类型，支持: pause, resume, cancel' },
        { status: 400 }
      );
    }

    let result;
    switch (action) {
      case 'pause':
        result = await taskScheduler.pauseTask(id);
        break;
      case 'resume':
        result = await taskScheduler.resumeTask(id);
        break;
      case 'cancel':
        result = await taskScheduler.cancelTask(id);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    if (result?.success) {
      return NextResponse.json({
        message: result.message,
        task_id: id,
        action,
        timestamp: new Date().toISOString(),
      });
    } else {
      return NextResponse.json(
        { 
          error: result?.message || 'Operation failed',
          task_id: id,
          action 
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('任务控制操作失败:', error);
    return NextResponse.json(
      { error: '任务控制操作失败' },
      { status: 500 }
    );
  }
}