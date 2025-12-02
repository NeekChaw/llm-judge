import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { 
  withMonitoring, 
  APIError, 
  ErrorType, 
  logger 
} from '@/lib/monitoring';
import { 
  withCache, 
  QueryOptimizer,
  CACHE_CONFIG,
  generateCacheKey,
  CacheInvalidation
} from '@/lib/performance';

interface ModelFormData {
  name: string;
  provider: string;
  api_endpoint: string;
  api_key_env_var: string;
  input_cost_per_1k_tokens?: number;
  output_cost_per_1k_tokens?: number;
  cost_currency?: 'USD' | 'CNY';
  // 🆕 Phase 1: 多提供商成本管理字段
  provider_input_cost_per_1k_tokens?: number;
  provider_output_cost_per_1k_tokens?: number;
  provider_cost_currency?: 'USD' | 'CNY';
  max_context_window?: number;
  tags: string[];
  // 新增：被测评时的默认配置
  default_max_tokens?: number;
  default_temperature?: number;
  default_thinking_budget?: number;
  // 多厂商架构字段
  logical_name?: string;
  vendor_name?: string;
  api_model_name?: string;
  priority?: number;
  concurrent_limit?: number;
  success_rate?: number;
  model_group_id?: string;
}

// GET /api/models - 获取模型列表 (性能优化 + 监控版)
export const GET = withMonitoring('models-list', async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get('tag');
  const search = searchParams.get('search');
  const status = searchParams.get('status'); // 可选：状态筛选
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = parseInt(searchParams.get('offset') || '0');
  const includeInactive = searchParams.get('include_inactive') === 'true'; // 🔧 新增：是否包含非活跃模型

  // 参数验证
  if (limit > 100) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '分页限制不能超过100条记录',
      400
    );
  }

  const validTags = ['非推理', '推理', '多模态'];
  if (tag && !validTags.includes(tag)) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '标签参数无效，必须是：非推理、推理、多模态之一',
      400
    );
  }

  const validStatuses = ['active', 'inactive', 'maintenance'];
  if (status && !validStatuses.includes(status)) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '状态参数无效，必须是：active、inactive、maintenance之一',
      400
    );
  }

  // 生成缓存键
  const cacheKey = generateCacheKey('models:list', {
    tag, search, status, limit, offset, includeInactive
  });

  const fetchData = async () => {
    const supabase = createClient();
    
    // 先获取所有符合条件的模型（不分页）
    let query = supabase
      .from('models')
      .select('*')
      .order('created_at', { ascending: false });

    // 🔧 状态筛选逻辑
    if (status) {
      // 如果指定了具体状态，只返回该状态的模型
      query = query.eq('status', status);
    } else if (!includeInactive) {
      // 如果未指定状态且未请求包含非活跃模型，则只返回活跃状态的模型
      query = query.eq('status', 'active');
    }
    // 如果includeInactive为true且未指定具体状态，则返回所有状态的模型

    if (tag) {
      query = query.contains('tags', [tag]);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,logical_name.ilike.%${search}%`);
    }

    const { data: allModels, error } = await query;
    
    if (error) {
      logger.error('数据库查询失败', error, { tag, search, limit, offset });
      throw new APIError(
        ErrorType.DATABASE_ERROR,
        '获取模型列表失败',
        500,
        error.message
      );
    }

    // 按逻辑名称分组
    const groupsMap = new Map<string, any[]>();
    (allModels || []).forEach(model => {
      const logicalName = model.logical_name || model.name;
      if (!groupsMap.has(logicalName)) {
        groupsMap.set(logicalName, []);
      }
      groupsMap.get(logicalName)!.push(model);
    });
    
    // 转换为分组数组并分页（按组分页，不是按记录）
    const groupsArray = Array.from(groupsMap.values());
    const paginatedGroups = groupsArray.slice(offset, offset + limit);
    
    // 展开分组为模型列表
    const models = paginatedGroups.flat();
    const count = groupsArray.length; // 总组数，不是总记录数

    // 处理模型数据，确保tags字段是数组
    const processedModels = (models || []).map(model => ({
      ...model,
      tags: model.tags || ['推理'] // 如果tags为null或undefined，默认为推理标签
    }));

    return {
      models: processedModels,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit
      }
    };
  };

  // 使用缓存
  const result = await withCache(cacheKey, CACHE_CONFIG.DYNAMIC_DATA_TTL, fetchData);

  const response = NextResponse.json(result);
  
  // 添加缓存头
  response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  response.headers.set('X-Cache-Key', cacheKey);
  
  return response;
});

// POST /api/models - 创建新模型 (监控版)
export const POST = withMonitoring('models-create', async (request: NextRequest) => {
  const body: ModelFormData = await request.json();

  // 输入验证 - 多提供商架构下的必填字段调整
  if (!body.name || !body.tags || body.tags.length === 0) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '模型名称和标签为必填字段',
      400
    );
  }

  // 多提供商架构：验证逻辑名称（如果提供）或从模型名称提取
  if (!body.logical_name && !body.name) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '必须提供逻辑名称或模型名称',
      400
    );
  }

  // 验证提供商信息：需要通过提供商选择或自定义输入
  const hasProviderSelection = body.provider && (body.api_endpoint || body.api_key_env_var);
  if (!hasProviderSelection) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '必须选择提供商或填写完整的提供商配置信息',
      400
    );
  }

  const validTags = ['非推理', '推理', '多模态'];
  const invalidTags = body.tags.filter(tag => !validTags.includes(tag));
  if (invalidTags.length > 0) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      `无效的标签：${invalidTags.join(', ')}。有效标签：${validTags.join(', ')}`,
      400
    );
  }

  // 检查名称是否重复
  const supabase = createClient();
  const { data: existing } = await supabase
    .from('models')
    .select('id')
    .eq('name', body.name)
    .single();

  if (existing) {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      `模型名称"${body.name}"已存在`,
      409
    );
  }

  // 创建模型
  const { data: model, error } = await supabase
    .from('models')
    .insert([{
      name: body.name,
      provider: body.provider,
      api_endpoint: body.api_endpoint,
      api_key_env_var: body.api_key_env_var,
      input_cost_per_1k_tokens: body.input_cost_per_1k_tokens ?? 0,
      output_cost_per_1k_tokens: body.output_cost_per_1k_tokens ?? 0,
      cost_currency: body.cost_currency || 'USD',
      // 🆕 Phase 1: 多提供商成本管理字段
      provider_input_cost_per_1k_tokens: body.provider_input_cost_per_1k_tokens ?? null,
      provider_output_cost_per_1k_tokens: body.provider_output_cost_per_1k_tokens ?? null,
      provider_cost_currency: body.provider_cost_currency || null,
      cost_last_updated: new Date().toISOString(),
      max_context_window: body.max_context_window || null,
      tags: body.tags,
      // 新增：被测评时的默认配置
      default_max_tokens: body.default_max_tokens || null,
      default_temperature: body.default_temperature || null,
      default_thinking_budget: body.default_thinking_budget || null,
      // 多厂商架构字段
      logical_name: body.logical_name || null,
      vendor_name: body.vendor_name || null,
      api_model_name: body.api_model_name || null,
      priority: body.priority ?? 3,
      concurrent_limit: body.concurrent_limit ?? 50,
      success_rate: body.success_rate ?? 1.0,
      model_group_id: body.model_group_id || null,
      status: 'active'  // 新创建的模型默认为活跃状态
    }])
    .select()
    .single();

  if (error) {
    logger.error('模型创建失败', error, { name: body.name });
    throw new APIError(
      ErrorType.DATABASE_ERROR,
      '创建模型失败',
      500,
      error.message
    );
  }

  // 清除相关缓存
  CacheInvalidation.invalidateResource('models');
  
  logger.info('模型创建成功', { 
    modelId: model.id, 
    name: body.name,
    provider: body.provider 
  });

  const response = NextResponse.json(
    { model, message: '模型创建成功' },
    { status: 201 }
  );

  response.headers.set('X-Cache-Invalidated', 'models');
  
  return response;
});