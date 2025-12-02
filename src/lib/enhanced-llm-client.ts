/**
 * 增强版LLM客户端 - 集成智能重试机制
 * 解决25%失败率问题的核心组件
 */

import { LLMClient } from './llm-client';
import type { LLMRequest, LLMResponse } from './llm-client';
import { retryEngine } from './enhanced-retry-engine';

interface EnhancedLLMRequest extends LLMRequest {
  // 增强配置选项
  retry_config?: {
    max_attempts?: number;
    timeout_ms?: number;
    enable_circuit_breaker?: boolean;
  };
  context?: {
    task_id?: string;
    subtask_id?: string;
    operation_type?: string;
  };
}

interface EnhancedLLMResponse extends LLMResponse {
  // 增强响应信息
  retry_info: {
    attempts: number;
    total_time: number;
    was_retried: boolean;
    circuit_breaker_triggered?: boolean;
  };
}

export class EnhancedLLMClient {
  private baseClient: LLMClient;
  
  constructor() {
    this.baseClient = new LLMClient();
  }

  /**
   * 增强版LLM调用 - 带智能重试
   */
  async callLLM(request: EnhancedLLMRequest): Promise<EnhancedLLMResponse> {
    const startTime = Date.now();
    
    // 从请求中提取模型配置信息
    const modelConfig = await this.getModelConfig(request.model_id);
    const provider = modelConfig?.provider || 'unknown';
    const modelName = modelConfig?.name || request.model_id;
    
    // 获取系统配置的超时时间
    const systemTimeout = await this.getSystemApiTimeout();
    
    // 准备重试配置
    const retryConfig = {
      maxAttempts: request.retry_config?.max_attempts || 5,
      timeoutMs: request.retry_config?.timeout_ms || systemTimeout, // 使用系统配置的超时时间
      enableCircuitBreaker: request.retry_config?.enable_circuit_breaker ?? true,
      // 根据错误历史动态调整配置
      ...retryEngine.getRecommendedConfig(await this.getErrorHistory(provider))
    };
    
    // 执行带重试的LLM调用
    const result = await retryEngine.executeWithRetry(
      () => this.baseLLMCall(request),
      {
        provider: provider,
        model: modelName,
        operation: request.context?.operation_type || 'evaluation'
      },
      retryConfig
    );
    
    if (result.success && result.data) {
      // 成功：返回增强响应
      return {
        ...result.data,
        retry_info: {
          attempts: result.attempts,
          total_time: result.totalTime,
          was_retried: result.attempts > 1,
          circuit_breaker_triggered: false
        }
      };
    } else {
      // 失败：抛出详细错误
      const error = new Error(`LLM调用失败: ${result.error}`);
      (error as any).retry_info = {
        attempts: result.attempts,
        total_time: result.totalTime,
        was_retried: result.attempts > 1,
        circuit_breaker_triggered: result.shouldCircuitBreak || false
      };
      (error as any).provider = provider;
      (error as any).model = modelName;
      
      throw error;
    }
  }

  /**
   * 基础LLM调用（无重试）
   */
  private async baseLLMCall(request: LLMRequest): Promise<LLMResponse> {
    return await this.baseClient.callLLM(request);
  }

  /**
   * 获取模型配置
   */
  private async getModelConfig(modelId: string): Promise<any> {
    try {
      // 从基础客户端获取模型配置
      return await (this.baseClient as any).getModelConfig(modelId);
    } catch (error) {
      console.warn(`无法获取模型配置: ${modelId}`, error);
      return null;
    }
  }

  /**
   * 获取提供商错误历史
   */
  private async getErrorHistory(provider: string): Promise<string[]> {
    // 这里可以从数据库或缓存中获取最近的错误历史
    // 暂时返回空数组，后续可以实现持久化存储
    return [];
  }

  /**
   * 批量健康检查
   */
  async batchHealthCheck(
    modelIds: string[],
    options: {
      timeout_ms?: number;
      concurrent_limit?: number;
    } = {}
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const timeoutMs = options.timeout_ms || await this.getSystemApiTimeout();
    const concurrentLimit = options.concurrent_limit || 5;
    
    // 分批并发执行
    const batches = this.createBatches(modelIds, concurrentLimit);
    
    for (const batch of batches) {
      const batchPromises = batch.map(async (modelId) => {
        try {
          const testRequest: EnhancedLLMRequest = {
            model_id: modelId,
            user_prompt: '健康检查测试',
            max_tokens: 10,
            temperature: 0.1,
            retry_config: {
              max_attempts: 1,
              timeout_ms: timeoutMs,
              enable_circuit_breaker: false
            },
            context: {
              operation_type: 'health_check'
            }
          };
          
          await this.callLLM(testRequest);
          return { modelId, healthy: true };
        } catch (error) {
          return { modelId, healthy: false };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.set(result.value.modelId, result.value.healthy);
        } else {
          // Promise本身失败，标记为不健康
          results.set('unknown', false);
        }
      });
    }
    
    return results;
  }

  /**
   * 获取提供商健康状态
   */
  getProviderHealthStatus() {
    return retryEngine.getProviderHealth();
  }

  /**
   * 重置健康状态
   */
  resetProviderHealth() {
    retryEngine.resetHealth();
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats() {
    const healthStatus = retryEngine.getProviderHealth();
    
    return {
      providers: healthStatus.map(health => ({
        name: health.name,
        avg_response_time: Math.round(health.avgResponseTime),
        consecutive_failures: health.consecutiveFailures,
        is_circuit_open: health.isCircuitOpen,
        last_failure_time: health.lastFailureTime ? new Date(health.lastFailureTime).toISOString() : null
      })),
      overall: {
        total_providers: healthStatus.length,
        healthy_providers: healthStatus.filter(h => !h.isCircuitOpen).length,
        circuit_breakers_open: healthStatus.filter(h => h.isCircuitOpen).length
      }
    };
  }

  /**
   * 获取系统配置的API超时时间
   */
  private async getSystemApiTimeout(): Promise<number> {
    try {
      const { systemConfigClient } = await import('@/lib/system-config-client');
      return await systemConfigClient.getApiRequestTimeout();
    } catch (error) {
      console.warn('获取系统API超时配置失败，使用默认值:', error);
      return 600000; // 默认10分钟
    }
  }

  /**
   * 创建批次
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}

// 全局实例
export const enhancedLLMClient = new EnhancedLLMClient();

// 向后兼容的类型导出
export type { LLMRequest, LLMResponse } from './llm-client';