import Redis from 'ioredis';
import { RedisConnection, MockRedis } from '@/types/redis';

// 开发模式检测
const isDevelopment = process.env.NODE_ENV !== 'production';
const useRedis = !isDevelopment || process.env.FORCE_REDIS === 'true';

// Redis连接配置
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: null, // BullMQ要求设为null
  lazyConnect: true,
  keepAlive: 30000,
  // 连接池配置
  family: 4,
  connectTimeout: 10000,
  commandTimeout: 5000,
};

// 创建Redis实例
let redis: RedisConnection | null = null;

export function getRedisConnection(): RedisConnection {
  if (!redis) {
    if (useRedis) {
      // 生产环境或强制使用Redis
      redis = new Redis(redisConfig);
      
      // 事件监听
      redis.on('connect', () => {
        console.log('✅ Redis connected successfully');
      });

      redis.on('error', (error) => {
        console.error('❌ Redis connection error:', error);
      });

      redis.on('close', () => {
        console.log('🔴 Redis connection closed');
      });

      redis.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
      });
    } else {
      // 开发环境使用Mock Redis
      redis = new MockRedis();
      console.log('🧪 Using Mock Redis for development');
      redis.on('connect', () => {
        console.log('✅ Mock Redis initialized');
      });
    }
  }

  return redis;
}

// 健康检查
export async function checkRedisHealth(): Promise<{ connected: boolean; error?: string; mode?: string }> {
  try {
    const redis = getRedisConnection();
    await redis.ping();
    return { 
      connected: true, 
      mode: useRedis ? 'real' : 'mock' 
    };
  } catch (error) {
    return { 
      connected: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      mode: useRedis ? 'real' : 'mock'
    };
  }
}

// 优雅关闭
export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    console.log(`✅ ${useRedis ? 'Redis' : 'Mock Redis'} connection closed gracefully`);
  }
}

// 导出单例Redis实例
export { getRedisConnection as redis };