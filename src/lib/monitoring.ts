/**
 * API性能监控和错误处理系统
 * 提供统一的API性能追踪、错误日志记录、告警机制
 */

import { NextRequest, NextResponse } from 'next/server';

// 性能指标接口
interface PerformanceMetrics {
  apiName: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  timestamp: number;
  userAgent?: string;
  ip?: string;
  error?: string;
}

// 性能数据存储 (内存存储，生产环境可替换为Redis/数据库)
class MetricsStore {
  private metrics: PerformanceMetrics[] = [];
  private maxSize = 1000; // 最大存储条数

  add(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // 保持存储大小限制
    if (this.metrics.length > this.maxSize) {
      this.metrics = this.metrics.slice(-this.maxSize);
    }
  }

  getMetrics(filter?: {
    apiName?: string;
    method?: string;
    minTimestamp?: number;
    maxTimestamp?: number;
  }): PerformanceMetrics[] {
    let filtered = this.metrics;

    if (filter) {
      if (filter.apiName) {
        filtered = filtered.filter(m => m.apiName === filter.apiName);
      }
      if (filter.method) {
        filtered = filtered.filter(m => m.method === filter.method);
      }
      if (filter.minTimestamp) {
        filtered = filtered.filter(m => m.timestamp >= filter.minTimestamp!);
      }
      if (filter.maxTimestamp) {
        filtered = filtered.filter(m => m.timestamp <= filter.maxTimestamp!);
      }
    }

    return filtered;
  }

  getStats(apiName?: string): {
    totalRequests: number;
    averageResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    errorRate: number;
    requestsPerMinute: number;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    let relevantMetrics = this.metrics;
    if (apiName) {
      relevantMetrics = relevantMetrics.filter(m => m.apiName === apiName);
    }

    const recentMetrics = relevantMetrics.filter(m => m.timestamp >= oneMinuteAgo);
    const responseTimes = relevantMetrics.map(m => m.responseTime);
    const errorCount = relevantMetrics.filter(m => m.statusCode >= 400).length;

    return {
      totalRequests: relevantMetrics.length,
      averageResponseTime: responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0,
      maxResponseTime: responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      minResponseTime: responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      errorRate: relevantMetrics.length > 0 ? (errorCount / relevantMetrics.length) * 100 : 0,
      requestsPerMinute: recentMetrics.length
    };
  }

  clear(): void {
    this.metrics = [];
  }
}

// 全局指标存储实例
const metricsStore = new MetricsStore();

// 错误类型定义
export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'
}

