/**
 * 智能LLM客户端 - 多厂商架构集成
 * 
 * 支持逻辑模型调用和自动厂商选择
 * 提供透明的故障转移和负载均衡
 */

import { LLMClient, LLMRequest, LLMResponse } from './llm-client';
import { VendorSelector, getVendorSelector } from './vendor-selector';
import { getApiModelName, extractLogicalName } from './model-utils';
import { createClient } from './supabase';
import type { ContentAttachment } from '@/types/multimodal';

/**
 * 智能LLM请求 - 支持逻辑模型名
 */
export interface SmartLLMRequest extends Omit<LLMRequest, 'model_id'> {
  model_id: string;           // 可以是逻辑模型名或具体厂商模型ID
  prefer_vendor?: string;     // 优先厂商（可选）
  fallback_enabled?: boolean; // 是否启用故障转移（默认true）
  max_retries?: number;       // 最大重试次数（默认2）
  fresh_start?: boolean;      // 🆕 是否全新开始（忽略历史失败，重置提供商状态）

  // 🆕 多模态支持
  attachments?: ContentAttachment[];  // 附件列表（图片、音频等）
  auto_parse_images?: boolean;        // 是否自动解析 Markdown 中的图片（默认 true）
}

/**
 * 智能LLM响应 - 包含厂商选择信息
 */
export interface SmartLLMResponse extends LLMResponse {
  vendor_info?: {
    selected_vendor: string;
    selection_reason: string;
    alternatives_count: number;
    performance_score: number;
    fallback_used: boolean;
    retry_count: number;
  };
}

/**
 * 智能LLM客户端类
 */
export class SmartLLMClient {
  private llmClient = new LLMClient();
  // 懒加载 Supabase 客户端，避免构建时初始化
  private get supabase() {
    return createClient();
  }
  private vendorSelector: VendorSelector | null = null;

  /**
   * 初始化厂商选择器
   */
  private async getVendorSelector(): Promise<VendorSelector> {
    if (!this.vendorSelector) {
      this.vendorSelector = await getVendorSelector();
    }
    return this.vendorSelector;
  }

  /**
   * 智能LLM调用 - 支持逻辑模型名和自动厂商选择
   */
  async callLLM(request: SmartLLMRequest): Promise<SmartLLMResponse> {
    const {
      model_id,
      prefer_vendor,
      fallback_enabled = true,
      max_retries = 2,
      fresh_start = false,
      attachments,
      auto_parse_images = true,
      ...llmRequest
    } = request;

    // 🆕 多模态支持：自动解析 Markdown 中的图片
    let processedRequest = { ...llmRequest };
    let finalAttachments = [...(attachments || [])]; // 🔧 始终保留原有attachments

    if (auto_parse_images && llmRequest.user_prompt) {
      const { cleanText, attachments: parsedAttachments } = this.parseMarkdownImages(llmRequest.user_prompt);

      // 🔧 优化：去重逻辑，防止重复图片
      const existingUrls = new Set(finalAttachments.map(att => att.url));
      const uniqueParsedAttachments = parsedAttachments.filter(att => !existingUrls.has(att.url));

      finalAttachments.push(...uniqueParsedAttachments); // 🔧 只添加不重复的attachments

      processedRequest = {
        ...llmRequest,
        user_prompt: cleanText,
        attachments: finalAttachments
      };

      if (parsedAttachments.length > 0) {
        const duplicateCount = parsedAttachments.length - uniqueParsedAttachments.length;
        console.log(`🖼️ 从 Markdown 解析到 ${parsedAttachments.length} 张图片，去重后添加 ${uniqueParsedAttachments.length} 张`);
        if (duplicateCount > 0) {
          console.log(`🔄 已去除 ${duplicateCount} 张重复图片，避免token浪费`);
        }
      }
    } else {
      // 🔧 即使没有Markdown解析，也要保留原有attachments
      processedRequest.attachments = finalAttachments;
    }

    // 🔧 智能路由增强：检查具体模型ID是否有逻辑名，支持自动升级到多提供商
    const modelInfo = await this.getModelInfo(model_id);
    const isLogicalModel = await this.isLogicalModelName(model_id);
    
    // 🆕 如果传入的是具体模型ID但有逻辑名，自动升级到多提供商模式
    if (!isLogicalModel && modelInfo?.logical_name) {
      console.log(`🔄 智能升级: 具体模型ID [${model_id}] 升级为逻辑模型 [${modelInfo.logical_name}]`);
      console.log(`💡 这将启用多提供商选择和故障转移功能`);
      
      // 递归调用，但使用逻辑模型名，并设置优先厂商为原厂商
      return this.callLLM({
        ...request,
        ...processedRequest,  // 🔧 使用处理过的请求（包含解析的图片）
        model_id: modelInfo.logical_name,
        prefer_vendor: modelInfo.vendor_name || undefined
      });
    }
    
    if (!isLogicalModel) {
      // 直接调用具体厂商模型 - 真正的Legacy单提供商模型（没有逻辑名的模型）
      console.log(`🔒 Legacy单提供商模型调用: ${model_id}, fresh_start: ${fresh_start}`);
      const response = await this.llmClient.callLLM({
        ...processedRequest,  // 🔧 使用处理过的请求（包含解析的图片）
        model_id,
        fresh_start  // 🔧 修复：传递fresh_start参数到传统路径
      });
      
      return {
        ...response,
        vendor_info: {
          selected_vendor: model_id,
          selection_reason: '真正的Legacy单提供商模型',
          alternatives_count: 0,
          performance_score: 1.0,
          fallback_used: false,
          retry_count: 0
        }
      };
    }

    // 逻辑模型调用 - 需要厂商选择
    return await this.callLogicalModel(model_id, processedRequest, {
      prefer_vendor,
      fallback_enabled,
      max_retries,
      fresh_start
    });
  }

