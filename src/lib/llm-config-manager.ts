/**
 * LLM配置管理器
 * 统一管理LLM提供商配置，支持数据库和环境变量
 */

import { createClient } from '@/lib/supabase';

export interface LLMProviderConfig {
  id: string;
  name: string;
  display_name: string;
  provider_type: 'openai' | 'anthropic' | 'siliconflow' | 'custom';
  base_url: string;
  api_key_env_var: string;
  default_model?: string;
  max_context_window?: number;
  rate_limit_rpm?: number;
  timeout_ms?: number;
  headers?: Record<string, string>;
  status: 'active' | 'inactive';
  is_builtin: boolean;
}

export interface LLMModelConfig {
  id: string;
  name: string;
  display_name?: string;
  provider: string; // 直接使用provider字符串而不是provider_id
  model_name?: string;
  max_context_window?: number;
  input_cost_per_1k_tokens?: number;
  output_cost_per_1k_tokens?: number;
  status: 'active' | 'inactive';
}

export interface LLMCallConfig {
  provider: LLMProviderConfig;
  model: LLMModelConfig;
  api_key: string;
}

export class LLMConfigManager {
  private static instance: LLMConfigManager;
  // 懒加载 Supabase 客户端，避免构建时初始化
  private get supabase() {
    return createClient();
  }
  private providersCache: Map<string, LLMProviderConfig> = new Map();
  private modelsCache: Map<string, LLMModelConfig> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

  private constructor() {}

  static getInstance(): LLMConfigManager {
    if (!LLMConfigManager.instance) {
      LLMConfigManager.instance = new LLMConfigManager();
    }
    return LLMConfigManager.instance;
  }

  /**
   * 获取LLM调用配置
   */
  async getLLMCallConfig(modelId: string): Promise<LLMCallConfig> {
    await this.ensureCacheValid();

    const model = this.modelsCache.get(modelId);
    if (!model) {
      throw new Error(`模型配置未找到: ${modelId}`);
    }

    // 处理provider为空的情况  
    if (!model.provider) {
      throw new Error(`模型 ${model.name || modelId} 的提供商配置缺失，请检查数据库中的models表`);
    }

    // 根据provider名称查找对应的provider配置
    const provider = Array.from(this.providersCache.values())
      .find(p => p.name === model.provider || p.display_name === model.provider);
    
    if (!provider) {
      throw new Error(`提供商配置未找到: ${model.provider}，模型: ${model.name || modelId}`);
    }

    // 从环境变量获取API密钥
    const apiKey = this.getApiKey(provider.api_key_env_var);
    
    // 调试日志（可在生产环境中移除）
    // console.log('🔑 API密钥调试:', {
    //   envVar: provider.api_key_env_var,
    //   hasApiKey: !!apiKey,
    //   keyLength: apiKey ? apiKey.length : 0,
    //   processEnvValue: !!process.env[provider.api_key_env_var]
    // });
    
    if (!apiKey) {
      throw new Error(`API密钥未配置: ${provider.api_key_env_var}`);
    }

    return {
      provider,
      model,
      api_key: apiKey,
    };
  }

  /**
   * 获取所有活跃的提供商
   */
  async getActiveProviders(): Promise<LLMProviderConfig[]> {
    await this.ensureCacheValid();
    return Array.from(this.providersCache.values())
      .filter(provider => provider.status === 'active');
  }

  /**
   * 获取提供商的所有活跃模型
   */
  async getProviderModels(providerName: string): Promise<LLMModelConfig[]> {
    await this.ensureCacheValid();
    return Array.from(this.modelsCache.values())
      .filter(model => model.provider === providerName && model.status === 'active');
  }

  /**
   * 获取所有活跃的模型
   */
  async getActiveModels(): Promise<LLMModelConfig[]> {
    await this.ensureCacheValid();
    return Array.from(this.modelsCache.values())
      .filter(model => model.status === 'active');
  }

