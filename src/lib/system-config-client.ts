/**
 * 系统配置客户端
 * 提供系统配置的获取和缓存功能
 */

interface SystemConfig {
  api_request_timeout: number;         // API请求超时时间（毫秒）
  api_connect_timeout: number;         // 连接超时时间（毫秒）
  api_max_retries: number;             // API最大重试次数
  [key: string]: any;
}

class SystemConfigClient {
  private configCache: SystemConfig | null = null;
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 60000; // 1分钟缓存

  /**
   * 获取系统配置（带缓存）
   */
  async getConfig(): Promise<SystemConfig> {
    const now = Date.now();
    
    // 检查缓存是否有效
    if (this.configCache && (now - this.lastCacheUpdate) < this.CACHE_TTL) {
      return this.configCache;
    }

    try {
      // 检查是否在服务器端环境
      if (typeof window === 'undefined') {
        // 服务器端：直接从数据库获取配置
        const { createClient } = await import('@/lib/supabase');
        const supabase = createClient();
        
        const { data: configs, error } = await supabase
          .from('system_configs')
          .select('key, value');

        if (!error && configs) {
          const configMap: SystemConfig = {};
          configs.forEach(config => {
            try {
              // 🔧 键名映射：处理数据库中的点分格式到下划线格式
              const mappedKey = this.mapConfigKey(config.key);
              configMap[mappedKey] = JSON.parse(config.value);
            } catch {
              const mappedKey = this.mapConfigKey(config.key);
              configMap[mappedKey] = config.value;
            }
          });
          
          console.log('✅ 系统配置加载成功:', {
            totalConfigs: configs.length,
            apiTimeout: configMap.api_request_timeout,
            apiTimeoutMinutes: configMap.api_request_timeout ? configMap.api_request_timeout / 60000 : 'undefined'
          });
          
          this.configCache = configMap;
          this.lastCacheUpdate = now;
          return this.configCache;
        }
      } else {
        // 客户端：使用API调用
        const response = await fetch('/api/system/config');
        if (response.ok) {
          const data = await response.json();
          this.configCache = data.config;
          this.lastCacheUpdate = now;
          return this.configCache;
        }
      }
    } catch (error) {
      console.warn('获取系统配置失败，使用默认值:', error);
    }

    // 如果获取失败，使用默认配置
    const defaultConfig: SystemConfig = {
      api_request_timeout: 900000,      // 🔧 修改为15分钟 (900000ms)，与系统配置一致
      api_connect_timeout: 30000,       // 30秒
      api_max_retries: 2,               // 最大2次重试
    };

    this.configCache = defaultConfig;
    this.lastCacheUpdate = now;
    return defaultConfig;
  }

  /**
   * 获取API请求超时时间
   */
  async getApiRequestTimeout(): Promise<number> {
    const config = await this.getConfig();
    return config.api_request_timeout || 600000; // 🔥 默认600秒
  }

  /**
   * 获取API连接超时时间
   */
  async getApiConnectTimeout(): Promise<number> {
    const config = await this.getConfig();
    return config.api_connect_timeout || 30000;
  }

  /**
   * 获取API最大重试次数
   */
  async getApiMaxRetries(): Promise<number> {
    const config = await this.getConfig();
    return config.api_max_retries || 2;
  }

  /**
   * 映射数据库配置键到系统配置键
   */
  private mapConfigKey(dbKey: string): string {
    const keyMapping: Record<string, string> = {
      'api.request_timeout': 'api_request_timeout',
      'api.connect_timeout': 'api_connect_timeout', 
      'api.max_retries': 'api_max_retries',
      // 可以继续添加其他映射
    };
    
    return keyMapping[dbKey] || dbKey.replace(/\./g, '_');
  }

  /**
   * 清除缓存（用于配置更新后立即生效）
   */
  clearCache(): void {
    this.configCache = null;
    this.lastCacheUpdate = 0;
    console.log('🔄 系统配置缓存已清除');
  }
}

// 创建全局单例
export const systemConfigClient = new SystemConfigClient();