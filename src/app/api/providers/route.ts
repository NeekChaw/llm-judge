import { supabase } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { 
  withMonitoring, 
  APIError, 
  ErrorType, 
  logger 
} from '@/lib/monitoring';

interface ProviderFormData {
  name: string;
  display_name: string;
  base_url: string;
  api_key_env_var?: string;
  headers?: Record<string, string>;
  auth_type?: string;
  request_template?: Record<string, any>;
  response_mapping?: Record<string, any>;
  rate_limit_rpm?: number;
  timeout_ms?: number;
  description?: string;
}

// GET /api/providers - 获取提供商列表
export const GET = withMonitoring('providers-list', async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const includeBuiltin = searchParams.get('include_builtin') !== 'false';
  const status = searchParams.get('status') || 'active';

  let query = supabase
    .from('api_providers')
    .select('*')
    .eq('status', status)
    .order('is_builtin', { ascending: false })
    .order('display_name', { ascending: true });

  if (!includeBuiltin) {
    query = query.eq('is_builtin', false);
  }

  const { data: providers, error } = await query;

  if (error) {
    logger.error('获取提供商列表失败', error);
    throw new APIError(
      ErrorType.DATABASE_ERROR,
      '获取提供商列表失败',
      500,
      error.message
    );
  }

  return NextResponse.json({
    providers: providers || [],
    total: providers?.length || 0
  });
});

// POST /api/providers - 创建新提供商
export const POST = withMonitoring('providers-create', async (request: NextRequest) => {
  const body: ProviderFormData = await request.json();

  // 输入验证
  if (!body.name || !body.display_name || !body.base_url) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '名称、显示名称和基础URL为必填字段',
      400
    );
  }

  // 检查名称是否重复
  const { data: existing } = await supabase
    .from('api_providers')
    .select('id')
    .eq('name', body.name)
    .single();

  if (existing) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '提供商名称已存在',
      409
    );
  }

  // 创建提供商
  const { data: provider, error } = await supabase
    .from('api_providers')
    .insert([{
      name: body.name,
      display_name: body.display_name,
      base_url: body.base_url,
      api_key_env_var: body.api_key_env_var || null,
      headers: body.headers || {},
      auth_type: body.auth_type || 'bearer',
      request_template: body.request_template || {},
      response_mapping: body.response_mapping || {},
      rate_limit_rpm: body.rate_limit_rpm || 60,
      timeout_ms: body.timeout_ms || 30000,
      description: body.description || null,
      is_builtin: false
    }])
    .select()
    .single();

  if (error) {
    logger.error('提供商创建失败', error, { name: body.name });
    throw new APIError(
      ErrorType.DATABASE_ERROR,
      '创建提供商失败',
      500,
      error.message
    );
  }

  logger.info('提供商创建成功', { 
    providerId: provider.id, 
    name: body.name,
    displayName: body.display_name 
  });

  return NextResponse.json(
    { provider, message: '提供商创建成功' },
    { status: 201 }
  );
});

// PUT /api/providers - 批量更新提供商状态
export const PUT = withMonitoring('providers-bulk-update', async (request: NextRequest) => {
  const { ids, status } = await request.json();

  if (!ids || !Array.isArray(ids) || !status) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '请提供有效的ID列表和状态',
      400
    );
  }

  if (!['active', 'disabled'].includes(status)) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '状态必须是 active 或 disabled',
      400
    );
  }

  const { data: providers, error } = await supabase
    .from('api_providers')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select();

  if (error) {
    logger.error('批量更新提供商失败', error, { ids, status });
    throw new APIError(
      ErrorType.DATABASE_ERROR,
      '批量更新提供商失败',
      500,
      error.message
    );
  }

  logger.info('批量更新提供商成功', { 
    count: providers?.length || 0, 
    status 
  });

  return NextResponse.json({
    providers,
    message: `成功更新 ${providers?.length || 0} 个提供商`
  });
});