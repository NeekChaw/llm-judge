/**
 * LLM API调用模块 - 动态提供商支持
 * 基于数据库配置自动支持所有Web界面添加的提供商
 * 替换原有硬编码提供商架构
 */

import { logger } from '@/lib/monitoring';
import type { ContentAttachment } from '@/types/multimodal';
import { createClient } from '@/lib/supabase';
import { decrypt } from '@/lib/encryption';

export interface LLMRequest {
  model_id: string;
  system_prompt?: string;
  user_prompt: string;
  temperature?: number;
  max_tokens?: number;
  thinking_budget?: number; // 新增：推理模型的思维链Token预算
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  fresh_start?: boolean; // 新增：支持Legacy模型的fresh_start参数
  disable_enable_thinking?: boolean; // 🆕 禁用enable_thinking参数，用于解决提供商兼容性问题

  // 🆕 多模态支持
  attachments?: ContentAttachment[];  // 附件列表（图片、音频等）
  messages?: any[];                   // 多模态消息数组（可选，用于OpenAI格式）
}

export interface LLMResponse {
  content: string;
  reasoning_content?: string; // 新增：推理模型的思维链内容（不收集，仅用于调试）
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
  cost_currency?: 'USD' | 'CNY';
  // 🆕 Phase 2: 多提供商成本管理字段
  provider_input_cost_per_1k_tokens?: number;
  provider_output_cost_per_1k_tokens?: number;
  provider_cost_currency?: 'USD' | 'CNY';
  // 多厂商架构字段
  logical_name?: string;
  vendor_name?: string;
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
export class LLMClient {
  private modelConfigs: Map<string, ModelConfig> = new Map();
  private providerConfigs: Map<string, ProviderConfig> = new Map();
  private configsLoaded: boolean = false;
  private loadingPromise: Promise<void> | null = null;

  constructor() {
    // 初始化时开始加载模型配置，但不等待完成
    this.initializeConfigs();
  }

  /**
   * 初始化配置（异步）
   */
  private initializeConfigs(): void {
    if (!this.loadingPromise) {
      this.loadingPromise = this.loadConfigurations();
    }
  }

  /**
   * 确保配置已加载
   */
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
   * 强制重新加载模型配置（用于处理动态添加的模型）
   */
  public async reloadModelConfigs(): Promise<void> {
    console.log('🔄 强制重新加载动态配置...');
    this.configsLoaded = false;
    this.loadingPromise = null;
    this.modelConfigs.clear();
    this.providerConfigs.clear();
    await this.loadConfigurations();
  }

