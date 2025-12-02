/**
 * 统一系统配置管理API
 * 基于现有的key-value结构，支持script和middleware处理器模式
 */

import { NextRequest, NextResponse } from 'next/server';
import { ProcessorConfigManager } from '@/lib/task-processor';
import { supabaseAdmin } from '@/lib/db';

interface SystemConfig {
  // 处理器配置（通用，支持script和middleware模式）
  processor_check_interval: number;
  processor_concurrent_limit: number;
  processor_retry_delay: number;
  processor_mode: 'script' | 'middleware';
  
  // 任务默认配置
  task_default_timeout: number;
  task_default_retry_count: number;
  task_default_concurrent_limit: number;
  
  // 系统性能配置
  system_max_queue_size: number;
  system_cleanup_interval: number;
  system_log_retention_days: number;
  
  // 中间件模式专用配置
  middleware_pool_size: number;
  middleware_keepalive_timeout: number;
  
  // 🆕 API请求配置
  api_request_timeout: number;         // API请求超时时间（毫秒）
  api_connect_timeout: number;         // 连接超时时间（毫秒）
  api_max_retries: number;             // API最大重试次数
  
  // 🆕 僵尸任务检测配置
  zombie_task_timeout_minutes: number; // 僵尸任务超时时间（分钟）
}

const CONFIG_KEY_MAPPING = {
  processor_check_interval: 'processor.check_interval',
  processor_concurrent_limit: 'processor.concurrent_limit', 
  processor_retry_delay: 'processor.retry_delay',
  processor_mode: 'processor.mode',
  task_default_timeout: 'task.default_timeout',
  task_default_retry_count: 'task.default_retry_count',
  task_default_concurrent_limit: 'task.default_concurrent_limit',
  system_max_queue_size: 'system.max_queue_size',
  system_cleanup_interval: 'system.cleanup_interval',
  system_log_retention_days: 'system.log_retention_days',
  middleware_pool_size: 'middleware.pool_size',
  middleware_keepalive_timeout: 'middleware.keepalive_timeout',
  // 🆕 API请求配置映射
  api_request_timeout: 'api.request_timeout',
  api_connect_timeout: 'api.connect_timeout',
  api_max_retries: 'api.max_retries',
  // 🆕 僵尸任务检测配置映射
  zombie_task_timeout_minutes: 'zombie.task_timeout_minutes',
};

const DEFAULT_CONFIG: SystemConfig = {
  processor_check_interval: 10000,
  processor_concurrent_limit: 5,
  processor_retry_delay: 5000,
  processor_mode: 'script',
  task_default_timeout: 300,
  task_default_retry_count: 3,
  task_default_concurrent_limit: 15,
  system_max_queue_size: 1000,
  system_cleanup_interval: 3600000,
  system_log_retention_days: 30,
  middleware_pool_size: 10,
  middleware_keepalive_timeout: 30000,
  // 🆕 API请求默认配置
  api_request_timeout: 900000,      // 🔧 修改为15分钟 (900000ms)
  api_connect_timeout: 30000,       // 30秒
  api_max_retries: 2,               // 最大2次重试
  // 🆕 僵尸任务检测默认配置
  zombie_task_timeout_minutes: 20,  // 🔧 修改为20分钟
};

/**
 * 从数据库获取配置值
 */
async function getConfigFromDatabase(): Promise<Partial<SystemConfig>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('system_configs')
      .select('key, value')
      .in('key', Object.values(CONFIG_KEY_MAPPING));

    if (error) {
      console.warn('获取数据库配置失败:', error);
      return {};
    }

    const config: Partial<SystemConfig> = {};
    
    if (data) {
      for (const row of data) {
        // 找到对应的配置字段
        const configField = Object.keys(CONFIG_KEY_MAPPING).find(
          key => CONFIG_KEY_MAPPING[key as keyof typeof CONFIG_KEY_MAPPING] === row.key
        ) as keyof SystemConfig;
        
        if (configField) {
          const value = row.value;
          
          // 处理不同类型的值
          if (configField === 'processor_mode') {
            config[configField] = (typeof value === 'string' ? JSON.parse(value) : value) as 'script' | 'middleware';
          } else {
            config[configField] = parseInt(typeof value === 'string' ? value : String(value));
          }
        }
      }
    }

    return config;
  } catch (error) {
    console.error('数据库配置读取异常:', error);
    return {};
  }
}

