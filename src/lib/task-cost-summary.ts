/**
 * 任务成本汇总计算工具
 * 用于在任务列表中显示成本概览
 */

import { Currency } from '@/lib/user-preferences';
import { formatCost } from '@/lib/cost-calculator';

export interface TaskCostSummary {
  total_cost_usd: number;
  total_cost_cny: number;
  has_cost_data: boolean;
  model_count: number;
}

/**
 * 计算任务的成本汇总
 * 这是一个简化版本，用于任务列表快速显示
 */
export function calculateTaskCostSummary(
  subTasks: any[], 
  models: any[]
): TaskCostSummary {
  if (!subTasks || subTasks.length === 0 || !models || models.length === 0) {
    return {
      total_cost_usd: 0,
      total_cost_cny: 0,
      has_cost_data: false,
      model_count: 0
    };
  }

  // 创建模型定价映射
  const modelPricingMap = models.reduce((acc, model) => {
    if (model.input_cost_per_1k_tokens && model.output_cost_per_1k_tokens) {
      acc[model.name] = {
        input_cost_per_1k_tokens: model.input_cost_per_1k_tokens,
        output_cost_per_1k_tokens: model.output_cost_per_1k_tokens,
        cost_currency: model.cost_currency || 'USD'
      };
    }
    return acc;
  }, {} as Record<string, any>);

  let total_cost_usd = 0;
  let total_cost_cny = 0;
  let has_cost_data = false;
  const unique_models = new Set<string>();

  // 遍历子任务计算成本
  subTasks.forEach(task => {
    const modelPricing = modelPricingMap[task.model_name];
    if (!modelPricing) return;

    const prompt_tokens = task.prompt_tokens || 0;
    const completion_tokens = task.completion_tokens || 0;
    const reasoning_tokens = task.reasoning_tokens || 
      (task.model_response?.usage?.completion_tokens_details?.reasoning_tokens) || 0;

    if (prompt_tokens === 0 && completion_tokens === 0) return;

    has_cost_data = true;
    unique_models.add(task.model_name);

    // 计算成本
    const input_cost = (prompt_tokens / 1000) * modelPricing.input_cost_per_1k_tokens;
    const output_cost = ((completion_tokens + reasoning_tokens) / 1000) * modelPricing.output_cost_per_1k_tokens;
    const task_cost = input_cost + output_cost;

    // 根据模型货币单位转换
    if (modelPricing.cost_currency === 'CNY') {
      // 模型成本是人民币
      total_cost_cny += task_cost;
      total_cost_usd += task_cost / 7; // 固定汇率 1 USD = 7 CNY
    } else {
      // 模型成本是美元
      total_cost_usd += task_cost;
      total_cost_cny += task_cost * 7;
    }
  });

  return {
    total_cost_usd,
    total_cost_cny,
    has_cost_data,
    model_count: unique_models.size
  };
}

/**
 * 格式化任务成本显示
 */
export function formatTaskCostDisplay(
  costSummary: TaskCostSummary,
  currency: Currency = 'CNY'
): string {
  if (!costSummary.has_cost_data) {
    return '-';
  }

  const cost = currency === 'USD' ? costSummary.total_cost_usd : costSummary.total_cost_cny;
  return formatCost(cost, currency, 4);
}