/**
 * 多厂商架构 - 逻辑模型工具库
 * 
 * 实现 "逻辑模型ID + 动态厂商选择" 架构的核心工具
 * 
 * 功能:
 * - 逻辑名称提取和标准化
 * - 厂商信息识别和映射
 * - 模型分组和优先级管理
 * - API调用兼容性保持
 */

import { Model } from '@/types/database';

/**
 * 扩展的模型接口 - 包含多厂商字段
 */
export interface ExtendedModel extends Model {
  logical_name?: string;
  vendor_name?: string; 
  api_model_name?: string;
  priority?: number;
  concurrent_limit?: number;
  success_rate?: number;
  status?: 'active' | 'inactive' | 'maintenance';
  model_group_id?: string;
}

/**
 * 厂商选择策略类型
 */
export type VendorSelectionStrategy = 
  | 'priority_first'      // 优先级优先
  | 'load_balancing'      // 负载均衡
  | 'fail_over'           // 故障转移
  | 'cost_optimal';       // 成本优化

/**
 * 厂商选择配置
 */
export interface VendorSelectionConfig {
  strategy: VendorSelectionStrategy;
  max_concurrent_per_vendor?: number;
  failure_threshold?: number;
  cost_weight?: number;
}

/**
 * 模型分组信息
 */
export interface ModelGroup {
  id: string;
  logical_name: string;
  description?: string;
  models: ExtendedModel[];
}

/**
 * 智能提取逻辑模型名
 * 实现您建议的"/"分割策略 + 智能匹配
 */
export function extractLogicalName(modelName: string): string {
  // 1. 包含"/"则提取最后一段
  if (modelName.includes('/')) {
    const logical = modelName.split('/').pop() || modelName;
    return logical;
  }
  
  // 2. 不包含"/"则保持原样
  return modelName;
}

/**
 * 提取厂商名称
 */
export function extractVendorName(modelName: string): string {
  if (modelName.includes('/')) {
    return modelName.split('/')[0];
  }
  
  // 基于已知模式匹配
  const vendorPatterns = [
    { pattern: /^gpt-/, vendor: 'OpenAI' },
    { pattern: /^claude-/, vendor: 'Anthropic' },
    { pattern: /^gemini-/, vendor: 'Google' },
    { pattern: /deepseek/i, vendor: 'DeepSeek' },
    { pattern: /qwen/i, vendor: 'Alibaba' },
    { pattern: /baidu/i, vendor: 'Baidu' },
    { pattern: /minimax/i, vendor: 'MiniMax' },
    { pattern: /doubao/i, vendor: 'ByteDance' },
    { pattern: /hunyuan/i, vendor: 'Tencent' },
    { pattern: /kimi/i, vendor: 'Moonshot' },
    { pattern: /glm/i, vendor: 'ZHIPU' },
  ];
  
  for (const { pattern, vendor } of vendorPatterns) {
    if (pattern.test(modelName)) {
      return vendor;
    }
  }
  
  return 'Unknown';
}

/**
 * 估算模型性能等级，用于设置初始priority
 */
export function estimateModelPriority(modelName: string, tags: string[] = []): number {
  // GPT-4系列 = 高优先级(1)
  if (modelName.toLowerCase().includes('gpt-4')) {
    return 1;
  }
  
  // Claude-3.5系列 = 高优先级(1) 
  if (modelName.toLowerCase().includes('claude-3.5') || modelName.toLowerCase().includes('sonnet')) {
    return 1;
  }
  
  // 推理模型 = 中等优先级(2)
  if (tags.includes('推理') || modelName.toLowerCase().includes('thinking')) {
    return 2;
  }
  
  // 其他模型 = 标准优先级(3)
  return 3;
}

/**
 * 设置初始并发限制
 */
export function estimateConcurrentLimit(vendorName: string): number {
  const limits: Record<string, number> = {
    'OpenAI': 100,
    'Anthropic': 80,
    'Google': 60,
    'SiliconFlow': 200,
    'DeepSeek': 150,
    'Alibaba': 120,
    'ByteDance': 100,
    'Tencent': 80,
    'ZHIPU': 100,
    'Unknown': 50
  };
  
  return limits[vendorName] || 50;
}

/**
 * 标准化模型显示名称
 * 用于UI显示的友好名称
 */
export function standardizeDisplayName(logicalName: string): string {
  // 基本清理
  let displayName = logicalName;
  
  // 移除常见的后缀
  displayName = displayName.replace(/-Instruct$|:free$/, '');
  
  // 标准化常见模型名
  const standardizations: Record<string, string> = {
    'gpt-4o': 'GPT-4o',
    'gpt-4': 'GPT-4',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'claude-3.5-sonnet': 'Claude-3.5 Sonnet',
    'claude-3-haiku': 'Claude-3 Haiku',
  };
  
  const lowerName = displayName.toLowerCase();
  for (const [key, value] of Object.entries(standardizations)) {
    if (lowerName.includes(key)) {
      return value;
    }
  }
  
  return displayName;
}

