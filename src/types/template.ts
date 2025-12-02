/**
 * 模板管理相关类型定义
 * 
 * 模板用于定义评测配置，包含维度、评分器、模型的组合关系
 */

// 基础模板接口
export interface Template {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
  created_by?: string;
}

// 模板映射关系（维度-评分器组合）
export interface TemplateMapping {
  id: string;
  template_id: string;
  dimension_id: string;
  evaluator_id: string;
  weight: number; // 该维度在模板中的权重 (0-1)
  config?: Record<string, any>; // 特定的配置覆盖
  created_at: string;
}

// 完整的模板数据（包含关联信息）
export interface TemplateWithMappings extends Template {
  mappings: TemplateMapping[];
  // 预加载的关联数据
  dimensions?: Array<{ id: string; name: string; description?: string }>;
  evaluators?: Array<{ id: string; name: string; type: string }>;
}

// 模板创建表单数据
export interface TemplateFormData {
  name: string;
  description?: string;
  status: 'draft' | 'active';
  mappings: Array<{
    dimension_id: string;
    evaluator_id: string;
    weight: number;
    config?: Record<string, any>;
  }>;
}

// 模板映射项（用于表单）
export interface TemplateMappingFormData {
  dimension_id: string;
  evaluator_id: string;
  weight: number;
  config?: Record<string, any>;
}

// 模板列表响应
export interface TemplateListResponse {
  templates: TemplateWithMappings[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

// 模板统计信息
export interface TemplateStats {
  total: number;
  by_status: Record<string, number>;
  by_dimension_count: Record<string, number>; // 按维度数量分组
  avg_mappings_per_template: number;
}

// 模板验证结果
export interface TemplateValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
  warnings: Array<{
    field: string;
    message: string;
  }>;
}

// 模板导入/导出
export interface TemplateExportData {
  template: Omit<Template, 'id' | 'created_at' | 'updated_at'>;
  mappings: Array<{
    dimension_name: string;
    evaluator_name: string;
    weight: number;
    config?: Record<string, any>;
  }>;
}

export interface TemplateImportResult {
  success: boolean;
  total: number;
  imported: number;
  failed: number;
  errors: Array<{
    row: number;
    error: string;
  }>;
}

// 模板应用配置（用于创建评测任务）
export interface TemplateApplicationConfig {
  template_id: string;
  test_case_ids: string[];
  model_ids: string[]; // 被评测的模型
  settings?: {
    concurrent_limit?: number;
    timeout?: number;
    retry_count?: number;
  };
}

// 用于构建器的可用资源
export interface TemplateBuilderResources {
  dimensions: Array<{
    id: string;
    name: string;
    description?: string;
    criteria?: string[];
  }>;
  evaluators: Array<{
    id: string;
    name: string;
    type: 'PROMPT' | 'REGEX' | 'CODE' | 'HUMAN';
    description?: string;
    compatible_dimensions?: string[]; // 兼容的维度ID列表
  }>;
}

// 模板克隆数据
export interface TemplateCloneData {
  source_template_id: string;
  new_name: string;
  new_description?: string;
  include_mappings: boolean;
}