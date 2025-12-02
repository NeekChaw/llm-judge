/**
 * API Keys Management - List & Create
 *
 * GET /api/api-keys - 获取API密钥列表（脱敏显示）
 * POST /api/api-keys - 创建新的API密钥
 */

import { createClient } from '@/lib/supabase';
import { encrypt, hashValue, maskValue } from '@/lib/encryption';
import { NextRequest, NextResponse } from 'next/server';
import type { CreateAPIKeyInput, MaskedAPIKey } from '@/types/api-key';

/**
 * GET /api/api-keys
 * 获取API密钥列表（脱敏显示）
 *
 * 查询参数：
 * - status: 'active' | 'disabled' - 按状态筛选
 * - provider_id: string - 按提供商筛选
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const provider_id = searchParams.get('provider_id');

    // 构建查询
    let query = supabase
      .from('api_keys')
      .select(`
        *,
        provider:api_providers(id, name, display_name)
      `)
      .order('created_at', { ascending: false });

    // 应用筛选
    if (status) {
      query = query.eq('status', status);
    }
    if (provider_id) {
      query = query.eq('provider_id', provider_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('获取API密钥列表失败:', error);
      return NextResponse.json(
        { success: false, error: '获取API密钥列表失败' },
        { status: 500 }
      );
    }

    // 脱敏处理
    const maskedKeys: MaskedAPIKey[] = (data || []).map((key) => {
      const usage_percentage = key.quota_limit
        ? Math.round((key.usage_count / key.quota_limit) * 100)
        : null;

      return {
        id: key.id,
        provider_id: key.provider_id,
        provider_name: key.provider?.display_name || key.provider?.name || '未知',
        key_name: key.key_name,
        key_value_masked: maskValue(key.key_name), // 显示脱敏的名称
        status: key.status,
        quota_limit: key.quota_limit,
        usage_count: key.usage_count,
        usage_percentage,
        last_used_at: key.last_used_at,
        expires_at: key.expires_at,
        created_at: key.created_at,
        updated_at: key.updated_at,
        created_by: key.created_by,
        notes: key.notes,
      };
    });

    return NextResponse.json({
      success: true,
      data: maskedKeys,
      total: maskedKeys.length,
    });

  } catch (error) {
    console.error('API密钥列表请求失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/api-keys
 * 创建新的API密钥
 *
 * 请求体：
 * {
 *   provider_id?: string,
 *   key_name: string,
 *   key_value: string,  // 明文密钥（仅在创建时接收，立即加密）
 *   quota_limit?: number,
 *   expires_at?: string,
 *   created_by?: string,
 *   notes?: string
 * }
 *
 * 响应：
 * {
 *   success: true,
 *   data: {
 *     api_key: MaskedAPIKey,
 *     plaintext_key: string  // 仅在创建时返回一次，不再保存
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateAPIKeyInput = await request.json();

    // 验证必填字段
    if (!body.key_name || !body.key_value) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段: key_name 和 key_value' },
        { status: 400 }
      );
    }

    // 验证密钥格式（可选，根据需要）
    if (body.key_value.length < 8) {
      return NextResponse.json(
        { success: false, error: 'API密钥长度至少8个字符' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 加密密钥
    let encryptedValue: string;
    let keyHash: string;
    try {
      encryptedValue = encrypt(body.key_value);
      keyHash = hashValue(body.key_value);
    } catch (error) {
      console.error('密钥加密失败:', error);
      return NextResponse.json(
        { success: false, error: '密钥加密失败' },
        { status: 500 }
      );
    }

    // 检查key_hash是否已存在（防止重复添加相同密钥）
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

    // 插入数据库
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        provider_id: body.provider_id || null,
        key_name: body.key_name,
        key_value_encrypted: encryptedValue,
        key_hash: keyHash,
        quota_limit: body.quota_limit || null,
        expires_at: body.expires_at || null,
        created_by: body.created_by || null,
        notes: body.notes || null,
      })
      .select(`
        *,
        provider:api_providers(id, name, display_name)
      `)
      .single();

    if (error) {
      console.error('创建API密钥失败:', error);
      return NextResponse.json(
        { success: false, error: '创建API密钥失败: ' + error.message },
        { status: 500 }
      );
    }

    // 构造响应（脱敏）
    const usage_percentage = data.quota_limit
      ? Math.round((data.usage_count / data.quota_limit) * 100)
      : null;

    const maskedKey: MaskedAPIKey = {
      id: data.id,
      provider_id: data.provider_id,
      provider_name: data.provider?.display_name || data.provider?.name || '未知',
      key_name: data.key_name,
      key_value_masked: maskValue(body.key_value), // 使用原始密钥生成脱敏显示
      status: data.status,
      quota_limit: data.quota_limit,
      usage_count: data.usage_count,
      usage_percentage,
      last_used_at: data.last_used_at,
      expires_at: data.expires_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
      created_by: data.created_by,
      notes: data.notes,
    };

    return NextResponse.json({
      success: true,
      data: {
        api_key: maskedKey,
        plaintext_key: body.key_value, // ⚠️ 仅在创建时返回一次
      },
      message: 'API密钥创建成功。请妥善保管，此密钥明文不会再次显示。',
    }, { status: 201 });

  } catch (error) {
    console.error('创建API密钥请求失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