  /**
   * 验证模型是否可用
   */
  async validateModel(modelId: string): Promise<{
    valid: boolean;
    error?: string;
    provider?: string;
  }> {
    try {
      const config = await this.getLLMCallConfig(modelId);
      return {
        valid: true,
        provider: config.provider.display_name,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 获取默认模型ID
   */
  async getDefaultModelId(): Promise<string | null> {
    await this.ensureCacheValid();
    
    // 优先使用环境变量指定的默认模型
    const envDefaultModel = process.env.DEFAULT_LLM_MODEL_ID;
    if (envDefaultModel && this.modelsCache.has(envDefaultModel)) {
      return envDefaultModel;
    }

    // 查找第一个活跃的模型
    const activeModels = await this.getActiveModels();
    return activeModels.length > 0 ? activeModels[0].id : null;
  }

  /**
   * 刷新缓存
   */
  async refreshCache(): Promise<void> {
    console.log('🔄 刷新LLM配置缓存...');
    
    try {
      // 加载提供商配置
      const { data: providers, error: providersError } = await this.supabase
        .from('api_providers')
        .select('*')
        .eq('status', 'active');

      if (providersError) {
        throw new Error(`加载提供商配置失败: ${providersError.message}`);
      }

      // 加载模型配置
      const { data: models, error: modelsError } = await this.supabase
        .from('models')
        .select('*')
        .eq('status', 'active');

      if (modelsError) {
        throw new Error(`加载模型配置失败: ${modelsError.message}`);
      }

      // 更新缓存
      this.providersCache.clear();
      this.modelsCache.clear();

      providers?.forEach(provider => {
        this.providersCache.set(provider.id, provider as LLMProviderConfig);
      });

      models?.forEach(model => {
        this.modelsCache.set(model.id, model as LLMModelConfig);
      });

      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      
      console.log(`✅ LLM配置缓存已更新: ${providers?.length || 0}个提供商, ${models?.length || 0}个模型`);

    } catch (error) {
      console.error('❌ 刷新LLM配置缓存失败:', error);
      
      // 如果数据库加载失败，使用fallback配置
      this.loadFallbackConfigs();
    }
  }

  /**
   * 加载fallback配置
   */
  private loadFallbackConfigs(): void {
    console.log('⚠️ 使用fallback LLM配置');
    
    // 清空缓存
    this.providersCache.clear();
    this.modelsCache.clear();

    // 添加默认的SiliconFlow提供商
    const siliconflowProvider: LLMProviderConfig = {
      id: 'fallback-siliconflow',
      name: 'siliconflow',
      display_name: 'SiliconFlow (Fallback)',
      provider_type: 'siliconflow',
      base_url: 'https://api.siliconflow.cn/v1',
      api_key_env_var: 'SILICONFLOW_API_KEY',
      default_model: 'deepseek-ai/DeepSeek-V3',
      rate_limit_rpm: 60,
      timeout_ms: 30000,
      status: 'active',
      is_builtin: true,
    };

    // 添加默认模型
    const defaultModel: LLMModelConfig = {
      id: 'fallback-deepseek-v3',
      name: 'deepseek-ai/DeepSeek-V3',
      display_name: 'DeepSeek-V3 (Fallback)',
      provider: 'siliconflow',
      model_name: 'deepseek-ai/DeepSeek-V3',
      max_context_window: 64000,
      status: 'active',
    };

    this.providersCache.set(siliconflowProvider.id, siliconflowProvider);
    this.modelsCache.set(defaultModel.id, defaultModel);
    
    this.cacheExpiry = Date.now() + this.CACHE_TTL;
  }

  /**
   * 确保缓存有效
   */
  private async ensureCacheValid(): Promise<void> {
    if (Date.now() > this.cacheExpiry || this.providersCache.size === 0) {
      await this.refreshCache();
    }
  }

  /**
   * 从环境变量获取API密钥
   */
  private getApiKey(envVar: string): string | null {
    const apiKey = process.env[envVar];
    return apiKey && apiKey.trim() !== '' ? apiKey : null;
  }

  /**
   * 获取配置统计信息
   */
  async getConfigStats(): Promise<{
    providers: number;
    models: number;
    configured_providers: number;
    missing_api_keys: string[];
  }> {
    await this.ensureCacheValid();

    const providers = Array.from(this.providersCache.values());
    const models = Array.from(this.modelsCache.values());
    
    const configuredProviders = providers.filter(provider => 
      this.getApiKey(provider.api_key_env_var) !== null
    );

    const missingApiKeys = providers
      .filter(provider => this.getApiKey(provider.api_key_env_var) === null)
      .map(provider => provider.api_key_env_var);

    return {
      providers: providers.length,
      models: models.length,
      configured_providers: configuredProviders.length,
      missing_api_keys: missingApiKeys,
    };
  }
}

// 导出单例实例
export const llmConfigManager = LLMConfigManager.getInstance();
