/**
 * 聚合分析工具函数
 * 用于检测任务兼容性和执行聚合操作
 */

export interface TaskDimension {
  id: string;
  name: string;
  description?: string;
  weight?: number;
}

export interface TaskModel {
  id: string;
  name: string;
  provider?: string;
}

export interface TaskForAggregation {
  id: string;
  name: string;
  status: 'completed';
  created_at: string;
  dimensions: TaskDimension[];
  models: TaskModel[];
  model_ids: string[];
  dimension_ids: string[];
}

export interface AggregationCompatibility {
  canVertical: boolean;   // 纵向聚合（相同维度）
  canHorizontal: boolean; // 横向聚合（相同模型）
  verticalReason?: string;
  horizontalReason?: string;
}

/**
 * 检测两个维度数组是否完全匹配
 */
export function areDimensionsIdentical(dims1: TaskDimension[], dims2: TaskDimension[]): boolean {
  if (dims1.length !== dims2.length) {
    return false;
  }

  // 按名称排序进行比较
  const sorted1 = [...dims1].sort((a, b) => a.name.localeCompare(b.name));
  const sorted2 = [...dims2].sort((a, b) => a.name.localeCompare(b.name));

  return sorted1.every((dim1, index) => {
    const dim2 = sorted2[index];
    return dim1.name === dim2.name; // 严格匹配维度名称
  });
}

/**
 * 检测两个模型数组是否完全匹配
 */
export function areModelsIdentical(models1: TaskModel[], models2: TaskModel[]): boolean {
  if (models1.length !== models2.length) {
    return false;
  }

  // 按ID排序进行比较
  const ids1 = [...models1].map(m => m.id).sort();
  const ids2 = [...models2].map(m => m.id).sort();

  return ids1.every((id1, index) => id1 === ids2[index]);
}

/**
 * 检测任务聚合兼容性
 */
export function checkAggregationCompatibility(tasks: TaskForAggregation[]): AggregationCompatibility {
  if (tasks.length < 2) {
    return {
      canVertical: false,
      canHorizontal: false,
      verticalReason: '至少需要2个任务才能进行聚合',
      horizontalReason: '至少需要2个任务才能进行聚合'
    };
  }

  // 检查所有任务是否都已完成
  const allCompleted = tasks.every(task => task.status === 'completed');
  if (!allCompleted) {
    return {
      canVertical: false,
      canHorizontal: false,
      verticalReason: '只有已完成的任务才能参与聚合',
      horizontalReason: '只有已完成的任务才能参与聚合'
    };
  }

  const firstTask = tasks[0];
  
  // 检查纵向聚合（相同维度）
  let canVertical = true;
  let verticalReason = '';
  
  for (let i = 1; i < tasks.length; i++) {
    if (!areDimensionsIdentical(firstTask.dimensions, tasks[i].dimensions)) {
      canVertical = false;
      verticalReason = `任务"${tasks[i].name}"的维度与基准任务"${firstTask.name}"不匹配`;
      break;
    }
  }

  if (canVertical) {
    verticalReason = `可以纵向聚合：扩展模型范围，保持${firstTask.dimensions.length}个相同维度`;
  }

  // 检查横向聚合（相同模型）
  let canHorizontal = true;
  let horizontalReason = '';
  
  for (let i = 1; i < tasks.length; i++) {
    if (!areModelsIdentical(firstTask.models, tasks[i].models)) {
      canHorizontal = false;
      horizontalReason = `任务"${tasks[i].name}"的模型集合与基准任务"${firstTask.name}"不匹配`;
      break;
    }
  }

  if (canHorizontal) {
    // 收集所有不同的维度
    const allDimensions = new Set<string>();
    tasks.forEach(task => {
      task.dimensions.forEach(dim => allDimensions.add(dim.name));
    });
    
    horizontalReason = `可以横向聚合：保持${firstTask.models.length}个相同模型，扩展至${allDimensions.size}个维度`;
  }

  return {
    canVertical,
    canHorizontal,
    verticalReason,
    horizontalReason
  };
}

/**
 * 创建聚合数据的唯一标识符
 */
export function createAggregationId(taskIds: string[]): string {
  const sortedIds = [...taskIds].sort();
  const timestamp = Date.now();
  return `agg_${timestamp}_${sortedIds.join('_').substring(0, 20)}`;
}

/**
 * 根据创建时间确定最新任务（用于数据优先级）
 */
