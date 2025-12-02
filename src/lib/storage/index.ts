/**
 * 存储系统统一导出
 */

// 导入所有存储提供商以注册到工厂
import './supabase-storage';
// import './cloudflare-r2'; // 暂时注释，等待完整实现

export {
  StorageProvider,
  StorageProviderFactory,
  StorageManager,
  type StorageConfig,
  type UploadOptions,
  type UploadResult,
  type StorageFile,
  type DeleteResult
} from './storage-provider';

export {
  SupabaseStorageProvider
} from './supabase-storage';

// export {
//   CloudflareR2Provider
// } from './cloudflare-r2';

export {
  getStorageConfig,
  validateStorageConfig,
  getStorageThresholds,
  getSupportedMimeTypes,
  getMimeTypeFromExtension,
  generateStoragePath,
  sanitizeFileName,
  isImageFile,
  isAudioFile,
  isVideoFile,
  STORAGE_PRESETS
} from './config';

// 创建全局存储管理器实例
import { StorageManager } from './storage-provider';
import { getStorageConfig, validateStorageConfig } from './config';
import { logger } from '@/lib/monitoring';

let globalStorageManager: StorageManager | null = null;

/**
 * 获取全局存储管理器实例
 */
export async function getStorageManager(): Promise<StorageManager> {
  if (!globalStorageManager) {
    globalStorageManager = StorageManager.getInstance();

    try {
      const config = getStorageConfig();

      // 验证配置
      if (!validateStorageConfig(config)) {
        throw new Error('Storage configuration validation failed');
      }

      await globalStorageManager.initialize(config);

      logger.info('全局存储管理器初始化成功', {
        provider: config.provider,
        bucket: config.bucket
      });

    } catch (error) {
      logger.error('全局存储管理器初始化失败', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  return globalStorageManager;
}

/**
 * 重置全局存储管理器（主要用于测试）
 */
export function resetStorageManager(): void {
  globalStorageManager = null;
}

/**
 * 检查存储系统健康状态
 */
export async function checkStorageHealth(): Promise<{
  status: 'healthy' | 'warning' | 'error';
  provider: string;
  usage?: {
    totalSize: number;
    fileCount: number;
    quota?: number;
    usagePercentage?: number;
  };
  message?: string;
}> {
  try {
    const manager = await getStorageManager();
    const provider = manager.getProvider();
    const config = manager.getConfig();

    // 验证连接
    const isValid = await provider.validateConfig();
    if (!isValid) {
      return {
        status: 'error',
        provider: config.provider,
        message: 'Storage provider configuration is invalid'
      };
    }

    // 获取使用情况
    const usage = await provider.getUsage();
    const usagePercentage = usage.quota ? (usage.totalSize / usage.quota) * 100 : 0;

    // 检查使用量阈值
    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    let message: string | undefined;

    if (usage.quota) {
      if (usagePercentage > 95) {
        status = 'error';
        message = `Storage usage is critical: ${usagePercentage.toFixed(1)}%`;
      } else if (usagePercentage > 80) {
        status = 'warning';
        message = `Storage usage is high: ${usagePercentage.toFixed(1)}%`;
      }
    }

    return {
      status,
      provider: config.provider,
      usage: {
        ...usage,
        usagePercentage
      },
      message
    };

  } catch (error) {
    logger.error('存储健康检查失败', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      status: 'error',
      provider: 'unknown',
      message: `Storage health check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * 便捷的上传函数
 */
export async function uploadFile(
  file: Buffer | Uint8Array,
  fileName: string,
  options?: {
    contentType?: string;
    isPublic?: boolean;
    generatePath?: boolean;
    prefix?: string;
  }
): Promise<UploadResult> {
  const manager = await getStorageManager();

  const {
    contentType,
    isPublic = true,
    generatePath = true,
    prefix = 'uploads'
  } = options || {};

  // 生成存储路径
  const { generateStoragePath } = await import('./config');
  const storagePath = generatePath
    ? generateStoragePath(fileName, { prefix })
    : fileName;

  // 推断 MIME 类型
  const finalContentType = contentType || getMimeTypeFromExtension(fileName);

  return manager.upload(file, storagePath, {
    fileName,
    contentType: finalContentType,
    isPublic
  });
}

/**
 * 便捷的删除函数
 */
export async function deleteFile(path: string): Promise<DeleteResult> {
  const manager = await getStorageManager();
  return manager.delete(path);
}

/**
 * 便捷的获取公共URL函数
 */
export async function getFilePublicUrl(path: string): Promise<string> {
  const manager = await getStorageManager();
  return manager.getPublicUrl(path);
}