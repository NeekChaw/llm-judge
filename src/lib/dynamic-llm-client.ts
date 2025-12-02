/**
 * 动态LLM API调用模块 - 支持基于数据库配置的动态提供商
 * 替换硬编码的提供商支持
 */

import { logger } from '@/lib/monitoring';

export interface LLMRequest {
  model_id: string;
  system_prompt?: string;
  user_prompt: string;
  temperature?: number;
  max_tokens?: number;
  thinking_budget?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  fresh_start?: boolean;
}

export interface LLMResponse {
  content: string;
  reasoning_content?: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string;
  finish_reason: string;
  response_time: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  api_endpoint: string;
  api_key_env_var: string;
  max_context_window?: number;
  input_cost_per_1k_tokens?: number;
  output_cost_per_1k_tokens?: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  display_name: string;
  base_url: string;
  api_key_env_var: string;
  headers?: Record<string, string>;
  auth_type: 'bearer' | 'custom' | 'api_key';
  request_template?: Record<string, any>;
  response_mapping?: Record<string, string>;
  timeout_ms?: number;
  status: 'active' | 'inactive';
}

/**
 * 动态LLM API客户端 - 基于数据库配置
 */
export class DynamicLLMClient {
  private modelConfigs: Map<string, ModelConfig> = new Map();
  private providerConfigs: Map<string, ProviderConfig> = new Map();
  private configsLoaded: boolean = false;
  private loadingPromise: Promise<void> | null = null;

  constructor() {
    this.initializeConfigs();
  }

  private initializeConfigs(): void {
    if (!this.loadingPromise) {
      this.loadingPromise = this.loadConfigurations();
    }
  }

  private async ensureConfigsLoaded(): Promise<void> {
    if (!this.configsLoaded) {
      if (this.loadingPromise) {
        await this.loadingPromise;
      } else {
        await this.loadConfigurations();
      }
    }
  }

  /**
   * 从数据库加载模型和提供商配置
   */
  private async loadConfigurations(): Promise<void> {
    try {
      const { createClient } = await import('@/lib/supabase');
      const supabase = createClient();

      // 同时加载模型配置和提供商配置
      const [modelsResult, providersResult] = await Promise.all([
        supabase
          .from('models')
          .select('id, name, provider, api_endpoint, api_key_env_var, max_context_window, input_cost_per_1k_tokens, output_cost_per_1k_tokens')
          .eq('status', 'active'),
        supabase
          .from('api_providers')
          .select('*')
          .eq('status', 'active')
      ]);

      if (modelsResult.error) throw modelsResult.error;
      if (providersResult.error) throw providersResult.error;

      // 加载提供商配置
      this.providerConfigs.clear();
      providersResult.data?.forEach(provider => {
        this.providerConfigs.set(provider.name, provider);
      });

      // 加载模型配置
      this.modelConfigs.clear();
      modelsResult.data?.forEach(model => {
        const adaptedConfig: ModelConfig = {
          id: model.id,
          name: model.name,
          provider: model.provider,
          api_endpoint: model.api_endpoint,
          api_key_env_var: model.api_key_env_var,
          max_context_window: model.max_context_window,
          input_cost_per_1k_tokens: model.input_cost_per_1k_tokens,
          output_cost_per_1k_tokens: model.output_cost_per_1k_tokens,
        };
        this.modelConfigs.set(adaptedConfig.id, adaptedConfig);
      });

      console.log(`✅ 动态加载: ${providersResult.data?.length} 个提供商, ${modelsResult.data?.length} 个模型`);
      this.configsLoaded = true;

    } catch (error) {
      console.error('❌ 配置加载失败:', error);
      throw new Error(`Failed to load dynamic configurations: ${error.message}`);
    }
  }

  /**
   * 获取API超时配置
   */
  private async getApiTimeout(): Promise<number> {
    try {
      const { systemConfigClient } = await import('@/lib/system-config-client');
      return await systemConfigClient.getApiRequestTimeout();
    } catch (error) {
      console.warn('使用默认超时配置:', error);
      return 900000; // 15分钟
    }
  }