export function getTasksByPriority(tasks: TaskForAggregation[]): TaskForAggregation[] {
  return [...tasks].sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * 合并任务的模型列表（纵向聚合用）
 * 相同模型以最新任务为准
 */
export function mergeModelsForVerticalAggregation(tasks: TaskForAggregation[]): TaskModel[] {
  const sortedTasks = getTasksByPriority(tasks);
  const modelMap = new Map<string, TaskModel>();
  
  // 按时间倒序处理，最新的覆盖旧的
  sortedTasks.reverse().forEach(task => {
    task.models.forEach(model => {
      modelMap.set(model.id, model);
    });
  });
  
  return Array.from(modelMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 合并任务的维度列表（横向聚合用）
 */
export function mergeDimensionsForHorizontalAggregation(tasks: TaskForAggregation[]): TaskDimension[] {
  const dimensionMap = new Map<string, TaskDimension>();
  
  tasks.forEach(task => {
    task.dimensions.forEach(dimension => {
      if (!dimensionMap.has(dimension.id)) {
        dimensionMap.set(dimension.id, dimension);
      }
    });
  });
  
  return Array.from(dimensionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 聚合类型枚举
 */
export enum AggregationType {
  VERTICAL = 'vertical',   // 纵向：相同维度，扩展模型
  HORIZONTAL = 'horizontal' // 横向：相同模型，扩展维度
}

/**
 * 预聚合统计信息
 */
export interface PreAggregatedStats {
  modelCount: number;
  dimensionCount: number;
  lastUpdatedAt: string;
  dataVersion: string; // 用于缓存失效检查
}

/**
 * 聚合配置接口
 */
export interface AggregationConfig {
  id: string;
  name: string;
  type: AggregationType;
  taskIds: string[];
  taskNames: string[];
  createdAt: string;
  dimensions: TaskDimension[];
  models: TaskModel[];
  compatibility?: AggregationCompatibility;
  // 预聚合统计信息
  preAggregatedStats?: PreAggregatedStats;
}

/**
 * 预聚合数据管理器
 */
export class PreAggregationManager {
  private static STORAGE_KEY = 'aggregation_analyses';
  
  /**
   * 创建带有预聚合统计的聚合配置
   */
  static async createAggregationWithPreStats(
    config: Omit<AggregationConfig, 'preAggregatedStats'>,
    models: TaskModel[],
    dimensions: TaskDimension[]
  ): Promise<AggregationConfig> {
    const preAggregatedStats: PreAggregatedStats = {
      modelCount: models.length,
      dimensionCount: dimensions.length,
      lastUpdatedAt: new Date().toISOString(),
      dataVersion: this.generateDataVersion(config.taskIds)
    };

    const configWithStats: AggregationConfig = {
      ...config,
      preAggregatedStats,
      models,
      dimensions
    };

    console.log(`✅ 创建预聚合配置: ${models.length}个模型, ${dimensions.length}个维度`);
    return configWithStats;
  }

  /**
   * 生成数据版本标识（用于缓存失效）
   */
  private static generateDataVersion(taskIds: string[]): string {
    const sortedIds = [...taskIds].sort();
    return `v_${Date.now()}_${sortedIds.join('_').substring(0, 10)}`;
  }

  /**
   * 保存聚合配置到localStorage
   */
  static saveAggregationConfig(config: AggregationConfig): void {
    try {
      const existing = this.loadAllAggregationConfigs();
      const updated = [...existing.filter(c => c.id !== config.id), config];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
      console.log('💾 聚合配置已保存到localStorage');
    } catch (error) {
      console.error('❌ 保存聚合配置失败:', error);
    }
  }

  /**
   * 从localStorage加载所有聚合配置
   */
  static loadAllAggregationConfigs(): AggregationConfig[] {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) return [];
      
      const configs = JSON.parse(saved);
      return Array.isArray(configs) ? configs : [];
    } catch (error) {
      console.error('❌ 加载聚合配置失败:', error);
      localStorage.removeItem(this.STORAGE_KEY);
      return [];
    }
  }

  /**
   * 获取单个聚合配置（优先使用预聚合数据）
   */
  static getAggregationConfig(id: string): AggregationConfig | null {
    const configs = this.loadAllAggregationConfigs();
    return configs.find(c => c.id === id) || null;
  }

  /**
   * 检查预聚合数据是否需要更新
   */
  static needsStatsRefresh(config: AggregationConfig, maxAgeMinutes: number = 60): boolean {
    if (!config.preAggregatedStats) return true;

    const lastUpdated = new Date(config.preAggregatedStats.lastUpdatedAt).getTime();
    const now = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;

    return (now - lastUpdated) > maxAge;
  }

  /**
   * 更新预聚合统计信息
   */
  static updatePreAggregatedStats(
    configId: string, 
    models: TaskModel[], 
    dimensions: TaskDimension[]
  ): void {
    try {
      const configs = this.loadAllAggregationConfigs();
      const configIndex = configs.findIndex(c => c.id === configId);
      
      if (configIndex === -1) {
        console.warn(`⚠️ 未找到聚合配置: ${configId}`);
        return;
      }

      const updatedStats: PreAggregatedStats = {
        modelCount: models.length,
        dimensionCount: dimensions.length,
        lastUpdatedAt: new Date().toISOString(),
        dataVersion: this.generateDataVersion(configs[configIndex].taskIds)
      };

      configs[configIndex] = {
        ...configs[configIndex],
        preAggregatedStats: updatedStats,
        models,
        dimensions
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(configs));
      console.log(`🔄 更新预聚合统计: ${configId} -> ${models.length}个模型, ${dimensions.length}个维度`);
    } catch (error) {
      console.error('❌ 更新预聚合统计失败:', error);
    }
  }
}