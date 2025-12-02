/**
 * 任务处理器工厂
 * 负责创建和管理不同模式的处理器实例
 */

import { 
  ITaskProcessor, 
  ITaskProcessorFactory, 
  ProcessorConfig 
} from './interfaces';
import { ScriptTaskProcessor } from './script-processor';
import { RedisTaskProcessor } from './redis-processor';
import { checkRedisHealth } from '@/lib/redis';

export class TaskProcessorFactory implements ITaskProcessorFactory {
  private static instance: TaskProcessorFactory;
  private processors: Map<string, ITaskProcessor> = new Map();

  private constructor() {}

  static getInstance(): TaskProcessorFactory {
    if (!TaskProcessorFactory.instance) {
      TaskProcessorFactory.instance = new TaskProcessorFactory();
    }
    return TaskProcessorFactory.instance;
  }

  async createProcessor(config: ProcessorConfig): Promise<ITaskProcessor> {
    const mode = config.mode;
    const processorKey = `${mode}-${JSON.stringify(config)}`;

    // 检查是否已有相同配置的处理器实例
    if (this.processors.has(processorKey)) {
      return this.processors.get(processorKey)!;
    }

    let processor: ITaskProcessor;

    switch (mode) {
      case 'redis':
        processor = new RedisTaskProcessor(config);
        break;
      case 'script':
        processor = new ScriptTaskProcessor(config);
        break;
      default:
        throw new Error(`不支持的处理器模式: ${mode}`);
    }

    // 初始化处理器
    await processor.initialize();

    // 缓存处理器实例
    this.processors.set(processorKey, processor);

    console.log(`✅ 创建${mode}模式处理器成功`);
    return processor;
  }

  async getAvailableModes(): Promise<string[]> {
    const modes: string[] = ['script']; // 脚本模式总是可用

    // 检查Redis是否可用
    try {
      const redisHealth = await this.checkRedisAvailability();
      if (redisHealth.available) {
        modes.push('redis');
      } else if (redisHealth.configured) {
        console.warn('⚠️ Redis已配置但不可用，将自动降级到脚本模式');
        console.warn(`   原因: ${redisHealth.error}`);
      }
    } catch (error) {
      console.warn('Redis可用性检查失败:', error);
    }

    return modes;
  }

  /**
   * 增强的Redis可用性检测
   */
  private async checkRedisAvailability(): Promise<{
    available: boolean;
    configured: boolean;
    error?: string;
  }> {
    const hasConfig = this.hasRedisConfiguration();

    if (!hasConfig) {
      return {
        available: false,
        configured: false,
      };
    }

    try {
      // 尝试导入Redis健康检查
      const { checkRedisHealth } = await import('@/lib/redis');
      const health = await checkRedisHealth();

      return {
        available: health.connected,
        configured: true,
        error: health.error,
      };
    } catch (importError) {
      // Redis模块导入失败，可能是依赖未安装
      return {
        available: false,
        configured: true,
        error: 'Redis模块导入失败，可能缺少依赖',
      };
    }
  }

  async detectBestMode(config: ProcessorConfig): Promise<'redis' | 'script'> {
    const availableModes = await this.getAvailableModes();

    // 如果配置指定了模式且可用，则使用指定模式
    if (config.mode && availableModes.includes(config.mode)) {
      return config.mode;
    }

    // 检查是否配置了Redis环境变量
    const hasRedisConfig = this.hasRedisConfiguration();

    if (hasRedisConfig && availableModes.includes('redis')) {
      console.log('🎯 检测到Redis配置，自动选择Redis模式');
      return 'redis';
    }

    // 默认使用脚本模式（简单可靠）
    console.log('🎯 使用默认脚本模式（简单可靠）');
    return 'script';
  }

  /**
   * 检查是否配置了Redis环境变量
   */
  private hasRedisConfiguration(): boolean {
    const redisEnvVars = [
      'REDIS_HOST',
      'REDIS_URL',
      'REDIS_PORT',
      'FORCE_REDIS'
    ];

    // 检查是否有任何Redis相关的环境变量被设置
    const hasRedisEnv = redisEnvVars.some(envVar => {
      const value = process.env[envVar];
      return value && value.trim() !== '';
    });

    // 特殊处理FORCE_REDIS
    const forceRedis = process.env.FORCE_REDIS === 'true';

    if (hasRedisEnv) {
      console.log('🔍 检测到Redis配置环境变量:',
        redisEnvVars.filter(env => process.env[env]).join(', '));
    }

    return hasRedisEnv || forceRedis;
  }