/**
 * GET /api/system/config - 获取系统配置
 */
export async function GET(request: NextRequest) {
  try {
    // 获取当前处理器配置
    const processorConfig = ProcessorConfigManager.loadFromEnvironment();
    
    // 从数据库获取用户自定义配置
    const customConfig = await getConfigFromDatabase();

    // 合并配置（优先级：数据库 > 环境变量 > 默认值）
    const systemConfig: SystemConfig = {
      processor_check_interval: customConfig.processor_check_interval ?? processorConfig.script?.check_interval ?? DEFAULT_CONFIG.processor_check_interval,
      processor_concurrent_limit: customConfig.processor_concurrent_limit ?? processorConfig.script?.concurrent_limit ?? DEFAULT_CONFIG.processor_concurrent_limit,
      processor_retry_delay: customConfig.processor_retry_delay ?? processorConfig.script?.retry_delay ?? DEFAULT_CONFIG.processor_retry_delay,
      processor_mode: customConfig.processor_mode ?? DEFAULT_CONFIG.processor_mode,
      task_default_timeout: customConfig.task_default_timeout ?? DEFAULT_CONFIG.task_default_timeout,
      task_default_retry_count: customConfig.task_default_retry_count ?? DEFAULT_CONFIG.task_default_retry_count,
      task_default_concurrent_limit: customConfig.task_default_concurrent_limit ?? DEFAULT_CONFIG.task_default_concurrent_limit,
      system_max_queue_size: customConfig.system_max_queue_size ?? DEFAULT_CONFIG.system_max_queue_size,
      system_cleanup_interval: customConfig.system_cleanup_interval ?? DEFAULT_CONFIG.system_cleanup_interval,
      system_log_retention_days: customConfig.system_log_retention_days ?? DEFAULT_CONFIG.system_log_retention_days,
      middleware_pool_size: customConfig.middleware_pool_size ?? DEFAULT_CONFIG.middleware_pool_size,
      middleware_keepalive_timeout: customConfig.middleware_keepalive_timeout ?? DEFAULT_CONFIG.middleware_keepalive_timeout,
      // 🆕 API配置（归入处理器配置类别）
      api_request_timeout: customConfig.api_request_timeout ?? DEFAULT_CONFIG.api_request_timeout,
      api_connect_timeout: customConfig.api_connect_timeout ?? DEFAULT_CONFIG.api_connect_timeout,
      api_max_retries: customConfig.api_max_retries ?? DEFAULT_CONFIG.api_max_retries,
      // 🆕 僵尸任务检测配置
      zombie_task_timeout_minutes: customConfig.zombie_task_timeout_minutes ?? DEFAULT_CONFIG.zombie_task_timeout_minutes,
    };

    return NextResponse.json({
      config: systemConfig,
      source: {
        database: Object.keys(customConfig).length > 0,
        environment: true,
        defaults: true,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('获取系统配置失败:', error);
    return NextResponse.json(
      { error: '获取系统配置失败' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/system/config - 更新系统配置
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const config: Partial<SystemConfig> = body.config;

    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { error: '无效的配置数据' },
        { status: 400 }
      );
    }

    // 验证配置值
    const validationErrors = validateConfig(config);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: '配置验证失败', details: validationErrors },
        { status: 400 }
      );
    }

    // 更新数据库配置
    const updatePromises = Object.entries(config)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        const dbKey = CONFIG_KEY_MAPPING[key as keyof typeof CONFIG_KEY_MAPPING];
        const dbValue = key === 'processor_mode' ? JSON.stringify(value) : String(value);
        
        return supabaseAdmin
          .from('system_configs')
          .upsert({
            key: dbKey,
            value: dbValue,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });
      });

    const results = await Promise.all(updatePromises);
    
    // 检查是否有错误
    const errors = results.filter(result => result.error);
    if (errors.length > 0) {
      console.error('保存配置失败:', errors);
      return NextResponse.json(
        { error: '保存配置失败: ' + errors.map(e => e.error?.message).join(', ') },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '系统配置已更新',
      updated_keys: Object.keys(config).length,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('更新系统配置失败:', error);
    return NextResponse.json(
      { error: '更新系统配置失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/system/config - 重置配置到默认值
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'reset') {
      // 删除数据库中的自定义配置，恢复默认值
      const { error } = await supabaseAdmin
        .from('system_configs')
        .delete()
        .in('key', Object.values(CONFIG_KEY_MAPPING));

      if (error) {
        console.error('重置配置失败:', error);
        return NextResponse.json(
          { error: '重置配置失败' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: '系统配置已重置为默认值',
        config: DEFAULT_CONFIG,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: '无效的操作类型' },
      { status: 400 }
    );

  } catch (error) {
    console.error('配置操作失败:', error);
    return NextResponse.json(
      { error: '配置操作失败' },
      { status: 500 }
    );
  }
}

/**
 * 验证配置参数
 */
function validateConfig(config: Partial<SystemConfig>): string[] {
  const errors: string[] = [];

  // 处理器配置验证
  if (config.processor_check_interval !== undefined) {
    if (config.processor_check_interval < 1000 || config.processor_check_interval > 300000) {
      errors.push('处理器检查间隔必须在1000-300000ms之间');
    }
  }

  if (config.processor_concurrent_limit !== undefined) {
    if (config.processor_concurrent_limit < 1 || config.processor_concurrent_limit > 50) {
      errors.push('处理器并发限制必须在1-50之间');
    }
  }

  if (config.processor_retry_delay !== undefined) {
    if (config.processor_retry_delay < 1000 || config.processor_retry_delay > 60000) {
      errors.push('重试延迟必须在1000-60000ms之间');
    }
  }

  if (config.processor_mode !== undefined) {
    if (!['script', 'middleware'].includes(config.processor_mode)) {
      errors.push('处理器模式必须是 script 或 middleware');
    }
  }

  // 任务配置验证
  if (config.task_default_timeout !== undefined) {
    if (config.task_default_timeout < 30 || config.task_default_timeout > 3600) {
      errors.push('任务超时时间必须在30-3600秒之间');
    }
  }

  if (config.task_default_retry_count !== undefined) {
    if (config.task_default_retry_count < 0 || config.task_default_retry_count > 10) {
      errors.push('重试次数必须在0-10之间');
    }
  }

  if (config.task_default_concurrent_limit !== undefined) {
    if (config.task_default_concurrent_limit < 1 || config.task_default_concurrent_limit > 20) {
      errors.push('任务并发限制必须在1-20之间');
    }
  }

  // 系统配置验证
  if (config.system_max_queue_size !== undefined) {
    if (config.system_max_queue_size < 100 || config.system_max_queue_size > 10000) {
      errors.push('最大队列大小必须在100-10000之间');
    }
  }

  if (config.system_cleanup_interval !== undefined) {
    if (config.system_cleanup_interval < 300000 || config.system_cleanup_interval > 86400000) {
      errors.push('清理间隔必须在300000-86400000ms之间');
    }
  }

  if (config.system_log_retention_days !== undefined) {
    if (config.system_log_retention_days < 1 || config.system_log_retention_days > 365) {
      errors.push('日志保留天数必须在1-365天之间');
    }
  }

  // 中间件配置验证
  if (config.middleware_pool_size !== undefined) {
    if (config.middleware_pool_size < 1 || config.middleware_pool_size > 100) {
      errors.push('中间件连接池大小必须在1-100之间');
    }
  }

  if (config.middleware_keepalive_timeout !== undefined) {
    if (config.middleware_keepalive_timeout < 5000 || config.middleware_keepalive_timeout > 300000) {
      errors.push('中间件保活超时必须在5000-300000ms之间');
    }
  }

  // 🆕 API配置验证（归入处理器配置类别）
  if (config.api_request_timeout !== undefined) {
    if (config.api_request_timeout < 30000 || config.api_request_timeout > 1800000) {
      errors.push('API请求超时必须在30000-1800000ms之间');
    }
  }

  if (config.api_connect_timeout !== undefined) {
    if (config.api_connect_timeout < 5000 || config.api_connect_timeout > 60000) {
      errors.push('API连接超时必须在5000-60000ms之间');
    }
  }

  if (config.api_max_retries !== undefined) {
    if (config.api_max_retries < 0 || config.api_max_retries > 5) {
      errors.push('API最大重试次数必须在0-5之间');
    }
  }

  // 🆕 僵尸任务检测配置验证
  if (config.zombie_task_timeout_minutes !== undefined) {
    if (config.zombie_task_timeout_minutes < 1 || config.zombie_task_timeout_minutes > 60) {
      errors.push('僵尸任务超时时间必须在1-60分钟之间');
    }
  }

  return errors;
}