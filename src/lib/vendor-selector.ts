/**
 * 厂商选择服务 - Phase 2: 动态厂商选择器
 * 
 * 实现智能厂商选择和负载均衡功能
 * 支持多种选择策略和实时监控
 */

import { Model } from '@/types/database';
import { 
  ExtendedModel, 
  ModelGroup, 
  VendorSelectionStrategy, 
  VendorSelectionConfig,
  selectOptimalVendor,
  groupModelsByLogicalName,
  isModelAvailable
} from './model-utils';
import { createClient } from './supabase';

/**
 * 厂商性能监控接口
 */
interface VendorMetrics {
  vendor_id: string;
  current_load: number;
  success_rate: number;
  avg_response_time: number;
  last_failure_time?: Date;
  consecutive_failures: number;
  is_available: boolean;
}

/**
 * 厂商选择结果
 */
interface VendorSelectionResult {
  selected_model: ExtendedModel;
  reason: string;
  alternatives: ExtendedModel[];
  performance_score: number;
}

/**
 * 系统配置
 */
interface SystemVendorConfig {
  default_strategy: VendorSelectionStrategy;
  failure_threshold: number;
  circuit_breaker_timeout: number;
  load_balance_weight: number;
  cost_optimization_enabled: boolean;
}

/**
 * 厂商选择器核心类
 */
export class VendorSelector {
  // 懒加载 Supabase 客户端，避免构建时初始化
  private get supabase() {
    return createClient();
  }
  private metrics = new Map<string, VendorMetrics>();
  private config: SystemVendorConfig;
  private modelGroups = new Map<string, ModelGroup>();

  constructor(config?: Partial<SystemVendorConfig>) {
    this.config = {
      default_strategy: 'priority_first',
      failure_threshold: 0.7,
      circuit_breaker_timeout: 300000, // 5分钟
      load_balance_weight: 0.3,
      cost_optimization_enabled: false,
      ...config
    };
  }

  /**
   * 初始化厂商选择器
   */
  async initialize(): Promise<void> {
    await this.loadModels();
    await this.loadMetrics();
  }

  /**
   * 加载所有模型数据
   */
  private async loadModels(): Promise<void> {
    const { data: models, error } = await this.supabase
      .from('models')
      .select('*')
      .eq('status', 'active');

    if (error) {
      throw new Error(`Failed to load models: ${error.message}`);
    }

    if (models) {
      const groups = groupModelsByLogicalName(models as ExtendedModel[]);
      groups.forEach(group => {
        this.modelGroups.set(group.logical_name, group);
      });
    }
  }

  /**
   * 加载厂商性能指标
   */
  private async loadMetrics(): Promise<void> {
    // 实际实现中这里会从Redis或数据库加载实时指标
    // 当前先使用模型中的基本信息
    for (const [_, group] of this.modelGroups) {
      for (const model of group.models) {
        this.metrics.set(model.id, {
          vendor_id: model.id,
          current_load: 0,
          success_rate: model.success_rate || 1.0,
          avg_response_time: 1000, // 默认1秒
          consecutive_failures: 0,
          is_available: true
        });
      }
    }
  }

