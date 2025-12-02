/**
 * 存储配置管理器
 * 支持环境变量和动态配置切换
 */

import { StorageConfig } from './storage-provider';
import { logger } from '@/lib/monitoring';

/**
 * 存储配置预设
 */
export const STORAGE_PRESETS = {
  supabase: {
    provider: 'supabase' as const,
    bucket: 'media-assets',
    options: {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'video/mp4',
        'video/webm',
        'video/ogg',
        'application/pdf',
        'text/plain',
        'text/csv'
      ],
      generateThumbnails: true
    }
  },

  cloudflare: {
    provider: 'cloudflare' as const,
    bucket: process.env.CLOUDFLARE_R2_BUCKET || 'media-assets',
    region: 'auto',
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    },
    options: {
      publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedMimeTypes: [
        'image/*',
        'audio/*',
        'video/*',
        'application/pdf',
        'text/*'
      ],
      generateThumbnails: true
    }
  }
};

/**
 * 获取当前存储配置
 */
export function getStorageConfig(): StorageConfig {
  const provider = (process.env.STORAGE_PROVIDER || 'supabase') as 'supabase' | 'cloudflare';

  switch (provider) {
    case 'supabase':
      return getSupabaseConfig();

    case 'cloudflare':
      return getCloudflareConfig();

    default:
      logger.warn('未知的存储提供商，回退到 Supabase', { provider });
      return getSupabaseConfig();
  }
}

/**
 * 获取 Supabase 存储配置
 */
function getSupabaseConfig(): StorageConfig {
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'media-assets';

  return {
    ...STORAGE_PRESETS.supabase,
    bucket: bucketName
  };
}

/**
 * 获取 Cloudflare R2 存储配置
 */
function getCloudflareConfig(): StorageConfig {
  const config = STORAGE_PRESETS.cloudflare;

  // 验证必需的环境变量
  if (!config.endpoint) {
    throw new Error('CLOUDFLARE_R2_ENDPOINT environment variable is required for Cloudflare R2');
  }

  if (!config.credentials?.accessKeyId || !config.credentials?.secretAccessKey) {
    throw new Error('CLOUDFLARE_R2_ACCESS_KEY_ID and CLOUDFLARE_R2_SECRET_ACCESS_KEY are required for Cloudflare R2');
  }

  return config as StorageConfig;
}

/**
 * 验证存储配置
 */
export function validateStorageConfig(config: StorageConfig): boolean {
  try {
    if (!config.provider) {
      logger.error('存储配置验证失败：缺少 provider');
      return false;
    }

    if (!config.bucket) {
      logger.error('存储配置验证失败：缺少 bucket');
      return false;
    }

    switch (config.provider) {
      case 'supabase':
        return validateSupabaseConfig();

      case 'cloudflare':
        return validateCloudflareConfig(config);

      default:
        logger.error('存储配置验证失败：不支持的提供商', { provider: config.provider });
        return false;
    }

  } catch (error) {
    logger.error('存储配置验证异常', {
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * 验证 Supabase 配置
 */
function validateSupabaseConfig(): boolean {
  // 检查 NEXT_PUBLIC_ 前缀的环境变量
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    logger.error('Supabase 配置验证失败：缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_URL');
    return false;
  }

  if (!supabaseAnonKey) {
    logger.error('Supabase 配置验证失败：缺少 NEXT_PUBLIC_SUPABASE_ANON_KEY 或 SUPABASE_ANON_KEY');
    return false;
  }

  logger.info('Supabase 配置验证通过', {
    url: supabaseUrl.substring(0, 20) + '...',
    hasAnonKey: !!supabaseAnonKey
  });

  return true;
}

/**
 * 验证 Cloudflare R2 配置
 */
function validateCloudflareConfig(config: StorageConfig): boolean {
  if (!config.endpoint) {
    logger.error('Cloudflare R2 配置验证失败：缺少 endpoint');
    return false;
  }

  if (!config.credentials?.accessKeyId || !config.credentials?.secretAccessKey) {
    logger.error('Cloudflare R2 配置验证失败：缺少访问凭据');
    return false;
  }

  return true;
}

/**
 * 获取存储使用情况阈值配置
 */
export function getStorageThresholds() {
  return {
    // 存储空间警告阈值（80%）
    storageWarningThreshold: 0.8,
    // 存储空间错误阈值（95%）
    storageErrorThreshold: 0.95,
    // 单文件大小限制
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50MB
    // 最大文件数量限制
    maxFileCount: parseInt(process.env.MAX_FILE_COUNT || '10000')
  };
}

/**
 * 获取支持的 MIME 类型
 */
export function getSupportedMimeTypes(): string[] {
  const customTypes = process.env.ALLOWED_MIME_TYPES?.split(',') || [];

  const defaultTypes = [
    // 图像
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // 音频
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/m4a',
    // 视频
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    // 文档
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json'
  ];

  return customTypes.length > 0 ? customTypes : defaultTypes;
}

/**
 * 根据文件扩展名获取 MIME 类型
 */
export function getMimeTypeFromExtension(fileName: string): string {
  const extension = fileName.toLowerCase().split('.').pop();

  const mimeMap: Record<string, string> = {
    // 图像
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    // 音频
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/m4a',
    // 视频
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogv: 'video/ogg',
    mov: 'video/quicktime',
    // 文档
    pdf: 'application/pdf',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json'
  };

  return mimeMap[extension || ''] || 'application/octet-stream';
}

/**
 * 生成存储路径
 */
export function generateStoragePath(
  fileName: string,
  options: {
    prefix?: string;
    includeDate?: boolean;
    includeHash?: boolean;
  } = {}
): string {
  const {
    prefix = 'uploads',
    includeDate = true,
    includeHash = true
  } = options;

  const parts: string[] = [prefix];

  // 添加日期路径
  if (includeDate) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    parts.push(year.toString(), month, day);
  }

  // 生成唯一文件名
  let finalFileName = fileName;
  if (includeHash) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = fileName.split('.').pop();
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    finalFileName = `${baseName}_${timestamp}_${random}.${extension}`;
  }

  parts.push(finalFileName);

  return parts.join('/');
}

/**
 * 清理文件名（移除不安全字符）
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * 检查文件是否为图像类型
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * 检查文件是否为音频类型
 */
export function isAudioFile(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

/**
 * 检查文件是否为视频类型
 */
export function isVideoFile(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}