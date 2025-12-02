/**
 * @deprecated Use @/lib/supabase instead
 * This file is kept for backward compatibility but should be migrated to use the new supabase.ts module
 * which supports both cloud Supabase and local PostgREST modes
 */

// Re-export from the new supabase module to maintain backward compatibility
export { supabase } from './supabase';

// For admin operations, use the same supabase client
// (In local mode, there's no distinction; in cloud mode, use RLS policies)
export { supabase as supabaseAdmin } from './supabase';

// 兼容原有的pool接口，用于现有代码
export const pool = {
  async query(text: string, params?: any[]) {
    // 这里需要将SQL查询转换为Supabase查询
    // 暂时保留此接口以支持现有代码
    console.warn('Using legacy pool.query interface. Consider migrating to Supabase client.');
    throw new Error('Please migrate to Supabase client API');
  }
};