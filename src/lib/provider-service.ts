import { createClient } from './supabase';

export interface ProviderConfig {
  id: string;
  name: string;
  display_name: string;
  base_url: string;
  api_key_env_var: string;
  auth_type: 'bearer' | 'custom';
  timeout_ms: number;
  rate_limit_rpm: number;
  status: 'active' | 'inactive';
}

export interface ModelConfig {
  id: string;
  name: string;
  tags: string[];
  status: 'active' | 'inactive';
  
  // 配置继承：优先使用模型配置，否则使用提供商配置
  api_endpoint: string;
  api_key_env_var: string;
  
  // 模型特有配置
  input_cost_per_1k_tokens?: number;
  output_cost_per_1k_tokens?: number;
  max_context_window?: number;
  
  // 提供商信息 - 保持兼容性
  provider: string;  // LLM客户端需要的字段
  provider_name: string;
  provider_display_name: string;
  provider_timeout: number;
  provider_rate_limit: number;
  provider_auth_type: string;
}

class ProviderService {
  // 懒加载 Supabase 客户端，避免构建时初始化
  private get supabase() {
    return createClient();
  }

  /**
   * 获取所有活跃的提供商配置
   */
  async getActiveProviders(): Promise<ProviderConfig[]> {
    const { data, error } = await this.supabase
      .from('api_providers')
      .select('*')
      .eq('status', 'active')
      .order('name');

    if (error) {
      throw new Error(`获取提供商配置失败: ${error.message}`);
    }

    return data || [];
  }

  /**
   * 获取统一的模型配置（包含提供商配置继承）
   */
  async getModelConfig(modelId: string): Promise<ModelConfig | null> {
    const { data, error } = await this.supabase
      .from('models')
      .select(`
        id, name, tags, status,
        api_endpoint, api_key_env_var,
        input_cost_per_1k_tokens,
        output_cost_per_1k_tokens,
        max_context_window,
        provider_id, provider,
        api_providers (
          name,
          display_name,
          base_url,
          api_key_env_var,
          timeout_ms,
          rate_limit_rpm,
          auth_type
        )
      `)
      .eq('id', modelId)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      return null;
    }

    const provider = data.api_providers as any;
    
