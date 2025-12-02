/**
 * LLM配置管理API
 * 提供LLM提供商和模型的配置管理功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { llmConfigManager } from '@/lib/llm-config-manager';

/**
 * GET /api/llm-config - 获取LLM配置信息
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'providers':
        return await getProviders();
      
      case 'models':
        return await getModels(searchParams.get('provider_id'));
      
      case 'stats':
        return await getConfigStats();
      
      case 'validate':
        return await validateModel(searchParams.get('model_id'));
      
      case 'default':
        return await getDefaultModel();
      
      default:
        return await getOverview();
    }
  } catch (error) {
    console.error('获取LLM配置失败:', error);
    return NextResponse.json(
      { error: '获取LLM配置失败' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/llm-config - LLM配置操作
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'refresh':
        return await refreshConfig();
      
      case 'test':
        return await testModel(body.model_id, body.test_input);
      
      default:
        return NextResponse.json(
          { error: '无效的操作类型' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('LLM配置操作失败:', error);
    return NextResponse.json(
      { error: 'LLM配置操作失败' },
      { status: 500 }
    );
  }
}

// 获取概览信息
async function getOverview() {
  const [providers, models, stats] = await Promise.all([
    llmConfigManager.getActiveProviders(),
    llmConfigManager.getActiveModels(),
    llmConfigManager.getConfigStats(),
  ]);

  return NextResponse.json({
    overview: {
      providers: providers.length,
      models: models.length,
      configured_providers: stats.configured_providers,
      missing_api_keys: stats.missing_api_keys.length,
    },
    providers: providers.map(p => ({
      id: p.id,
      name: p.display_name,
      type: p.provider_type,
      status: p.status,
      has_api_key: !stats.missing_api_keys.includes(p.api_key_env_var),
    })),
    models: models.map(m => ({
      id: m.id,
      name: m.display_name,
      provider_id: m.provider_id,
      model_name: m.model_name,
      status: m.status,
    })),
    timestamp: new Date().toISOString(),
  });
}

// 获取提供商列表
async function getProviders() {
  const providers = await llmConfigManager.getActiveProviders();
  const stats = await llmConfigManager.getConfigStats();

  const providersWithStatus = providers.map(provider => ({
    ...provider,
    has_api_key: !stats.missing_api_keys.includes(provider.api_key_env_var),
    api_key_env_var: provider.api_key_env_var, // 显示环境变量名
  }));

  return NextResponse.json({
    providers: providersWithStatus,
    total: providers.length,
    configured: stats.configured_providers,
    timestamp: new Date().toISOString(),
  });
}

// 获取模型列表
async function getModels(providerId?: string | null) {
  let models;
  
  if (providerId) {
    models = await llmConfigManager.getProviderModels(providerId);
  } else {
    models = await llmConfigManager.getActiveModels();
  }

  return NextResponse.json({
    models,
    total: models.length,
    provider_id: providerId,
    timestamp: new Date().toISOString(),
  });
}

// 获取配置统计
async function getConfigStats() {
  const stats = await llmConfigManager.getConfigStats();

  return NextResponse.json({
    stats,
    timestamp: new Date().toISOString(),
  });
}

// 验证模型
async function validateModel(modelId?: string | null) {
  if (!modelId) {
    return NextResponse.json(
      { error: '模型ID未提供' },
      { status: 400 }
    );
  }

  const validation = await llmConfigManager.validateModel(modelId);

  return NextResponse.json({
    model_id: modelId,
    validation,
    timestamp: new Date().toISOString(),
  });
}

// 获取默认模型
async function getDefaultModel() {
  const defaultModelId = await llmConfigManager.getDefaultModelId();

  if (!defaultModelId) {
    return NextResponse.json({
      default_model: null,
      message: '未配置默认模型',
      timestamp: new Date().toISOString(),
    });
  }

  const validation = await llmConfigManager.validateModel(defaultModelId);

  return NextResponse.json({
    default_model: defaultModelId,
    validation,
    timestamp: new Date().toISOString(),
  });
}

// 刷新配置
async function refreshConfig() {
  try {
    await llmConfigManager.refreshCache();

    const stats = await llmConfigManager.getConfigStats();

    return NextResponse.json({
      success: true,
      message: 'LLM配置已刷新',
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '刷新失败',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// 测试模型
async function testModel(modelId: string, testInput?: string) {
  if (!modelId) {
    return NextResponse.json(
      { error: '模型ID未提供' },
      { status: 400 }
    );
  }

  try {
    const config = await llmConfigManager.getLLMCallConfig(modelId);
    
    const messages = [
      {
        role: 'user',
        content: testInput || 'Hello, this is a test message. Please respond briefly.',
      },
    ];

    const response = await fetch(`${config.provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`,
        ...config.provider.headers,
      },
      body: JSON.stringify({
        model: config.model.model_name,
        messages,
        max_tokens: 100,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(config.provider.timeout_ms || 30000),
    });

    if (!response.ok) {
      throw new Error(`API调用失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      model_id: modelId,
      test_input: testInput,
      response: data.choices[0]?.message?.content || 'No response',
      provider: config.provider.display_name,
      model_name: config.model.model_name,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      model_id: modelId,
      error: error instanceof Error ? error.message : '测试失败',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
