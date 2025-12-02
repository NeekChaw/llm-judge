/**
 * 媒体文件管理 API
 * 提供媒体文件的列表查询功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// GET: 获取媒体文件列表
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);

    const entity_type = searchParams.get('entity_type');
    const entity_id = searchParams.get('entity_id');
    const file_type = searchParams.get('file_type');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('media_assets')
      .select(`
        *,
        media_relations (
          id,
          entity_type,
          entity_id,
          relation_type,
          metadata
        )
      `)
      .order('created_at', { ascending: false });

    if (file_type) {
      query = query.eq('file_type', file_type);
    }

    // 如果指定了实体，通过关联表过滤
    if (entity_type && entity_id) {
      query = query.eq('media_relations.entity_type', entity_type)
                   .eq('media_relations.entity_id', entity_id);
    }

    const { data: mediaAssets, error } = await query
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Media query error:', error);
      return NextResponse.json(
        { error: '获取媒体文件失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      media_assets: mediaAssets,
      pagination: {
        limit,
        offset,
        total: mediaAssets.length // 简化实现，实际应该获取总数
      }
    });

  } catch (error) {
    console.error('Media list error:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}