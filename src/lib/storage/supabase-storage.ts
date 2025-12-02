/**
 * Supabase Storage 提供商实现
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  StorageProvider,
  StorageConfig,
  UploadOptions,
  UploadResult,
  StorageFile,
  DeleteResult,
  StorageProviderFactory
} from './storage-provider';
import { logger } from '@/lib/monitoring';

export class SupabaseStorageProvider extends StorageProvider {
  private client: SupabaseClient;
  private bucketName: string;

  constructor(config: StorageConfig) {
    super(config);

    // 检查环境变量，支持混合模式（数据库本地 + Storage 云端）
    // 优先使用 SUPABASE_STORAGE_* 环境变量（用于混合模式）
    const storageUrl = process.env.SUPABASE_STORAGE_URL ||
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.SUPABASE_URL;
    const storageKey = process.env.SUPABASE_STORAGE_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                       process.env.SUPABASE_ANON_KEY;

    if (!storageUrl || !storageKey) {
      throw new Error('Supabase URL and ANON KEY are required for Supabase storage');
    }

    // 检测本地 PostgREST 模式
    const isLocalMode = storageUrl.includes('postgrest') ||
                        storageUrl.includes('localhost:3001') ||
                        storageUrl.includes('127.0.0.1:3001');

    if (isLocalMode) {
      const errorMessage =
        '\n========================================\n' +
        '⚠️  本地 PostgREST 模式不支持文件存储\n' +
        '========================================\n\n' +
        'Supabase Storage 是独立服务，需要单独部署。\n\n' +
        '推荐解决方案：\n\n' +
        '1️⃣  混合模式（推荐）：\n' +
        '   - 数据库使用本地 PostgREST\n' +
        '   - Storage 使用云端 Supabase\n' +
        '   配置环境变量：\n' +
        '     SUPABASE_STORAGE_URL=https://your-project.supabase.co\n' +
        '     SUPABASE_STORAGE_KEY=your_anon_key\n\n' +
        '2️⃣  部署 MinIO（完全离线）：\n' +
        '   - 自托管 S3 兼容对象存储\n' +
        '   参考: docker-compose.full-local.yml\n' +
        '   文档: ADAPTER_IMPLEMENTATION_CHECKLIST.md\n\n' +
        '3️⃣  使用本地文件系统（开发测试）：\n' +
        '   配置: STORAGE_PROVIDER=local\n\n' +
        '详细文档: docs/storage-options.md\n' +
        '========================================\n';

      logger.error('Storage 初始化失败：本地模式不支持', {
        detectedUrl: storageUrl,
        isLocalMode
      });

      throw new Error(errorMessage);
    }

    // 云端模式或混合模式正常初始化
    this.client = createClient(storageUrl, storageKey);
    this.bucketName = config.bucket;

    const mode = process.env.SUPABASE_STORAGE_URL ? '混合模式（Storage 云端）' : '云端模式';
    logger.info(`Supabase Storage Provider 初始化成功 [${mode}]`, {
      bucket: this.bucketName,
      url: storageUrl.substring(0, 30) + '...'
    });
  }

  async upload(
    file: Buffer | Uint8Array,
    path: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    try {
      const {
        fileName = path,
        contentType = 'application/octet-stream',
        metadata = {},
        isPublic = true,
        overwrite = false
      } = options;

      // 确保路径格式正确
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;

      logger.info('Supabase Storage上传开始', {
        bucket: this.bucketName,
        path: cleanPath,
        size: file.length,
        contentType,
        isPublic
      });

      // 上传文件到 Supabase Storage
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .upload(cleanPath, file, {
          cacheControl: '3600',
          upsert: overwrite,
          contentType,
          metadata
        });

      if (error) {
        logger.error('Supabase Storage上传失败', {
          bucket: this.bucketName,
          path: cleanPath,
          error: error.message
        });

        return {
          success: false,
          fileName,
          storagePath: cleanPath,
          publicUrl: '',
          size: file.length,
          contentType,
          error: error.message
        };
      }

      // 获取公共URL
      const { data: urlData } = this.client.storage
        .from(this.bucketName)
        .getPublicUrl(cleanPath);

      const publicUrl = urlData?.publicUrl || '';

      logger.info('Supabase Storage上传成功', {
        bucket: this.bucketName,
        path: cleanPath,
        publicUrl,
        size: file.length
      });

      return {
        success: true,
        fileName,
        storagePath: cleanPath,
        publicUrl,
        size: file.length,
        contentType,
        metadata
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Supabase Storage上传异常', {
        bucket: this.bucketName,
        path,
        error: errorMessage
      });

      return {
        success: false,
        fileName: options.fileName || path,
        storagePath: path,
        publicUrl: '',
        size: file.length,
        contentType: options.contentType || 'application/octet-stream',
        error: errorMessage
      };
    }
  }

  async download(path: string): Promise<Buffer | null> {
    try {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;

      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .download(cleanPath);

      if (error || !data) {
        logger.error('Supabase Storage下载失败', {
          bucket: this.bucketName,
          path: cleanPath,
          error: error?.message
        });
        return null;
      }

      // 将 Blob 转换为 Buffer
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);

    } catch (error) {
      logger.error('Supabase Storage下载异常', {
        bucket: this.bucketName,
        path,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  async delete(path: string): Promise<DeleteResult> {
    try {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;

      const { error } = await this.client.storage
        .from(this.bucketName)
        .remove([cleanPath]);

      if (error) {
        logger.error('Supabase Storage删除失败', {
          bucket: this.bucketName,
          path: cleanPath,
          error: error.message
        });

        return {
          success: false,
          error: error.message
        };
      }

      logger.info('Supabase Storage删除成功', {
        bucket: this.bucketName,
        path: cleanPath
      });

      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Supabase Storage删除异常', {
        bucket: this.bucketName,
        path,
        error: errorMessage
      });

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async getFileInfo(path: string): Promise<StorageFile | null> {
    try {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;

      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .list(cleanPath.split('/').slice(0, -1).join('/') || '', {
          search: cleanPath.split('/').pop()
        });

      if (error || !data || data.length === 0) {
        return null;
      }

      const fileInfo = data[0];
      const publicUrl = this.getPublicUrl(cleanPath);

      return {
        name: fileInfo.name,
        size: fileInfo.metadata?.size || 0,
        lastModified: new Date(fileInfo.updated_at || fileInfo.created_at),
        contentType: fileInfo.metadata?.mimetype || 'application/octet-stream',
        publicUrl,
        metadata: fileInfo.metadata
      };

    } catch (error) {
      logger.error('Supabase Storage获取文件信息失败', {
        bucket: this.bucketName,
        path,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  async listFiles(prefix = '', limit = 100): Promise<StorageFile[]> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .list(prefix, {
          limit,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (error || !data) {
        logger.error('Supabase Storage列出文件失败', {
          bucket: this.bucketName,
          prefix,
          error: error?.message
        });
        return [];
      }

      return data.map(fileInfo => ({
        name: fileInfo.name,
        size: fileInfo.metadata?.size || 0,
        lastModified: new Date(fileInfo.updated_at || fileInfo.created_at),
        contentType: fileInfo.metadata?.mimetype || 'application/octet-stream',
        publicUrl: this.getPublicUrl(`${prefix}/${fileInfo.name}`),
        metadata: fileInfo.metadata
      }));

    } catch (error) {
      logger.error('Supabase Storage列出文件异常', {
        bucket: this.bucketName,
        prefix,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  getPublicUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    const { data } = this.client.storage
      .from(this.bucketName)
      .getPublicUrl(cleanPath);

    return data?.publicUrl || '';
  }

  async getPresignedUrl(
    path: string,
    expiresIn = 3600,
    options: Record<string, any> = {}
  ): Promise<string> {
    try {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;

      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .createSignedUrl(cleanPath, expiresIn, options);

      if (error || !data) {
        throw new Error(error?.message || 'Failed to create signed URL');
      }

      return data.signedUrl;

    } catch (error) {
      logger.error('Supabase Storage生成预签名URL失败', {
        bucket: this.bucketName,
        path,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    const fileInfo = await this.getFileInfo(path);
    return fileInfo !== null;
  }

  async getUsage(): Promise<{ totalSize: number; fileCount: number; quota?: number }> {
    try {
      // Supabase 免费版有 1GB 存储空间限制
      const files = await this.listFiles('', 1000);

      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const fileCount = files.length;
      const quota = 1024 * 1024 * 1024; // 1GB

      return {
        totalSize,
        fileCount,
        quota
      };

    } catch (error) {
      logger.error('Supabase Storage获取使用情况失败', {
        bucket: this.bucketName,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        totalSize: 0,
        fileCount: 0,
        quota: 1024 * 1024 * 1024
      };
    }
  }

  async createBucket(): Promise<boolean> {
    try {
      // 检查存储桶是否已存在
      const { data: buckets, error: listError } = await this.client.storage.listBuckets();

      if (listError) {
        logger.error('Supabase Storage列出存储桶失败', {
          error: listError.message
        });
        return false;
      }

      const bucketExists = buckets?.some(bucket => bucket.name === this.bucketName);

      if (bucketExists) {
        logger.info('Supabase Storage存储桶已存在', {
          bucket: this.bucketName
        });
        return true;
      }

      // 创建新存储桶
      const { error: createError } = await this.client.storage.createBucket(this.bucketName, {
        public: true,
        allowedMimeTypes: this.config.options?.allowedMimeTypes || [
          'image/*',
          'audio/*',
          'video/*',
          'application/pdf',
          'text/*'
        ],
        fileSizeLimit: this.config.options?.maxFileSize || 50 * 1024 * 1024 // 50MB
      });

      if (createError) {
        logger.error('Supabase Storage创建存储桶失败', {
          bucket: this.bucketName,
          error: createError.message
        });
        return false;
      }

      logger.info('Supabase Storage创建存储桶成功', {
        bucket: this.bucketName
      });

      return true;

    } catch (error) {
      logger.error('Supabase Storage创建存储桶异常', {
        bucket: this.bucketName,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      // 测试连接
      const { data, error } = await this.client.storage.listBuckets();

      if (error) {
        logger.error('Supabase Storage配置验证失败', {
          error: error.message
        });
        return false;
      }

      logger.info('Supabase Storage配置验证成功', {
        bucketCount: data?.length || 0
      });

      return true;

    } catch (error) {
      logger.error('Supabase Storage配置验证异常', {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
}

// 注册 Supabase Storage 提供商
StorageProviderFactory.register('supabase', SupabaseStorageProvider);