  /**
   * 统一的LLM API调用入口
   */
  async callLLM(request: LLMRequest): Promise<LLMResponse> {
    await this.ensureConfigsLoaded();

    const modelConfig = this.modelConfigs.get(request.model_id);
    if (!modelConfig) {
      // 尝试重新加载配置
      console.log('🔄 模型未找到，尝试重新加载配置...');
      await this.loadConfigurations();
      const reloadedConfig = this.modelConfigs.get(request.model_id);
      if (!reloadedConfig) {
        throw new Error(`Model configuration not found: ${request.model_id}`);
      }
    }

    const finalConfig = this.modelConfigs.get(request.model_id)!;
    const providerConfig = this.getProviderConfig(finalConfig.provider);

    if (!providerConfig) {
      throw new Error(`Provider configuration not found: ${finalConfig.provider}`);
    }

    // 获取API密钥
    const apiKey = process.env[providerConfig.api_key_env_var];
    if (!apiKey) {
      throw new Error(`API key not found in environment: ${providerConfig.api_key_env_var}`);
    }

    // 记录调用开始
    const startTime = Date.now();
    console.log(`🚀 动态API调用: ${providerConfig.display_name}/${finalConfig.name}`);

    // 记录日志
    logger.info('LLM API调用开始', {
      model_id: request.model_id,
      provider: finalConfig.provider,
      prompt_length: request.user_prompt?.length || 0,
      system_prompt_length: request.system_prompt?.length || 0,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      fresh_start: request.fresh_start,
      start_time: new Date(startTime).toISOString()
    });

    try {
      // 使用通用API调用方法
      const response = await this.callGenericAPI(
        finalConfig,
        providerConfig,
        request,
        apiKey
      );

      response.response_time = Date.now() - startTime;

      // 记录成功日志
      logger.info('LLM API调用成功', {
        model_id: request.model_id,
        provider: finalConfig.provider,
        response_time: response.response_time,
        prompt_tokens: response.prompt_tokens,
        completion_tokens: response.completion_tokens,
        total_tokens: response.total_tokens,
        response_length: response.content?.length || 0
      });

      return response;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // 记录失败日志
      logger.error('LLM API调用失败', error, {
        model_id: request.model_id,
        provider: finalConfig.provider,
        response_time: responseTime,
        error_type: error instanceof Error ? error.constructor.name : 'Unknown'
      });

      throw error;
    }
  }

  /**
   * 获取提供商配置（支持名称匹配和别名）
   */
  private getProviderConfig(providerName: string): ProviderConfig | null {
    // 直接匹配
    if (this.providerConfigs.has(providerName)) {
      return this.providerConfigs.get(providerName)!;
    }

    // 通过display_name匹配
    for (const [key, config] of this.providerConfigs) {
      if (config.display_name === providerName) {
        return config;
      }
    }

    // 模糊匹配（处理大小写和变体）
    const normalized = providerName.toLowerCase().trim();
    for (const [key, config] of this.providerConfigs) {
      if (config.name.toLowerCase() === normalized ||
          config.display_name.toLowerCase() === normalized) {
        return config;
      }
    }

    return null;
  }

  /**
   * 通用API调用方法 - 基于OpenAI兼容协议
   */
  private async callGenericAPI(
    modelConfig: ModelConfig,
    providerConfig: ProviderConfig,
    request: LLMRequest,
    apiKey: string
  ): Promise<LLMResponse> {
    const messages = [];
    
    if (request.system_prompt) {
      messages.push({ role: 'system', content: request.system_prompt });
    }
    
    messages.push({ role: 'user', content: request.user_prompt });

    // 构建请求体（基于OpenAI兼容格式）
    const requestBody: any = {
      model: modelConfig.name,
      messages,
      temperature: request.temperature || 0.7,
      ...(request.max_tokens ? { max_tokens: request.max_tokens } : {}),
      ...(request.top_p ? { top_p: request.top_p } : {}),
      ...(request.frequency_penalty ? { frequency_penalty: request.frequency_penalty } : {}),
      ...(request.presence_penalty ? { presence_penalty: request.presence_penalty } : {}),
      stream: false,
    };

    // 支持推理模型的thinking_budget
    if (request.thinking_budget) {
      requestBody.extra_body = {
        thinking_budget: request.thinking_budget
      };
    }

    // 应用提供商特定的请求模板
    if (providerConfig.request_template) {
      Object.assign(requestBody, providerConfig.request_template);
    }

    // 构建API端点
    const apiUrl = this.buildApiEndpoint(providerConfig.base_url, modelConfig.api_endpoint);

    // 构建请求头
    const headers = this.buildHeaders(providerConfig, apiKey);

    // 获取超时配置
    const timeoutMs = providerConfig.timeout_ms || await this.getApiTimeout();
    
    console.log(`🔧 ${providerConfig.display_name} API调用超时: ${timeoutMs}ms`);

    // 使用原生HTTPS请求
    return this.makeHttpsRequest(apiUrl, requestBody, headers, timeoutMs, providerConfig);
  }

