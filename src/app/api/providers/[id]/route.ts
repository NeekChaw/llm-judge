import { supabase } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { 
  withMonitoring, 
  APIError, 
  ErrorType, 
  logger 
} from '@/lib/monitoring';

interface ProviderUpdateData {
  display_name?: string;
  base_url?: string;
  api_key_env_var?: string;
  headers?: Record<string, string>;
  auth_type?: string;
  request_template?: Record<string, any>;
  response_mapping?: Record<string, any>;
  rate_limit_rpm?: number;
  timeout_ms?: number;
  status?: string;
  description?: string;
}

// GET /api/providers/[id] - 获取单个提供商详情
export const GET = withMonitoring('provider-detail', async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const { data: provider, error } = await supabase
    .from('api_providers')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new APIError(
        ErrorType.VALIDATION_ERROR,
        '提供商不存在',
        404
      );
    }
    
    logger.error('获取提供商详情失败', error, { providerId: params.id });
    throw new APIError(
      ErrorType.DATABASE_ERROR,
      '获取提供商详情失败',
      500,
      error.message
    );
  }

  return NextResponse.json({ provider });
});

// PUT /api/providers/[id] - 更新提供商
export const PUT = withMonitoring('provider-update', async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  const body: ProviderUpdateData = await request.json();

  // 检查提供商是否存在
  const { data: existingProvider, error: fetchError } = await supabase
    .from('api_providers')
    .select('id, is_builtin')
    .eq('id', params.id)
    .single();

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      throw new APIError(
        ErrorType.VALIDATION_ERROR,
        '提供商不存在',
        404
      );
    }
    throw new APIError(
      ErrorType.DATABASE_ERROR,
      '查询提供商失败',
      500,
      fetchError.message
    );
  }

  // 内置提供商只允许更新部分字段
  const allowedFields = existingProvider.is_builtin 
    ? ['api_key_env_var', 'status', 'description', 'rate_limit_rpm', 'timeout_ms', 'display_name', 'base_url']
    : Object.keys(body);

  const updateData: any = { updated_at: new Date().toISOString() };
  
  allowedFields.forEach(field => {
    if (body[field as keyof ProviderUpdateData] !== undefined) {
      updateData[field] = body[field as keyof ProviderUpdateData];
    }
  });

  // 状态验证
  if (body.status && !['active', 'disabled'].includes(body.status)) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '状态必须是 active 或 disabled',
      400
    );
  }

  const { data: provider, error } = await supabase
    .from('api_providers')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    logger.error('更新提供商失败', error, { providerId: params.id });
    throw new APIError(
      ErrorType.DATABASE_ERROR,
      '更新提供商失败',
      500,
      error.message
    );
  }

  logger.info('提供商更新成功', { 
    providerId: params.id,
    updatedFields: Object.keys(updateData)
  });

  return NextResponse.json({
    provider,
    message: '提供商更新成功'
  });
});

// DELETE /api/providers/[id] - 删除提供商
export const DELETE = withMonitoring('provider-delete', async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  // 检查提供商是否存在及是否为内置提供商
  const { data: provider, error: fetchError } = await supabase
    .from('api_providers')
    .select('id, name, is_builtin')
    .eq('id', params.id)
    .single();

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      throw new APIError(
        ErrorType.VALIDATION_ERROR,
        '提供商不存在',
        404
      );
    }
    throw new APIError(
      ErrorType.DATABASE_ERROR,
      '查询提供商失败',
      500,
      fetchError.message
    );
  }

  if (provider.is_builtin) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '不能删除内置提供商',
      400
    );
  }

  // 检查是否有模型正在使用此提供商
  const { data: modelsUsingProvider, error: modelsError } = await supabase
    .from('models')
    .select('id, name')
    .eq('provider', provider.name)
    .limit(1);

  if (modelsError) {
    logger.error('检查关联模型失败', modelsError);
    throw new APIError(
      ErrorType.DATABASE_ERROR,
      '检查关联模型失败',
      500,
      modelsError.message
    );
  }

  if (modelsUsingProvider && modelsUsingProvider.length > 0) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '无法删除：仍有模型正在使用此提供商',
      400
    );
  }

  // 删除提供商
  const { error: deleteError } = await supabase
    .from('api_providers')
    .delete()
    .eq('id', params.id);

  if (deleteError) {
    logger.error('删除提供商失败', deleteError, { providerId: params.id });
    throw new APIError(
      ErrorType.DATABASE_ERROR,
      '删除提供商失败',
      500,
      deleteError.message
    );
  }

  logger.info('提供商删除成功', { 
    providerId: params.id,
    providerName: provider.name
  });

  return NextResponse.json({
    message: '提供商删除成功'
  });
});