/**
 * 将模型按逻辑名称分组
 * 用于多厂商模型管理
 */
export function groupModelsByLogicalName(models: ExtendedModel[]): ModelGroup[] {
  const groups = new Map<string, ExtendedModel[]>();
  
  models.forEach(model => {
    const logical = model.logical_name || extractLogicalName(model.name);
    if (!groups.has(logical)) {
      groups.set(logical, []);
    }
    groups.get(logical)!.push(model);
  });
  
  return Array.from(groups.entries()).map(([logical, models]) => ({
    id: `group-${logical}`,
    logical_name: logical,
    description: `${models.length} vendor(s) available`,
    models: models.sort((a, b) => (a.priority || 3) - (b.priority || 3))
  }));
}

/**
 * 厂商选择器 - 核心算法
 * 根据策略和当前状态选择最优厂商
 */
export function selectOptimalVendor(
  modelGroup: ModelGroup,
  config: VendorSelectionConfig,
  currentLoads?: Map<string, number>
): ExtendedModel | null {
  const activeModels = modelGroup.models.filter(m => m.status === 'active');
  
  if (activeModels.length === 0) {
    return null;
  }
  
  switch (config.strategy) {
    case 'priority_first':
      return selectByPriority(activeModels);
    
    case 'load_balancing':
      return selectByLoadBalance(activeModels, currentLoads);
    
    case 'fail_over':
      return selectByFailOver(activeModels);
    
    case 'cost_optimal':
      return selectByCost(activeModels);
    
    default:
      return activeModels[0];
  }
}

/**
 * 按优先级选择
 */
function selectByPriority(models: ExtendedModel[]): ExtendedModel {
  return models.reduce((best, current) => 
    (current.priority || 3) < (best.priority || 3) ? current : best
  );
}

/**
 * 按负载均衡选择
 */
function selectByLoadBalance(
  models: ExtendedModel[], 
  currentLoads?: Map<string, number>
): ExtendedModel {
  if (!currentLoads) {
    return selectByPriority(models);
  }
  
  return models.reduce((best, current) => {
    const currentLoad = currentLoads.get(current.id) || 0;
    const bestLoad = currentLoads.get(best.id) || 0;
    const currentUtilization = currentLoad / (current.concurrent_limit || 50);
    const bestUtilization = bestLoad / (best.concurrent_limit || 50);
    
    return currentUtilization < bestUtilization ? current : best;
  });
}

/**
 * 按故障率选择
 */
function selectByFailOver(models: ExtendedModel[]): ExtendedModel {
  return models.reduce((best, current) => 
    (current.success_rate || 1.0) > (best.success_rate || 1.0) ? current : best
  );
}

/**
 * 按成本选择
 */
function selectByCost(models: ExtendedModel[]): ExtendedModel {
  return models.reduce((best, current) => {
    const currentCost = (current.input_cost_per_1k_tokens || 0) + (current.output_cost_per_1k_tokens || 0);
    const bestCost = (best.input_cost_per_1k_tokens || 0) + (best.output_cost_per_1k_tokens || 0);
    
    return currentCost < bestCost ? current : best;
  });
}

/**
 * 向后兼容 - 从现有模型名获取API调用名
 * 保证现有代码完全不受影响
 */
export function getApiModelName(model: ExtendedModel): string {
  // 优先使用新的api_model_name字段
  if (model.api_model_name) {
    return model.api_model_name;
  }
  
  // 兜底使用原始name字段
  return model.name;
}

/**
 * 获取显示名称 - 用于UI显示
 * 优先使用逻辑名称，兜底使用原名
 */
export function getDisplayName(model: ExtendedModel): string {
  if (model.logical_name) {
    return standardizeDisplayName(model.logical_name);
  }
  
  return standardizeDisplayName(extractLogicalName(model.name));
}

/**
 * 检查模型是否可用
 */
export function isModelAvailable(model: ExtendedModel, currentLoad?: number): boolean {
  if (model.status !== 'active') {
    return false;
  }
  
  if (currentLoad && model.concurrent_limit) {
    return currentLoad < model.concurrent_limit;
  }
  
  return true;
}

/**
 * 生成模型性能报告
 */
export interface ModelPerformanceReport {
  model_id: string;
  logical_name: string;
  vendor_name: string;
  success_rate: number;
  avg_response_time: number;
  current_load: number;
  utilization_rate: number;
  status: string;
  last_updated: Date;
}

/**
 * 计算模型利用率
 */
export function calculateUtilizationRate(currentLoad: number, limit: number): number {
  return limit > 0 ? Math.min(currentLoad / limit, 1.0) : 0;
}

export default {
  extractLogicalName,
  extractVendorName,
  estimateModelPriority,
  estimateConcurrentLimit,
  standardizeDisplayName,
  groupModelsByLogicalName,
  selectOptimalVendor,
  getApiModelName,
  getDisplayName,
  isModelAvailable,
  calculateUtilizationRate,
};