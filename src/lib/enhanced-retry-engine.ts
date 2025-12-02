/**
 * 增强重试引擎 - 解决25%失败率问题
 * 实现智能重试、电路熔断、指数退避等策略
 */

interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
}

interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  totalTime: number;
  shouldCircuitBreak?: boolean;
}

interface ProviderHealth {
  name: string;
  consecutiveFailures: number;
  lastFailureTime: number;
  isCircuitOpen: boolean;
  successRate: number;
  avgResponseTime: number;
}

export class EnhancedRetryEngine {
  private providerHealth = new Map<string, ProviderHealth>();
  private defaultConfig: RetryConfig = {
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    timeoutMs: 60000,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5
  };

  /**
   * 执行带智能重试的操作
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: {
      provider: string;
      model: string;
      operation: string;
    },
    config: Partial<RetryConfig> = {}
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    let lastError: any;
    
    // 检查电路熔断状态
    if (this.isCircuitOpen(context.provider)) {
      return {
        success: false,
        error: `电路熔断: ${context.provider} 暂时不可用`,
        attempts: 0,
        totalTime: 0,
        shouldCircuitBreak: true
      };
    }

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        console.log(`🔄 [${context.provider}/${context.model}] 尝试 ${attempt}/${finalConfig.maxAttempts}`);
        
        // 使用Promise.race实现超时控制
        const result = await Promise.race([
          operation(),
          this.createTimeoutPromise<T>(finalConfig.timeoutMs)
        ]);
        
        // 成功：记录健康状态
        this.recordSuccess(context.provider, Date.now() - startTime);
        
        return {
          success: true,
          data: result,
          attempts: attempt,
          totalTime: Date.now() - startTime
        };
        
      } catch (error: any) {
        lastError = error;
        const errorMessage = error.message || error.toString();
        
        console.warn(`❌ [${context.provider}/${context.model}] 尝试 ${attempt} 失败: ${errorMessage}`);
        
        // 记录失败
        this.recordFailure(context.provider);
        
        // 判断是否应该重试
        if (!this.shouldRetry(error, attempt, finalConfig.maxAttempts)) {
          break;
        }
        
        // 指数退避延迟
        if (attempt < finalConfig.maxAttempts) {
          const delay = this.calculateDelay(attempt, finalConfig);
          console.log(`⏱️ 等待 ${delay}ms 后重试...`);
          await this.sleep(delay);
        }
      }
    }
    
    // 检查是否触发电路熔断
    const shouldBreak = this.shouldOpenCircuit(context.provider);
    
    return {
      success: false,
      error: lastError?.message || '未知错误',
      attempts: finalConfig.maxAttempts,
      totalTime: Date.now() - startTime,
      shouldCircuitBreak: shouldBreak
    };
  }

  /**
   * 创建超时Promise
   */
  private createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`操作超时 (${timeoutMs}ms)`));
      }, timeoutMs);
    });
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: any, attempt: number, maxAttempts: number): boolean {
    if (attempt >= maxAttempts) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    
    // 可重试的错误类型
    const retryableErrors = [
      'timeout',
      'aborted',
      'fetch failed',
      '502',
      '503',
      '504',
      'network',
      'connection',
      'unknown error'
    ];
    
    // 不可重试的错误类型
    const nonRetryableErrors = [
      '401',
      '403',
      '404',
      '400',
      'invalid',
      'unauthorized',
      'forbidden'
    ];
    
    // 检查不可重试的错误
    if (nonRetryableErrors.some(err => errorMessage.includes(err))) {
      console.log(`🚫 不可重试的错误: ${errorMessage}`);
      return false;
    }
    
    // 检查可重试的错误
    const isRetryable = retryableErrors.some(err => errorMessage.includes(err));
    
    if (!isRetryable) {
      console.log(`❓ 未知错误类型，尝试重试: ${errorMessage}`);
    }
    
    return true;
  }

  /**
   * 计算重试延迟（指数退避 + 随机抖动）
   */
  private calculateDelay(attempt: number, config: RetryConfig): number {
    // 指数退避：baseDelay * 2^(attempt-1)
    const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt - 1);
    
    // 添加随机抖动（±25%）
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    
    // 限制最大延迟
    const finalDelay = Math.min(exponentialDelay + jitter, config.maxDelayMs);
    
    return Math.max(finalDelay, config.baseDelayMs);
  }

  /**
   * 记录成功操作
   */
  private recordSuccess(provider: string, responseTime: number): void {
    let health = this.providerHealth.get(provider);
    if (!health) {
      health = {
        name: provider,
        consecutiveFailures: 0,
        lastFailureTime: 0,
        isCircuitOpen: false,
        successRate: 100,
        avgResponseTime: responseTime
      };
    }
    
    // 重置失败计数
    health.consecutiveFailures = 0;
    health.isCircuitOpen = false;
    
    // 更新平均响应时间
    health.avgResponseTime = (health.avgResponseTime * 0.9) + (responseTime * 0.1);
    
    this.providerHealth.set(provider, health);
  }

  /**
   * 记录失败操作
   */
  private recordFailure(provider: string): void {
    let health = this.providerHealth.get(provider);
    if (!health) {
      health = {
        name: provider,
        consecutiveFailures: 0,
        lastFailureTime: 0,
        isCircuitOpen: false,
        successRate: 100,
        avgResponseTime: 0
      };
    }
    
    health.consecutiveFailures++;
    health.lastFailureTime = Date.now();
    
    this.providerHealth.set(provider, health);
  }

  /**
   * 检查是否应该开启电路熔断
   */
  private shouldOpenCircuit(provider: string): boolean {
    const health = this.providerHealth.get(provider);
    if (!health) return false;
    
    const shouldOpen = health.consecutiveFailures >= this.defaultConfig.circuitBreakerThreshold;
    
    if (shouldOpen) {
      health.isCircuitOpen = true;
      this.providerHealth.set(provider, health);
      console.warn(`🔌 电路熔断开启: ${provider} (连续失败 ${health.consecutiveFailures} 次)`);
    }
    
    return shouldOpen;
  }

  /**
   * 检查电路是否开启
   */
  private isCircuitOpen(provider: string): boolean {
    const health = this.providerHealth.get(provider);
    if (!health || !health.isCircuitOpen) return false;
    
    // 检查是否到了恢复时间（5分钟后尝试恢复）
    const recoveryTimeMs = 5 * 60 * 1000;
    const shouldTryRecovery = Date.now() - health.lastFailureTime > recoveryTimeMs;
    
    if (shouldTryRecovery) {
      console.log(`🔌 尝试恢复电路: ${provider}`);
      health.isCircuitOpen = false;
      health.consecutiveFailures = Math.floor(health.consecutiveFailures / 2); // 减半失败计数
      this.providerHealth.set(provider, health);
      return false;
    }
    
    return true;
  }

  /**
   * 获取提供商健康状态
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  /**
   * 获取推荐的配置
   */
  getRecommendedConfig(errorHistory: string[]): Partial<RetryConfig> {
    const timeoutErrors = errorHistory.filter(e => e.includes('timeout')).length;
    const networkErrors = errorHistory.filter(e => e.includes('fetch failed')).length;
    
    if (timeoutErrors > 3) {
      return {
        timeoutMs: 90000, // 增加到90秒
        maxAttempts: 3,   // 减少重试次数
        baseDelayMs: 2000 // 增加基础延迟
      };
    }
    
    if (networkErrors > 3) {
      return {
        maxAttempts: 7,   // 增加重试次数
        baseDelayMs: 3000, // 增加延迟
        maxDelayMs: 60000
      };
    }
    
    return {};
  }

  /**
   * 休眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 重置所有健康状态
   */
  resetHealth(): void {
    this.providerHealth.clear();
    console.log('🔄 已重置所有提供商健康状态');
  }
}

// 全局实例
export const retryEngine = new EnhancedRetryEngine();