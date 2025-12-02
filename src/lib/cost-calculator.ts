/**
 * 成本计算工具
 * 支持输入输出token成本计算，包含思维链消耗
 */

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens?: number; // 思维链token消耗
}

export interface ModelPricing {
  input_cost_per_1k_tokens: number; // 成本/1K tokens
  output_cost_per_1k_tokens: number; // 成本/1K tokens
  cost_currency?: 'USD' | 'CNY'; // 成本货币单位，默认USD
}

// 🆕 Phase 2: 扩展的模型定价接口，支持提供商级别成本
export interface ExtendedModelPricing extends ModelPricing {
  // 提供商特定成本字段（优先级更高）
  provider_input_cost_per_1k_tokens?: number;
  provider_output_cost_per_1k_tokens?: number;
  provider_cost_currency?: 'USD' | 'CNY';
  // 模型标识信息
  model_name?: string;
  provider_name?: string;
  logical_name?: string;
}

export interface CostCalculationResult {
  input_cost_usd: number;
  output_cost_usd: number;
  total_cost_usd: number;
  input_cost_cny: number;
  output_cost_cny: number;
  total_cost_cny: number;
  model_currency: 'USD' | 'CNY'; // 模型原始货币单位
  token_breakdown: {
    prompt_tokens: number;
    completion_tokens: number;
    reasoning_tokens: number;
    total_tokens: number;
  };
}

// 汇率常量
export const USD_TO_CNY_RATE = 7;

/**
 * 计算单个任务的成本
 */
export function calculateTaskCost(
  tokenUsage: TokenUsage,
  modelPricing: ModelPricing
): CostCalculationResult {
  const { prompt_tokens, completion_tokens, reasoning_tokens = 0 } = tokenUsage;
  const { input_cost_per_1k_tokens, output_cost_per_1k_tokens, cost_currency = 'USD' } = modelPricing;

  // 计算原始货币成本
  const input_cost_original = (prompt_tokens / 1000) * input_cost_per_1k_tokens;
  
  // 输出成本包含普通输出token + 思维链token
  const total_output_tokens = completion_tokens + reasoning_tokens;
  const output_cost_original = (total_output_tokens / 1000) * output_cost_per_1k_tokens;
  
  const total_cost_original = input_cost_original + output_cost_original;

  // 根据模型货币单位进行转换
  let input_cost_usd, output_cost_usd, total_cost_usd;
  let input_cost_cny, output_cost_cny, total_cost_cny;

  if (cost_currency === 'CNY') {
    // 模型成本是人民币，转换为美元
    input_cost_cny = input_cost_original;
    output_cost_cny = output_cost_original;
    total_cost_cny = total_cost_original;
    
    input_cost_usd = input_cost_cny / USD_TO_CNY_RATE;
    output_cost_usd = output_cost_cny / USD_TO_CNY_RATE;
    total_cost_usd = total_cost_cny / USD_TO_CNY_RATE;
  } else {
    // 模型成本是美元，转换为人民币
    input_cost_usd = input_cost_original;
    output_cost_usd = output_cost_original;
    total_cost_usd = total_cost_original;
    
    input_cost_cny = input_cost_usd * USD_TO_CNY_RATE;
    output_cost_cny = output_cost_usd * USD_TO_CNY_RATE;
    total_cost_cny = total_cost_usd * USD_TO_CNY_RATE;
  }

  return {
    input_cost_usd,
    output_cost_usd,
    total_cost_usd,
    input_cost_cny,
    output_cost_cny,
    total_cost_cny,
    model_currency: cost_currency,
    token_breakdown: {
      prompt_tokens,
      completion_tokens,
      reasoning_tokens,
      total_tokens: prompt_tokens + completion_tokens + reasoning_tokens
    }
  };
}

/**
 * 获取模型实际使用成本配置（用于准确的成本记录）
 * 
 * 重要说明：
 * - 模型选择不受成本影响（仍按优先级、负载均衡等策略）
 * - 但调用后要准确记录真实的提供商成本
 * - provider_*字段存储更精确的提供商定价
 */
export function getProviderCost(modelPricing: ExtendedModelPricing): ModelPricing {
  // 优先使用精确的提供商成本，fallback到基础成本
  const input_cost = modelPricing.provider_input_cost_per_1k_tokens ?? modelPricing.input_cost_per_1k_tokens;
  const output_cost = modelPricing.provider_output_cost_per_1k_tokens ?? modelPricing.output_cost_per_1k_tokens;
  const currency = modelPricing.provider_cost_currency ?? modelPricing.cost_currency ?? 'USD';

  return {
    input_cost_per_1k_tokens: input_cost || 0,
    output_cost_per_1k_tokens: output_cost || 0,
    cost_currency: currency
  };
}

/**
 * 获取成本来源信息用于UI显示
 */
export function getCostSourceInfo(modelPricing: ExtendedModelPricing): {
  base_cost: ModelPricing;           // 基础成本（原字段，对应provider的成本）
  updated_cost?: ModelPricing;       // 更新成本（provider_*字段）
  using_updated: boolean;            // 是否使用了更新成本
  provider_name?: string;            // 提供商名称
} {
  const hasUpdatedCost = !!(
    modelPricing.provider_input_cost_per_1k_tokens !== undefined ||
    modelPricing.provider_output_cost_per_1k_tokens !== undefined
  );

  const baseCost = {
    input_cost_per_1k_tokens: modelPricing.input_cost_per_1k_tokens || 0,
    output_cost_per_1k_tokens: modelPricing.output_cost_per_1k_tokens || 0,
    cost_currency: modelPricing.cost_currency || 'USD'
  };

  const updatedCost = hasUpdatedCost ? {
    input_cost_per_1k_tokens: modelPricing.provider_input_cost_per_1k_tokens || 0,
    output_cost_per_1k_tokens: modelPricing.provider_output_cost_per_1k_tokens || 0,
    cost_currency: modelPricing.provider_cost_currency || 'USD'
  } : undefined;

  return {
    base_cost: baseCost,
    updated_cost: updatedCost,
    using_updated: hasUpdatedCost,
    provider_name: modelPricing.provider_name
  };
}

