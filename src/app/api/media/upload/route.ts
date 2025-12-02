/**
 * 媒体文件上传 API - 使用存储抽象层
 * 支持图像、音频等多媒体文件的上传和管理
 * 支持多种存储后端：Supabase Storage, Cloudflare R2 等
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import {
  uploadFile,
  getSupportedMimeTypes,
  sanitizeFileName,
  getStorageThresholds,
  checkStorageHealth
} from '@/lib/storage';
import { logger } from '@/lib/monitoring';
import type { MediaAsset } from '@/types/multimodal';

// 从存储配置获取文件大小限制
const { maxFileSize } = getStorageThresholds();

// 文件类型映射
const TYPE_MAPPING: Record<string, string> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'audio/mp3': 'audio',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/ogg': 'video',
  'application/pdf': 'document',
  'text/plain': 'document'
};

export async function POST(request: NextRequest) {
  try {
    // 首先检查存储系统健康状态
    const storageHealth = await checkStorageHealth();
    if (storageHealth.status === 'error') {
      logger.error('Storage system unavailable', { health: storageHealth });
      return NextResponse.json(
        { error: '存储系统不可用', details: storageHealth.message },
        { status: 503 }
      );
    }

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

    logger.info('Media upload started', {
      fileName: file.name,
      size: file.size,
      type: file.type,
      entityType: entity_type,
      entityId: entity_id
    });

    // 验证文件类型
    const allowedTypes = getSupportedMimeTypes();
    const isTypeAllowed = allowedTypes.includes(file.type) ||
                         allowedTypes.some(allowed =>
                           allowed.endsWith('/*') &&
                           file.type.startsWith(allowed.slice(0, -1))
                         );

    if (!isTypeAllowed) {
      return NextResponse.json(
        { error: `不支持的文件类型: ${file.type}` },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > maxFileSize) {
      return NextResponse.json(
        { error: `文件大小超过限制 (${maxFileSize / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    // 清理文件名
    const sanitizedFileName = sanitizeFileName(file.name);

    // 转换文件为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 使用存储抽象层上传文件
    const uploadResult = await uploadFile(buffer, sanitizedFileName, {
      contentType: file.type,
      isPublic: true,
      generatePath: true,
      prefix: `media/${TYPE_MAPPING[file.type] || 'other'}`
    });

    if (!uploadResult.success) {
      logger.error('Storage upload failed', {
        fileName: sanitizedFileName,
        error: uploadResult.error
      });

      return NextResponse.json(
        { error: '文件上传失败', details: uploadResult.error },
        { status: 500 }
      );
    }

    logger.info('Storage upload successful', {
      fileName: uploadResult.fileName,
      storagePath: uploadResult.storagePath,
      publicUrl: uploadResult.publicUrl,
      size: uploadResult.size
    });

    // 获取图像元数据（如果是图像）
    let metadata: any = {
      original_size: file.size,
      mime_type: file.type,
      upload_timestamp: new Date().toISOString(),
      storage_provider: storageHealth.provider,
      description: description || undefined
    };

    if (file.type.startsWith('image/')) {
      try {
        // 这里可以添加图像处理逻辑，如获取尺寸
        // 由于服务端环境限制，建议在客户端获取并传递
        metadata.type = 'image';
      } catch (err) {
        logger.warn('Failed to get image metadata', { error: err });
      }
    }

    // 保存到数据库
    const { data: mediaAsset, error: dbError } = await supabase
      .from('media_assets')
      .insert({
        file_name: uploadResult.fileName,
        original_name: file.name,
        file_type: TYPE_MAPPING[file.type] || 'other',
        mime_type: file.type,
        file_size: file.size,
        storage_type: storageHealth.provider,
        storage_path: uploadResult.storagePath,
        public_url: uploadResult.publicUrl,
        metadata,
        upload_status: 'completed',
        uploaded_by: 'system' // 可以集成用户认证
      })
      .select()
      .single();

    if (dbError) {
      logger.error('Database insert error', {
        error: dbError,
        storagePath: uploadResult.storagePath
      });

      // 清理上传的文件
      try {
        const { deleteFile } = await import('@/lib/storage');
        await deleteFile(uploadResult.storagePath);
        logger.info('Cleaned up uploaded file after database error', {
          storagePath: uploadResult.storagePath
        });
      } catch (cleanupError) {
        logger.warn('Failed to cleanup uploaded file after database error', {
          storagePath: uploadResult.storagePath,
          cleanupError
        });
      }

      return NextResponse.json(
        { error: '保存文件信息失败' },
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
        logger.warn('Failed to create media relation', {
          mediaId: mediaAsset.id,
          entityType: entity_type,
          entityId: entity_id,
          error: relationError
        });
        // 不影响主流程，仅记录警告
      }
    }

    logger.info('Media upload completed successfully', {
      mediaId: mediaAsset.id,
      fileName: uploadResult.fileName,
      publicUrl: uploadResult.publicUrl,
      storageProvider: storageHealth.provider,
      fileSize: file.size
    });

    return NextResponse.json({
      success: true,
      media_asset: mediaAsset,
      storage_info: {
        provider: storageHealth.provider,
        bucket: 'media-assets',
        storage_path: uploadResult.storagePath,
        public_url: uploadResult.publicUrl,
        upload_size: uploadResult.size
      },
      storage_health: {
        status: storageHealth.status,
        usage: storageHealth.usage
      },
      message: '文件上传成功'
    });

  } catch (error) {
    logger.error('Media upload error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        error: '服务器错误',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}

