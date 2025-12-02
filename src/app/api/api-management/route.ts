/**
 * Unified API Management Endpoint
 *
 * 统一管理 API 提供商配置和 API 密钥
 *
 * GET /api/api-management - 获取所有提供商配置和状态
 * POST /api/api-management - 创建/更新提供商配置和/或API密钥
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { encrypt, hashValue, maskValue } from '@/lib/encryption';
import {
  DEFAULT_PROVIDER_CONFIGS,
  getProviderConfig,
  type ProviderConfig
} from '@/lib/api-providers-config';

/**
 * GET /api/api-management
 *
 * 返回所有提供商的完整信息：
 * - 默认配置 (从 DEFAULT_PROVIDER_CONFIGS)
 * - 数据库中的自定义配置 (从 api_providers 表)
 * - API 密钥状态 (从 api_keys 表，脱敏)
 * - 环境变量配置状态
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    // 1. 获取数据库中所有提供商配置
    const { data: dbProviders, error: providersError } = await supabase
      .from('api_providers')
      .select('*')
      .order('created_at', { ascending: false });

    if (providersError) {
      console.error('获取提供商列表失败:', providersError);
      return NextResponse.json(
        { success: false, error: '获取提供商列表失败' },
        { status: 500 }
      );
    }

    // 2. 获取所有 API 密钥（脱敏）
    const { data: apiKeys, error: keysError } = await supabase
      .from('api_keys')
      .select(`
        id,
        provider_id,
        key_name,
        status,
        quota_limit,
        usage_count,
        last_used_at,
        expires_at,
        created_at
      `)
      .eq('status', 'active');

    if (keysError) {
      console.error('获取API密钥列表失败:', keysError);
      // 不阻塞，继续返回提供商信息
    }

    // 3. 合并默认配置和数据库配置
    const providersMap = new Map();

    // 首先添加所有默认提供商
    DEFAULT_PROVIDER_CONFIGS.forEach(defaultConfig => {
      const dbConfig = (dbProviders || []).find(p => p.name === defaultConfig.name);
      const providerKeys = (apiKeys || []).filter(k => k.provider_id === dbConfig?.id);

      // 检查环境变量是否配置
      const envConfigured = !!(
        process.env[defaultConfig.env_key_name] &&
        process.env[defaultConfig.env_key_name]!.trim().length > 0
      );

      providersMap.set(defaultConfig.name, {
        // 默认配置
        ...defaultConfig,

        // 数据库配置（覆盖默认值）
        id: dbConfig?.id,
        custom_base_url: dbConfig?.base_url !== defaultConfig.base_url ? dbConfig?.base_url : undefined,
        is_active: dbConfig?.is_active ?? true,
        config: dbConfig?.config,

        // 密钥信息
        has_api_key: providerKeys.length > 0,
        api_keys_count: providerKeys.length,
        active_keys: providerKeys.map(k => ({
          id: k.id,
          key_name: k.key_name,
          status: k.status,
          usage_percentage: k.quota_limit
            ? Math.round((k.usage_count / k.quota_limit) * 100)
            : null,
          last_used_at: k.last_used_at,
          expires_at: k.expires_at
        })),

        // 配置状态
        configured_in_env: envConfigured,
        configured_in_db: !!dbConfig,
        configuration_status: envConfigured
          ? 'env'
          : (providerKeys.length > 0 ? 'database' : 'not_configured')
      });
    });

    // 添加数据库中的自定义提供商（不在默认列表中）
    (dbProviders || []).forEach(dbProvider => {
      if (!providersMap.has(dbProvider.name)) {
        const providerKeys = (apiKeys || []).filter(k => k.provider_id === dbProvider.id);

        providersMap.set(dbProvider.name, {
          name: dbProvider.name,
          display_name: dbProvider.display_name || dbProvider.name,
          base_url: dbProvider.base_url,
          auth_type: dbProvider.auth_type,
          is_active: dbProvider.is_active,
          config: dbProvider.config,
          id: dbProvider.id,

          has_api_key: providerKeys.length > 0,
          api_keys_count: providerKeys.length,
          active_keys: providerKeys.map(k => ({
            id: k.id,
            key_name: k.key_name,
            status: k.status,
            usage_percentage: k.quota_limit
              ? Math.round((k.usage_count / k.quota_limit) * 100)
              : null,
            last_used_at: k.last_used_at,
            expires_at: k.expires_at
          })),

          configured_in_env: false,
          configured_in_db: true,
          configuration_status: providerKeys.length > 0 ? 'database' : 'not_configured',
          is_custom: true // 标记为自定义提供商
        });
      }
    });

    // 转换为数组并排序
    const providers = Array.from(providersMap.values()).sort((a, b) => {
      // 优先显示已配置的
      if (a.configuration_status !== 'not_configured' && b.configuration_status === 'not_configured') return -1;
      if (a.configuration_status === 'not_configured' && b.configuration_status !== 'not_configured') return 1;

      // 其次按国内/国际分组
      if (a.is_chinese && !b.is_chinese) return 1;
      if (!a.is_chinese && b.is_chinese) return -1;

      // 最后按名称排序
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      success: true,
      data: providers,
      total: providers.length,
      summary: {
        total: providers.length,
        configured: providers.filter(p => p.configuration_status !== 'not_configured').length,
        env_configured: providers.filter(p => p.configured_in_env).length,
        db_configured: providers.filter(p => p.has_api_key).length
      }
    });

  } catch (error) {
    console.error('API管理列表请求失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/api-management
 *
 * 统一创建/更新提供商配置和API密钥
 *
 * 请求体：
 * {
 *   provider_name: string,          // 必填：提供商名称 (如 'openai', 'anthropic')
 *   use_default_config?: boolean,   // 使用默认配置 (默认 true)
 *
 *   // 可选：自定义提供商配置
 *   provider_config?: {
 *     base_url?: string,
 *     auth_type?: 'bearer' | 'custom',
 *     display_name?: string,
 *     config?: any
 *   },
 *
 *   // 可选：API密钥配置
 *   api_key?: {
 *     key_name?: string,            // 默认使用 provider_name
 *     key_value: string,            // 必填（如果提供api_key）
 *     quota_limit?: number,
 *     expires_at?: string,
 *     notes?: string
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证必填字段
    if (!body.provider_name) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段: provider_name' },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const providerName = body.provider_name;
    const useDefaultConfig = body.use_default_config !== false; // 默认 true

    let providerId: string | null = null;
    let providerData: any = null;
    let apiKeyData: any = null;

    // ========================================
    // 步骤 1: 处理提供商配置
    // ========================================

    // 获取默认配置
    const defaultConfig = getProviderConfig(providerName);

    // 检查提供商是否已存在
    const { data: existingProvider } = await supabase
      .from('api_providers')
      .select('*')
      .eq('name', providerName)
      .single();

    if (existingProvider) {
      // 更新现有提供商
      providerId = existingProvider.id;

      if (body.provider_config) {
        const updateData: any = {};

        if (body.provider_config.base_url) {
          updateData.base_url = body.provider_config.base_url;
        }
        if (body.provider_config.auth_type) {
          updateData.auth_type = body.provider_config.auth_type;
        }
        if (body.provider_config.display_name) {
          updateData.display_name = body.provider_config.display_name;
        }
        if (body.provider_config.config) {
          updateData.config = body.provider_config.config;
        }

        if (Object.keys(updateData).length > 0) {
          const { data, error } = await supabase
            .from('api_providers')
            .update(updateData)
            .eq('id', providerId)
            .select()
            .single();

          if (error) {
            console.error('更新提供商配置失败:', error);
            return NextResponse.json(
              { success: false, error: '更新提供商配置失败: ' + error.message },
              { status: 500 }
            );
          }

          providerData = data;
        } else {
          providerData = existingProvider;
        }
      } else {
        providerData = existingProvider;
      }
    } else {
      // 创建新提供商
      const insertData: any = {
        name: providerName,
        display_name: body.provider_config?.display_name ||
                      defaultConfig?.display_name ||
                      providerName,
        base_url: body.provider_config?.base_url ||
                  defaultConfig?.base_url ||
                  '',
        auth_type: body.provider_config?.auth_type ||
                   defaultConfig?.auth_type ||
                   'bearer',
        is_active: true,
        config: body.provider_config?.config || {}
      };

      const { data, error } = await supabase
        .from('api_providers')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('创建提供商配置失败:', error);
        return NextResponse.json(
          { success: false, error: '创建提供商配置失败: ' + error.message },
          { status: 500 }
        );
      }

      providerId = data.id;
      providerData = data;
    }

    // ========================================
    // 步骤 2: 处理 API 密钥（如果提供）
    // ========================================

    if (body.api_key && body.api_key.key_value) {
      const apiKeyInput = body.api_key;

      // 验证密钥长度
      if (apiKeyInput.key_value.length < 8) {
        return NextResponse.json(
          { success: false, error: 'API密钥长度至少8个字符' },
          { status: 400 }
        );
      }

      // 加密密钥
      let encryptedValue: string;
      let keyHash: string;
      try {
        encryptedValue = encrypt(apiKeyInput.key_value);
        keyHash = hashValue(apiKeyInput.key_value);
      } catch (error) {
        console.error('密钥加密失败:', error);
        return NextResponse.json(
          { success: false, error: '密钥加密失败' },
          { status: 500 }
        );
      }

      // 检查是否已存在相同密钥
      const { data: existingKey } = await supabase
        .from('api_keys')
        .select('id, key_name')
        .eq('key_hash', keyHash)
        .single();

      if (existingKey) {
        return NextResponse.json(
          {
            success: false,
            error: `此API密钥已存在（名称: ${existingKey.key_name}）`
          },
          { status: 409 }
        );
      }

      // 插入 API 密钥
      const { data: keyData, error: keyError } = await supabase
        .from('api_keys')
        .insert({
          provider_id: providerId,
          key_name: apiKeyInput.key_name || `${providerName}_key`,
          key_value_encrypted: encryptedValue,
          key_hash: keyHash,
          quota_limit: apiKeyInput.quota_limit || null,
          expires_at: apiKeyInput.expires_at || null,
          notes: apiKeyInput.notes || null,
          status: 'active'
        })
        .select()
        .single();

      if (keyError) {
        console.error('创建API密钥失败:', keyError);
        return NextResponse.json(
          { success: false, error: '创建API密钥失败: ' + keyError.message },
          { status: 500 }
        );
      }

      apiKeyData = {
        id: keyData.id,
        key_name: keyData.key_name,
        key_value_masked: maskValue(apiKeyInput.key_value),
        plaintext_key: apiKeyInput.key_value, // ⚠️ 仅在创建时返回一次
        status: keyData.status,
        quota_limit: keyData.quota_limit,
        expires_at: keyData.expires_at,
        created_at: keyData.created_at
      };
    }

    // ========================================
    // 步骤 3: 返回结果
    // ========================================

    return NextResponse.json({
      success: true,
      data: {
        provider: providerData,
        api_key: apiKeyData
      },
      message: apiKeyData
        ? '提供商配置和API密钥创建成功。请妥善保管密钥，此密钥明文不会再次显示。'
        : '提供商配置创建/更新成功'
    }, { status: apiKeyData ? 201 : 200 });

  } catch (error) {
    console.error('API管理操作失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
