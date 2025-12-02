/**
 * 存储提供商抽象接口
 * 支持多种存储服务：Supabase Storage, Cloudflare R2, AWS S3 等
 */

export interface StorageConfig {
  provider: 'supabase' | 'cloudflare' | 'aws' | 'local';
  bucket: string;
  region?: string;
  endpoint?: string;
  credentials?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    apiKey?: string;
  };
  options?: {
    publicUrl?: string;
    maxFileSize?: number;
    allowedMimeTypes?: string[];
    generateThumbnails?: boolean;
  };
}

export interface UploadOptions {
  fileName?: string;
  contentType?: string;
  metadata?: Record<string, any>;
  isPublic?: boolean;
  generateThumbnail?: boolean;
  overwrite?: boolean;
}

export interface UploadResult {
  success: boolean;
  fileName: string;
  storagePath: string;
  publicUrl: string;
  size: number;
  contentType: string;
  metadata?: Record<string, any>;
  thumbnailUrl?: string;
  error?: string;
}

export interface StorageFile {
  name: string;
  size: number;
  lastModified: Date;
  contentType: string;
  publicUrl: string;
  metadata?: Record<string, any>;
}

export interface DeleteResult {
  success: boolean;
  error?: string;
}

/**
 * 存储提供商抽象基类
 */
export abstract class StorageProvider {
  protected config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * 上传文件
   */
  abstract upload(
    file: Buffer | Uint8Array,
    path: string,
    options?: UploadOptions
  ): Promise<UploadResult>;

  /**
   * 下载文件
   */
  abstract download(path: string): Promise<Buffer | null>;

  /**
   * 删除文件
   */
  abstract delete(path: string): Promise<DeleteResult>;

  /**
   * 获取文件信息
   */
  abstract getFileInfo(path: string): Promise<StorageFile | null>;

  /**
   * 列出文件
   */
  abstract listFiles(prefix?: string, limit?: number): Promise<StorageFile[]>;

  /**
   * 获取公共URL
   */
  abstract getPublicUrl(path: string): string;

  /**
   * 生成预签名URL（用于直接上传）
   */
  abstract getPresignedUrl(
    path: string,
    expiresIn?: number,
    options?: Record<string, any>
  ): Promise<string>;

  /**
   * 检查文件是否存在
   */
  abstract exists(path: string): Promise<boolean>;

  /**
   * 获取存储使用情况
   */
  abstract getUsage(): Promise<{
    totalSize: number;
    fileCount: number;
    quota?: number;
  }>;

  /**
   * 创建存储桶（如果不存在）
   */
  abstract createBucket(): Promise<boolean>;

  /**
   * 验证配置
   */
  abstract validateConfig(): Promise<boolean>;
}

/**
 * 存储提供商工厂
 */
export class StorageProviderFactory {
  private static providers = new Map<string, typeof StorageProvider>();

  /**
   * 注册存储提供商
   */
  static register(name: string, providerClass: typeof StorageProvider) {
    this.providers.set(name, providerClass);
  }

  /**
   * 创建存储提供商实例
   */
  static create(config: StorageConfig): StorageProvider {
    const ProviderClass = this.providers.get(config.provider);

    if (!ProviderClass) {
      throw new Error(`Unsupported storage provider: ${config.provider}`);
    }

    return new ProviderClass(config);
  }

  /**
   * 获取所有支持的提供商
   */
  static getSupportedProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

/**
 * 存储管理器 - 单例模式
 */
export class StorageManager {
  private static instance: StorageManager | null = null;
  private provider: StorageProvider | null = null;
  private config: StorageConfig | null = null;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * 初始化存储提供商
   */
  async initialize(config: StorageConfig): Promise<void> {
    this.config = config;
    this.provider = StorageProviderFactory.create(config);

    // 验证配置
    const isValid = await this.provider.validateConfig();
    if (!isValid) {
      throw new Error(`Storage provider configuration is invalid: ${config.provider}`);
    }

    // 确保存储桶存在
    await this.provider.createBucket();
  }

  /**
   * 获取当前提供商
   */
  getProvider(): StorageProvider {
    if (!this.provider) {
      throw new Error('Storage provider not initialized. Call initialize() first.');
    }
    return this.provider;
  }

  /**
   * 获取当前配置
   */
  getConfig(): StorageConfig {
    if (!this.config) {
      throw new Error('Storage manager not initialized. Call initialize() first.');
    }
    return this.config;
  }

  /**
   * 热切换存储提供商
   */
  async switchProvider(newConfig: StorageConfig): Promise<void> {
    await this.initialize(newConfig);
  }

  /**
   * 上传文件的便捷方法
   */
  async upload(
    file: Buffer | Uint8Array,
    path: string,
    options?: UploadOptions
  ): Promise<UploadResult> {
    return this.getProvider().upload(file, path, options);
  }

  /**
   * 删除文件的便捷方法
   */
  async delete(path: string): Promise<DeleteResult> {
    return this.getProvider().delete(path);
  }

  /**
   * 获取公共URL的便捷方法
   */
  getPublicUrl(path: string): string {
    return this.getProvider().getPublicUrl(path);
  }
}