  /**
   * 🔐 获取API密钥 - 支持环境变量和数据库加密存储
   *
   * 优先级：
   * 1. 环境变量（向后兼容）
   * 2. 数据库加密存储（关联provider_id）
   *
   * @param apiKeyEnvVar 环境变量名称
   * @param providerId 提供商ID（可选，用于从数据库查找）
   * @param modelId 模型ID（用于日志记录）
   * @returns API密钥明文
   */
  private async getApiKey(
    apiKeyEnvVar: string,
    providerId?: string,
    modelId?: string
  ): Promise<string> {
    // 1. 优先检查环境变量（向后兼容）
    const envKey = process.env[apiKeyEnvVar];
    if (envKey) {
      console.log(`🔑 使用环境变量API密钥: ${apiKeyEnvVar} (模型: ${modelId || 'unknown'})`);
      return envKey;
    }

    // 2. 如果没有环境变量，尝试从数据库读取
    if (!providerId) {
      const error = `API key not found in environment variable: ${apiKeyEnvVar}, and no provider_id provided for database lookup`;
      logger.error('LLM API密钥错误', new Error(error), {
        model_id: modelId,
        env_var: apiKeyEnvVar,
      });
      throw new Error(error);
    }

    try {
      console.log(`🔍 从数据库查找API密钥 (provider_id: ${providerId}, 模型: ${modelId || 'unknown'})`);

      const supabase = createClient();

      // 查询该提供商的active状态密钥，按created_at降序（最新优先）
      const { data: apiKeys, error: fetchError } = await supabase
        .from('api_keys')
        .select('id, key_value_encrypted, key_name, usage_count, quota_limit, last_used_at')
        .eq('provider_id', providerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      if (fetchError) {
        throw new Error(`Database query failed: ${fetchError.message}`);
      }

      if (!apiKeys || apiKeys.length === 0) {
        const error = `No active API key found in database for provider_id: ${providerId}`;
        logger.error('LLM API密钥错误', new Error(error), {
          model_id: modelId,
          provider_id: providerId,
        });
        throw new Error(error);
      }

      const apiKey = apiKeys[0];
      console.log(`✅ 找到数据库密钥: ${apiKey.key_name} (使用次数: ${apiKey.usage_count})`);

      // 检查配额限制
      if (apiKey.quota_limit && apiKey.usage_count >= apiKey.quota_limit) {
        const error = `API key quota exceeded: ${apiKey.key_name} (${apiKey.usage_count}/${apiKey.quota_limit})`;
        logger.warn('LLM API密钥配额超限', {
          key_id: apiKey.id,
          key_name: apiKey.key_name,
          usage_count: apiKey.usage_count,
          quota_limit: apiKey.quota_limit,
        });
        throw new Error(error);
      }

      // 解密密钥
      let decryptedKey: string;
      try {
        decryptedKey = decrypt(apiKey.key_value_encrypted);
      } catch (decryptError) {
        const error = `Failed to decrypt API key: ${apiKey.key_name}`;
        logger.error('LLM API密钥解密失败', decryptError as Error, {
          key_id: apiKey.id,
          key_name: apiKey.key_name,
        });
        throw new Error(error);
      }

      // 异步更新使用统计（不等待完成，避免影响性能）
      this.updateApiKeyUsage(apiKey.id).catch(error => {
        logger.warn('更新API密钥使用统计失败', {
          key_id: apiKey.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      return decryptedKey;
    } catch (error) {
      if (error instanceof Error && error.message.includes('API key')) {
        throw error; // 重新抛出已格式化的错误
      }

      const formattedError = `Failed to retrieve API key from database: ${error instanceof Error ? error.message : String(error)}`;
      logger.error('LLM API密钥数据库查询失败', error as Error, {
        model_id: modelId,
        provider_id: providerId,
      });
      throw new Error(formattedError);
    }
  }

  /**
   * 🔐 更新API密钥使用统计
   *
   * @param keyId API密钥ID
   */
  private async updateApiKeyUsage(keyId: string): Promise<void> {
    try {
      const supabase = createClient();

      // 先获取当前值
      const { data: currentKey, error: fetchError } = await supabase
        .from('api_keys')
        .select('usage_count')
        .eq('id', keyId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // 更新使用统计
      const { error: updateError } = await supabase
        .from('api_keys')
        .update({
          usage_count: (currentKey?.usage_count || 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', keyId);

      if (updateError) {
        throw updateError;
      }

      console.log(`📊 已更新密钥使用统计 (key_id: ${keyId})`);
    } catch (error) {
      // 不抛出错误，只记录警告
      console.warn(`⚠️  更新密钥使用统计失败 (key_id: ${keyId}):`, error);
    }
  }

  /**
   * 🆕 错误驱动的推理参数重试机制
   */
  private async callGenericAPIWithReasoningRetry(
    modelConfig: ModelConfig,
    providerConfig: ProviderConfig,
    request: LLMRequest,
    apiKey: string
  ): Promise<LLMResponse> {
    try {
      // 第一次尝试：正常调用
      return await this.callGenericAPI(modelConfig, providerConfig, request, apiKey);
      
    } catch (error) {
      // 🔧 检查是否为推理参数相关的错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isReasoningMandatoryError = this.isReasoningMandatoryError(errorMessage);
      
      // 只有在禁用了推理参数且遇到强制推理错误时才重试
      if (request.disable_enable_thinking && isReasoningMandatoryError && (request as any).__original_reasoning) {
        console.log(`🔄 检测到强制推理错误，自动重试一次 (${providerConfig.display_name})`);
        console.log(`📋 错误信息: ${errorMessage}`);
        
        // 创建重试请求：恢复最小推理配置
        const retryRequest = { ...request };
        delete retryRequest.disable_enable_thinking; // 取消禁用标志
        
        // 准备最小推理配置
        const originalReasoning = (request as any).__original_reasoning;
        const minimalReasoning = this.createMinimalReasoningConfig(originalReasoning);
        
        console.log(`🔧 使用最小推理配置重试: ${JSON.stringify(minimalReasoning)}`);
        
        // 🆕 特殊处理：手动添加reasoning参数到请求体
        (retryRequest as any).__force_reasoning = minimalReasoning;
        
        try {
          const retryResponse = await this.callGenericAPI(modelConfig, providerConfig, retryRequest, apiKey);
          console.log(`✅ 推理参数重试成功 (${providerConfig.display_name})`);
          return retryResponse;
          
        } catch (retryError) {
          console.log(`❌ 推理参数重试仍然失败 (${providerConfig.display_name}):`, retryError instanceof Error ? retryError.message : retryError);
          // 抛出原始错误，因为重试也失败了
          throw error;
        }
      } else {
        // 不是推理参数问题，或者没有禁用推理参数，直接抛出原始错误
        throw error;
      }
    }
  }

  /**
   * 🔧 检查错误信息是否表明推理参数是强制性的
   */
  private isReasoningMandatoryError(errorMessage: string): boolean {
    const reasoningErrorPatterns = [
      'reasoning is mandatory',
      'reasoning.*cannot be disabled',
      'reasoning.*required',
      'must include reasoning',
      'reasoning parameter.*mandatory',
      'reasoning.*must be provided'
    ];
    
    const lowerErrorMessage = errorMessage.toLowerCase();
    return reasoningErrorPatterns.some(pattern => 
      new RegExp(pattern).test(lowerErrorMessage)
    );
  }

  /**
   * 🔧 创建最小推理配置
   */
  private createMinimalReasoningConfig(originalReasoning: any): any {
    if (!originalReasoning) {
      return { enabled: true, effort: 'low' };
    }
    
    // 保持原有结构，但使用最小参数
    if (originalReasoning.max_tokens) {
      return {
        enabled: true,
        max_tokens: Math.min(originalReasoning.max_tokens, 1000) // 限制在1000以内
      };
    } else if (originalReasoning.effort) {
      return {
        enabled: true,
        effort: 'low' // 强制使用最低effort
      };
    } else {
      return { enabled: true, effort: 'low' };
    }
  }

  /**
   * 🆕 获取API请求超时时间
   */
  private async getApiTimeout(): Promise<number> {
    try {
      const { systemConfigClient } = await import('@/lib/system-config-client');
      const timeout = await systemConfigClient.getApiRequestTimeout();
      console.log(`✅ 使用系统配置的API超时: ${timeout}ms (${Math.round(timeout/1000)}秒)`);
      return timeout;
    } catch (error) {
      console.warn('❌ 获取API超时配置失败，使用默认值:', error);
      // 🔧 修改为15分钟，与系统配置保持一致
      const defaultTimeout = 900000; // 15分钟 (900000ms)
      console.warn(`⚠️ 使用fallback超时配置: ${defaultTimeout}ms (${Math.round(defaultTimeout/1000)}秒)`);
      return defaultTimeout;
    }
  }

  /**
   * 调用LLM API
   */
  async callLLM(request: LLMRequest): Promise<LLMResponse> {
    // 确保配置已加载
    await this.ensureConfigsLoaded();
    const startTime = Date.now();
    const timeoutMs = await this.getApiTimeout();
    const timeoutSeconds = Math.round(timeoutMs / 1000);
    const { logger } = await import('@/lib/monitoring');

    // 🔧 处理fresh_start参数 - 对于Legacy模型的兼容性支持
    if (request.fresh_start) {
      console.log(`🔄 Legacy模型fresh_start模式: ${request.model_id} - 清理潜在的缓存状态`);
      // 注意：对于传统LLMClient，fresh_start主要用于日志记录和调试
      // 实际的状态重置在multi-vendor架构中处理
    }

    // 🔍 调试：检查attachments传递
    console.log(`🔍 LLM Client 收到的 attachments:`, request.attachments ? `${request.attachments.length} 个` : 'undefined');
    if (request.attachments?.length) {
      request.attachments.forEach((att, i) => {
        console.log(`  ${i + 1}. ${att.type}: ${att.url}`);
      });
    }

    // 🆕 检测多模态请求
    const hasAttachments = request.attachments && request.attachments.length > 0;
    if (hasAttachments) {
      console.log(`🖼️ 检测到多模态请求，附件数量: ${request.attachments!.length}`);
      console.log(`📎 附件类型: ${request.attachments!.map(att => att.type).join(', ')}`);
      return this.callMultimodalLLM(request);
    }

    // 记录API调用开始
    logger.info('LLM API调用开始', {
      model_id: request.model_id,
      prompt_length: request.user_prompt?.length || 0,
      system_prompt_length: request.system_prompt?.length || 0,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      fresh_start: request.fresh_start,
      timeout_seconds: timeoutSeconds,
      start_time: new Date(startTime).toISOString(),
      has_attachments: hasAttachments,
      attachment_count: request.attachments?.length || 0
    });
    
    console.log(`🚀 开始 LLM API 调用: ${request.model_id}, fresh_start: ${request.fresh_start || false}, 超时设置: ${timeoutSeconds}秒 (${timeoutMs}ms)`);;

    let modelConfig = this.modelConfigs.get(request.model_id);
    
    // 如果找不到模型配置，尝试重新加载一次（处理动态添加的模型）
    if (!modelConfig) {
      console.log(`⚠️  模型配置未找到: ${request.model_id}，尝试重新加载配置...`);
      await this.reloadModelConfigs();
      modelConfig = this.modelConfigs.get(request.model_id);
      
      if (!modelConfig) {
        const error = `Model configuration not found: ${request.model_id}`;
        logger.error('LLM API配置错误', new Error(error), { 
          model_id: request.model_id,
          available_models: Array.from(this.modelConfigs.keys()).slice(0, 5) // 显示前5个可用模型
        });
        throw new Error(error);
      } else {
        console.log(`✅ 重新加载后找到模型配置: ${request.model_id}`);
      }
    }

    // 🆕 使用动态提供商架构
    const providerConfig = this.getProviderConfig(modelConfig.provider);

    if (!providerConfig) {
      const error = `Provider configuration not found: ${modelConfig.provider}`;
      logger.error('LLM API提供商配置未找到', new Error(error), {
        model_id: request.model_id,
        provider: modelConfig.provider,
        available_providers: Array.from(this.providerConfigs.keys())
      });
      throw new Error(error);
    }

    // 🔐 获取API密钥（支持环境变量和数据库加密存储）
    const apiKey = await this.getApiKey(
      modelConfig.api_key_env_var,
      providerConfig.id,
      request.model_id
    );

    try {
      let response: LLMResponse;

      console.log(`🚀 动态API调用: ${providerConfig.display_name}/${modelConfig.name}`);
      
      // 🆕 使用错误驱动重试的通用动态API调用
      response = await this.callGenericAPIWithReasoningRetry(modelConfig, providerConfig, request, apiKey);

      response.response_time = Date.now() - startTime;

      // 记录API调用成功
      logger.info('LLM API调用成功', {
        model_id: request.model_id,
        provider: modelConfig.provider,
        response_time: response.response_time,
        prompt_tokens: response.prompt_tokens,
        completion_tokens: response.completion_tokens,
        total_tokens: response.total_tokens,
        response_length: response.content?.length || 0
      });

      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const responseTimeSeconds = (responseTime / 1000).toFixed(2);
      const isTimeout = error instanceof Error && 
        (error.message.includes('timeout') || error.message.includes('aborted') || 
         error.name === 'AbortError' || error.name === 'TimeoutError');
      
      let errorMessage = `LLM API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      
      // 增强超时错误信息
      if (isTimeout) {
        errorMessage = `LLM API 调用超时 (运行了 ${responseTimeSeconds}秒，超时限制: ${timeoutSeconds}秒): ${error instanceof Error ? error.message : 'Unknown timeout'}`;
        console.error(`⏰ API 调用超时详情:`);
        console.error(`   模型: ${request.model_id}`);
        console.error(`   实际运行时间: ${responseTimeSeconds}秒`);
        console.error(`   超时设置: ${timeoutSeconds}秒`);
        console.error(`   开始时间: ${new Date(startTime).toLocaleTimeString()}`);
        console.error(`   结束时间: ${new Date().toLocaleTimeString()}`);
      } else {
        console.error(`❌ API 调用失败 (运行了 ${responseTimeSeconds}秒): ${request.model_id}`);
      }

      // 记录API调用失败
      logger.error('LLM API调用失败', error, {
        model_id: request.model_id,
        provider: modelConfig?.provider || 'unknown',
        response_time: responseTime,
        response_time_seconds: parseFloat(responseTimeSeconds),
        timeout_seconds: timeoutSeconds,
        timeout_ms: timeoutMs,
        is_timeout: isTimeout,
        error_type: error instanceof Error ? error.constructor.name : 'Unknown',
        start_time: new Date(startTime).toISOString(),
        end_time: new Date().toISOString()
      });

      throw new Error(errorMessage);
    }
  }

  /**
   * 调用OpenAI API
   */
  private async callOpenAI(
    config: ModelConfig,
    request: LLMRequest,
    apiKey: string
  ): Promise<LLMResponse> {
    const messages = [];
    
    if (request.system_prompt) {
      messages.push({ role: 'system', content: request.system_prompt });
    }
    
    messages.push({ role: 'user', content: request.user_prompt });

    const requestBody = {
      model: config.name,
      messages,
      temperature: request.temperature || 0.7,
      // 🔧 修复：只有明确提供max_tokens时才包含该字段，支持真正的无限制模式
      ...(request.max_tokens ? { max_tokens: request.max_tokens } : {}),
      ...(request.top_p ? { top_p: request.top_p } : {}),
      ...(request.frequency_penalty ? { frequency_penalty: request.frequency_penalty } : {}),
      ...(request.presence_penalty ? { presence_penalty: request.presence_penalty } : {}),
    };

    // 🔧 修复：确保OpenAI API端点包含正确的路径
    const apiUrl = config.api_endpoint.endsWith('/chat/completions')
      ? config.api_endpoint
      : `${config.api_endpoint}/chat/completions`;

    // 🔥 终极解决方案：使用Node.js原生https模块，完全绕过undici系统
    const https = require('https');
    const { URL } = require('url');
    const timeoutMs = await this.getApiTimeout();
    console.log(`🔧 OpenAI API调用超时设置: ${timeoutMs}ms (${timeoutMs/1000}秒) [使用原生HTTPS]`);
    
    const url = new URL(apiUrl);
    const postData = JSON.stringify(requestBody);
    
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: timeoutMs,
      }, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`OpenAI API error: ${res.statusCode} ${responseData}`));
              return;
            }
            
            const data = JSON.parse(responseData);
            
            // 增强对推理模型的支持
            const message = data.choices[0].message;
            let content = message.content;
            let reasoning_content = message.reasoning_content || message.reasoning;
            
            // 🔧 特殊处理：如果content为空但reasoning有内容，使用reasoning作为主要内容
            if (!content && reasoning_content && typeof reasoning_content === 'string') {
              console.log('🔧 检测到reasoning字段包含内容，将其作为主要回答内容');
              content = reasoning_content;
            }
            
            resolve({
              content,
              reasoning_content,
              prompt_tokens: data.usage?.prompt_tokens || 0,
              completion_tokens: data.usage?.completion_tokens || 0,
              total_tokens: data.usage?.total_tokens || 0,
              model: data.model,
              finish_reason: data.choices[0].finish_reason,
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
   * 调用Anthropic API
   */
  private async callAnthropic(
    config: ModelConfig,
    request: LLMRequest,
    apiKey: string
  ): Promise<LLMResponse> {
    const requestBody = {
      model: config.name,
      system: request.system_prompt,
      messages: [{ role: 'user', content: request.user_prompt }],
      temperature: request.temperature || 0.7,
      // 🔧 修复：只有明确提供max_tokens时才包含该字段，支持真正的无限制模式
      ...(request.max_tokens ? { max_tokens: request.max_tokens } : {}),
    };

    // 🔧 修复：确保Anthropic API端点包含正确的路径
    const apiUrl = config.api_endpoint.endsWith('/messages')
      ? config.api_endpoint
      : `${config.api_endpoint}/v1/messages`;

    // 🔥 终极解决方案：使用Node.js原生https模块，完全绕过undici系统
    const https = require('https');
    const { URL } = require('url');
    const timeoutMs = await this.getApiTimeout();
    console.log(`🔧 Anthropic API调用超时设置: ${timeoutMs}ms (${timeoutMs/1000}秒) [使用原生HTTPS]`);
    
    const url = new URL(apiUrl);
    const postData = JSON.stringify(requestBody);
    
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: timeoutMs,
      }, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`Anthropic API error: ${res.statusCode} ${responseData}`));
              return;
            }
            
            const data = JSON.parse(responseData);
            
            resolve({
              content: data.content[0].text,
              prompt_tokens: data.usage.input_tokens,
              completion_tokens: data.usage.output_tokens,
              total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
              model: data.model,
              finish_reason: data.stop_reason,
              response_time: 0,
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
   * 智能计算最佳Token限制
   * 基于任务复杂度和模型能力动态分配
   */
  private getOptimalMaxTokens(request: LLMRequest, config: ModelConfig): number {
    const userPrompt = request.user_prompt || '';
    const systemPrompt = request.system_prompt || '';
    
    // 基础Token分析
    const promptLength = userPrompt.length + systemPrompt.length;
    const modelMaxTokens = config.max_context_window || 4096;
    
    // 任务复杂度检测
    const complexityScore = this.assessTaskComplexity(userPrompt);
    
    // 智能分配策略
    let optimalTokens = 2000; // 基础值，比原来的1000更合理
    
    // 基于复杂度调整
    if (complexityScore >= 0.8) {
      // 极高复杂度：代码生成、HTML页面等
      optimalTokens = Math.min(12000, modelMaxTokens * 0.4);
    } else if (complexityScore >= 0.6) {
      // 高复杂度：长文档、复杂分析
      optimalTokens = Math.min(6000, modelMaxTokens * 0.3);
    } else if (complexityScore >= 0.4) {
      // 中等复杂度：详细解释、代码片段
      optimalTokens = Math.min(4000, modelMaxTokens * 0.2);
    } else {
      // 低复杂度：简单问答
      optimalTokens = Math.min(2000, modelMaxTokens * 0.1);
    }
    
    // 基于prompt长度的二次调整
    if (promptLength > 2000) {
      optimalTokens = Math.min(optimalTokens * 1.5, modelMaxTokens * 0.5);
    }
    
    // 确保不超过模型上下文限制的70%
    const maxSafeTokens = Math.floor(modelMaxTokens * 0.7);
    optimalTokens = Math.min(optimalTokens, maxSafeTokens);
    
    console.log(`📊 智能Token分配: 复杂度=${complexityScore.toFixed(2)}, 分配=${optimalTokens}, 模型上限=${modelMaxTokens}`);
    
    return optimalTokens;
  }
  
  /**
   * 评估任务复杂度
   * 返回0-1的分数，1表示最复杂
   */
  private assessTaskComplexity(prompt: string): number {
    let score = 0;
    const lowerPrompt = prompt.toLowerCase();
    
    // 代码生成相关关键词（高权重）
    const codeKeywords = [
      'html', 'javascript', 'css', 'three.js', 'react', 'vue', 'angular',
      'python', 'java', 'c++', 'golang', 'rust', 'typescript',
      '创建页面', '生成代码', '编写程序', '实现功能', '开发',
      'function', 'class', 'component', 'api', 'database'
    ];
    
    // 复杂任务关键词（中等权重）
    const complexKeywords = [
      '详细', '完整', '全面', '系统', '架构', '设计', '分析', '报告',
      '比较', '对比', '评估', '优化', '解决方案', 'comprehensive', 'detailed', 'complete'
    ];
    
    // 长文档指示词（中等权重）
    const lengthKeywords = [
      '文档', '教程', '指南', '手册', '说明书', '介绍',
      'tutorial', 'guide', 'manual', 'documentation', 'explanation'
    ];
    
    // 统计关键词出现次数
    codeKeywords.forEach(keyword => {
      if (lowerPrompt.includes(keyword)) {
        score += 0.15; // 代码相关权重最高
      }
    });
    
    complexKeywords.forEach(keyword => {
      if (lowerPrompt.includes(keyword)) {
        score += 0.08;
      }
    });
    
    lengthKeywords.forEach(keyword => {
      if (lowerPrompt.includes(keyword)) {
        score += 0.05;
      }
    });
    
    // 基于prompt长度的复杂度加权
    if (prompt.length > 500) score += 0.1;
    if (prompt.length > 1000) score += 0.1;
    if (prompt.length > 2000) score += 0.1;
    
    // 特殊模式检测
    if (lowerPrompt.includes('创建') && lowerPrompt.includes('web') && lowerPrompt.includes('页面')) {
      score += 0.3; // Web页面生成是高复杂度任务
    }
    
    if (lowerPrompt.includes('科技感') || lowerPrompt.includes('监控系统') || lowerPrompt.includes('3d')) {
      score += 0.2; // 复杂UI/可视化任务
    }
    
    // 限制在0-1范围内
    return Math.min(score, 1.0);
  }

  /**
   * 标准化提供商名称（支持中英文映射）
   */
  private normalizeProviderName(provider: string): string {
    const providerMapping: Record<string, string> = {
      // 中文名称映射
      '硅基流动': 'siliconflow',
      'OpenAI': 'openai',
      'Anthropic': 'anthropic',
      'DeepSeek': 'openai', // 🔧 DeepSeek使用OpenAI兼容协议
      '月之暗面': 'openai', // 🔧 Moonshot使用OpenAI兼容协议
      '火山方舟': 'volcengine',
      '豆包': 'volcengine',
      '智谱': 'zhipu', // 🆕 智谱GLM支持

      // 英文名称映射（保持兼容性）
      'siliconflow': 'siliconflow',
      'openai': 'openai',
      'anthropic': 'anthropic',
      'deepseek': 'openai', // 🔧 DeepSeek使用OpenAI兼容协议
      'moonshot': 'openai', // 🔧 Moonshot使用OpenAI兼容协议
      'volcengine': 'volcengine',
      'volces': 'volcengine',
      'doubao': 'volcengine',
      
      // 大小写变体
      'SiliconFlow': 'siliconflow',
      'OPENAI': 'openai',
      'ANTHROPIC': 'anthropic',
      'DEEPSEEK': 'openai', // 🔧 DeepSeek使用OpenAI兼容协议
      
      // OpenRouter兼容性（使用OpenAI协议）
      'OpenRouter': 'openai',
      'openrouter': 'openai'
    };

    const normalized = providerMapping[provider] || provider.toLowerCase();
    
    // 记录映射过程以便调试
    if (provider !== normalized) {
      console.log(`🔄 Provider name mapped: "${provider}" -> "${normalized}"`);
    }
    
    return normalized;
  }

  /**
   * 调用硅基流动API
   */
  private async callSiliconFlow(
    config: ModelConfig,
    request: LLMRequest,
    apiKey: string
  ): Promise<LLMResponse> {
    const messages = [];
    
    if (request.system_prompt) {
      messages.push({ role: 'system', content: request.system_prompt });
    }
    
    messages.push({ role: 'user', content: request.user_prompt });

    const requestBody: any = {
      model: config.name,
      messages,
      temperature: request.temperature || 0.7,
      // 🔧 修复：只有明确提供max_tokens时才包含该字段，支持真正的无限制模式
      ...(request.max_tokens ? { max_tokens: request.max_tokens } : {}),
      ...(request.top_p ? { top_p: request.top_p } : {}),
      stream: false,
    };

    // 🆕 支持推理模型的thinking_budget参数
    if (request.thinking_budget) {
      requestBody.extra_body = {
        thinking_budget: request.thinking_budget
      };
    }

    // 🔧 修复：确保SiliconFlow API端点包含正确的路径
    const apiUrl = config.api_endpoint.endsWith('/chat/completions')
      ? config.api_endpoint
      : `${config.api_endpoint}/chat/completions`;

    // 🔥 终极解决方案：使用Node.js原生https模块，完全绕过undici系统
    const https = require('https');
    const { URL } = require('url');
    const timeoutMs = await this.getApiTimeout();
    console.log(`🔧 SiliconFlow API调用超时设置: ${timeoutMs}ms (${timeoutMs/1000}秒) [使用原生HTTPS]`);
    
    const url = new URL(apiUrl);
    const postData = JSON.stringify(requestBody);
    
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: timeoutMs, // 原生Node.js超时，不受undici影响
      }, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`SiliconFlow API error: ${res.statusCode} ${responseData}`));
              return;
            }
            
            const data = JSON.parse(responseData);
            
            // 增强对推理模型的支持
            const message = data.choices[0].message;
            let content = message.content;
            let reasoning_content = message.reasoning_content || message.reasoning;
            
            // 🔧 特殊处理：如果content为空但reasoning有内容，使用reasoning作为主要内容
            if (!content && reasoning_content && typeof reasoning_content === 'string') {
              console.log('🔧 检测到reasoning字段包含内容，将其作为主要回答内容');
              content = reasoning_content;
            }
            
            resolve({
              content,
              reasoning_content,
              prompt_tokens: data.usage?.prompt_tokens || 0,
              completion_tokens: data.usage?.completion_tokens || 0,
              total_tokens: data.usage?.total_tokens || 0,
              model: data.model,
              finish_reason: data.choices[0].finish_reason,
              response_time: 0,
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
   * 调用火山方舟API
   */
  private async callVolcengine(
    config: ModelConfig,
    request: LLMRequest,
    apiKey: string
  ): Promise<LLMResponse> {
    const messages = [];

    if (request.system_prompt) {
      messages.push({ role: 'system', content: request.system_prompt });
    }

    messages.push({ role: 'user', content: request.user_prompt });

    const requestBody = {
      model: config.name,
      messages,
      temperature: request.temperature || 0.7,
      // 🔧 修复：只有明确提供max_tokens时才包含该字段，支持真正的无限制模式
      ...(request.max_tokens ? { max_tokens: request.max_tokens } : {}),
      ...(request.top_p ? { top_p: request.top_p } : {}),
      stream: false,
    };

    // 🔧 修复：确保火山方舟API端点包含正确的路径
    const apiUrl = config.api_endpoint.endsWith('/chat/completions')
      ? config.api_endpoint
      : `${config.api_endpoint}/chat/completions`;

    // 🔥 终极解决方案：使用Node.js原生https模块，完全绕过undici系统
    const https = require('https');
    const { URL } = require('url');
    const timeoutMs = await this.getApiTimeout();
    console.log(`🔧 Volcengine API调用超时设置: ${timeoutMs}ms (${timeoutMs/1000}秒) [使用原生HTTPS]`);
    
    const url = new URL(apiUrl);
    const postData = JSON.stringify(requestBody);
    
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: timeoutMs,
      }, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`Volcengine API error: ${res.statusCode} ${responseData}`));
              return;
            }
            
            const data = JSON.parse(responseData);
            
            // 增强对推理模型的支持
            const message = data.choices[0].message;
            let content = message.content;
            let reasoning_content = message.reasoning_content || message.reasoning;
            
            // 🔧 特殊处理：如果content为空但reasoning有内容，使用reasoning作为主要内容
            if (!content && reasoning_content && typeof reasoning_content === 'string') {
              console.log('🔧 检测到reasoning字段包含内容，将其作为主要回答内容');
              content = reasoning_content;
            }
            
            resolve({
              content,
              reasoning_content,
              prompt_tokens: data.usage?.prompt_tokens || 0,
              completion_tokens: data.usage?.completion_tokens || 0,
              total_tokens: data.usage?.total_tokens || 0,
              model: data.model,
              finish_reason: data.choices[0].finish_reason,
              response_time: 0,
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
   * 调用智谱GLM API
   */
  private async callZhipu(
    config: ModelConfig,
    request: LLMRequest,
    apiKey: string
  ): Promise<LLMResponse> {
    const messages = [];
    
    if (request.system_prompt) {
      messages.push({ role: 'system', content: request.system_prompt });
    }
    
    messages.push({ role: 'user', content: request.user_prompt });

    const requestBody: any = {
      model: config.name,
      messages,
      temperature: request.temperature || 0.7,
      // 🔧 修复：只有明确提供max_tokens时才包含该字段，支持真正的无限制模式
      ...(request.max_tokens ? { max_tokens: request.max_tokens } : {}),
      ...(request.top_p ? { top_p: request.top_p } : {}),
      stream: false,
    };

    // 🆕 支持推理模型的thinking_budget参数（智谱GLM-4可能支持类似功能）
    if (request.thinking_budget) {
      requestBody.extra_body = {
        thinking_budget: request.thinking_budget
      };
    }

    // 智谱GLM API端点通常是 /api/paas/v4/chat/completions
    const apiUrl = config.api_endpoint.endsWith('/chat/completions')
      ? config.api_endpoint
      : `${config.api_endpoint}/chat/completions`;

    // 使用Node.js原生https模块
    const https = require('https');
    const { URL } = require('url');
    const timeoutMs = await this.getApiTimeout();
    console.log(`🔧 Zhipu API调用超时设置: ${timeoutMs}ms (${timeoutMs/1000}秒) [使用原生HTTPS]`);
    
    const url = new URL(apiUrl);
    const postData = JSON.stringify(requestBody);
    
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: timeoutMs,
      }, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`Zhipu API error: ${res.statusCode} ${responseData}`));
              return;
            }
            
            const data = JSON.parse(responseData);
            
            // 🔧 Enhanced parsing logic for ByteDance Seed and other models
            const message = data.choices[0].message;
            let content = message?.content || '';
            let reasoning_content = message?.reasoning_content || message?.reasoning;
            
            // 🔧 Special handling: if content is empty but reasoning has content, use reasoning as main content
            if (!content && reasoning_content && typeof reasoning_content === 'string') {
              console.log('🔧 检测到reasoning字段包含内容，将其作为主要回答内容 (Zhipu API)');
              content = reasoning_content;
            }
            
            resolve({
              content,
              reasoning_content,
              prompt_tokens: data.usage?.prompt_tokens || 0,
              completion_tokens: data.usage?.completion_tokens || 0,
              total_tokens: data.usage?.total_tokens || 0,
              model: data.model,
              finish_reason: data.choices[0].finish_reason,
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
    // 🔧 修复：优先使用已经构建好的 messages（多模态场景）
    let messages: any[];

    if (request.messages && request.messages.length > 0) {
      console.log(`🖼️ 使用预构建的多模态 messages (${request.messages.length} 条)`);
      messages = request.messages;
    } else {
      // 传统文本模式：从 system_prompt 和 user_prompt 构建
      messages = [];

      if (request.system_prompt) {
        messages.push({ role: 'system', content: request.system_prompt });
      }

      messages.push({ role: 'user', content: request.user_prompt });
    }

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
    
    // 🆕 处理强制推理配置（错误重试时使用）
    if ((request as any).__force_reasoning) {
      console.log(`🔧 ${providerConfig.display_name}: 强制应用推理配置 - ${JSON.stringify((request as any).__force_reasoning)}`);
      requestBody.reasoning = (request as any).__force_reasoning;
    }
    
    // 🆕 处理disable_enable_thinking参数 - 用于解决提供商兼容性问题
    else if (request.disable_enable_thinking) {
      // 处理DMX等使用enable_thinking的提供商
      if (requestBody.enable_thinking !== undefined) {
        console.log(`🔧 ${providerConfig.display_name}: 临时禁用enable_thinking参数 (原值: ${requestBody.enable_thinking})`);
        delete requestBody.enable_thinking;
      }
      
      // 处理OpenRouter使用reasoning的提供商
      if (requestBody.reasoning !== undefined) {
        console.log(`🔧 ${providerConfig.display_name}: 临时禁用reasoning参数 (原值: ${JSON.stringify(requestBody.reasoning)})`);
        // 🆕 保存原始reasoning配置，以备错误重试时使用
        (request as any).__original_reasoning = requestBody.reasoning;
        delete requestBody.reasoning;
      }
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
   * 执行HTTPS请求 - 通用动态实现
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
            // 🔧 增强响应状态检查
            if (res.statusCode < 200 || res.statusCode >= 300) {
              console.error(`❌ ${providerConfig.display_name} API 错误响应:`, {
                statusCode: res.statusCode,
                headers: res.headers,
                responseLength: responseData.length,
                responsePreview: responseData.substring(0, 200)
              });
              reject(new Error(`${providerConfig.display_name} API error: ${res.statusCode} ${responseData}`));
              return;
            }
            
            // 🔧 增强响应数据验证和调试
            if (!responseData || responseData.trim().length === 0) {
              console.error(`❌ ${providerConfig.display_name} 空响应:`, {
                statusCode: res.statusCode,
                headers: res.headers,
                contentLength: res.headers['content-length']
              });
              reject(new Error(`${providerConfig.display_name} API returned empty response`));
              return;
            }
            
            // 🔧 检查响应是否看起来像JSON
            const trimmedResponse = responseData.trim();
            if (!trimmedResponse.startsWith('{') && !trimmedResponse.startsWith('[')) {
              console.error(`❌ ${providerConfig.display_name} 非JSON响应:`, {
                statusCode: res.statusCode,
                responseLength: responseData.length,
                responseType: res.headers['content-type'],
                responseStart: responseData.substring(0, 100),
                responseEnd: responseData.substring(Math.max(0, responseData.length - 100))
              });
              reject(new Error(`${providerConfig.display_name} API returned non-JSON response: ${responseData.substring(0, 200)}...`));
              return;
            }
            
            let data;
            try {
              data = JSON.parse(responseData);
              console.log(`✅ ${providerConfig.display_name} JSON解析成功:`, {
                responseLength: responseData.length,
                hasChoices: !!data.choices,
                hasUsage: !!data.usage,
                choicesLength: data.choices?.length
              });
            } catch (jsonError) {
              console.error(`❌ ${providerConfig.display_name} JSON解析失败:`, {
                error: jsonError.message,
                responseLength: responseData.length,
                responsePreview: responseData.substring(0, 500),
                responseSuffix: responseData.substring(Math.max(0, responseData.length - 200)),
                contentType: res.headers['content-type'],
                transferEncoding: res.headers['transfer-encoding']
              });
              
              // 尝试修复常见的JSON问题
              const fixedResponse = this.tryFixJsonResponse(responseData);
              if (fixedResponse) {
                console.log(`🔧 ${providerConfig.display_name} JSON自动修复成功`);
                data = fixedResponse;
              } else {
                reject(new Error(`${providerConfig.display_name} JSON parsing failed: ${jsonError.message}. Response: ${responseData.substring(0, 300)}...`));
                return;
              }
            }
            
            // 应用响应映射（如果配置了的话）
            const response = this.mapResponse(data, providerConfig);
            
            // 🔧 验证响应数据完整性
            if (!response.content && response.content !== '') {
              console.warn(`⚠️ ${providerConfig.display_name} 响应缺少content字段:`, {
                responseKeys: Object.keys(response),
                originalData: data
              });
            }
            
            resolve({
              content: response.content || '',
              reasoning_content: response.reasoning_content,
              prompt_tokens: response.prompt_tokens || 0,
              completion_tokens: response.completion_tokens || 0,
              total_tokens: response.total_tokens || 0,
              model: response.model || requestBody.model,
              finish_reason: response.finish_reason || 'stop',
              response_time: 0, // 将在调用处设置
            });
            
          } catch (parseError) {
            console.error(`❌ ${providerConfig.display_name} 响应处理异常:`, {
              error: parseError.message,
              stack: parseError.stack,
              responseLength: responseData?.length || 0,
              statusCode: res.statusCode
            });
            reject(new Error(`${providerConfig.display_name} response processing error: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        console.error(`❌ ${providerConfig.display_name} 连接错误:`, {
          errorCode: error.code,
          errorMessage: error.message,
          hostname: url.hostname,
          port: url.port || 443
        });
        
        // 分类错误类型
        let errorType = 'connection_error';
        let userMessage = `Network error`;
        
        if (error.code === 'ECONNREFUSED') {
          errorType = 'connection_refused';
          userMessage = 'Connection refused - service may be down';
        } else if (error.code === 'ENOTFOUND') {
          errorType = 'dns_error';
          userMessage = 'DNS resolution failed - check hostname';
        } else if (error.code === 'ECONNRESET') {
          errorType = 'connection_reset';
          userMessage = 'Connection reset by server';
        } else if (error.code === 'ETIMEDOUT') {
          errorType = 'connection_timeout';
          userMessage = 'Connection timed out';
        }
        
        const enhancedError = new Error(`${providerConfig.display_name} ${userMessage}: ${error.message}`);
        enhancedError.code = error.code;
        enhancedError.errorType = errorType;
        reject(enhancedError);
      });
      
      req.on('timeout', () => {
        console.warn(`⏰ ${providerConfig.display_name} 请求超时:`, {
          timeoutMs,
          timeoutSeconds: Math.round(timeoutMs / 1000),
          hostname: url.hostname
        });
        req.destroy();
        const timeoutError = new Error(`${providerConfig.display_name} request timeout after ${timeoutMs}ms (${Math.round(timeoutMs/1000)}s)`);
        timeoutError.errorType = 'request_timeout';
        timeoutError.isTimeout = true;
        reject(timeoutError);
      });
      
      // 🔧 添加连接建立超时检测
      req.on('socket', (socket) => {
        socket.setTimeout(timeoutMs);
        socket.on('timeout', () => {
          console.warn(`⏰ ${providerConfig.display_name} Socket超时:`);
          req.destroy();
          const socketTimeoutError = new Error(`${providerConfig.display_name} socket timeout after ${timeoutMs}ms`);
          socketTimeoutError.errorType = 'socket_timeout';
          socketTimeoutError.isTimeout = true;
          reject(socketTimeoutError);
        });
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

    // 默认使用OpenAI兼容格式，增强对推理模型的支持
    const message = data.choices?.[0]?.message;
    let content = message?.content || '';
    let reasoning_content = message?.reasoning_content || message?.reasoning;
    
    // 🔧 特殊处理：如果content为空但reasoning有内容，使用reasoning作为主要内容
    // 这主要是为了支持ByteDance Seed等模型，它们将实际回答放在reasoning字段中
    if (!content && reasoning_content && typeof reasoning_content === 'string') {
      console.log('🔧 检测到reasoning字段包含内容，将其作为主要回答内容');
      content = reasoning_content;
    }
    
    return {
      content,
      reasoning_content,
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
   * 尝试修复常见的JSON响应问题
   */
  private tryFixJsonResponse(responseData: string): any | null {
    try {
      // 1. 清理响应数据
      let cleaned = responseData.trim();
      
      // 2. 移除可能的BOM或其他不可见字符
      cleaned = cleaned.replace(/^\uFEFF/, '');
      
      // 3. 检查是否是被截断的JSON（缺少结尾括号）
      if (cleaned.startsWith('{') && !cleaned.endsWith('}')) {
        console.log('🔧 检测到被截断的JSON对象，尝试修复...');
        
        // 尝试找到最后一个完整的字段
        const lastCommaIndex = cleaned.lastIndexOf(',');
        const lastQuoteIndex = cleaned.lastIndexOf('"');
        
        if (lastCommaIndex > lastQuoteIndex) {
          // 移除最后一个不完整的字段
          cleaned = cleaned.substring(0, lastCommaIndex);
        }
        
        // 添加缺失的结尾括号
        cleaned += '}';
        
        try {
          return JSON.parse(cleaned);
        } catch (e) {
          console.log('❌ JSON对象修复失败');
        }
      }
      
      // 4. 检查是否是被截断的JSON数组
      if (cleaned.startsWith('[') && !cleaned.endsWith(']')) {
        console.log('🔧 检测到被截断的JSON数组，尝试修复...');
        
        const lastCommaIndex = cleaned.lastIndexOf(',');
        if (lastCommaIndex > 0) {
          cleaned = cleaned.substring(0, lastCommaIndex);
        }
        
        cleaned += ']';
        
        try {
          return JSON.parse(cleaned);
        } catch (e) {
          console.log('❌ JSON数组修复失败');
        }
      }
      
      // 5. 尝试移除可能的非JSON前缀/后缀
      const jsonStart = Math.max(cleaned.indexOf('{'), cleaned.indexOf('['));
      const jsonEndBrace = cleaned.lastIndexOf('}');
      const jsonEndBracket = cleaned.lastIndexOf(']');
      const jsonEnd = Math.max(jsonEndBrace, jsonEndBracket);
      
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const extractedJson = cleaned.substring(jsonStart, jsonEnd + 1);
        console.log('🔧 尝试提取JSON内容...');
        
        try {
          return JSON.parse(extractedJson);
        } catch (e) {
          console.log('❌ JSON提取修复失败');
        }
      }
      
      // 6. 尝试修复常见的格式问题
      try {
        // 修复单引号为双引号
        cleaned = cleaned.replace(/'/g, '"');
        // 修复属性名未加引号的问题
        cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
        
        return JSON.parse(cleaned);
      } catch (e) {
        console.log('❌ 格式修复失败');
      }
      
    } catch (error) {
      console.log('❌ JSON修复过程出现异常:', error.message);
    }
    
    return null;
  }

  /**
   * 从数据库加载模型和提供商配置 - 动态架构
   */
  private async loadConfigurations(): Promise<void> {
    try {
      const { createClient } = await import('@/lib/supabase');
      const supabase = createClient();

      // 同时加载模型配置和提供商配置
      const [modelsResult, providersResult] = await Promise.all([
        supabase
          .from('models')
          .select(`
            id, name, provider, api_endpoint, api_key_env_var, max_context_window, 
            input_cost_per_1k_tokens, output_cost_per_1k_tokens, cost_currency,
            provider_input_cost_per_1k_tokens, provider_output_cost_per_1k_tokens, provider_cost_currency,
            logical_name, vendor_name, api_model_name
          `)
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
          name: model.api_model_name || model.name, // 🔧 优先使用api_model_name用于API调用
          provider: model.provider,
          api_endpoint: model.api_endpoint,
          api_key_env_var: model.api_key_env_var,
          max_context_window: model.max_context_window,
          input_cost_per_1k_tokens: model.input_cost_per_1k_tokens,
          output_cost_per_1k_tokens: model.output_cost_per_1k_tokens,
          cost_currency: model.cost_currency,
          // 🆕 Phase 2: 多提供商成本管理字段
          provider_input_cost_per_1k_tokens: model.provider_input_cost_per_1k_tokens,
          provider_output_cost_per_1k_tokens: model.provider_output_cost_per_1k_tokens,
          provider_cost_currency: model.provider_cost_currency,
          logical_name: model.logical_name,
          vendor_name: model.vendor_name,
        };
        this.modelConfigs.set(adaptedConfig.id, adaptedConfig);

        // 🔧 修复：同时通过logical_name建立索引，支持评分器使用逻辑名称
        if (model.logical_name && model.logical_name !== adaptedConfig.id) {
          this.modelConfigs.set(model.logical_name, adaptedConfig);
          console.log(`📋 建立逻辑名称索引: ${model.logical_name} -> ${adaptedConfig.id} (${model.provider})`);

          // 🆕 提供商变化检测和警告
          const existingConfig = this.modelConfigs.get(model.logical_name);
          if (existingConfig && existingConfig.provider !== model.provider) {
            console.warn(`🚨 提供商变化检测: ${model.logical_name} 从 ${existingConfig.provider} 变为 ${model.provider}`);
            console.warn(`   - API端点: ${existingConfig.api_endpoint} → ${adaptedConfig.api_endpoint}`);
            console.warn(`   - API密钥: ${existingConfig.api_key_env_var} → ${adaptedConfig.api_key_env_var}`);
          }

          // 🔄 可选：为未来稳定性，同时建立基于内容哈希的稳定索引
          // 这样即使logical_name改变，哈希值也保持一致
          const stableId = `logical_${this.hashString(model.logical_name)}`;
          this.modelConfigs.set(stableId, adaptedConfig);
          console.log(`🔐 建立稳定索引: ${stableId} -> ${model.logical_name}`);
        }
      });

      console.log(`✅ 动态加载: ${providersResult.data?.length} 个提供商, ${modelsResult.data?.length} 个模型`);
      this.configsLoaded = true;

    } catch (error) {
      console.error('❌ 动态配置加载失败:', error);
      // 回退到原有方法
      await this.loadModelConfigsLegacy();
    }
  }

  /**
   * 原有加载方法 - 作为回退
   */
  private async loadModelConfigsLegacy(): Promise<void> {
    try {
      // 使用新的统一配置服务
      const { providerService } = await import('@/lib/provider-service');
      const modelConfigs = await providerService.getAllModelConfigs();

      if (modelConfigs && modelConfigs.length > 0) {
        modelConfigs.forEach(config => {
          // 将新的ModelConfig接口适配到现有的ModelConfig接口
          const adaptedConfig: ModelConfig = {
            id: config.id,
            name: config.name,
            provider: config.provider_name || (config as any).provider || 'unknown',  // 兼容新旧两种配置方式
            api_endpoint: config.api_endpoint,
            api_key_env_var: config.api_key_env_var,
            max_context_window: config.max_context_window,
            input_cost_per_1k_tokens: config.input_cost_per_1k_tokens,
            output_cost_per_1k_tokens: config.output_cost_per_1k_tokens,
          };
          
          this.modelConfigs.set(adaptedConfig.id, adaptedConfig);

          // 🔧 修复：如果配置中有logical_name，建立索引
          if ((config as any).logical_name && (config as any).logical_name !== adaptedConfig.id) {
            this.modelConfigs.set((config as any).logical_name, adaptedConfig);
            console.log(`📋 回退方法建立逻辑名称索引: ${(config as any).logical_name} -> ${adaptedConfig.id}`);
          }
        });

        console.log(`✅ Loaded ${modelConfigs.length} model configurations from database`);
        this.configsLoaded = true;
      } else {
        console.warn('No active models found in database, using fallback configs');
        this.loadFallbackConfigs();
        this.configsLoaded = true;
      }
    } catch (error) {
      console.error('Error loading model configurations:', error);
      this.loadFallbackConfigs();
      this.configsLoaded = true;
    }
  }

  /**
   * 加载备用模型配置
   */
  private loadFallbackConfigs(): void {
    const mockConfigs: ModelConfig[] = [
        {
          id: 'gpt-3.5-turbo',
          name: 'gpt-3.5-turbo',
          provider: 'siliconflow',
          api_endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
          api_key_env_var: 'SILICONFLOW_API_KEY',
          max_context_window: 4096,
          input_cost_per_1k_tokens: 0.002,
          output_cost_per_1k_tokens: 0.002,
        },
        {
          id: 'claude-3-haiku',
          name: 'anthropic/claude-3-haiku-20240307',
          provider: 'siliconflow',
          api_endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
          api_key_env_var: 'SILICONFLOW_API_KEY',
          max_context_window: 200000,
          input_cost_per_1k_tokens: 0.00025,
          output_cost_per_1k_tokens: 0.00125,
        },
        {
          id: 'qwen2-72b',
          name: 'Qwen/Qwen2-72B-Instruct',
          provider: 'siliconflow',
          api_endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
          api_key_env_var: 'SILICONFLOW_API_KEY',
          max_context_window: 32768,
          input_cost_per_1k_tokens: 0.0006,
          output_cost_per_1k_tokens: 0.0006,
        },
      ];

      mockConfigs.forEach(config => {
        this.modelConfigs.set(config.id, config);
      });

      console.log(`✅ Loaded ${mockConfigs.length} model configurations`);
  }

  /**
   * 获取模型配置
   */
  async getModelConfig(modelId: string): Promise<ModelConfig | undefined> {
    await this.ensureConfigsLoaded();
    return this.modelConfigs.get(modelId);
  }

  /**
   * 获取所有模型配置
   */
  async getAllModelConfigs(): Promise<ModelConfig[]> {
    await this.ensureConfigsLoaded();
    return Array.from(this.modelConfigs.values());
  }

  /**
   * 🆕 Phase 2: 增强的成本估算（支持提供商级别成本）
   */
  estimateCost(
    modelId: string,
    promptTokens: number,
    completionTokens: number,
    reasoningTokens: number = 0
  ): number {
    const config = this.modelConfigs.get(modelId);
    if (!config) {
      return 0;
    }

    // 语义修正：优先使用provider_*字段，fallback到原字段（对应provider的基础成本）
    const inputCostPer1k = config.provider_input_cost_per_1k_tokens ?? config.input_cost_per_1k_tokens ?? 0;
    const outputCostPer1k = config.provider_output_cost_per_1k_tokens ?? config.output_cost_per_1k_tokens ?? 0;
    
    let inputCost: number;
    let outputCost: number;
    
    // 智能检测单位：如果成本值大于10，认为是1M token单位，需要除以1000
    if (inputCostPer1k > 10) {
      inputCost = (inputCostPer1k / 1000) * (promptTokens / 1000);
    } else {
      inputCost = inputCostPer1k * (promptTokens / 1000);
    }
    
    // 🆕 输出成本包含普通输出 + 思维链token
    const totalOutputTokens = completionTokens + reasoningTokens;
    if (outputCostPer1k > 10) {
      outputCost = (outputCostPer1k / 1000) * (totalOutputTokens / 1000);
    } else {
      outputCost = outputCostPer1k * (totalOutputTokens / 1000);
    }
    
    return inputCost + outputCost;
  }

  /**
   * 获取模型成本配置信息（简化版本，仅用于显示）
   */
  getCostInfo(modelId: string): {
    has_provider_cost: boolean;
    cost_source: string;
    currency: 'USD' | 'CNY';
    input_cost_per_1k: number;
    output_cost_per_1k: number;
    provider_input_cost_per_1k?: number;
    provider_output_cost_per_1k?: number;
    provider_currency?: 'USD' | 'CNY';
  } {
    const config = this.modelConfigs.get(modelId);
    if (!config) {
      throw new Error(`Model configuration not found: ${modelId}`);
    }

    const hasProviderCost = !!(
      config.provider_input_cost_per_1k_tokens !== undefined ||
      config.provider_output_cost_per_1k_tokens !== undefined
    );

    return {
      has_provider_cost: hasProviderCost,
      cost_source: hasProviderCost 
        ? `Updated cost for ${config.vendor_name || config.provider}` 
        : `Base cost for ${config.vendor_name || config.provider}`,
      currency: (hasProviderCost ? config.provider_cost_currency : config.cost_currency) ?? 'USD',
      input_cost_per_1k: config.provider_input_cost_per_1k_tokens ?? config.input_cost_per_1k_tokens ?? 0,
      output_cost_per_1k: config.provider_output_cost_per_1k_tokens ?? config.output_cost_per_1k_tokens ?? 0,
      provider_input_cost_per_1k: config.provider_input_cost_per_1k_tokens,
      provider_output_cost_per_1k: config.provider_output_cost_per_1k_tokens,
      provider_currency: config.provider_cost_currency,
    };
  }

  /**
   * 估算API调用成本（明确指定单位）
   */
  estimateCostExplicit(
    modelId: string,
    promptTokens: number,
    completionTokens: number,
    costUnit: '1k' | '1m' = '1k'
  ): number {
    const config = this.modelConfigs.get(modelId);
    if (!config) {
      return 0;
    }

    const inputCostPer1k = config.input_cost_per_1k_tokens || 0;
    const outputCostPer1k = config.output_cost_per_1k_tokens || 0;
    
    if (costUnit === '1m') {
      // 新单位：$/1M tokens
      const inputCost = (inputCostPer1k / 1000) * (promptTokens / 1000);
      const outputCost = (outputCostPer1k / 1000) * (completionTokens / 1000);
      return inputCost + outputCost;
    } else {
      // 传统单位：$/1K tokens
      const inputCost = inputCostPer1k * (promptTokens / 1000);
      const outputCost = outputCostPer1k * (completionTokens / 1000);
      return inputCost + outputCost;
    }
  }

  /**
   * 🆕 多模态LLM调用 - 根据提供商分发请求
   */
  private async callMultimodalLLM(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    console.log(`🎯 开始多模态LLM调用: ${request.model_id}`);

    // 获取模型和提供商配置
    const modelConfig = this.modelConfigs.get(request.model_id);
    if (!modelConfig) {
      throw new Error(`模型配置未找到: ${request.model_id}`);
    }

    const providerConfig = this.getProviderConfig(modelConfig.provider);
    if (!providerConfig) {
      throw new Error(`提供商配置未找到: ${modelConfig.provider}`);
    }

    console.log(`📡 提供商: ${providerConfig.name}, 模型: ${modelConfig.name}`);

    // 根据提供商类型分发调用
    try {
      switch (providerConfig.name.toLowerCase()) {
        case 'openai':
        case 'openrouter':
        case 'siliconflow':
          console.log(`🔄 使用 OpenAI 兼容格式处理多模态请求`);
          return await this.callOpenAICompatibleMultimodal(request, modelConfig, providerConfig);

        case 'anthropic':
        case 'claude':
          console.log(`🔄 使用 Anthropic 格式处理多模态请求`);
          return await this.callAnthropicMultimodal(request, modelConfig, providerConfig);

        default:
          console.warn(`⚠️ 提供商 ${providerConfig.name} 不支持多模态，降级为文本模式`);
          return await this.callTextFallback(request);
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error(`❌ 多模态调用失败 (${responseTime}ms):`, error);
      throw error;
    }
  }

  /**
   * 🆕 OpenAI 兼容格式的多模态调用 (OpenRouter, SiliconFlow)
   * 🔧 修复：OpenRouter某些模型需要Base64格式，统一使用Base64传递图片
   */
  private async callOpenAICompatibleMultimodal(
    request: LLMRequest,
    modelConfig: any,
    providerConfig: any
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    console.log(`🔧 构建 OpenAI 兼容的多模态请求...`);
    console.log(`⚠️ OpenRouter 某些模型需要 base64 格式，将下载并转换图片...`);

    if (!request.attachments || request.attachments.length === 0) {
      throw new Error('OpenAI 兼容多模态调用需要附件');
    }

    try {
      // 构建消息数组
      const messages: any[] = [];

      // 添加系统提示
      if (request.system_prompt) {
        messages.push({
          role: 'system',
          content: request.system_prompt
        });
      }

      // 构建用户消息内容（文本 + 图片）
      const userContent: any[] = [
        {
          type: 'text',
          text: request.user_prompt
        }
      ];

      // 处理图片附件 - 下载并转换为Base64
      let processedImages = 0;
      for (const attachment of request.attachments) {
        if (attachment.type === 'image' && attachment.url) {
          try {
            console.log(`📥 下载图片: ${attachment.url}`);
            const { base64Data, mimeType } = await this.downloadImageAsBase64(attachment.url);

            userContent.push({
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
                detail: 'auto'  // OpenAI 的细节级别设置
              }
            });
            processedImages++;
            console.log(`📸 添加Base64图片 ${processedImages}: ${attachment.metadata?.filename || 'unknown'} (${mimeType})`);
          } catch (imageError) {
            console.error(`❌ 处理图片失败: ${attachment.url}`, imageError);
            throw this.createMultimodalError(
              'IMAGE_PROCESSING_ERROR',
              `无法处理图片: ${imageError.message}`,
              attachment.url
            );
          }
        }
      }

      if (processedImages === 0) {
        throw new Error('没有成功处理任何图片附件');
      }

      messages.push({
        role: 'user',
        content: userContent
      });

      console.log(`📝 构建的Base64消息结构: ${messages.length} 条消息, ${processedImages} 张图片`);

      // 构建请求体
      const requestBody = {
        model: modelConfig.name,
        messages: messages,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty
      };

      // 添加推理模型的 thinking_budget
      if (request.thinking_budget) {
        requestBody.thinking_budget = request.thinking_budget;
      }

      // 🔐 获取 API 密钥（支持环境变量和数据库加密存储）
      const apiKey = await this.getApiKey(
        modelConfig.api_key_env_var,
        providerConfig.id,
        modelConfig.name
      );

      // 构建符合 LLMRequest 接口的请求
      const llmRequest: LLMRequest = {
        model_id: modelConfig.name,
        user_prompt: request.user_prompt,
        system_prompt: request.system_prompt,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        frequency_penalty: request.frequency_penalty,
        presence_penalty: request.presence_penalty,
        thinking_budget: request.thinking_budget,
        messages: requestBody.messages  // 添加多模态消息
      };

      // 调用通用 API 方法
      const result = await this.callGenericAPI(modelConfig, providerConfig, llmRequest, apiKey);

      const totalTime = Date.now() - startTime;
      console.log(`✅ OpenAI兼容多模态调用完成，耗时: ${totalTime}ms, 处理图片: ${processedImages} 张`);

      // 🧹 API调用完成后，主动提醒垃圾回收清理Base64数据
      if (processedImages > 0) {
        console.log(`🧹 多模态调用完成，建议进行内存清理 (处理了${processedImages}张图片)`);
        // 在Node.js环境中，可以提示垃圾回收
        if (typeof global !== 'undefined' && global.gc) {
          global.gc();
          console.log(`🧹 已执行垃圾回收清理`);
        }
      }

      return result;

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`❌ OpenAI兼容多模态调用失败，耗时: ${totalTime}ms`, error);

      // 如果是多模态相关错误，尝试降级为文本模式
      if (this.isMultimodalError(error)) {
        console.log(`🔄 多模态处理失败，尝试降级为文本模式...`);
        return this.callTextFallback(request);
      }

      throw error;
    }
  }

  /**
   * 🆕 Anthropic 格式的多模态调用 (需要 base64 转换)
   */
  private async callAnthropicMultimodal(
    request: LLMRequest,
    modelConfig: any,
    providerConfig: any
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    console.log(`🔧 构建 Anthropic 格式的多模态请求...`);
    console.log(`⚠️ Claude 需要 base64 格式，将下载并转换图片...`);

    if (!request.attachments || request.attachments.length === 0) {
      throw new Error('Anthropic 多模态调用需要附件');
    }

    try {
      // 构建消息内容数组
      const messageContent: any[] = [
        {
          type: 'text',
          text: request.user_prompt
        }
      ];

      // 处理图片附件
      let processedImages = 0;
      for (const attachment of request.attachments) {
        if (attachment.type === 'image' && attachment.url) {
          try {
            console.log(`📥 下载图片: ${attachment.url}`);
            const { base64Data, mimeType } = await this.downloadImageAsBase64(attachment.url);

            messageContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Data
              }
            });

            processedImages++;
            console.log(`✅ 图片 ${processedImages} 转换完成: ${mimeType}`);

          } catch (error) {
            console.warn(`⚠️ 图片下载失败: ${attachment.url}, 错误: ${error.message}`);
            // 降级处理：将失败的图片转为文本描述
            const description = attachment.metadata?.alt_text || '图片加载失败';
            messageContent[0].text += `\n[图片: ${description}]`;
          }
        }
      }

      if (processedImages === 0) {
        console.warn(`⚠️ 没有成功处理任何图片，降级为文本模式`);
        return await this.callTextFallback(request);
      }

      console.log(`🖼️ 成功处理 ${processedImages} 张图片，构建 Anthropic 请求...`);

      // 构建 Anthropic API 请求
      const requestBody = {
        model: modelConfig.name,
        max_tokens: request.max_tokens || 1000,
        temperature: request.temperature,
        messages: [
          {
            role: 'user',
            content: messageContent
          }
        ]
      };

      // 添加系统提示（如果有）
      if (request.system_prompt) {
        requestBody.system = request.system_prompt;
      }

      // 🔐 获取 API 密钥（支持环境变量和数据库加密存储）
      const apiKey = await this.getApiKey(
        modelConfig.api_key_env_var,
        providerConfig.id,
        modelConfig.name
      );

      console.log(`📤 发送 Anthropic API 请求...`);

      // 发送请求
      const response = await fetch(providerConfig.base_url || modelConfig.api_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          ...providerConfig.headers
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API 错误 (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;

      console.log(`✅ Anthropic 多模态调用成功 (${responseTime}ms)`);

      // 🧹 API调用完成后，主动提醒垃圾回收清理Base64数据
      if (processedImages > 0) {
        console.log(`🧹 Anthropic多模态调用完成，建议进行内存清理 (处理了${processedImages}张图片)`);
        // 在Node.js环境中，可以提示垃圾回收
        if (typeof global !== 'undefined' && global.gc) {
          global.gc();
          console.log(`🧹 已执行垃圾回收清理`);
        }
      }

      // 转换为标准响应格式
      return {
        content: data.content?.[0]?.text || '',
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        model: modelConfig.name,
        finish_reason: data.stop_reason || 'stop',
        response_time: responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      // 详细错误日志
      if (error.isMultimodalError) {
        console.error(`❌ Anthropic 多模态调用失败 (${responseTime}ms):`, {
          errorType: error.errorType,
          message: error.message,
          url: error.url,
          metadata: error.metadata
        });
      } else {
        console.error(`❌ Anthropic 多模态调用失败 (${responseTime}ms):`, error);
      }

      // 智能降级处理
      if (this.shouldFallbackToText(error)) {
        console.log(`🔄 错误类型 ${error.errorType || 'unknown'} 触发降级，转为文本模式`);
        return await this.callTextFallback(request);
      }

      // 重新抛出非降级错误
      throw error;
    }
  }

  /**
   * 🆕 下载图片并转换为 base64 格式（带重试机制）
   */
  private async downloadImageAsBase64(url: string, maxRetries: number = 2): Promise<{ base64Data: string; mimeType: string }> {
    const downloadTimeout = 30000; // 30秒超时

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        // 验证URL格式
        if (!url.startsWith('https://')) {
          throw this.createMultimodalError('URL_INVALID', '只支持 HTTPS URL', url);
        }

        console.log(`🔄 开始下载图片 (尝试 ${attempt}/${maxRetries + 1}): ${url}`);

        // 创建带超时的 fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), downloadTimeout);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AI-Benchmark/1.0)',
            'Accept': 'image/*',
            'Cache-Control': 'no-cache'
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorType = response.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR';
          throw this.createMultimodalError(
            errorType,
            `HTTP ${response.status}: ${response.statusText}`,
            url,
            { status: response.status }
          );
        }

        // 检查内容类型
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          throw this.createMultimodalError(
            'INVALID_FORMAT',
            `无效的图片类型: ${contentType}`,
            url,
            { contentType }
          );
        }

        // 检查文件大小（限制10MB）
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
          throw this.createMultimodalError(
            'FILE_TOO_LARGE',
            `图片文件过大: ${Math.round(parseInt(contentLength) / 1024 / 1024)}MB (限制10MB)`,
            url,
            { size: parseInt(contentLength) }
          );
        }

        // 转换为 ArrayBuffer
        const arrayBuffer = await response.arrayBuffer();
        const sizeKB = Math.round(arrayBuffer.byteLength / 1024);
        console.log(`📊 图片大小: ${sizeKB}KB`);

        // 检查实际大小
        if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
          throw this.createMultimodalError(
            'FILE_TOO_LARGE',
            `图片实际大小过大: ${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB`,
            url
          );
        }

        // 转换为 base64
        const base64Data = Buffer.from(arrayBuffer).toString('base64');

        // 确定 MIME 类型
        let mimeType = contentType;
        if (!mimeType.includes('/')) {
          // 从 URL 推断类型
          if (url.includes('.png')) mimeType = 'image/png';
          else if (url.includes('.jpg') || url.includes('.jpeg')) mimeType = 'image/jpeg';
          else if (url.includes('.gif')) mimeType = 'image/gif';
          else if (url.includes('.webp')) mimeType = 'image/webp';
          else mimeType = 'image/jpeg'; // 默认
        }

        console.log(`✅ 图片转换完成: ${mimeType}, Base64长度: ${base64Data.length}`);

        // 🧹 主动释放ArrayBuffer内存引用
        // 虽然JavaScript会自动垃圾回收，但对于大图片主动释放更安全
        if (typeof arrayBuffer === 'object' && arrayBuffer.byteLength > 1024 * 1024) {
          console.log(`🧹 主动释放${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB的ArrayBuffer内存引用`);
          // 将arrayBuffer置为null，帮助GC更快释放
          (arrayBuffer as any) = null;
        }

        return {
          base64Data,
          mimeType
        };

      } catch (error) {
        const isLastAttempt = attempt === maxRetries + 1;

        // 处理超时错误
        if (error.name === 'AbortError') {
          const timeoutError = this.createMultimodalError(
            'DOWNLOAD_TIMEOUT',
            `图片下载超时 (${downloadTimeout/1000}s)`,
            url,
            { timeout: downloadTimeout }
          );

          if (isLastAttempt) {
            throw timeoutError;
          } else {
            console.warn(`⚠️ 下载超时，准备重试: ${error.message}`);
            await this.delay(1000 * attempt); // 递增延迟
            continue;
          }
        }

        // 处理其他错误
        if (error.errorType) {
          // 已经是我们的自定义错误
          if (isLastAttempt || !this.isRetryableError(error.errorType)) {
            throw error;
          } else {
            console.warn(`⚠️ 下载失败，准备重试: ${error.message}`);
            await this.delay(1000 * attempt);
            continue;
          }
        }

        // 未知错误
        const unknownError = this.createMultimodalError(
          'UNKNOWN_ERROR',
          `图片下载失败: ${error.message}`,
          url
        );

        if (isLastAttempt) {
          throw unknownError;
        } else {
          console.warn(`⚠️ 未知错误，准备重试: ${error.message}`);
          await this.delay(1000 * attempt);
        }
      }
    }

    // 理论上不应该到达这里
    throw this.createMultimodalError('MAX_RETRIES_EXCEEDED', '已达到最大重试次数', url);
  }

  /**
   * 🆕 创建标准化的多模态错误
   */
  private createMultimodalError(
    errorType: string,
    message: string,
    url?: string,
    metadata?: any
  ): Error {
    const error = new Error(message);
    (error as any).errorType = errorType;
    (error as any).isMultimodalError = true;
    (error as any).url = url;
    (error as any).metadata = metadata;
    (error as any).timestamp = new Date().toISOString();
    return error;
  }

  /**
   * 🆕 判断错误是否可重试
   */
  private isRetryableError(errorType: string): boolean {
    const retryableErrors = [
      'DOWNLOAD_TIMEOUT',
      'SERVER_ERROR',
      'NETWORK_ERROR',
      'UNKNOWN_ERROR'
    ];
    return retryableErrors.includes(errorType);
  }

  /**
   * 🆕 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 🆕 判断是否应该降级到文本模式
   */
  private shouldFallbackToText(error: any): boolean {
    // 如果是我们的多模态错误
    if (error.isMultimodalError) {
      const fallbackErrors = [
        'DOWNLOAD_TIMEOUT',    // 下载超时
        'FILE_TOO_LARGE',      // 文件过大
        'INVALID_FORMAT',      // 格式不支持
        'MAX_RETRIES_EXCEEDED',// 重试次数超限
        'SERVER_ERROR',        // 服务器错误
        'NETWORK_ERROR'        // 网络错误
      ];
      return fallbackErrors.includes(error.errorType);
    }

    // 对于其他错误，检查消息内容
    const message = error.message || '';
    const fallbackKeywords = [
      '下载',
      '网络',
      '超时',
      '文件过大',
      '格式不支持',
      'timeout',
      'network',
      'download',
      'too large'
    ];

    return fallbackKeywords.some(keyword =>
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 🆕 不支持多模态的提供商降级处理
   */
  private async callTextFallback(request: LLMRequest): Promise<LLMResponse> {
    console.log(`🔄 降级为文本模式处理多模态请求`);

    // 将附件信息转换为文本描述
    const attachmentDescriptions = (request.attachments || [])
      .map(att => {
        const type = att.type;
        const desc = att.metadata?.alt_text || att.metadata?.filename || 'unknown';
        return `[${type}: ${desc}]`;
      })
      .join(' ');

    const enhancedPrompt = attachmentDescriptions
      ? `${request.user_prompt}\n\n附件信息: ${attachmentDescriptions}`
      : request.user_prompt;

    console.log(`📝 增强的提示文本长度: ${enhancedPrompt.length} 字符`);

    // 递归调用文本模式（移除附件）
    return this.callLLM({
      ...request,
      user_prompt: enhancedPrompt,
      attachments: undefined  // 移除附件，避免无限递归
    });
  }

  /**
   * 简单的字符串哈希函数，用于生成稳定的逻辑模型标识符
   */
  private hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString(16);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).slice(0, 8);
  }
}

// 导出单例实例
export const llmClient = new LLMClient();