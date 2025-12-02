/**
 * 加密服务 - API密钥安全存储
 *
 * 使用 AES-256-GCM 算法加密/解密敏感数据
 *
 * 环境变量依赖：
 * - CONFIG_ENCRYPTION_KEY: 加密密钥（至少32个字符）
 *
 * 使用示例：
 * ```typescript
 * import { encrypt, decrypt } from '@/lib/encryption';
 *
 * const apiKey = 'sk-1234567890abcdef';
 * const encrypted = encrypt(apiKey);  // 'iv:authTag:encryptedData'
 * const decrypted = decrypt(encrypted);  // 'sk-1234567890abcdef'
 * ```
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT = 'ai-benchmark-v2-salt'; // 固定盐值

/**
 * 获取加密密钥（从环境变量或使用默认值）
 */
function getEncryptionKey(): Buffer {
  const keyString = process.env.CONFIG_ENCRYPTION_KEY || 'default_key_please_change_in_production_minimum_32_characters';

  if (!process.env.CONFIG_ENCRYPTION_KEY) {
    console.warn('⚠️  未设置 CONFIG_ENCRYPTION_KEY 环境变量，使用默认密钥（不安全）');
  }

  // 使用 scrypt 从密钥字符串生成固定长度的密钥
  return crypto.scryptSync(keyString, SALT, 32);
}

/**
 * 加密文本
 *
 * @param plaintext - 要加密的明文
 * @returns 加密后的字符串，格式：iv:authTag:encryptedData (hex编码)
 *
 * @example
 * const encrypted = encrypt('my-secret-key');
 * // => '1a2b3c4d...:5e6f7g8h...:9i0j1k2l...'
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('加密内容不能为空');
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // 格式: iv:authTag:encrypted (全部hex编码)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

  } catch (error) {
    throw new Error(`加密失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 解密文本
 *
 * @param encryptedData - 加密的数据（格式：iv:authTag:encryptedData）
 * @returns 解密后的明文
 *
 * @example
 * const decrypted = decrypt('1a2b3c4d...:5e6f7g8h...:9i0j1k2l...');
 * // => 'my-secret-key'
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error('解密内容不能为空');
  }

  try {
    const parts = encryptedData.split(':');

    if (parts.length !== 3) {
      throw new Error('加密数据格式无效（应为 iv:authTag:data）');
    }

    const [ivHex, authTagHex, encrypted] = parts;

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;

  } catch (error) {
    throw new Error(`解密失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 创建数据哈希（用于日志、审计等场景，不可逆）
 *
 * @param value - 要哈希的值
 * @returns SHA256哈希值（hex编码）
 *
 * @example
 * const hash = hashValue('sk-1234567890abcdef');
 * // => 'a3f5d8e9...' (64个字符)
 */
export function hashValue(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

/**
 * 脱敏显示（用于UI展示）
 *
 * @param value - 要脱敏的值
 * @param visibleStart - 开始保留的字符数（默认4）
 * @param visibleEnd - 结束保留的字符数（默认4）
 * @returns 脱敏后的字符串
 *
 * @example
 * maskValue('sk-1234567890abcdef');
 * // => 'sk-1****cdef'
 */
export function maskValue(value: string, visibleStart: number = 4, visibleEnd: number = 4): string {
  if (!value || value.length <= visibleStart + visibleEnd) {
    return '****';
  }

  const start = value.slice(0, visibleStart);
  const end = value.slice(-visibleEnd);
  const maskedLength = Math.min(value.length - visibleStart - visibleEnd, 16);
  const masked = '*'.repeat(maskedLength);

  return `${start}${masked}${end}`;
}

/**
 * 验证加密密钥强度
 *
 * @returns 验证结果
 */
export function validateEncryptionKey(): {
  valid: boolean;
  message: string;
  strength: 'weak' | 'medium' | 'strong';
} {
  const key = process.env.CONFIG_ENCRYPTION_KEY;

  if (!key) {
    return {
      valid: false,
      message: '未设置 CONFIG_ENCRYPTION_KEY 环境变量',
      strength: 'weak',
    };
  }

  if (key === 'default_key_please_change_in_production_minimum_32_characters') {
    return {
      valid: false,
      message: '仍在使用默认密钥，请立即更改',
      strength: 'weak',
    };
  }

  if (key.length < 32) {
    return {
      valid: false,
      message: '加密密钥长度不足32个字符',
      strength: 'weak',
    };
  }

  if (key.length >= 64) {
    return {
      valid: true,
      message: '加密密钥强度良好',
      strength: 'strong',
    };
  }

  return {
    valid: true,
    message: '加密密钥可用',
    strength: 'medium',
  };
}
