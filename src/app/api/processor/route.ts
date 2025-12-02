/**
 * 任务处理器管理API
 * 提供处理器状态查询、模式切换等功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getTaskProcessorService, 
  checkProcessorAvailability,
  startBestProcessor,
  ProcessorConfigManager 
} from '@/lib/task-processor';

/**
 * GET /api/processor - 获取处理器状态
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'status':
        return await getProcessorStatus();
      
      case 'availability':
        return await getProcessorAvailability();
      
      case 'config':
        return await getProcessorConfig();
      
      default:
        return await getProcessorStatus();
    }
  } catch (error) {
    console.error('获取处理器信息失败:', error);
    return NextResponse.json(
      { error: '获取处理器信息失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/processor - 处理器操作
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, mode, config } = body;

    switch (action) {
      case 'start':
        return await startProcessor(config);
      
      case 'stop':
        return await stopProcessor();
      
      case 'switch':
        return await switchProcessor(mode);
      
      case 'restart':
        return await restartProcessor();
      
      case 'auto-start':
        return await autoStartProcessor();
      
      default:
        return NextResponse.json(
          { error: '无效的操作类型' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('处理器操作失败:', error);
    return NextResponse.json(
      { error: '处理器操作失败' },
      { status: 500 }
    );
  }
}

// 获取处理器状态
async function getProcessorStatus() {
  const service = getTaskProcessorService();
  const status = await service.getStatus();
  const currentMode = service.getCurrentMode();
  const healthCheck = await service.healthCheck();

  return NextResponse.json({
    current_mode: currentMode,
    status: status,
    health: healthCheck,
    timestamp: new Date().toISOString(),
  });
}

// 获取处理器可用性
async function getProcessorAvailability() {
  const availability = await checkProcessorAvailability();
  
  return NextResponse.json({
    availability,
    timestamp: new Date().toISOString(),
  });
}

// 获取处理器配置
async function getProcessorConfig() {
  const config = ProcessorConfigManager.loadFromEnvironment();
  
  // 隐藏敏感信息
  const safeConfig = {
    ...config,
    llm: {
      ...config.llm,
      api_key: config.llm?.api_key ? '***已配置***' : '未配置',
    },
    redis: {
      ...config.redis,
      password: config.redis?.password ? '***已配置***' : undefined,
    },
  };

  return NextResponse.json({
    config: safeConfig,
    timestamp: new Date().toISOString(),
  });
}

// 启动处理器
async function startProcessor(config?: any) {
  const service = getTaskProcessorService();
  
  try {
    await service.start(config);
    const currentMode = service.getCurrentMode();
    
    return NextResponse.json({
      success: true,
      message: `处理器已启动 (模式: ${currentMode})`,
      mode: currentMode,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '启动失败',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// 停止处理器
async function stopProcessor() {
  const service = getTaskProcessorService();
  
  try {
    await service.stop();
    
    return NextResponse.json({
      success: true,
      message: '处理器已停止',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '停止失败',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// 切换处理器模式
async function switchProcessor(mode: 'redis' | 'script') {
  if (!mode || !['redis', 'script'].includes(mode)) {
    return NextResponse.json(
      { error: '无效的处理器模式' },
      { status: 400 }
    );
  }

  const service = getTaskProcessorService();
  
  try {
    const oldMode = service.getCurrentMode();
    await service.switchMode(mode);
    
    return NextResponse.json({
      success: true,
      message: `处理器模式已切换: ${oldMode} → ${mode}`,
      old_mode: oldMode,
      new_mode: mode,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '切换失败',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// 重启处理器
async function restartProcessor() {
  const service = getTaskProcessorService();
  
  try {
    const currentMode = service.getCurrentMode();
    
    await service.stop();
    await service.start();
    
    return NextResponse.json({
      success: true,
      message: `处理器已重启 (模式: ${currentMode})`,
      mode: currentMode,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '重启失败',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// 自动启动最佳处理器
async function autoStartProcessor() {
  try {
    const result = await startBestProcessor();
    
    return NextResponse.json({
      success: true,
      message: `自动启动处理器成功`,
      mode: result.mode,
      reason: result.reason,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '自动启动失败',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
