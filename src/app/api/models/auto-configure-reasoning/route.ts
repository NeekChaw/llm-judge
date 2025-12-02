import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/models/auto-configure-reasoning
 * 根据模型的思维链Token数自动配置提供商的推理参数
 */

interface AutoConfigureRequest {
  provider_name: string;
  thinking_budget?: number; // 思维链Token数
  max_tokens?: number; // 最大Token数
  model_name?: string; // 模型名称（用于日志）
}

export async function POST(request: NextRequest) {
  try {
    const body: AutoConfigureRequest = await request.json();
    const { provider_name, thinking_budget, max_tokens, model_name } = body;

    if (!provider_name) {
      return NextResponse.json({ error: '缺少provider_name参数' }, { status: 400 });
    }

    const supabase = createClient();

    // 1. 获取提供商信息
    const { data: provider, error: providerError } = await supabase
      .from('api_providers')
      .select('*')
      .eq('name', provider_name)
      .single();

    if (providerError || !provider) {
      return NextResponse.json({ error: '提供商不存在' }, { status: 404 });
    }

    console.log(`🔧 自动配置推理参数: ${provider_name} (${model_name || '未知模型'})`);
    console.log(`📊 参数: thinking_budget=${thinking_budget}, max_tokens=${max_tokens}`);

    // 2. 根据提供商类型生成推理参数配置
    let newRequestTemplate = { ...provider.request_template };
    let configurationApplied = false;

    // 3. 根据提供商名称适配推理参数格式
    switch (provider_name.toLowerCase()) {
      case 'dmx':
        // DMX使用enable_thinking参数
        if (thinking_budget && thinking_budget > 0) {
          newRequestTemplate.enable_thinking = true;
          configurationApplied = true;
          console.log(`✅ DMX: 配置 enable_thinking = true (thinking_budget: ${thinking_budget})`);
        } else {
          newRequestTemplate.enable_thinking = false;
          console.log(`⚪ DMX: 配置 enable_thinking = false (无思维链预算)`);
        }
        break;

      case 'openrouter':
        // OpenRouter使用reasoning参数
        if (thinking_budget && thinking_budget > 0) {
          // 根据OpenRouter文档，reasoning可以使用max_tokens或effort
          newRequestTemplate.reasoning = {
            enabled: true,
            max_tokens: thinking_budget
          };
          configurationApplied = true;
          console.log(`✅ OpenRouter: 配置 reasoning.max_tokens = ${thinking_budget}`);
        } else {
          newRequestTemplate.reasoning = {
            enabled: false
          };
          console.log(`⚪ OpenRouter: 配置 reasoning.enabled = false (无思维链预算)`);
        }
        break;

      case 'anthropic':
        // Anthropic的推理参数通过思维链预算在LLM客户端处理
        // 这里不需要特殊配置，但可以记录
        if (thinking_budget && thinking_budget > 0) {
          console.log(`ℹ️ Anthropic: 思维链预算 ${thinking_budget} 将通过thinking_budget参数传递`);
        }
        break;

      case 'openai':
        // OpenAI的o1系列等推理模型自动启用推理
        if (thinking_budget && thinking_budget > 0) {
          console.log(`ℹ️ OpenAI: 思维链预算 ${thinking_budget} 将通过thinking_budget参数传递`);
        }
        break;

      default:
        console.log(`ℹ️ ${provider_name}: 暂不支持自动推理参数配置，使用默认设置`);
        break;
    }

    // 4. 如果有配置变更，更新提供商的request_template
    if (configurationApplied || provider_name.toLowerCase() === 'dmx' || provider_name.toLowerCase() === 'openrouter') {
      const { data: updatedProvider, error: updateError } = await supabase
        .from('api_providers')
        .update({
          request_template: newRequestTemplate,
          updated_at: new Date().toISOString()
        })
        .eq('id', provider.id)
        .select()
        .single();

      if (updateError) {
        console.error('更新提供商配置失败:', updateError);
        return NextResponse.json({ error: '更新提供商配置失败' }, { status: 500 });
      }

      console.log(`💾 ${provider_name} 推理参数配置已更新`);
      
      return NextResponse.json({
        message: '推理参数配置成功',
        provider: updatedProvider,
        configuration: {
          provider_name,
          thinking_budget,
          max_tokens,
          applied_template: newRequestTemplate
        }
      });
    } else {
      return NextResponse.json({
        message: '无需配置推理参数',
        provider,
        configuration: {
          provider_name,
          thinking_budget,
          max_tokens,
          note: '该提供商暂不需要特殊推理参数配置'
        }
      });
    }

  } catch (error) {
    console.error('自动配置推理参数失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}