  /**
   * 构建API端点URL
   */
  private buildApiEndpoint(baseUrl: string, modelEndpoint?: string): string {
    if (modelEndpoint && modelEndpoint !== baseUrl) {
      return modelEndpoint;
    }
    
    // 确保端点以/chat/completions结尾（OpenAI兼容）
    if (baseUrl.endsWith('/chat/completions')) {
      return baseUrl;
    }
    
    return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  /**
   * 构建请求头
   */
  private buildHeaders(providerConfig: ProviderConfig, apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'AI-Benchmark-Dynamic-Client/1.0',
      ...providerConfig.headers || {}
    };

    // 根据认证类型设置Authorization头
    switch (providerConfig.auth_type) {
      case 'bearer':
      default:
        headers.Authorization = `Bearer ${apiKey}`;
        break;
      case 'api_key':
        headers['X-API-Key'] = apiKey;
        break;
      case 'custom':
        // 自定义认证在headers中已定义
        if (!headers.Authorization && !headers['X-API-Key']) {
          headers.Authorization = `Bearer ${apiKey}`;
        }
        break;
    }

    return headers;
  }

  /**
   * 执行HTTPS请求
   */
  private async makeHttpsRequest(
    apiUrl: string,
    requestBody: any,
    headers: Record<string, string>,
    timeoutMs: number,
    providerConfig: ProviderConfig
  ): Promise<LLMResponse> {
    const https = require('https');
    const { URL } = require('url');
    
    const url = new URL(apiUrl);
    const postData = JSON.stringify(requestBody);
    
    // 添加Content-Length
    headers['Content-Length'] = Buffer.byteLength(postData).toString();

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers,
        timeout: timeoutMs,
      }, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`${providerConfig.display_name} API error: ${res.statusCode} ${responseData}`));
              return;
            }
            
            const data = JSON.parse(responseData);
            
            // 应用响应映射（如果配置了的话）
            const response = this.mapResponse(data, providerConfig);
            
            resolve({
              content: response.content,
              reasoning_content: response.reasoning_content,
              prompt_tokens: response.prompt_tokens || 0,
              completion_tokens: response.completion_tokens || 0,
              total_tokens: response.total_tokens || 0,
              model: response.model || requestBody.model,
              finish_reason: response.finish_reason || 'stop',
              response_time: 0, // 将在调用处设置
            });
            
          } catch (parseError) {
            reject(new Error(`Response parsing error: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`HTTPS request error: ${error.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      });
      
      req.write(postData);
      req.end();
    });
  }

  /**
   * 映射响应格式（处理不同提供商的响应差异）
   */
  private mapResponse(data: any, providerConfig: ProviderConfig): any {
    // 如果配置了响应映射，使用自定义映射
    if (providerConfig.response_mapping && Object.keys(providerConfig.response_mapping).length > 0) {
      const mapped = {};
      Object.entries(providerConfig.response_mapping).forEach(([key, path]) => {
        mapped[key] = this.getNestedValue(data, path as string);
      });
      return mapped;
    }

    // 默认使用OpenAI兼容格式
    return {
      content: data.choices?.[0]?.message?.content || '',
      reasoning_content: data.choices?.[0]?.message?.reasoning_content,
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
      total_tokens: data.usage?.total_tokens || 0,
      model: data.model,
      finish_reason: data.choices?.[0]?.finish_reason || 'stop'
    };
  }

  /**
   * 从嵌套对象中获取值
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * 强制重新加载配置
   */
  async reloadConfigurations(): Promise<void> {
    console.log('🔄 强制重新加载动态配置...');
    this.configsLoaded = false;
    this.loadingPromise = null;
    this.modelConfigs.clear();
    this.providerConfigs.clear();
    await this.loadConfigurations();
  }

  /**
   * 获取支持的提供商列表
   */
  async getSupportedProviders(): Promise<ProviderConfig[]> {
    await this.ensureConfigsLoaded();
    return Array.from(this.providerConfigs.values());
  }

  /**
   * 获取模型配置
   */
  async getModelConfig(modelId: string): Promise<ModelConfig | undefined> {
    await this.ensureConfigsLoaded();
    return this.modelConfigs.get(modelId);
  }

  /**
   * 成本估算
   */
  estimateCost(modelId: string, promptTokens: number, completionTokens: number): number {
    const config = this.modelConfigs.get(modelId);
    if (!config) return 0;

    const inputCost = (config.input_cost_per_1k_tokens || 0) * (promptTokens / 1000);
    const outputCost = (config.output_cost_per_1k_tokens || 0) * (completionTokens / 1000);
    return inputCost + outputCost;
  }
}

// 导出单例实例
export const dynamicLLMClient = new DynamicLLMClient();