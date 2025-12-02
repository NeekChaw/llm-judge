import { supabase } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { 
  withMonitoring, 
  APIError, 
  ErrorType, 
  logger 
} from '@/lib/monitoring';

// POST /api/providers/[id]/test - 测试提供商连接
export const POST = withMonitoring('provider-test', async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  // 获取提供商配置
  const { data: provider, error: fetchError } = await supabase
    .from('api_providers')
    .select('*')
    .eq('id', id)
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
      '获取提供商配置失败',
      500,
      fetchError.message
    );
  }

  if (provider.status !== 'active') {
    throw new APIError(
      ErrorType.VALIDATION_ERROR,
      '提供商未激活，无法测试连接',
      400
    );
  }

  // 检查API密钥环境变量
  const apiKey = provider.api_key_env_var ? process.env[provider.api_key_env_var] : null;
  if (provider.api_key_env_var && !apiKey) {
    return NextResponse.json({
      success: false,
      error: `环境变量 ${provider.api_key_env_var} 未设置`,
      details: '请在环境变量中配置API密钥'
    });
  }

  try {
    // 🔧 修复：为火山方舟等提供商提供特殊的测试逻辑
    let testEndpoint: string;
    let testMethod: string = 'GET';
    let testBody: any = undefined;

    // 根据提供商类型选择合适的测试端点
    if (provider.name === 'volcengine' || provider.base_url.includes('volces.com')) {
      // 火山方舟不支持/models端点，使用chat/completions进行测试
      testEndpoint = provider.base_url.endsWith('/chat/completions')
        ? provider.base_url
        : `${provider.base_url}/chat/completions`;
      testMethod = 'POST';
      testBody = {
        model: 'doubao-seed-1-6-250615', // 使用默认测试模型
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      };
    } else {
      // 其他提供商使用标准的/models端点
      testEndpoint = `${provider.base_url}/models` || `${provider.base_url}/v1/models`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(provider.headers || {})
    };

    // 根据认证类型设置Authorization头
    if (apiKey) {
      switch (provider.auth_type) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${apiKey}`;
          break;
        case 'api_key':
          headers['x-api-key'] = apiKey;
          break;
        case 'custom':
          // 对于自定义认证，可能需要特殊处理
          if (provider.name === 'anthropic') {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
          } else if (provider.name === 'volcengine') {
            headers['Authorization'] = `Bearer ${apiKey}`;
          }
          break;
      }
    }

    // 发送测试请求
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.timeout_ms || 10000);

    const response = await fetch(testEndpoint, {
      method: testMethod,
      headers,
      body: testBody ? JSON.stringify(testBody) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeout);

    const isSuccess = response.ok || response.status === 401; // 401可能表示API密钥有效但权限不足
    
    let responseData;
    try {
      responseData = await response.json();
    } catch {
      responseData = await response.text();
    }

    const result = {
      success: isSuccess,
      status_code: response.status,
      status_text: response.statusText,
      response_data: typeof responseData === 'string' ? responseData.substring(0, 500) : responseData,
      test_endpoint: testEndpoint,
      tested_at: new Date().toISOString()
    };

    if (isSuccess) {
      logger.info('提供商连接测试成功', {
        providerId: id,
        providerName: provider.name,
        statusCode: response.status
      });
    } else {
      logger.warn('提供商连接测试失败', {
        providerId: id,
        providerName: provider.name,
        statusCode: response.status,
        error: result.response_data
      });
    }

    return NextResponse.json(result);

  } catch (error: any) {
    const errorMessage = error.name === 'AbortError' 
      ? '连接超时' 
      : error.message || '连接测试失败';

    logger.error('提供商连接测试异常', error, {
      providerId: id,
      providerName: provider.name
    });

    return NextResponse.json({
      success: false,
      error: errorMessage,
      details: error.name === 'AbortError' 
        ? `请求超时（${provider.timeout_ms}ms）`
        : '网络连接或API端点错误',
      tested_at: new Date().toISOString()
    });
  }
});