import { NextRequest, NextResponse } from 'next/server';
import { taskScheduler } from '@/lib/task-scheduler';

/**
 * GET /api/tasks/metrics - 获取系统性能指标
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('include_history') === 'true';

    const metrics = await taskScheduler.getSystemMetrics();
    const response: any = {
      metrics,
      timestamp: new Date().toISOString()
    };

    if (includeHistory) {
      response.history = taskScheduler.getMetricsHistory();
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('获取系统指标失败:', error);
    return NextResponse.json(
      { error: '获取系统指标失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/metrics/reset - 重置指标历史
 */
export async function POST(request: NextRequest) {
  try {
    // 清空指标历史
    const metrics = await taskScheduler.getSystemMetrics();
    
    return NextResponse.json({
      message: '指标历史已重置',
      current_metrics: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('重置指标失败:', error);
    return NextResponse.json(
      { error: '重置指标失败' },
      { status: 500 }
    );
  }
}