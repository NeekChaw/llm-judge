/**
 * 智能缓存管理器
 * 为聚合分析提供多层缓存策略
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  version: string;
  hits: number;
  ttl: number; // 生存时间（毫秒）
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
}

export class SmartCacheManager {
  private static instance: SmartCacheManager;
  private memoryCache = new Map<string, CacheItem<any>>();
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, hitRate: 0 };
  private readonly maxSize = 100; // 最大缓存项数
  
  private constructor() {
    // 定期清理过期缓存
    setInterval(() => this.cleanup(), 5 * 60 * 1000); // 每5分钟清理一次
  }

  static getInstance(): SmartCacheManager {
    if (!SmartCacheManager.instance) {
      SmartCacheManager.instance = new SmartCacheManager();
    }
    return SmartCacheManager.instance;
  }

  /**
   * 生成缓存键
   */
  private generateKey(prefix: string, identifier: string | string[]): string {
    if (Array.isArray(identifier)) {
      const sortedIds = [...identifier].sort();
      return `${prefix}:${sortedIds.join('_')}`;
    }
    return `${prefix}:${identifier}`;
  }

  /**
   * 设置缓存项
   */
  set<T>(
    prefix: string,
    identifier: string | string[],
    data: T,
    ttlMinutes: number = 30,
    version: string = '1.0'
  ): void {
    const key = this.generateKey(prefix, identifier);
    const now = Date.now();
    const ttl = ttlMinutes * 60 * 1000;

    // 如果缓存已满，清理最少使用的项
    if (this.memoryCache.size >= this.maxSize) {
      this.evictLRU();
    }

    const item: CacheItem<T> = {
      data,
      timestamp: now,
      version,
      hits: 0,
      ttl
    };

    this.memoryCache.set(key, item);
    console.log(`💾 缓存设置: ${key} (TTL: ${ttlMinutes}分钟)`);
  }

  /**
   * 获取缓存项
   */
  get<T>(
    prefix: string,
    identifier: string | string[],
    requiredVersion?: string
  ): T | null {
    const key = this.generateKey(prefix, identifier);
    const item = this.memoryCache.get(key);

    if (!item) {
      this.stats.misses++;
      this.updateHitRate();
      console.log(`❌ 缓存未命中: ${key}`);
      return null;
    }

    const now = Date.now();
    
    // 检查是否过期
    if (now - item.timestamp > item.ttl) {
      this.memoryCache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      console.log(`⏰ 缓存过期: ${key}`);
      return null;
    }

    // 检查版本是否匹配
    if (requiredVersion && item.version !== requiredVersion) {
      this.memoryCache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      console.log(`🔄 缓存版本不匹配: ${key} (需要: ${requiredVersion}, 实际: ${item.version})`);
      return null;
    }

    // 更新访问统计
    item.hits++;
    this.stats.hits++;
    this.updateHitRate();
    console.log(`✅ 缓存命中: ${key} (命中${item.hits}次)`);
    
    return item.data;
  }

  /**
   * 智能获取或设置缓存
   */
  async getOrSet<T>(
    prefix: string,
    identifier: string | string[],
    fetcher: () => Promise<T>,
    ttlMinutes: number = 30,
    version: string = '1.0'
  ): Promise<T> {
    // 先尝试从缓存获取
    const cached = this.get<T>(prefix, identifier, version);
    if (cached !== null) {
      return cached;
    }

    // 缓存未命中，从数据源获取
    console.log(`🔄 缓存未命中，从数据源获取: ${this.generateKey(prefix, identifier)}`);
    const data = await fetcher();
    
    // 设置到缓存
    this.set(prefix, identifier, data, ttlMinutes, version);
    
    return data;
  }

  /**
   * 删除特定缓存项
   */
  delete(prefix: string, identifier: string | string[]): boolean {
    const key = this.generateKey(prefix, identifier);
    const deleted = this.memoryCache.delete(key);
    if (deleted) {
      console.log(`🗑️ 缓存删除: ${key}`);
    }
    return deleted;
  }

  /**
   * 批量删除缓存（按前缀）
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    const keysToDelete: string[] = [];
    
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix + ':')) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.memoryCache.delete(key);
      count++;
    });
    
    if (count > 0) {
      console.log(`🗑️ 批量删除缓存: ${prefix} (${count}项)`);
    }
    
    return count;
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, item] of this.memoryCache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 定期清理过期缓存: ${cleanedCount}项`);
      this.stats.evictions += cleanedCount;
    }
  }

  /**
   * 清理最少使用的缓存项（LRU）
   */
  private evictLRU(): void {
    let lruKey = '';
    let minHits = Infinity;
    let oldestTime = Infinity;
    
    for (const [key, item] of this.memoryCache.entries()) {
      if (item.hits < minHits || (item.hits === minHits && item.timestamp < oldestTime)) {
        minHits = item.hits;
        oldestTime = item.timestamp;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.memoryCache.delete(lruKey);
      this.stats.evictions++;
      console.log(`🚮 LRU清理: ${lruKey} (命中${minHits}次)`);
    }
  }

  /**
   * 更新命中率统计
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): CacheStats & { size: number; maxSize: number } {
    return {
      ...this.stats,
      size: this.memoryCache.size,
      maxSize: this.maxSize
    };
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    const size = this.memoryCache.size;
    this.memoryCache.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, hitRate: 0 };
    console.log(`🧽 清空所有缓存: ${size}项`);
  }

  /**
   * 预热缓存（可在应用启动时调用）
   */
  async warmup(warmupTasks: Array<() => Promise<void>>): Promise<void> {
    console.log(`🔥 开始缓存预热: ${warmupTasks.length}个任务`);
    
    const results = await Promise.allSettled(warmupTasks);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`🔥 缓存预热完成: 成功${successful}个, 失败${failed}个`);
  }
}

