/**
 * 双模板系统类型定义
 * 支持统一模板和自定义模板两种模式
 */

// 模板类型枚举
export type TemplateType = 'unified' | 'custom';

// 基础模板接口
export interface BaseTemplate {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'draft';
  template_type: TemplateType;
  created_at: string;
  updated_at?: string;
}

// 统一模板映射（现有结构）
export interface UnifiedTemplateMapping {
  id: string;
  template_id: string;
  dimension_id: string;
  evaluator_id: string;
  created_at: string;
}

// 自定义模板映射（新增结构）
export interface CustomTemplateMapping {
  id: string;
  template_id: string;
  dimension_id: string;
  evaluator_id: string;
  test_case_ids: string[]; // 该维度专用的题目IDs
  system_prompt?: string;  // 该维度专用的角色
  created_at: string;
}

// 扩展的模板接口
export interface UnifiedTemplate extends BaseTemplate {
  template_type: 'unified';
  mappings: UnifiedTemplateMapping[];
  dimensions_count: number;
  evaluators_count: number;
}

export interface CustomTemplate extends BaseTemplate {
  template_type: 'custom';
  custom_mappings: CustomTemplateMapping[];
  dimensions_count: number;
  evaluators_count: number;
  total_test_cases: number; // 所有维度包含的题目总数
}

// 联合类型
export type Template = UnifiedTemplate | CustomTemplate;

// 模板创建请求接口
export interface CreateUnifiedTemplateRequest {
  name: string;
  description?: string;
  status?: 'active' | 'inactive' | 'draft';
  template_type: 'unified';
  mappings: {
    dimension_id: string;
    evaluator_id: string;
  }[];
}

export interface CreateCustomTemplateRequest {
  name: string;
  description?: string;
  status?: 'active' | 'inactive' | 'draft';
  template_type: 'custom';
  custom_mappings: {
    dimension_id: string;
    evaluator_id: string;
    test_case_ids: string[];
    system_prompt?: string;
  }[];
}

export type CreateTemplateRequest = CreateUnifiedTemplateRequest | CreateCustomTemplateRequest;

// 模板详情接口（用于详情页面）
export interface TemplateDetail extends BaseTemplate {
  template_type: TemplateType;
  mappings?: UnifiedTemplateMapping[];
  custom_mappings?: CustomTemplateMapping[];
  dimensions_count: number;
  evaluators_count: number;
  total_test_cases?: number;
  
  // 关联数据
  dimensions?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  evaluators?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  test_cases?: Array<{
    id: string;
    input: string;
    category?: string;
  }>;
}

// 模板统计信息
export interface TemplateStats {
  total_templates: number;
  unified_templates: number;
  custom_templates: number;
  active_templates: number;
  inactive_templates: number;
}

// 模板验证结果
export interface TemplateValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// 工具函数接口
export interface TemplateUtils {
  validateTemplate(template: CreateTemplateRequest): TemplateValidation;
  getTemplateType(template: Template): TemplateType;
  isUnifiedTemplate(template: Template): template is UnifiedTemplate;
  isCustomTemplate(template: Template): template is CustomTemplate;
}

// 执行上下文相关接口
export interface ExecutionMapping {
  dimension_id: string;
  evaluator_id: string;
  test_case_ids: string[];
  system_prompt?: string;
}

export interface TemplateExecutionPlan {
  template_id: string;
  template_type: TemplateType;
  mappings: ExecutionMapping[];
  total_evaluations: number; // 预计的评测次数
}

// 角色优先级定义
export interface SystemPromptContext {
  custom_mapping_prompt?: string;  // 最高优先级：自定义模板的维度级角色
  task_prompt?: string;           // 第二优先级：任务级角色
  evaluator_prompt?: string;      // 向后兼容：评分器遗留配置
}

// 模板使用统计
export interface TemplateUsageStats {
  template_id: string;
  template_name: string;
  template_type: TemplateType;
  total_tasks: number;
  total_evaluations: number;
  avg_score: number;
  last_used: string;
}