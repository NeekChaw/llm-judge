/**
 * API Keys Management - Individual Resource
 *
 * GET /api/api-keys/[id] - 获取单个API密钥（脱敏）
 * PUT /api/api-keys/[id] - 更新API密钥
 * DELETE /api/api-keys/[id] - 删除API密钥
 */

import { createClient } from '@/lib/supabase';
import { encrypt, hashValue, maskValue, decrypt } from '@/lib/encryption';
import { NextRequest, NextResponse } from 'next/server';
import type { UpdateAPIKeyInput, MaskedAPIKey } from '@/types/api-key';

/**
 * GET /api/api-keys/[id]
 * 获取单个API密钥详情（脱敏显示）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;

    const { data, error } = await supabase
      .from('api_keys')
      .select(`
        *,
        provider:api_providers(id, name, display_name, base_url)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'API密钥不存在' },
        { status: 404 }
      );
    }

    // 脱敏处理
    const usage_percentage = data.quota_limit
      ? Math.round((data.usage_count / data.quota_limit) * 100)
      : null;

    const maskedKey: MaskedAPIKey = {
      id: data.id,
      provider_id: data.provider_id,
      provider_name: data.provider?.display_name || data.provider?.name || '未知',
      key_name: data.key_name,
      key_value_masked: maskValue(data.key_name),
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
      data: maskedKey,
    });

  } catch (error) {
    console.error('获取API密钥详情失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/api-keys/[id]
 * 更新API密钥
 *
 * 请求体：
 * {
 *   key_name?: string,
 *   key_value?: string,  // 如果提供，会重新加密
 *   status?: 'active' | 'disabled',
 *   quota_limit?: number,
 *   expires_at?: string,
 *   notes?: string
 * }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body: UpdateAPIKeyInput = await request.json();
    const supabase = createClient();

    // 检查API密钥是否存在
    const { data: existingKey, error: fetchError } = await supabase
      .from('api_keys')
      .select('id, key_value_encrypted')
      .eq('id', id)
      .single();

    if (fetchError || !existingKey) {
      return NextResponse.json(
        { success: false, error: 'API密钥不存在' },
        { status: 404 }
      );
    }

    // 准备更新数据
    const updateData: Record<string, any> = {};

    if (body.key_name !== undefined) {
      updateData.key_name = body.key_name;
    }

    if (body.status !== undefined) {
      if (!['active', 'disabled'].includes(body.status)) {
        return NextResponse.json(
          { success: false, error: 'status 只能是 active 或 disabled' },
          { status: 400 }
        );
      }
      updateData.status = body.status;
    }

    if (body.quota_limit !== undefined) {
      updateData.quota_limit = body.quota_limit;
    }

    if (body.expires_at !== undefined) {
      updateData.expires_at = body.expires_at;
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }

    // 如果提供了新的密钥值，重新加密
    if (body.key_value) {
      try {
        updateData.key_value_encrypted = encrypt(body.key_value);
        updateData.key_hash = hashValue(body.key_value);
      } catch (error) {
        console.error('密钥加密失败:', error);
        return NextResponse.json(
          { success: false, error: '密钥加密失败' },
          { status: 500 }
        );
      }
    }

    // 执行更新
    const { data, error } = await supabase
      .from('api_keys')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        provider:api_providers(id, name, display_name)
      `)
      .single();

    if (error) {
      console.error('更新API密钥失败:', error);
      return NextResponse.json(
        { success: false, error: '更新API密钥失败: ' + error.message },
        { status: 500 }
      );
    }

    // 脱敏处理
    const usage_percentage = data.quota_limit
      ? Math.round((data.usage_count / data.quota_limit) * 100)
      : null;

    const maskedKey: MaskedAPIKey = {
      id: data.id,
      provider_id: data.provider_id,
      provider_name: data.provider?.display_name || data.provider?.name || '未知',
      key_name: data.key_name,
      key_value_masked: body.key_value ? maskValue(body.key_value) : maskValue(data.key_name),
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
      data: maskedKey,
      message: 'API密钥更新成功',
    });

  } catch (error) {
    console.error('更新API密钥请求失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/api-keys/[id]
 * 删除API密钥
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const supabase = createClient();

    // 检查API密钥是否存在
    const { data: existingKey, error: fetchError } = await supabase
      .from('api_keys')
      .select('id, key_name')
      .eq('id', id)
      .single();

    if (fetchError || !existingKey) {
      return NextResponse.json(
        { success: false, error: 'API密钥不存在' },
        { status: 404 }
      );
    }

    // 执行删除
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('删除API密钥失败:', error);
      return NextResponse.json(
        { success: false, error: '删除API密钥失败: ' + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `API密钥 "${existingKey.key_name}" 已删除`,
    });

  } catch (error) {
    console.error('删除API密钥请求失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