// 聚合分析专用缓存工具
export class AggregationCacheManager {
  private cache = SmartCacheManager.getInstance();

  /**
   * 缓存聚合分析统计信息
   */
  cacheAggregationStats(
    taskIds: string[],
    stats: { modelCount: number; dimensionCount: number; models: any[]; dimensions: any[] },
    ttlMinutes: number = 30
  ): void {
    const version = this.generateStatsVersion(taskIds);
    this.cache.set('agg_stats', taskIds, stats, ttlMinutes, version);
  }

  /**
   * 获取缓存的聚合分析统计信息
   */
  getCachedAggregationStats(taskIds: string[]): {
    modelCount: number;
    dimensionCount: number;
    models: any[];
    dimensions: any[];
  } | null {
    const version = this.generateStatsVersion(taskIds);
    return this.cache.get('agg_stats', taskIds, version);
  }

  /**
   * 智能获取聚合统计信息（自动缓存）
   */
  async getAggregationStatsWithCache(
    taskIds: string[],
    fetcher: () => Promise<{ modelCount: number; dimensionCount: number; models: any[]; dimensions: any[] }>,
    ttlMinutes: number = 30
  ): Promise<{ modelCount: number; dimensionCount: number; models: any[]; dimensions: any[] }> {
    const version = this.generateStatsVersion(taskIds);
    return this.cache.getOrSet('agg_stats', taskIds, fetcher, ttlMinutes, version);
  }

  /**
   * 使聚合分析缓存失效
   */
  invalidateAggregationCache(taskIds?: string[]): void {
    if (taskIds) {
      this.cache.delete('agg_stats', taskIds);
    } else {
      // 清空所有聚合统计缓存
      this.cache.deleteByPrefix('agg_stats');
    }
  }

  /**
   * 生成统计信息版本（基于任务ID和当前时间）
   */
  private generateStatsVersion(taskIds: string[]): string {
    const sortedIds = [...taskIds].sort();
    const today = new Date().toDateString();
    return `v_${today}_${sortedIds.length}`;
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}

/**
 * 🚀 浏览器持久化缓存管理器
 * 解决聚合分析矩阵数据在页面刷新后需要重新加载的问题
 */
interface PersistentCachedMatrixData {
  matrixData: Array<[string, Array<[string, any[]]>]>; // Map序列化为数组
  rankingData: Array<[string, Array<[string, number]>]>;
  overallRankingData: Array<[string, number]>;
  timestamp: number;
  dataVersion: string;
  aggregationId: string;
}

export class PersistentAggregationCache {
  private static readonly CACHE_KEY_PREFIX = 'agg_matrix_persistent_';
  private static readonly METADATA_KEY = 'agg_persistent_metadata';
  private static readonly DEFAULT_MAX_AGE = 60 * 60 * 1000; // 1小时
  private static readonly MAX_CACHE_SIZE = 5 * 1024 * 1024; // 5MB localStorage限制
  
