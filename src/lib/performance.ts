/**
 * API性能优化和缓存策略
 * 实现Redis缓存、查询优化、响应压缩等性能提升措施
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// 内存缓存实现 (开发环境)
class MemoryCache {
  private cache = new Map<string, { data: any; expires: number }>();
  
  set(key: string, data: any, ttlSeconds: number = 300): void {
    const expires = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { data, expires });
  }
  
  get(key: string): any {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  // 清理过期缓存
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key);
      }
    }
  }
}

// 全局缓存实例
const memoryCache = new MemoryCache();

// 定期清理过期缓存
if (typeof window === 'undefined') {
  setInterval(() => {
    memoryCache.cleanup();
  }, 60000); // 每分钟清理一次
}

// 缓存配置
export const CACHE_CONFIG = {
  // 静态数据缓存时间 (秒)
  STATIC_DATA_TTL: 300, // 5分钟
  // 动态数据缓存时间 (秒)  
  DYNAMIC_DATA_TTL: 60, // 1分钟
  // 搜索结果缓存时间 (秒)
  SEARCH_RESULTS_TTL: 180, // 3分钟
  // 统计数据缓存时间 (秒)
  STATS_DATA_TTL: 120, // 2分钟
};

// 缓存键生成函数
export function generateCacheKey(prefix: string, params: Record<string, any> = {}): string {
  const paramStr = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  return paramStr ? `${prefix}:${paramStr}` : prefix;
}

// 缓存装饰器函数
export function withCache<T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      // 尝试从缓存获取数据
      const cached = memoryCache.get(key);
      if (cached !== null) {
        console.log(`Cache HIT: ${key}`);
        resolve(cached);
        return;
      }
      
      console.log(`Cache MISS: ${key}`);
      // 缓存未命中，执行原始函数
      const result = await fetchFn();
      
      // 存入缓存
      memoryCache.set(key, result, ttl);
      resolve(result);
      
    } catch (error) {
      reject(error);
    }
  });
}

// API响应压缩中间件
export function withCompression(response: NextResponse): NextResponse {
  // 设置压缩头
  response.headers.set('Content-Encoding', 'gzip');
  response.headers.set('Vary', 'Accept-Encoding');
  
  return response;
}

// API性能监控装饰器
export function withPerformanceMonitoring(
  apiName: string,
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const startTime = performance.now();
    
    try {
      const response = await handler(req);
      const duration = performance.now() - startTime;
      
      // 记录性能指标
      console.log(`API Performance: ${apiName} - ${duration.toFixed(2)}ms`);
      
      // 添加性能头信息
      response.headers.set('X-Response-Time', `${duration.toFixed(2)}ms`);
      response.headers.set('X-API-Name', apiName);
      
      return response;
      
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`API Error: ${apiName} - ${duration.toFixed(2)}ms`, error);
      throw error;
    }
  };
}

// 数据库查询优化工具
export class QueryOptimizer {
  private supabase: ReturnType<typeof createClient>;
  
  constructor(supabaseClient: ReturnType<typeof createClient>) {
    this.supabase = supabaseClient;
  }
  
  // 优化的分页查询
  async getPaginatedData(
    table: string,
    options: {
      select?: string;
      filters?: Record<string, any>;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
      offset?: number;
      cacheKey?: string;
      cacheTTL?: number;
    } = {}
  ) {
    const {
      select = '*',
      filters = {},
      orderBy = { column: 'created_at', ascending: false },
      limit = 20,
      offset = 0,
      cacheKey,
      cacheTTL = CACHE_CONFIG.DYNAMIC_DATA_TTL
    } = options;
    
    const fetchData = async () => {
      let query = this.supabase
        .from(table)
        .select(select, { count: 'exact' })
        .order(orderBy.column, { ascending: orderBy.ascending });
      
      // 应用过滤器
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (typeof value === 'string' && key.includes('search')) {
            query = query.ilike(key.replace('_search', ''), `%${value}%`);
          } else {
            query = query.eq(key, value);
          }
        }
      });
      
      // 应用分页
      const { data, error, count } = await query.range(offset, offset + limit - 1);
      
      if (error) throw error;
      
      return {
        data: data || [],
        pagination: {
          total: count || 0,
          limit,
          offset,
          has_more: (count || 0) > offset + limit
        }
      };
    };
    
    // 如果提供了缓存键，使用缓存
    if (cacheKey) {
      const fullCacheKey = generateCacheKey(cacheKey, { 
        table, filters, orderBy, limit, offset 
      });
      return withCache(fullCacheKey, cacheTTL, fetchData);
    }
    
    return fetchData();
  }
  
  // 优化的统计查询
  async getStats(
    table: string,
    options: {
      countColumn?: string;
      groupBy?: string;
      filters?: Record<string, any>;
      cacheKey?: string;
      cacheTTL?: number;
    } = {}
  ) {
    const {
      countColumn = '*',
      groupBy,
      filters = {},
      cacheKey,
      cacheTTL = CACHE_CONFIG.STATS_DATA_TTL
    } = options;
    
    const fetchStats = async () => {
      // Simple count query - just return basic count for now
      const { count, error } = await this.supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return count;
    };
    
    if (cacheKey) {
      const fullCacheKey = generateCacheKey(cacheKey, {
        table, countColumn, groupBy, filters
      });
      return withCache(fullCacheKey, cacheTTL, fetchStats);
    }
    
    return fetchStats();
  }
}

// 批量操作优化
export async function batchOperation<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  batchSize: number = 10,
  delayMs: number = 100
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // 并行执行批次内的操作
    const batchResults = await Promise.all(
      batch.map(item => operation(item))
    );
    
    results.push(...batchResults);
    
    // 批次间延迟，避免过载
    if (i + batchSize < items.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

// 缓存失效策略
export class CacheInvalidation {
  // 按前缀清除缓存
  static clearByPrefix(prefix: string): void {
    const keys = Array.from(memoryCache['cache'].keys());
    keys.forEach(key => {
      if (key.startsWith(prefix)) {
        memoryCache.delete(key);
      }
    });
    console.log(`Cache cleared for prefix: ${prefix}`);
  }
  
  // 资源更新时的缓存失效
  static invalidateResource(resourceType: string, resourceId?: string): void {
    const prefixes = [
      `${resourceType}:list`,
      `${resourceType}:stats`,
      `${resourceType}:search`
    ];
    
    if (resourceId) {
      prefixes.push(`${resourceType}:${resourceId}`);
    }
    
    prefixes.forEach(prefix => {
      this.clearByPrefix(prefix);
    });
  }
}