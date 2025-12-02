/**
 * 媒体文件上传测试 API
 * 跳过存储上传，仅测试数据库操作
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'video/mp4': 'video',
  'video/webm': 'video',
  'application/pdf': 'document'
};

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const formData = await request.formData();

    const file = formData.get('file') as File;
    const entity_type = formData.get('entity_type') as string;
    const entity_id = formData.get('entity_id') as string;
    const relation_type = formData.get('relation_type') as string || 'attachment';
    const description = formData.get('description') as string;

    if (!file) {
      return NextResponse.json(
        { error: '没有找到上传的文件' },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES]) {
      return NextResponse.json(
        { error: `不支持的文件类型: ${file.type}` },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    // 生成唯一文件名
    const fileExtension = file.name.split('.').pop();
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
    const storagePath = `media/${ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES]}/${uniqueFileName}`;

    // 跳过存储上传，使用模拟的公开URL
    const mockPublicUrl = `https://mock-storage.example.com/${storagePath}`;

    // 获取图像元数据（如果是图像）
    let metadata: any = {
      original_size: file.size,
      mime_type: file.type
    };

    if (file.type.startsWith('image/')) {
      metadata.type = 'image';
    }

    // 保存到数据库
    const { data: mediaAsset, error: dbError } = await supabase
      .from('media_assets')
      .insert({
        file_name: uniqueFileName,
        original_name: file.name,
        file_type: ALLOWED_TYPES[file.type as keyof typeof ALLOWED_TYPES],
        mime_type: file.type,
        file_size: file.size,
        storage_type: 'mock',
        storage_path: storagePath,
        public_url: mockPublicUrl,
        metadata,
        upload_status: 'completed',
        uploaded_by: 'test-user'
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      return NextResponse.json(
        { error: '保存文件信息失败', details: dbError.message },
        { status: 500 }
      );
    }

    // 如果提供了关联信息，创建关联关系
    if (entity_type && entity_id) {
      const { error: relationError } = await supabase
        .from('media_relations')
        .insert({
          media_id: mediaAsset.id,
          entity_type,
          entity_id,
          relation_type,
          metadata: description ? { description } : {}
        });

      if (relationError) {
        console.warn('Failed to create media relation:', relationError);
        // 不影响主流程，仅记录警告
      }
    }

    return NextResponse.json({
      success: true,
      media_asset: mediaAsset,
      message: '文件上传成功（测试模式）'
    });

  } catch (error) {
    console.error('Media upload error:', error);
    return NextResponse.json(
      { error: '服务器错误', details: (error as Error).message },
      { status: 500 }
    );
  }
}