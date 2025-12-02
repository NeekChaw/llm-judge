import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { SupabasePostgRESTAdapter } from './postgrest-adapter';

function getSupabaseConfig() {
  // 区分服务器端和浏览器端的 URL 配置
  const isServer = typeof window === 'undefined';

  // 服务器端优先使用 SUPABASE_URL（容器间通信地址）
  // 浏览器端优先使用 NEXT_PUBLIC_SUPABASE_URL（localhost 地址）
  const url = isServer
    ? (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
    : (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);

  const key = isServer
    ? (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL environment variable is required');
  }

  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY environment variable is required');
  }

  return { url, key };
}

/**
 * 检测是否为本地 PostgREST 模式
 */
function isLocalPostgRESTMode(url: string): boolean {
  // 检测 URL 中是否包含 PostgREST 相关标识
  return (
    url.includes('postgrest') ||
    url.includes('localhost:3001') ||
    url.includes('127.0.0.1:3001')
  );
}

// 延迟初始化
let _supabase: ReturnType<typeof createSupabaseClient> | SupabasePostgRESTAdapter | null = null;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(target, prop) {
    if (!_supabase) {
      const config = getSupabaseConfig();

      // 检测是否为本地 PostgREST 模式
      if (isLocalPostgRESTMode(config.url)) {
        console.log(`[Supabase] Using PostgREST adapter for local mode: ${config.url}`);
        _supabase = new SupabasePostgRESTAdapter(config.url, config.key) as any;
      } else {
        console.log(`[Supabase] Using cloud Supabase mode: ${config.url}`);
        _supabase = createSupabaseClient(config.url, config.key);
      }
    }
    return (_supabase as any)[prop];
  }
});

// 兼容原有的pool接口，用于现有代码
export const pool = {
  async query(text: string, params?: any[]) {
    // 这里需要将SQL查询转换为Supabase查询
    // 暂时保留此接口以支持现有代码
    console.warn('Using legacy pool.query interface. Consider migrating to Supabase client.');
    throw new Error('Please migrate to Supabase client API');
  }
};

// 新增：创建客户端函数，用于API路由
// ⚠️ DEPRECATED: 返回单例以避免连接数爆炸
// 之前每次调用都创建新连接，导致性能问题
export function createClient() {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Performance] createClient() is deprecated. Using singleton supabase instead. Consider importing { supabase } directly.');
  }
  return supabase; // 返回单例而不是新实例
}