// 自定义错误类
export class APIError extends Error {
  constructor(
    public type: ErrorType,
    public message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// 错误日志记录器
class ErrorLogger {
  private logs: Array<{
    timestamp: number;
    level: 'ERROR' | 'WARN' | 'INFO';
    message: string;
    error?: any;
    context?: any;
  }> = [];

  private maxLogs = 500;

  log(level: 'ERROR' | 'WARN' | 'INFO', message: string, error?: any, context?: any): void {
    this.logs.push({
      timestamp: Date.now(),
      level,
      message,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined,
      context
    });

    // 控制台输出
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${level}: ${message}`;
    
    switch (level) {
      case 'ERROR':
        console.error(logMessage, error, context);
        break;
      case 'WARN':
        console.warn(logMessage, error, context);
        break;
      case 'INFO':
        console.info(logMessage, error, context);
        break;
    }

    // 保持日志大小限制
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  error(message: string, error?: any, context?: any): void {
    this.log('ERROR', message, error, context);
  }

  warn(message: string, error?: any, context?: any): void {
    this.log('WARN', message, error, context);
  }

  info(message: string, context?: any): void {
    this.log('INFO', message, undefined, context);
  }

  getLogs(filter?: {
    level?: 'ERROR' | 'WARN' | 'INFO';
    minTimestamp?: number;
    maxTimestamp?: number;
  }) {
    let filtered = this.logs;

    if (filter) {
      if (filter.level) {
        filtered = filtered.filter(log => log.level === filter.level);
      }
      if (filter.minTimestamp) {
        filtered = filtered.filter(log => log.timestamp >= filter.minTimestamp!);
      }
      if (filter.maxTimestamp) {
        filtered = filtered.filter(log => log.timestamp <= filter.maxTimestamp!);
      }
    }

    return filtered;
  }
}

// 全局错误日志记录器实例
export const logger = new ErrorLogger();

// 性能监控和错误处理中间件
export function withMonitoring(
  apiName: string,
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    const startTime = performance.now();
    const timestamp = Date.now();
    
    // 提取请求信息
    const method = req.method;
    const path = new URL(req.url).pathname;
    const userAgent = req.headers.get('user-agent') || undefined;
    const ip = req.headers.get('x-forwarded-for') || 
              req.headers.get('x-real-ip') || 
              'unknown';

    let response: NextResponse;
    let statusCode = 200;
    let errorMessage: string | undefined;

    try {
      // 执行API处理函数
      response = await handler(req, context);
      statusCode = response.status;

      // 记录成功请求
      const responseTime = performance.now() - startTime;
      
      metricsStore.add({
        apiName,
        method,
        path,
        statusCode,
        responseTime,
        timestamp,
        userAgent,
        ip
      });

      // 添加性能头信息
      response.headers.set('X-Response-Time', `${responseTime.toFixed(2)}ms`);
      response.headers.set('X-API-Name', apiName);
      response.headers.set('X-Request-ID', `${timestamp}-${Math.random().toString(36).substr(2, 9)}`);

      // 记录慢查询警告
      if (responseTime > 1000) {
        logger.warn(`Slow API response: ${apiName}`, undefined, {
          responseTime,
          method,
          path
        });
      }

      logger.info(`API Success: ${apiName}`, {
        method,
        path,
        statusCode,
        responseTime: `${responseTime.toFixed(2)}ms`
      });

      return response;

    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      // 处理自定义错误
      if (error instanceof APIError) {
        statusCode = error.statusCode;
        errorMessage = error.message;
        
        response = NextResponse.json(
          { 
            error: error.message,
            type: error.type,
            details: error.details
          },
          { status: error.statusCode }
        );
      } else {
        // 处理未知错误
        statusCode = 500;
        errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        response = NextResponse.json(
          { 
            error: '服务器内部错误',
            type: ErrorType.INTERNAL_SERVER_ERROR
          },
          { status: 500 }
        );
      }

      // 记录错误指标
      metricsStore.add({
        apiName,
        method,
        path,
        statusCode,
        responseTime,
        timestamp,
        userAgent,
        ip,
        error: errorMessage
      });

      // 记录错误日志
      logger.error(`API Error: ${apiName}`, error, {
        method,
        path,
        statusCode,
        responseTime: `${responseTime.toFixed(2)}ms`,
        userAgent,
        ip
      });

      // 添加错误头信息
      response.headers.set('X-Response-Time', `${responseTime.toFixed(2)}ms`);
      response.headers.set('X-API-Name', apiName);
      response.headers.set('X-Error-Type', error instanceof APIError ? error.type : ErrorType.INTERNAL_SERVER_ERROR);

      return response;
    }
  };
}

// 健康检查和监控API端点
export async function getHealthCheck(): Promise<NextResponse> {
  const now = Date.now();
  const fiveMinutesAgo = now - 300000;

  // 获取系统整体统计
  const overallStats = metricsStore.getStats();
  
  // 获取最近5分钟的错误日志
  const recentErrors = logger.getLogs({
    level: 'ERROR',
    minTimestamp: fiveMinutesAgo
  });

  // 系统健康状态评估
  const isHealthy = overallStats.errorRate < 5 && overallStats.averageResponseTime < 1000;

  const healthData = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    performance: {
      totalRequests: overallStats.totalRequests,
      averageResponseTime: Math.round(overallStats.averageResponseTime),
      maxResponseTime: Math.round(overallStats.maxResponseTime),
      minResponseTime: Math.round(overallStats.minResponseTime),
      errorRate: Math.round(overallStats.errorRate * 100) / 100,
      requestsPerMinute: overallStats.requestsPerMinute
    },
    errors: {
      recentErrorCount: recentErrors.length,
      lastError: recentErrors.length > 0 ? recentErrors[recentErrors.length - 1] : null
    },
    uptime: process.uptime ? Math.round(process.uptime()) : 'unknown'
  };

  return NextResponse.json(healthData, {
    status: isHealthy ? 200 : 503
  });
}

// 获取详细监控数据
export async function getMonitoringData(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const apiName = searchParams.get('api');
  const timeRange = parseInt(searchParams.get('timeRange') || '3600'); // 默认1小时
  
  const minTimestamp = Date.now() - (timeRange * 1000);
  
  const metrics = metricsStore.getMetrics({
    apiName: apiName || undefined,
    minTimestamp
  });
  
  const logs = logger.getLogs({
    minTimestamp
  });

  const stats = metricsStore.getStats(apiName || undefined);

  return NextResponse.json({
    metrics,
    logs,
    stats,
    timeRange,
    generatedAt: new Date().toISOString()
  });
}

// 导出全局实例用于其他模块
export { metricsStore };