  /**
   * 调用逻辑模型 - 包含厂商选择和故障转移
   */
  private async callLogicalModel(
    logicalModelName: string,
    llmRequest: Omit<LLMRequest, 'model_id'>,
    options: {
      prefer_vendor?: string;
      fallback_enabled: boolean;
      max_retries: number;
      fresh_start?: boolean;
    }
  ): Promise<SmartLLMResponse> {
    const vendorSelector = await this.getVendorSelector();
    let retryCount = 0;
    let lastError: Error | null = null;
    let fallbackUsed = false;
    let lastFailedVendorId: string | null = null; // 🔧 跟踪最后失败的提供商
    let allFailedVendorIds: Set<string> = new Set(); // 🔧 跟踪所有已失败的提供商
    let selectedModel: any = null; // 🔧 修复：在外部定义selectedModel，避免作用域错误

    // 🆕 如果是全新开始模式，重置该逻辑模型的所有提供商状态
    if (options.fresh_start) {
      console.log(`🔄 全新开始模式：重置逻辑模型 [${logicalModelName}] 的所有提供商状态`);
      await vendorSelector.resetLogicalModelVendors([logicalModelName]);
    }

    while (retryCount <= options.max_retries) {
      try {
        // 选择厂商
        const selectionResult = await vendorSelector.selectVendorForModel(
          logicalModelName,
          options.prefer_vendor ? { 
            strategy: 'priority_first' // 如果指定优先厂商，使用优先级策略
          } : undefined
        );

        if (!selectionResult) {
          throw new Error(`No available vendors for logical model: ${logicalModelName}`);
        }

        selectedModel = selectionResult.selected_model; // 🔧 修复：使用外部定义的变量
        const apiModelName = getApiModelName(selectedModel);

        console.log(`🎯 厂商选择 [${logicalModelName}]: ${selectedModel.vendor_name} (${selectionResult.reason})`);
        console.log(`📋 厂商详情: ${selectedModel.name} (ID: ${selectedModel.id})`);
        console.log(`🚀 开始调用厂商API: ${selectedModel.name}`);

        // 调用选定的厂商
        const response = await this.llmClient.callLLM({
          ...llmRequest,  // 🔧 修复：在callLogicalModel方法中，参数名是llmRequest
          model_id: selectedModel.id
        });

        console.log(`✅ 厂商调用成功: ${selectedModel.name}`);
        console.log(`📊 响应统计: ${response.prompt_tokens}+${response.completion_tokens}=${response.total_tokens} tokens, ${response.response_time}ms`);
        
        // 更新成功指标
        await vendorSelector.updateVendorMetrics(selectedModel.id, {
          consecutive_failures: 0,
          success_rate: Math.min(1.0, (selectedModel.success_rate || 0.9) + 0.01) // 微调成功率
        });

        return {
          ...response,
          vendor_info: {
            selected_vendor: selectedModel.vendor_name || 'Unknown',
            selection_reason: selectionResult.reason,
            alternatives_count: selectionResult.alternatives.length,
            performance_score: selectionResult.performance_score,
            fallback_used: fallbackUsed,
            retry_count: retryCount
          }
        };

      } catch (error) {
        lastError = error as Error;
        retryCount++;
        
        // 🔧 记录失败的提供商ID，用于后续重试时避开
        if (selectedModel) {
          lastFailedVendorId = selectedModel.id;
          allFailedVendorIds.add(selectedModel.id); // 🔧 添加到已失败提供商集合
        }
        
        // 🔧 区分超时错误和其他错误类型，提供更详细的日志
        const isTimeout = error instanceof Error && 
          (error.message.includes('timeout') || error.message.includes('aborted') || 
           error.name === 'AbortError' || error.name === 'TimeoutError');
        
        const errorType = isTimeout ? '⏰ 超时失败' : '❌ 其他错误';
        console.warn(`${errorType} 厂商 ${selectedModel?.vendor_name || 'Unknown'} [重试 ${retryCount}/${options.max_retries + 1}]:`, error.message);

        if (!options.fallback_enabled || retryCount > options.max_retries) {
          break;
        }

        // 🔧 修复：从第一次重试开始就启用故障转移，避免重复尝试失败提供商
        console.log(`🔄 启用故障转移，避开失败提供商: ${selectedModel?.vendor_name || 'Unknown'}`);
        console.log(`🚫 当前已失败提供商列表: ${Array.from(allFailedVendorIds).join(', ')}`); // 🔧 新增日志
        fallbackUsed = true;
        
        const reassignResult = await vendorSelector.reassignFailedTask(
          lastFailedVendorId || '', // 传入失败的提供商ID
          logicalModelName,
          undefined, // 使用默认配置
          allFailedVendorIds // 🔧 传入所有已失败的提供商ID集合
        );
        
        if (!reassignResult) {
          console.error(`🚨 所有厂商都不可用: ${logicalModelName}`);
          break;
        }
        
        console.log(`🔄 故障转移到: ${reassignResult.selected_model.vendor_name} (${reassignResult.selected_model.name})`);
        console.log(`🆕 新厂商详情: ID: ${reassignResult.selected_model.id}, 优先级: ${reassignResult.selected_model.priority}`);
        
        // 短暂延迟避免过于频繁的请求
        if (retryCount === 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // 🔧 所有重试都失败了 - 区分超时和其他错误
    const isAllTimeoutFailures = lastError && (
      lastError.message.includes('timeout') || 
      lastError.message.includes('aborted') || 
      lastError.name === 'AbortError' || 
      lastError.name === 'TimeoutError'
    );
    
    if (isAllTimeoutFailures) {
      console.error(`⏰ 所有厂商都超时失败，启用0分兜底机制: ${logicalModelName}`);
      // 抛出特殊的超时错误，让上层识别并进行0分兜底
      const timeoutError = new Error(`TIMEOUT: All vendors timed out for logical model ${logicalModelName}: ${lastError?.message}`);
      timeoutError.name = 'SmartLLMTimeoutError';
      throw timeoutError;
    } else {
      console.error(`❌ 所有厂商都失败，非超时错误，应该报错而不是0分兜底: ${logicalModelName}`);
      throw new Error(`All vendors failed for logical model ${logicalModelName}: ${lastError?.message}`);
    }
  }

  /**
   * 检查字符串是否为UUID格式
   */
  private isUUID(str: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * 获取模型信息（用于智能路由判断）
   */
  private async getModelInfo(modelId: string): Promise<{
    id: string;
    name: string;
    logical_name: string | null;
    vendor_name: string | null;
  } | null> {
    try {
      const { data, error } = await this.supabase
        .from('models')
        .select('id, name, logical_name, vendor_name')
        .eq('id', modelId)
        .single();

      if (error || !data) {
        return null;
      }

      return data;
    } catch (error) {
      console.warn('Error getting model info:', error);
      return null;
    }
  }

  /**
   * 检查是否为逻辑模型名
   */
  private async isLogicalModelName(modelId: string): boolean {
    try {
      // 🔧 修复UUID错误：分别查询logical_name和ID，避免UUID类型错误
      const [logicalNameQuery, idQuery] = await Promise.all([
        // 查询logical_name匹配
        this.supabase
          .from('models')
          .select('id, logical_name')
          .eq('logical_name', modelId)
          .limit(1),
        // 查询ID匹配（仅当modelId是UUID格式时）
        this.isUUID(modelId) ? 
          this.supabase
            .from('models')
            .select('id, logical_name')
            .eq('id', modelId)
            .limit(1) :
          Promise.resolve({ data: [], error: null })
      ]);

      const logicalMatches = logicalNameQuery.data || [];
      const idMatches = idQuery.data || [];
      const data = [...logicalMatches, ...idMatches];

      if (logicalNameQuery.error || idQuery.error) {
        console.warn('Error checking logical model name:', logicalNameQuery.error || idQuery.error);
        return false;
      }

      // 如果存在logical_name匹配的记录，且该记录的logical_name确实等于查询值
      // 则认为这是一个逻辑模型名
      const hasLogicalMatch = data?.some(model => model.logical_name === modelId);
      const hasDirectIdMatch = data?.some(model => model.id === modelId && !model.logical_name);

      // 如果有逻辑名匹配，则认为是逻辑模型
      // 如果只有ID匹配且没有逻辑名，则认为是具体模型
      return hasLogicalMatch && !hasDirectIdMatch;
    } catch (error) {
      console.warn('Error in isLogicalModelName:', error);
      return false;
    }
  }

  /**
   * 获取逻辑模型的可用厂商
   */
  async getAvailableVendors(logicalModelName: string) {
    const vendorSelector = await this.getVendorSelector();
    return vendorSelector.getAvailableVendorsForModel(logicalModelName);
  }

  /**
   * 获取厂商健康状态
   */
  async getVendorHealth() {
    const vendorSelector = await this.getVendorSelector();
    return vendorSelector.getVendorHealthReport();
  }

  /**
   * 🆕 解析 Markdown 文本中的图片
   * 提取图片URL并生成附件，同时清理文本内容
   */
  private parseMarkdownImages(text: string): {
    cleanText: string;
    attachments: ContentAttachment[];
  } {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const attachments: ContentAttachment[] = [];

    let match;
    while ((match = imageRegex.exec(text)) !== null) {
      const [fullMatch, altText, url] = match;

      // 验证URL格式并处理
      const trimmedUrl = url.trim();
      if (this.isValidImageUrl(trimmedUrl)) {
        attachments.push({
          type: 'image',
          url: trimmedUrl,
          metadata: {
            alt_text: altText || '图片',
            filename: this.extractFilename(trimmedUrl),
            source: 'markdown_parsed',
            original_markdown: fullMatch
          }
        });
      } else {
        console.warn(`⚠️ 无效的图片URL，跳过: ${trimmedUrl}`);
      }
    }

    // 清理文本：移除图片Markdown语法，保留描述性文本
    const cleanText = text.replace(imageRegex, (match, altText) =>
      altText ? `[图片: ${altText}]` : '[图片]'
    );

    return { cleanText, attachments };
  }

  /**
   * 验证图片URL的有效性
   */
  private isValidImageUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // 支持 HTTPS 协议
      if (urlObj.protocol !== 'https:') {
        return false;
      }

      // 验证是否为我们的 Supabase Storage URL
      const isSupabaseStorage = url.includes('supabase.co/storage');

      // 也支持其他常见的图片托管服务
      const isCommonImageHost = [
        'amazonaws.com',
        'cloudinary.com',
        'imgur.com',
        'unsplash.com'
      ].some(host => url.includes(host));

      return isSupabaseStorage || isCommonImageHost;

    } catch (error) {
      return false;
    }
  }

  /**
   * 从URL中提取文件名
   */
  private extractFilename(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || 'image';

      // 如果文件名没有扩展名，尝试从URL推断
      if (!filename.includes('.')) {
        return `${filename}.jpg`; // 默认为 jpg
      }

      return filename;
    } catch (error) {
      return 'image.jpg';
    }
  }

  /**
   * 预热厂商选择器 - 在应用启动时调用
   */
  async warmUp(): Promise<void> {
    try {
      await this.getVendorSelector();
      console.log('✅ SmartLLMClient 预热完成');
    } catch (error) {
      console.error('❌ SmartLLMClient 预热失败:', error);
    }
  }

  /**
   * 批量模型调用 - 自动厂商分配
   */
  async batchCallLLM(requests: SmartLLMRequest[]): Promise<SmartLLMResponse[]> {
    const results: SmartLLMResponse[] = [];
    
    // 并行处理（但要考虑并发限制）
    const batchSize = 5; // 每批最多5个并发请求
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(request => this.callLLM(request))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 兼容性方法 - 直接传递给底层LLM客户端
   */
  async estimateTokens(text: string): Promise<number> {
    return this.llmClient.estimateTokens(text);
  }

  async getApiTimeout(): Promise<number> {
    return this.llmClient.getApiTimeout();
  }
}

/**
 * 全局智能LLM客户端实例
 */
let globalSmartLLMClient: SmartLLMClient | null = null;

/**
 * 获取全局智能LLM客户端实例
 */
export function getSmartLLMClient(): SmartLLMClient {
  if (!globalSmartLLMClient) {
    globalSmartLLMClient = new SmartLLMClient();
  }
  return globalSmartLLMClient;
}

/**
 * 便捷函数 - 智能LLM调用
 */
export async function callSmartLLM(request: SmartLLMRequest): Promise<SmartLLMResponse> {
  const client = getSmartLLMClient();
  return await client.callLLM(request);
}

export default SmartLLMClient;