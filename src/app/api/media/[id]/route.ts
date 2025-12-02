/**
 * 媒体文件删除 API
 * 支持删除指定 ID 的媒体文件
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// DELETE: 删除指定媒体文件
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const mediaId = params.id;

    if (!mediaId) {
      return NextResponse.json(
        { error: '缺少媒体文件 ID' },
        { status: 400 }
      );
    }

    // 首先获取媒体文件信息
    const { data: mediaAsset, error: fetchError } = await supabase
      .from('media_assets')
      .select('*')
      .eq('id', mediaId)
      .single();

    if (fetchError || !mediaAsset) {
      return NextResponse.json(
        { error: '媒体文件不存在' },
        { status: 404 }
      );
    }

    // 删除存储中的文件
    if (mediaAsset.storage_path) {
      const { error: storageError } = await supabase.storage
        .from('media-assets')
        .remove([mediaAsset.storage_path]);

      if (storageError) {
        console.warn('Failed to delete file from storage:', storageError);
        // 继续执行，不阻断删除流程
      }
    }

    // 删除关联关系
    const { error: relationError } = await supabase
      .from('media_relations')
      .delete()
      .eq('media_id', mediaId);

    if (relationError) {
      console.warn('Failed to delete media relations:', relationError);
      // 继续执行，不阻断删除流程
    }

    // 删除媒体记录
    const { error: deleteError } = await supabase
      .from('media_assets')
      .delete()
      .eq('id', mediaId);

    if (deleteError) {
      console.error('Failed to delete media asset:', deleteError);
      return NextResponse.json(
        { error: '删除媒体文件失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '媒体文件删除成功'
    });

  } catch (error) {
    console.error('Media delete error:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}