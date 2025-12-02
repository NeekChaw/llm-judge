import { NextRequest, NextResponse } from 'next/server';
import { pauseQueue, resumeQueue, cleanQueue } from '@/lib/queue';

/**
 * POST /api/tasks/queue/control - 队列控制API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, queue_name } = body;

    if (!action || !queue_name) {
      return NextResponse.json(
        { error: '缺少必要参数: action, queue_name' },
        { status: 400 }
      );
    }

    if (!['pause', 'resume', 'clean'].includes(action)) {
      return NextResponse.json(
        { error: '无效的操作类型，支持: pause, resume, clean' },
        { status: 400 }
      );
    }

    if (!['evaluation-tasks', 'evaluation-subtasks'].includes(queue_name)) {
      return NextResponse.json(
        { error: '无效的队列名称' },
        { status: 400 }
      );
    }

    let result: string;

    switch (action) {
      case 'pause':
        await pauseQueue(queue_name);
        result = `队列 ${queue_name} 已暂停`;
        break;
      case 'resume':
        await resumeQueue(queue_name);
        result = `队列 ${queue_name} 已恢复`;
        break;
      case 'clean':
        await cleanQueue(queue_name);
        result = `队列 ${queue_name} 已清空`;
        break;
      default:
        throw new Error('未知操作');
    }

    return NextResponse.json({
      message: result,
      queue_name,
      action,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('队列控制操作失败:', error);
    return NextResponse.json(
      { 
        error: '队列控制操作失败',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}