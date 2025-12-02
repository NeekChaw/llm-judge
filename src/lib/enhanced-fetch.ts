/**
 * 增强版Fetch客户端 - 带智能重试机制
 * 将智能重试引擎应用于普通URL请求
 */

import { retryEngine } from './enhanced-retry-engine';

interface EnhancedFetchOptions extends RequestInit {
  // 增强配置选项
  retry_config?: {
    max_attempts?: number;
    timeout_ms?: number;
    enable_circuit_breaker?: boolean;
  };
  context?: {
    operation_type?: string;
    service_name?: string;
  };
}

export class EnhancedFetch {
  /**
   * 增强版fetch - 带智能重试
   */
  static async fetch(url: string, options: EnhancedFetchOptions = {}): Promise<Response> {
    const { retry_config, context, ...fetchOptions } = options;
    
    // 从URL中解析服务信息
    let serviceName = 'unknown';
    try {
      // 尝试解析绝对URL
      const parsedUrl = new URL(url);
      serviceName = context?.service_name || parsedUrl.hostname || 'unknown';
    } catch {
      // 如果是相对URL，尝试使用当前域名构建完整URL来解析
      try {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        const parsedUrl = new URL(url, baseUrl);
        serviceName = context?.service_name || parsedUrl.pathname.split('/')[1] || 'local-api';
      } catch {
        // 如果仍然失败，使用默认值或从路径推断
        serviceName = context?.service_name || (url.startsWith('/api/') ? 'local-api' : 'unknown');
      }
    }
    const operation = context?.operation_type || 'fetch';
    
    // 准备重试配置
    const retryConfig = {
      maxAttempts: retry_config?.max_attempts || 3,
      timeoutMs: retry_config?.timeout_ms || 600000, // 🔥 默认600秒超时
      enableCircuitBreaker: retry_config?.enable_circuit_breaker ?? true
    };
    
    // 添加超时到fetch选项
    if (!fetchOptions.signal) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), retryConfig.timeoutMs);
      fetchOptions.signal = controller.signal;
      
      // 清理定时器
      fetchOptions.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
      });
    }
    
    // 执行带重试的fetch调用
    const result = await retryEngine.executeWithRetry(
      async () => {
        const response = await fetch(url, fetchOptions);
        
        // 对于4xx客户端错误，不重试
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // 对于5xx服务器错误和429限流，抛出错误触发重试
        if (response.status >= 500 || response.status === 429) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response;
      },
      {
        provider: serviceName,
        model: 'http-client',
        operation: operation
      },
      retryConfig
    );
    
    if (result.success && result.data) {
      return result.data;
    } else {
      const error = new Error(`HTTP请求失败: ${result.error}`);
      (error as any).retry_info = {
        attempts: result.attempts,
        total_time: result.totalTime,
        was_retried: result.attempts > 1,
        circuit_breaker_triggered: result.shouldCircuitBreak || false
      };
      
      throw error;
    }
  }

  /**
   * 增强版GET请求
   */
  static async get(url: string, options: Omit<EnhancedFetchOptions, 'method' | 'body'> = {}): Promise<Response> {
    return EnhancedFetch.fetch(url, { ...options, method: 'GET' });
  }

  /**
   * 增强版POST请求
   */
  static async post(url: string, body?: any, options: Omit<EnhancedFetchOptions, 'method' | 'body'> = {}): Promise<Response> {
    return EnhancedFetch.fetch(url, { 
      ...options, 
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  }

  /**
   * 增强版PUT请求
   */
  static async put(url: string, body?: any, options: Omit<EnhancedFetchOptions, 'method' | 'body'> = {}): Promise<Response> {
    return EnhancedFetch.fetch(url, { 
      ...options, 
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  }

  /**
   * 增强版DELETE请求
   */
  static async delete(url: string, options: Omit<EnhancedFetchOptions, 'method' | 'body'> = {}): Promise<Response> {
    return EnhancedFetch.fetch(url, { ...options, method: 'DELETE' });
  }
}

// 便捷导出
export const enhancedFetch = EnhancedFetch.fetch;
export const enhancedGet = EnhancedFetch.get;
export const enhancedPost = EnhancedFetch.post;
export const enhancedPut = EnhancedFetch.put;
export const enhancedDelete = EnhancedFetch.delete;