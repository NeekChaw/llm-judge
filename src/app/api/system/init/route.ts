import { NextResponse } from 'next/server';

/**
 * POST /api/system/init - 初始化系统
 * 启动任务队列系统和相关服务
 */
export async function POST() {
  try {
    console.log('🚀 Starting system initialization...');
    
    // 启动任务队列系统
    const { startTaskQueueSystem } = await import('@/lib/task-system');
    await startTaskQueueSystem();
    
    console.log('✅ System initialization completed');
    
    return NextResponse.json({
      status: 'success',
      message: 'System initialized successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ System initialization failed:', error);
    
    return NextResponse.json({
      status: 'error',
      message: 'System initialization failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
