/**
 * 任务处理器统一入口
 * 提供简化的API接口供应用程序使用
 */

export * from './interfaces';
export * from './factory';
export * from './script-processor';
export * from './redis-processor';

import { 
  ITaskProcessor, 
  TaskData, 
  SubTaskData, 
  ProcessingResult, 
  ProcessorStatus,
  ProcessorConfig 
} from './interfaces';
import { 
  GlobalProcessorManager, 
  ProcessorConfigManager,
  createTaskProcessor,
  getCurrentProcessor,
  switchProcessorMode 
} from './factory';

/**
 * 任务处理器服务
 * 提供高级API接口
 */
export class TaskProcessorService {
  private static instance: TaskProcessorService;
  private manager: GlobalProcessorManager;

  private constructor() {
    this.manager = GlobalProcessorManager.getInstance();
  }

  static getInstance(): TaskProcessorService {
    if (!TaskProcessorService.instance) {
      TaskProcessorService.instance = new TaskProcessorService();
    }
    return TaskProcessorService.instance;
  }

  /**
   * 启动任务处理服务
   */
  async start(config?: ProcessorConfig): Promise<void> {
    console.log('🚀 启动任务处理服务...');

    const processor = await this.manager.initialize(config);
    await processor.start();

    console.log(`✅ 任务处理服务已启动 (模式: ${processor.mode})`);
  }

  /**
   * 停止任务处理服务
   */
  async stop(): Promise<void> {
    console.log('🛑 停止任务处理服务...');
    await this.manager.shutdown();
    console.log('✅ 任务处理服务已停止');
  }

  /**
   * 处理任务
   */
  async processTask(taskData: TaskData): Promise<ProcessingResult> {
    const processor = this.manager.getCurrentProcessor();
    if (!processor) {
      throw new Error('任务处理器未初始化');
    }

    return await processor.processTask(taskData);
  }

  /**
   * 处理子任务
   */
  async processSubTask(subTaskData: SubTaskData): Promise<ProcessingResult> {
    const processor = this.manager.getCurrentProcessor();
    if (!processor) {
      throw new Error('任务处理器未初始化');
    }

    return await processor.processSubTask(subTaskData);
  }

  /**
   * 获取服务状态
   */
  async getStatus(): Promise<ProcessorStatus | null> {
    const processor = this.manager.getCurrentProcessor();
    if (!processor) {
      return null;
    }

    return await processor.getStatus();
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    const processor = this.manager.getCurrentProcessor();
    if (!processor) {
      return false;
    }

    return await processor.healthCheck();
  }

  /**
   * 切换处理模式
   */
  async switchMode(mode: 'redis' | 'script'): Promise<void> {
    await this.manager.switchMode(mode);
    console.log(`✅ 已切换到${mode}模式`);
  }

  /**
   * 获取当前模式
   */
  getCurrentMode(): 'redis' | 'script' | null {
    const processor = this.manager.getCurrentProcessor();
    return processor?.mode || null;
  }

  /**
   * 暂停任务
   */
  async pauseTask(taskId: string): Promise<boolean> {
    const processor = this.manager.getCurrentProcessor();
    if (!processor) {
      return false;
    }

    return await processor.pauseTask(taskId);
  }

  /**
   * 恢复任务
   */
  async resumeTask(taskId: string): Promise<boolean> {
    const processor = this.manager.getCurrentProcessor();
    if (!processor) {
      return false;
    }

    return await processor.resumeTask(taskId);
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const processor = this.manager.getCurrentProcessor();
    if (!processor) {
      return false;
    }

    return await processor.cancelTask(taskId);
  }

  /**
   * 获取任务进度
   */
  async getTaskProgress(taskId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    progress_percentage: number;
  } | null> {
    const processor = this.manager.getCurrentProcessor();
    if (!processor) {
      return null;
    }

    return await processor.getTaskProgress(taskId);
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    const processor = this.manager.getCurrentProcessor();
    if (processor) {
      await processor.cleanup();
    }
  }
}

/**
 * 便捷函数：获取任务处理服务实例
 */
export function getTaskProcessorService(): TaskProcessorService {
  return TaskProcessorService.getInstance();
}

/**
 * 便捷函数：启动默认任务处理服务
 */
export async function startTaskProcessorService(config?: ProcessorConfig): Promise<TaskProcessorService> {
  const service = TaskProcessorService.getInstance();
  await service.start(config);
  return service;
}

/**
 * 便捷函数：从环境变量启动服务
 */
export async function startFromEnvironment(): Promise<TaskProcessorService> {
  const config = ProcessorConfigManager.loadFromEnvironment();
  return await startTaskProcessorService(config);
}

/**
 * 便捷函数：从配置文件启动服务
 */
export async function startFromConfigFile(filePath: string): Promise<TaskProcessorService> {
  const config = await ProcessorConfigManager.loadFromFile(filePath);
  return await startTaskProcessorService(config);
}

/**
 * 便捷函数：检查处理器可用性
 */
export async function checkProcessorAvailability(): Promise<{
  redis: boolean;
  script: boolean;
  recommended: 'redis' | 'script';
}> {
  const { TaskProcessorFactory } = await import('./factory');
  const factory = TaskProcessorFactory.getInstance();
  
  const availableModes = await factory.getAvailableModes();
  const config = ProcessorConfigManager.loadFromEnvironment();
  const recommended = await factory.detectBestMode(config);

  return {
    redis: availableModes.includes('redis'),
    script: availableModes.includes('script'),
    recommended,
  };
}

/**
 * 便捷函数：自动选择最佳处理器并启动
 */
export async function startBestProcessor(): Promise<{
  service: TaskProcessorService;
  mode: 'redis' | 'script';
  reason: string;
}> {
  const availability = await checkProcessorAvailability();
  const config = ProcessorConfigManager.loadFromEnvironment();
  
  config.mode = availability.recommended;
  
  const service = await startTaskProcessorService(config);
  
  let reason: string;
  if (availability.recommended === 'redis') {
    reason = availability.redis ? 'Redis可用，性能更佳' : 'Redis不可用，降级到脚本模式';
  } else {
    reason = '使用脚本模式（默认）';
  }

  return {
    service,
    mode: availability.recommended,
    reason,
  };
}

// 导出主要类和函数
export {
  createTaskProcessor,
  getCurrentProcessor,
  switchProcessorMode,
  ProcessorConfigManager,
  GlobalProcessorManager,
};