    return {
      id: data.id,
      name: data.name,
      tags: data.tags || ['推理'],
      status: data.status as 'active' | 'inactive',
      
      // 配置继承逻辑
      api_endpoint: data.api_endpoint || (provider ? `${provider.base_url}/chat/completions` : ''),
      api_key_env_var: data.api_key_env_var || (provider ? provider.api_key_env_var : ''),
      
      // 模型特有配置
      input_cost_per_1k_tokens: data.input_cost_per_1k_tokens,
      output_cost_per_1k_tokens: data.output_cost_per_1k_tokens,
      max_context_window: data.max_context_window,
      
      // 提供商信息
      provider_name: provider?.name || data.provider || '',
      provider_display_name: provider?.display_name || '',
      provider_timeout: provider?.timeout_ms || 30000,
      provider_rate_limit: provider?.rate_limit_rpm || 60,
      provider_auth_type: provider?.auth_type || 'bearer',
    };
  }

  /**
   * 获取所有活跃模型的配置
   */
  async getAllModelConfigs(): Promise<ModelConfig[]> {
    const { data, error } = await this.supabase
      .from('models')
      .select(`
        id, name, tags, status,
        api_endpoint, api_key_env_var,
        input_cost_per_1k_tokens,
        output_cost_per_1k_tokens,
        max_context_window,
        provider_id, provider,
        api_providers (
          name,
          display_name,
          base_url,
          api_key_env_var,
          timeout_ms,
          rate_limit_rpm,
          auth_type
        )
      `)
      .eq('status', 'active')
      .order('name');

    if (error) {
      throw new Error(`获取模型配置失败: ${error.message}`);
    }

    return (data || []).map(model => {
      const provider = model.api_providers as any;
      
      return {
        id: model.id,
        name: model.name,
        tags: model.tags || ['推理'],
        status: model.status as 'active' | 'inactive',
        
        // 配置继承逻辑
        api_endpoint: model.api_endpoint || (provider ? `${provider.base_url}/chat/completions` : ''),
        api_key_env_var: model.api_key_env_var || (provider ? provider.api_key_env_var : ''),
        
        // 模型特有配置
        input_cost_per_1k_tokens: model.input_cost_per_1k_tokens,
        output_cost_per_1k_tokens: model.output_cost_per_1k_tokens,
        max_context_window: model.max_context_window,
        
        // 提供商信息 - 保持兼容性，同时提供两种字段名
        provider: provider?.name || model.provider || '',  // LLM客户端需要的字段，优先使用关联的provider，否则使用直接存储的provider
        provider_name: provider?.name || model.provider || '',
        provider_display_name: provider?.display_name || '',
        provider_timeout: provider?.timeout_ms || 30000,
        provider_rate_limit: provider?.rate_limit_rpm || 60,
        provider_auth_type: provider?.auth_type || 'bearer',
      };
    });
  }

  /**
   * 将模型关联到提供商
   */
  async linkModelToProvider(modelId: string, providerName: string): Promise<void> {
    // 获取提供商ID
    const { data: provider, error: providerError } = await this.supabase
      .from('api_providers')
      .select('id')
      .eq('name', providerName)
      .eq('status', 'active')
      .single();

    if (providerError || !provider) {
      throw new Error(`提供商 ${providerName} 不存在或未激活`);
    }

    // 更新模型的provider_id
    const { error } = await this.supabase
      .from('models')
      .update({ provider_id: provider.id })
      .eq('id', modelId);

    if (error) {
      throw new Error(`关联模型到提供商失败: ${error.message}`);
    }
  }

  /**
   * 批量迁移现有模型到统一配置
   */
  async migrateExistingModels(): Promise<{
    success: number;
    failed: number;
    details: Array<{ modelId: string; modelName: string; result: string }>;
  }> {
    console.log('📦 开始批量迁移现有模型...');

    // 获取未关联提供商的模型
    const { data: models, error } = await this.supabase
      .from('models')
      .select('id, name, provider')
      .is('provider_id', null);

    if (error) {
      throw new Error(`获取待迁移模型失败: ${error.message}`);
    }

    const results = {
      success: 0,
      failed: 0,
      details: [] as Array<{ modelId: string; modelName: string; result: string }>
    };

    if (!models || models.length === 0) {
      console.log('✅ 没有需要迁移的模型');
      return results;
    }

    // 提供商名称映射
    const providerMapping: Record<string, string> = {
      '硅基流动': 'siliconflow',
      'OpenAI': 'openai',
      'Anthropic': 'anthropic',
      'DeepSeek': 'deepseek'
    };

    for (const model of models) {
      try {
        const providerName = providerMapping[model.provider];
        if (!providerName) {
          results.failed++;
          results.details.push({
            modelId: model.id,
            modelName: model.name,
            result: `未知提供商: ${model.provider}`
          });
          continue;
        }

        await this.linkModelToProvider(model.id, providerName);
        results.success++;
        results.details.push({
          modelId: model.id,
          modelName: model.name,
          result: `成功关联到 ${providerName}`
        });
      } catch (error) {
        results.failed++;
        results.details.push({
          modelId: model.id,
          modelName: model.name,
          result: `迁移失败: ${error.message}`
        });
      }
    }

    console.log(`📊 迁移完成: ${results.success} 成功, ${results.failed} 失败`);
    return results;
  }

  /**
   * 验证配置完整性
   */
  async validateConfigurations(): Promise<{
    valid: boolean;
    issues: Array<{ type: string; message: string; details?: any }>;
  }> {
    const issues: Array<{ type: string; message: string; details?: any }> = [];

    // 1. 检查是否有模型缺少提供商关联
    const { data: unlinkedModels } = await this.supabase
      .from('models')
      .select('id, name, provider')
      .is('provider_id', null)
      .eq('status', 'active');

    if (unlinkedModels && unlinkedModels.length > 0) {
      issues.push({
        type: 'missing_provider_link',
        message: `${unlinkedModels.length} 个活跃模型未关联提供商`,
        details: unlinkedModels.map(m => ({ id: m.id, name: m.name, provider: m.provider }))
      });
    }

    // 2. 检查是否有模型关联了非活跃的提供商
    const { data: inactiveProviderModels } = await this.supabase
      .from('models')
      .select(`
        id, name,
        api_providers!inner (
          name, status
        )
      `)
      .eq('status', 'active')
      .neq('api_providers.status', 'active');

    if (inactiveProviderModels && inactiveProviderModels.length > 0) {
      issues.push({
        type: 'inactive_provider',
        message: `${inactiveProviderModels.length} 个模型关联了非活跃提供商`,
        details: inactiveProviderModels
      });
    }

    // 3. 检查环境变量配置
    const modelConfigs = await this.getAllModelConfigs();
    const missingEnvVars = modelConfigs
      .filter(config => config.api_key_env_var && !process.env[config.api_key_env_var])
      .map(config => ({
        model: config.name,
        env_var: config.api_key_env_var,
        provider: config.provider_display_name
      }));

    if (missingEnvVars.length > 0) {
      issues.push({
        type: 'missing_env_vars',
        message: `${missingEnvVars.length} 个模型的API密钥环境变量未设置`,
        details: missingEnvVars
      });
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

export const providerService = new ProviderService();