  /**
   * 为逻辑模型选择最优厂商
   */
  async selectVendorForModel(
    logicalName: string, 
    customConfig?: Partial<VendorSelectionConfig>,
    excludeVendorIds?: Set<string> // 🔧 新增：排除的提供商ID集合
  ): Promise<VendorSelectionResult | null> {
    let group = this.modelGroups.get(logicalName);
    
    // 🔧 如果找不到模型组，尝试动态加载（可能包含非活跃模型）
    if (!group) {
      console.log(`⚠️  未找到逻辑名称 "${logicalName}" 的模型组，尝试动态加载...`);
      
      try {
        const { data: models, error } = await this.supabase
          .from('models')
          .select('*')
          .eq('logical_name', logicalName);
          
        if (error) throw error;
        
        if (models && models.length > 0) {
          // 只考虑活跃的模型用于新的选择
          const activeModels = models.filter(m => m.status === 'active');
          
          if (activeModels.length > 0) {
            const groups = groupModelsByLogicalName(activeModels as ExtendedModel[]);
            const dynamicGroup = groups.find(g => g.logical_name === logicalName);
            
            if (dynamicGroup) {
              console.log(`✅ 动态加载了逻辑模型组 "${logicalName}"，包含 ${dynamicGroup.models.length} 个活跃提供商`);

              // 🔧 为新加载的模型初始化 metrics
              dynamicGroup.models.forEach(model => {
                if (!this.metrics.has(model.id)) {
                  this.metrics.set(model.id, {
                    vendor_id: model.id,
                    current_load: 0,
                    success_rate: model.success_rate || 1.0,
                    avg_response_time: 1000,
                    consecutive_failures: 0,
                    is_available: true
                  });
                  console.log(`🔧 初始化模型 ${model.id} 的 metrics: provider=${model.provider}, api_model_name=${model.api_model_name}`);
                }
              });

              // 缓存到内存中以便后续使用
              this.modelGroups.set(logicalName, dynamicGroup);
              group = dynamicGroup;
            }
          } else {
            console.log(`❌ 逻辑名称 "${logicalName}" 的所有提供商都处于非活跃状态`);
            throw new Error(`No active providers found for logical name: ${logicalName}`);
          }
        }
      } catch (error) {
        console.error(`❌ 动态加载模型组失败:`, error);
        throw new Error(`No model group found for logical name: ${logicalName}. Dynamic loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    if (!group) {
      throw new Error(`No model group found for logical name: ${logicalName}`);
    }

    const config: VendorSelectionConfig = {
      strategy: this.config.default_strategy,
      max_concurrent_per_vendor: 50,
      failure_threshold: this.config.failure_threshold,
      cost_weight: 0.2,
      ...customConfig
    };

    // 过滤掉不可用的模型和已失败的提供商
    const availableModels = group.models.filter(model => {
      const metrics = this.metrics.get(model.id);
      const isAvailable = metrics?.is_available && isModelAvailable(model, metrics?.current_load);
      const isExcluded = excludeVendorIds?.has(model.id); // 🔧 检查是否在排除列表中
      return isAvailable && !isExcluded; // 🔧 同时满足可用且未被排除
    });

    if (availableModels.length === 0) {
      return null;
    }

    const selectedModel = selectOptimalVendor({
      ...group,
      models: availableModels
    }, config, this.getCurrentLoadsMap());

    if (!selectedModel) {
      return null;
    }

    const alternatives = availableModels
      .filter(m => m.id !== selectedModel.id)
      .slice(0, 3);

    const performanceScore = this.calculatePerformanceScore(selectedModel);

    return {
      selected_model: selectedModel,
      reason: this.getSelectionReason(selectedModel, config.strategy),
      alternatives,
      performance_score: performanceScore
    };
  }

  /**
   * 批量厂商选择 - 为多个逻辑模型选择厂商
   */
  async selectVendorsForModels(
    logicalNames: string[],
    customConfig?: Partial<VendorSelectionConfig>
  ): Promise<Map<string, VendorSelectionResult>> {
    const results = new Map<string, VendorSelectionResult>();

    for (const logicalName of logicalNames) {
      try {
        const result = await this.selectVendorForModel(logicalName, customConfig);
        if (result) {
          results.set(logicalName, result);
          // 更新负载计数
          this.updateLoad(result.selected_model.id, 1);
        }
      } catch (error) {
        console.error(`Failed to select vendor for ${logicalName}:`, error);
      }
    }

    return results;
  }

  /**
   * 更新厂商性能指标
   */
  async updateVendorMetrics(
    vendorId: string,
    metrics: Partial<VendorMetrics>
  ): Promise<void> {
    const current = this.metrics.get(vendorId);
    if (current) {
      this.metrics.set(vendorId, { ...current, ...metrics });
      
      // 检查是否需要触发熔断
      if (metrics.consecutive_failures && metrics.consecutive_failures >= 3) {
        await this.triggerCircuitBreaker(vendorId);
      }
    }
  }

  /**
   * 触发熔断保护
   */
  private async triggerCircuitBreaker(vendorId: string): Promise<void> {
    const metrics = this.metrics.get(vendorId);
    if (metrics) {
      metrics.is_available = false;
      
      // 设置熔断恢复定时器
      setTimeout(() => {
        const current = this.metrics.get(vendorId);
        if (current) {
          current.is_available = true;
          current.consecutive_failures = 0;
        }
      }, this.config.circuit_breaker_timeout);

      console.warn(`Circuit breaker triggered for vendor ${vendorId}`);
    }
  }

  /**
   * 获取当前负载情况
   */
  private getCurrentLoadsMap(): Map<string, number> {
    const loads = new Map<string, number>();
    for (const [vendorId, metrics] of this.metrics) {
      loads.set(vendorId, metrics.current_load);
    }
    return loads;
  }

  /**
   * 更新负载计数
   */
  private updateLoad(vendorId: string, delta: number): void {
    const metrics = this.metrics.get(vendorId);
    if (metrics) {
      metrics.current_load = Math.max(0, metrics.current_load + delta);
    }
  }

  /**
   * 计算性能评分
   */
  private calculatePerformanceScore(model: ExtendedModel): number {
    const metrics = this.metrics.get(model.id);
    if (!metrics) return 0.5;

    const successScore = metrics.success_rate;
    const loadScore = 1 - (metrics.current_load / (model.concurrent_limit || 50));
    const priorityScore = 1 - ((model.priority || 3) - 1) / 3;

    return (successScore * 0.4) + (loadScore * 0.3) + (priorityScore * 0.3);
  }

  /**
   * 获取选择原因
   */
  private getSelectionReason(model: ExtendedModel, strategy: VendorSelectionStrategy): string {
    switch (strategy) {
      case 'priority_first':
        return `选择优先级最高的厂商 (优先级: ${model.priority})`;
      case 'load_balancing':
        const load = this.metrics.get(model.id)?.current_load || 0;
        const limit = model.concurrent_limit || 50;
        return `选择负载最低的厂商 (当前负载: ${load}/${limit})`;
      case 'fail_over':
        const successRate = (this.metrics.get(model.id)?.success_rate || 1) * 100;
        return `选择成功率最高的厂商 (成功率: ${successRate.toFixed(1)}%)`;
      case 'cost_optimal':
        const cost = (model.input_cost_per_1k_tokens || 0) + (model.output_cost_per_1k_tokens || 0);
        return `选择成本最优的厂商 (成本: $${cost.toFixed(4)}/1k tokens)`;
      default:
        return '默认选择策略';
    }
  }

  /**
   * 获取厂商健康状态报告
   */
  async getVendorHealthReport(): Promise<{
    healthy_vendors: number;
    total_vendors: number;
    availability_rate: number;
    vendor_details: Array<{
      vendor_id: string;
      logical_name: string;
      vendor_name: string;
      is_healthy: boolean;
      current_load: number;
      success_rate: number;
      issues: string[];
    }>;
  }> {
    let healthyCount = 0;
    const totalCount = this.metrics.size;
    const vendorDetails = [];

    for (const [vendorId, metrics] of this.metrics) {
      const model = this.findModelById(vendorId);
      if (!model) continue;

      const isHealthy = metrics.is_available && 
                       metrics.success_rate >= this.config.failure_threshold &&
                       metrics.consecutive_failures < 3;
      
      if (isHealthy) healthyCount++;

      const issues: string[] = [];
      if (!metrics.is_available) issues.push('厂商不可用');
      if (metrics.success_rate < this.config.failure_threshold) {
        issues.push(`成功率过低 (${(metrics.success_rate * 100).toFixed(1)}%)`);
      }
      if (metrics.consecutive_failures >= 3) issues.push('连续失败次数过多');
      if (metrics.current_load >= (model.concurrent_limit || 50)) issues.push('负载已满');

      vendorDetails.push({
        vendor_id: vendorId,
        logical_name: model.logical_name || model.name,
        vendor_name: model.vendor_name || 'Unknown',
        is_healthy: isHealthy,
        current_load: metrics.current_load,
        success_rate: metrics.success_rate,
        issues
      });
    }

    return {
      healthy_vendors: healthyCount,
      total_vendors: totalCount,
      availability_rate: totalCount > 0 ? healthyCount / totalCount : 0,
      vendor_details: vendorDetails
    };
  }

  /**
   * 通过ID查找模型
   */
  private findModelById(id: string): ExtendedModel | null {
    for (const [_, group] of this.modelGroups) {
      const model = group.models.find(m => m.id === id);
      if (model) return model;
    }
    return null;
  }

  /**
   * 重新分配失败的任务
   */
  async reassignFailedTask(
    originalVendorId: string,
    logicalName: string,
    customConfig?: Partial<VendorSelectionConfig>,
    excludeVendorIds?: Set<string> // 🔧 新增：排除的提供商ID集合
  ): Promise<VendorSelectionResult | null> {
    // 标记原厂商为失败
    await this.updateVendorMetrics(originalVendorId, {
      consecutive_failures: (this.metrics.get(originalVendorId)?.consecutive_failures || 0) + 1,
      last_failure_time: new Date()
    });

    // 从备选厂商中选择，排除已失败的提供商
    const config: VendorSelectionConfig = {
      strategy: 'fail_over', // 失败重试时优先选择成功率高的
      ...customConfig
    };

    return await this.selectVendorForModel(logicalName, config, excludeVendorIds);
  }

  /**
   * 获取逻辑模型的所有可用厂商
   */
  getAvailableVendorsForModel(logicalName: string): ExtendedModel[] {
    const group = this.modelGroups.get(logicalName);
    if (!group) return [];

    return group.models.filter(model => {
      const metrics = this.metrics.get(model.id);
      return metrics?.is_available && isModelAvailable(model, metrics?.current_load);
    });
  }

  /**
   * 重置提供商状态 - 用于全新开始重试
   */
  async resetVendorMetrics(
    vendorIds: string[],
    resetValues?: Partial<VendorMetrics>
  ): Promise<void> {
    const defaultResetValues: Partial<VendorMetrics> = {
      consecutive_failures: 0,
      success_rate: 1.0,
      is_available: true,
      current_load: 0,
      last_failure_time: undefined,
      ...resetValues
    };

    vendorIds.forEach(vendorId => {
      const currentMetrics = this.metrics.get(vendorId);
      if (currentMetrics) {
        this.metrics.set(vendorId, {
          ...currentMetrics,
          ...defaultResetValues
        });
      }
    });

    console.log(`🔄 重置了 ${vendorIds.length} 个提供商的状态，准备全新开始重试`);
  }

  /**
   * 批量重置逻辑模型的所有提供商状态
   */
  async resetLogicalModelVendors(logicalNames: string[]): Promise<void> {
    const vendorIdsToReset: string[] = [];

    logicalNames.forEach(logicalName => {
      const group = this.modelGroups.get(logicalName);
      if (group) {
        group.models.forEach(model => {
          vendorIdsToReset.push(model.id);
        });
      }
    });

    await this.resetVendorMetrics(vendorIdsToReset);
    console.log(`🔄 为逻辑模型 [${logicalNames.join(', ')}] 重置了所有提供商状态`);
  }
}

/**
 * 全局厂商选择器实例
 */
let globalVendorSelector: VendorSelector | null = null;

/**
 * 获取全局厂商选择器实例
 */
export async function getVendorSelector(): Promise<VendorSelector> {
  if (!globalVendorSelector) {
    globalVendorSelector = new VendorSelector();
    await globalVendorSelector.initialize();
  }
  return globalVendorSelector;
}

/**
 * 便捷函数：为单个逻辑模型选择厂商
 */
export async function selectVendorForModel(
  logicalName: string,
  strategy?: VendorSelectionStrategy
): Promise<VendorSelectionResult | null> {
  const selector = await getVendorSelector();
  return await selector.selectVendorForModel(logicalName, { strategy });
}

/**
 * 便捷函数：获取厂商健康状态
 */
export async function getVendorHealth() {
  const selector = await getVendorSelector();
  return await selector.getVendorHealthReport();
}

/**
 * 重置全局厂商选择器缓存
 * 用于模型配置更新后强制重新加载
 */
export function resetVendorSelector(): void {
  console.log('🔄 重置全局 VendorSelector 缓存...');
  globalVendorSelector = null;
}

export default VendorSelector;