/**
 * 增强的成本计算函数，使用真实的提供商成本进行准确计算
 */
export function calculateTaskCostWithProvider(
  tokenUsage: TokenUsage,
  modelPricing: ExtendedModelPricing
): CostCalculationResult & { 
  has_provider_cost: boolean; // 是否使用了提供商特定成本
  cost_source: string; // 实际使用的成本来源
  cost_accuracy: 'high' | 'medium'; // 成本准确度
} {
  // 获取实际使用的成本配置（准确记录真实花费）
  const actualPricing = getProviderCost(modelPricing);
  
  // 检查是否使用了提供商特定成本
  const hasProviderCost = !!(
    modelPricing.provider_input_cost_per_1k_tokens !== undefined ||
    modelPricing.provider_output_cost_per_1k_tokens !== undefined
  );

  // 生成实际成本来源描述
  const providerName = modelPricing.provider_name || 'Unknown Provider';
  const costSource = hasProviderCost 
    ? `Accurate provider cost (${providerName})`
    : `Base cost (${providerName})`;

  // 成本准确度评估
  const costAccuracy = hasProviderCost ? 'high' : 'medium';

  // 使用实际成本进行计算
  const result = calculateTaskCost(tokenUsage, actualPricing);

  return {
    ...result,
    has_provider_cost: hasProviderCost,
    cost_source: costSource,
    cost_accuracy: costAccuracy
  };
}

/**
 * 聚合多个子任务的成本
 */
export function aggregateTasksCost(
  costs: CostCalculationResult[]
): CostCalculationResult {
  const totals = costs.reduce(
    (acc, cost) => ({
      input_cost_usd: acc.input_cost_usd + cost.input_cost_usd,
      output_cost_usd: acc.output_cost_usd + cost.output_cost_usd,
      total_cost_usd: acc.total_cost_usd + cost.total_cost_usd,
      input_cost_cny: acc.input_cost_cny + cost.input_cost_cny,
      output_cost_cny: acc.output_cost_cny + cost.output_cost_cny,
      total_cost_cny: acc.total_cost_cny + cost.total_cost_cny,
      model_currency: 'USD', // 聚合结果统一为标准化货币单位
      token_breakdown: {
        prompt_tokens: acc.token_breakdown.prompt_tokens + cost.token_breakdown.prompt_tokens,
        completion_tokens: acc.token_breakdown.completion_tokens + cost.token_breakdown.completion_tokens,
        reasoning_tokens: acc.token_breakdown.reasoning_tokens + cost.token_breakdown.reasoning_tokens,
        total_tokens: acc.token_breakdown.total_tokens + cost.token_breakdown.total_tokens
      }
    }),
    {
      input_cost_usd: 0,
      output_cost_usd: 0,
      total_cost_usd: 0,
      input_cost_cny: 0,
      output_cost_cny: 0,
      total_cost_cny: 0,
      model_currency: 'USD' as 'USD' | 'CNY',
      token_breakdown: {
        prompt_tokens: 0,
        completion_tokens: 0,
        reasoning_tokens: 0,
        total_tokens: 0
      }
    }
  );

  return totals;
}

/**
 * 格式化成本显示
 */
export function formatCost(amount: number, currency: 'USD' | 'CNY', precision: number = 4): string {
  const symbol = currency === 'USD' ? '$' : '¥';
  return `${symbol}${amount.toFixed(precision)}`;
}

/**
 * 格式化token数量
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * 计算每1K token的成本
 */
export function calculateCostPer1KTokens(
  totalCost: number,
  totalTokens: number,
  currency: 'USD' | 'CNY'
): string {
  if (totalTokens === 0) return formatCost(0, currency);
  const costPer1K = (totalCost / totalTokens) * 1000;
  return formatCost(costPer1K, currency);
}

/**
 * 从模型响应中提取token使用信息
 */
export function extractTokenUsageFromResponse(modelResponse: any): TokenUsage {
  // 处理不同LLM提供商的响应格式
  if (!modelResponse) {
    return { prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0 };
  }

  // OpenAI格式
  if (modelResponse.usage) {
    return {
      prompt_tokens: modelResponse.usage.prompt_tokens || 0,
      completion_tokens: modelResponse.usage.completion_tokens || 0,
      reasoning_tokens: modelResponse.usage.completion_tokens_details?.reasoning_tokens || 0
    };
  }

  // Anthropic格式
  if (modelResponse.usage && (modelResponse.usage.input_tokens !== undefined || modelResponse.usage.output_tokens !== undefined)) {
    return {
      prompt_tokens: modelResponse.usage.input_tokens || 0,
      completion_tokens: modelResponse.usage.output_tokens || 0,
      reasoning_tokens: 0 // Anthropic暂不支持思维链
    };
  }
  
  // 其他格式检查
  if (modelResponse.meta) {
    return {
      prompt_tokens: modelResponse.meta.input_tokens || 0,
      completion_tokens: modelResponse.meta.output_tokens || 0,
      reasoning_tokens: 0
    };
  }

  // 直接从字段获取
  return {
    prompt_tokens: modelResponse.prompt_tokens || 0,
    completion_tokens: modelResponse.completion_tokens || 0,
    reasoning_tokens: modelResponse.reasoning_tokens || 0
  };
}