  /**
   * 🎯 核心功能：保存完整矩阵数据到浏览器持久存储
   * 解决用户重新访问时仍需等待的问题
   */
  static saveCompleteMatrixData(
    aggregationId: string,
    matrixData: Map<string, Map<string, any[]>>,
    rankingData: Map<string, Map<string, number>>,
    overallRankingData: Map<string, number>
  ): void {
    try {
      const cacheData: PersistentCachedMatrixData = {
        matrixData: Array.from(matrixData.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
        rankingData: Array.from(rankingData.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
        overallRankingData: Array.from(overallRankingData.entries()),
        timestamp: Date.now(),
        dataVersion: this.generateDataVersion(aggregationId),
        aggregationId
      };
      
      // 检查存储空间
      const dataSize = JSON.stringify(cacheData).length;
      if (dataSize > this.MAX_CACHE_SIZE) {
        console.warn(`⚠️ 矩阵数据过大，跳过持久化缓存: ${Math.round(dataSize / 1024)}KB`);
        return;
      }
      
      const cacheKey = this.CACHE_KEY_PREFIX + aggregationId;
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      
      // 更新元数据
      this.updateMetadata(aggregationId);
      
      console.log(`💾 矩阵数据已持久化缓存: ${aggregationId}`, {
        dataSize: `${Math.round(dataSize / 1024)}KB`,
        models: matrixData.size,
        dimensions: Array.from(matrixData.values())[0]?.size || 0,
        validUntil: new Date(Date.now() + this.DEFAULT_MAX_AGE).toLocaleString()
      });
      
      // 清理旧缓存以避免存储空间不足
      this.cleanupOldCaches();
      
    } catch (error) {
      console.warn('⚠️ 保存持久化矩阵数据失败:', error);
      // 如果是存储空间不足，清理旧缓存后重试
      if (error.name === 'QuotaExceededError') {
        this.forceCleanupCaches();
        console.log('🔄 清理后重试保存持久化缓存...');
        try {
          const cacheKey = this.CACHE_KEY_PREFIX + aggregationId;
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
          this.updateMetadata(aggregationId);
          console.log('✅ 重试保存持久化缓存成功');
        } catch {
          console.warn('❌ 重试保存持久化缓存仍然失败');
        }
      }
    }
  }
  
  /**
   * 🚀 核心功能：立即加载持久化的矩阵数据
   * 实现"秒级响应"的关键
   */
  static loadPersistedMatrixData(aggregationId: string): {
    matrixData: Map<string, Map<string, any[]>>;
    rankingData: Map<string, Map<string, number>>;
    overallRankingData: Map<string, number>;
    cacheAge: number; // 缓存年龄（分钟）
  } | null {
    try {
      const cacheKey = this.CACHE_KEY_PREFIX + aggregationId;
      const cached = localStorage.getItem(cacheKey);
      
      if (!cached) {
        console.log(`📭 未找到持久化缓存: ${aggregationId}`);
        return null;
      }
      
      const cacheData: PersistentCachedMatrixData = JSON.parse(cached);
      
      // 检查缓存是否过期
      const cacheAge = Date.now() - cacheData.timestamp;
      if (cacheAge > this.DEFAULT_MAX_AGE) {
        console.log(`⏰ 持久化缓存已过期: ${aggregationId} (${Math.round(cacheAge / 1000 / 60)}分钟前)`);
        this.removeCache(aggregationId);
        return null;
      }
      
      // 重建Map结构
      const matrixData = new Map(
        cacheData.matrixData.map(([k, v]) => [k, new Map(v)])
      );
      const rankingData = new Map(
        cacheData.rankingData.map(([k, v]) => [k, new Map(v)])
      );
      const overallRankingData = new Map(cacheData.overallRankingData);
      
      const ageMinutes = Math.round(cacheAge / 1000 / 60);
      console.log(`🚀 立即加载持久化矩阵数据: ${aggregationId}`, {
        cacheAge: `${ageMinutes}分钟前`,
        models: matrixData.size,
        dimensions: rankingData.size,
        freshness: ageMinutes < 15 ? '🟢新鲜' : ageMinutes < 30 ? '🟡一般' : '🟠较旧'
      });
      
      return {
        matrixData,
        rankingData,
        overallRankingData,
        cacheAge: ageMinutes
      };
    } catch (error) {
      console.warn(`⚠️ 加载持久化缓存失败: ${aggregationId}`, error);
      this.removeCache(aggregationId);
      return null;
    }
  }
  
  /**
   * 检查是否有可用的持久化缓存
   */
  static hasValidPersistentCache(aggregationId: string): boolean {
    try {
      const cacheKey = this.CACHE_KEY_PREFIX + aggregationId;
      const cached = localStorage.getItem(cacheKey);
      
      if (!cached) return false;
      
      const cacheData: PersistentCachedMatrixData = JSON.parse(cached);
      const cacheAge = Date.now() - cacheData.timestamp;
      
      return cacheAge <= this.DEFAULT_MAX_AGE;
    } catch {
      return false;
    }
  }
  
  /**
   * 获取缓存年龄信息
   */
  static getCacheAge(aggregationId: string): number | null {
    try {
      const cacheKey = this.CACHE_KEY_PREFIX + aggregationId;
      const cached = localStorage.getItem(cacheKey);
      
      if (!cached) return null;
      
      const cacheData: PersistentCachedMatrixData = JSON.parse(cached);
      return Math.round((Date.now() - cacheData.timestamp) / 1000 / 60);
    } catch {
      return null;
    }
  }
  
  /**
   * 移除特定缓存
   */
  static removeCache(aggregationId: string): void {
    try {
      const cacheKey = this.CACHE_KEY_PREFIX + aggregationId;
      localStorage.removeItem(cacheKey);
      
      // 更新元数据
      const metadata = this.getMetadata();
      delete metadata[aggregationId];
      this.saveMetadata(metadata);
      
      console.log(`🗑️ 已移除持久化缓存: ${aggregationId}`);
    } catch (error) {
      console.warn('移除持久化缓存失败:', error);
    }
  }
  
  /**
   * 清理过期缓存
   */
  static cleanupExpiredCaches(): number {
    try {
      const metadata = this.getMetadata();
      const now = Date.now();
      let cleanedCount = 0;
      
      Object.keys(metadata).forEach(aggregationId => {
        const cacheKey = this.CACHE_KEY_PREFIX + aggregationId;
        const cached = localStorage.getItem(cacheKey);
        
        if (!cached) {
          delete metadata[aggregationId];
          cleanedCount++;
          return;
        }
        
        try {
          const cacheData: PersistentCachedMatrixData = JSON.parse(cached);
          if (now - cacheData.timestamp > this.DEFAULT_MAX_AGE) {
            localStorage.removeItem(cacheKey);
            delete metadata[aggregationId];
            cleanedCount++;
          }
        } catch {
          localStorage.removeItem(cacheKey);
          delete metadata[aggregationId];
          cleanedCount++;
        }
      });
      
      if (cleanedCount > 0) {
        this.saveMetadata(metadata);
        console.log(`🧹 清理了 ${cleanedCount} 个过期的持久化缓存`);
      }
      
      return cleanedCount;
    } catch (error) {
      console.warn('清理过期持久化缓存失败:', error);
      return 0;
    }
  }
  
  /**
   * 强制清理缓存（存储空间不足时使用）
   */
  private static forceCleanupCaches(): void {
    try {
      const metadata = this.getMetadata();
      const cacheEntries = Object.entries(metadata);
      
      // 按时间排序，删除最老的一半缓存
      cacheEntries.sort(([,a], [,b]) => a.timestamp - b.timestamp);
      const toDelete = cacheEntries.slice(0, Math.ceil(cacheEntries.length / 2));
      
      toDelete.forEach(([aggregationId]) => {
        const cacheKey = this.CACHE_KEY_PREFIX + aggregationId;
        localStorage.removeItem(cacheKey);
        delete metadata[aggregationId];
      });
      
      this.saveMetadata(metadata);
      console.log(`🚮 强制清理了 ${toDelete.length} 个持久化缓存以释放存储空间`);
    } catch (error) {
      console.warn('强制清理持久化缓存失败:', error);
    }
  }
  
  /**
   * 清理旧缓存（保持存储空间健康）
   */
  private static cleanupOldCaches(): void {
    const metadata = this.getMetadata();
    const cacheCount = Object.keys(metadata).length;
    
    // 如果缓存数量超过限制，清理最旧的
    const MAX_CACHE_COUNT = 10;
    if (cacheCount > MAX_CACHE_COUNT) {
      const cacheEntries = Object.entries(metadata);
      cacheEntries.sort(([,a], [,b]) => a.timestamp - b.timestamp);
      
      const toDelete = cacheEntries.slice(0, cacheCount - MAX_CACHE_COUNT);
      toDelete.forEach(([aggregationId]) => {
        this.removeCache(aggregationId);
      });
      
      console.log(`🧹 清理了 ${toDelete.length} 个旧的持久化缓存`);
    }
  }
  
  /**
   * 获取缓存统计信息
   */
  static getCacheStats(): {
    totalCaches: number;
    totalSize: string;
    oldestCacheAge: string;
    newestCacheAge: string;
    hitRate: string;
  } {
    try {
      const metadata = this.getMetadata();
      const cacheIds = Object.keys(metadata);
      
      let totalSize = 0;
      let oldestTime = Date.now();
      let newestTime = 0;
      
      cacheIds.forEach(aggregationId => {
        const cacheKey = this.CACHE_KEY_PREFIX + aggregationId;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          totalSize += cached.length;
          const cacheInfo = metadata[aggregationId];
          if (cacheInfo) {
            oldestTime = Math.min(oldestTime, cacheInfo.timestamp);
            newestTime = Math.max(newestTime, cacheInfo.timestamp);
          }
        }
      });
      
      return {
        totalCaches: cacheIds.length,
        totalSize: `${Math.round(totalSize / 1024)}KB`,
        oldestCacheAge: oldestTime === Date.now() ? '-' : `${Math.round((Date.now() - oldestTime) / 1000 / 60)}分钟前`,
        newestCacheAge: newestTime === 0 ? '-' : `${Math.round((Date.now() - newestTime) / 1000 / 60)}分钟前`,
        hitRate: cacheIds.length > 0 ? '持久化缓存' : '无缓存'
      };
    } catch {
      return {
        totalCaches: 0,
        totalSize: '0KB',
        oldestCacheAge: '-',
        newestCacheAge: '-',
        hitRate: '错误'
      };
    }
  }
  
  // 私有辅助方法
  private static getMetadata(): Record<string, { timestamp: number; version: string }> {
    try {
      const metadata = localStorage.getItem(this.METADATA_KEY);
      return metadata ? JSON.parse(metadata) : {};
    } catch {
      return {};
    }
  }
  
  private static saveMetadata(metadata: Record<string, { timestamp: number; version: string }>): void {
    try {
      localStorage.setItem(this.METADATA_KEY, JSON.stringify(metadata));
    } catch (error) {
      console.warn('保存持久化缓存元数据失败:', error);
    }
  }
  
  private static updateMetadata(aggregationId: string): void {
    const metadata = this.getMetadata();
    metadata[aggregationId] = {
      timestamp: Date.now(),
      version: this.generateDataVersion(aggregationId)
    };
    this.saveMetadata(metadata);
  }
  
  private static generateDataVersion(aggregationId: string): string {
    return `persist_v_${Date.now()}_${aggregationId.substring(0, 8)}`;
  }
}

// 🚀 页面加载时自动清理过期的持久化缓存
if (typeof window !== 'undefined') {
  PersistentAggregationCache.cleanupExpiredCaches();
  console.log('🔧 持久化缓存系统已初始化');
}