  /**
   * 清理所有处理器实例
   */
  async cleanup(): Promise<void> {
    console.log('🧹 清理所有处理器实例...');
    
    const cleanupPromises = Array.from(this.processors.values()).map(async (processor) => {
      try {
        await processor.stop();
      } catch (error) {
        console.error('清理处理器失败:', error);
      }
    });

    await Promise.all(cleanupPromises);
    this.processors.clear();
    
    console.log('✅ 处理器清理完成');
  }

  /**
   * 获取当前活跃的处理器
   */
  getActiveProcessors(): ITaskProcessor[] {
    return Array.from(this.processors.values());
  }
}

/**
 * 配置管理器
 */
export class ProcessorConfigManager {
  private static defaultConfig: Partial<ProcessorConfig> = {
    script: {
      check_interval: 10000,
      concurrent_limit: 5,
      retry_delay: 5000,
    },
    redis: {
      host: 'localhost',
      port: 6379,
      db: 0,
    },
    llm: {
      api_key: process.env.SILICONFLOW_API_KEY || 'dummy-key-for-build',
      base_url: 'https://api.siliconflow.cn/v1',
      timeout: 30000,
    },
    database: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    },
  };

  /**
   * 从环境变量加载配置
   */
  static loadFromEnvironment(): ProcessorConfig {
    const mode = this.getProcessorMode();
    
    const config: ProcessorConfig = {
      mode,
      ...this.defaultConfig,
      redis: {
        host: process.env.REDIS_HOST || this.defaultConfig.redis!.host,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
      },
      script: {
        check_interval: parseInt(process.env.SCRIPT_CHECK_INTERVAL || '10000'),
        concurrent_limit: parseInt(process.env.SCRIPT_CONCURRENT_LIMIT || '5'),
        retry_delay: parseInt(process.env.SCRIPT_RETRY_DELAY || '5000'),
      },
      llm: {
        api_key: process.env.SILICONFLOW_API_KEY || '',
        base_url: process.env.LLM_BASE_URL || this.defaultConfig.llm!.base_url,
        timeout: parseInt(process.env.LLM_TIMEOUT || '30000'),
      },
    };

    return config;
  }

  /**
   * 从配置文件加载配置
   */
  static async loadFromFile(filePath: string): Promise<ProcessorConfig> {
    try {
      const fs = await import('fs/promises');
      const configData = await fs.readFile(filePath, 'utf-8');
      const fileConfig = JSON.parse(configData);
      
      return {
        ...this.defaultConfig,
        ...fileConfig,
      } as ProcessorConfig;
    } catch (error) {
      console.warn(`配置文件加载失败: ${filePath}，使用环境变量配置`);
      return this.loadFromEnvironment();
    }
  }

  /**
   * 获取处理器模式
   */
  private static getProcessorMode(): 'redis' | 'script' {
    const mode = process.env.TASK_PROCESSOR_MODE?.toLowerCase();
    
    if (mode === 'redis' || mode === 'script') {
      return mode;
    }

    // 默认模式检测
    const forceRedis = process.env.FORCE_REDIS === 'true';
    return forceRedis ? 'redis' : 'script';
  }

  /**
   * 验证配置
   */
  static async validateConfig(config: ProcessorConfig): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 验证基本配置
    if (!config.mode) {
      errors.push('处理器模式未指定');
    }

    // 验证LLM配置（使用新的配置管理器）
    try {
      const { llmConfigManager } = await import('@/lib/llm-config-manager');
      const stats = await llmConfigManager.getConfigStats();

      if (stats.providers === 0) {
        warnings.push('未找到LLM提供商配置，将使用fallback配置');
      } else if (stats.configured_providers === 0) {
        errors.push('所有LLM提供商都缺少API密钥配置');
      } else if (stats.missing_api_keys.length > 0) {
        warnings.push(`部分LLM提供商缺少API密钥: ${stats.missing_api_keys.join(', ')}`);
      }
    } catch (llmError) {
      // 降级到环境变量检查
      if (!config.llm?.api_key && !process.env.SILICONFLOW_API_KEY) {
        errors.push('LLM API密钥未配置（环境变量或数据库）');
      }
    }

    // 验证Redis配置（如果使用Redis模式）
    if (config.mode === 'redis') {
      if (!config.redis?.host) {
        errors.push('Redis主机地址未配置');
      }
      if (!config.redis?.port) {
        errors.push('Redis端口未配置');
      }
    }

    // 验证脚本配置（如果使用脚本模式）
    if (config.mode === 'script') {
      if (!config.script?.check_interval || config.script.check_interval < 1000) {
        errors.push('脚本检查间隔配置无效（最小1000ms）');
      }
      if (!config.script?.concurrent_limit || config.script.concurrent_limit < 1) {
        errors.push('脚本并发限制配置无效（最小1）');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 打印配置信息
   */
  static printConfig(config: ProcessorConfig): void {
    console.log('📋 当前处理器配置:');
    console.log(`   模式: ${config.mode}`);
    
    if (config.mode === 'redis' && config.redis) {
      console.log(`   Redis: ${config.redis.host}:${config.redis.port}/${config.redis.db}`);
    }
    
    if (config.mode === 'script' && config.script) {
      console.log(`   脚本检查间隔: ${config.script.check_interval}ms`);
      console.log(`   并发限制: ${config.script.concurrent_limit}`);
    }
    
    console.log(`   LLM API: ${config.llm?.api_key ? '已配置' : '未配置'}`);
  }
}

/**
 * 全局处理器管理器
 */
export class GlobalProcessorManager {
  private static instance: GlobalProcessorManager;
  private currentProcessor: ITaskProcessor | null = null;
  private factory: TaskProcessorFactory;

  private constructor() {
    this.factory = TaskProcessorFactory.getInstance();
  }

  static getInstance(): GlobalProcessorManager {
    if (!GlobalProcessorManager.instance) {
      GlobalProcessorManager.instance = new GlobalProcessorManager();
    }
    return GlobalProcessorManager.instance;
  }

  /**
   * 初始化处理器
   */
  async initialize(config?: ProcessorConfig): Promise<ITaskProcessor> {
    if (!config) {
      config = ProcessorConfigManager.loadFromEnvironment();
    }

    // 验证配置
    const validation = await ProcessorConfigManager.validateConfig(config);
    if (!validation.valid) {
      const errors = validation.errors || ['未知配置错误'];
      throw new Error(`配置验证失败: ${errors.join(', ')}`);
    }

    // 显示警告信息
    if (validation.warnings && validation.warnings.length > 0) {
      console.log('⚠️ 配置警告:');
      validation.warnings.forEach(warning => {
        console.log(`   ${warning}`);
      });
    }

    // 自动检测最佳模式
    config.mode = await this.factory.detectBestMode(config);

    // 打印配置信息
    ProcessorConfigManager.printConfig(config);

    // 创建处理器
    this.currentProcessor = await this.factory.createProcessor(config);
    
    return this.currentProcessor;
  }

  /**
   * 获取当前处理器
   */
  getCurrentProcessor(): ITaskProcessor | null {
    return this.currentProcessor;
  }

  /**
   * 切换处理器模式
   */
  async switchMode(newMode: 'redis' | 'script'): Promise<ITaskProcessor> {
    console.log(`🔄 切换处理器模式: ${this.currentProcessor?.mode} → ${newMode}`);

    // 停止当前处理器
    if (this.currentProcessor) {
      await this.currentProcessor.stop();
    }

    // 创建新配置
    const config = ProcessorConfigManager.loadFromEnvironment();
    config.mode = newMode;

    // 创建新处理器
    this.currentProcessor = await this.factory.createProcessor(config);
    await this.currentProcessor.start();

    console.log(`✅ 处理器模式切换完成: ${newMode}`);
    return this.currentProcessor;
  }

  /**
   * 优雅关闭
   */
  async shutdown(): Promise<void> {
    console.log('🛑 关闭全局处理器管理器...');

    if (this.currentProcessor) {
      await this.currentProcessor.stop();
      this.currentProcessor = null;
    }

    await this.factory.cleanup();
    console.log('✅ 全局处理器管理器已关闭');
  }
}

// 导出便捷函数
export async function createTaskProcessor(config?: ProcessorConfig): Promise<ITaskProcessor> {
  const manager = GlobalProcessorManager.getInstance();
  return await manager.initialize(config);
}

export function getCurrentProcessor(): ITaskProcessor | null {
  const manager = GlobalProcessorManager.getInstance();
  return manager.getCurrentProcessor();
}

export async function switchProcessorMode(mode: 'redis' | 'script'): Promise<ITaskProcessor> {
  const manager = GlobalProcessorManager.getInstance();
  return await manager.switchMode(mode);
}
