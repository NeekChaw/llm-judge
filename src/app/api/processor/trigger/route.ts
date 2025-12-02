/**
 * 手动触发任务处理器执行
 * 用于调试和测试
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 手动触发任务处理器执行...');
    
    // 动态导入任务处理器
    const { getTaskProcessor } = await import('@/lib/task-processor');
    
    const processor = await getTaskProcessor();
    
    if (!processor) {
      return NextResponse.json({
        success: false,
        error: '任务处理器未初始化'
      }, { status: 500 });
    }

    // 手动触发一次子任务处理
    if ('processNextSubTask' in processor && typeof processor.processNextSubTask === 'function') {
      // @ts-ignore - 访问私有方法用于调试
      await processor.processNextSubTask();
      
      return NextResponse.json({
        success: true,
        message: '手动触发执行完成'
      });
    } else {
      return NextResponse.json({
        success: false,
        error: '处理器不支持手动触发'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('❌ 手动触发失败:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // 获取处理器状态
    const { getTaskProcessor } = await import('@/lib/task-processor');
    
    const processor = await getTaskProcessor();
    
    if (!processor) {
      return NextResponse.json({
        success: false,
        error: '任务处理器未初始化'
      });
    }

    const status = await processor.getStatus();
    
    return NextResponse.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('❌ 获取处理器状态失败:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
