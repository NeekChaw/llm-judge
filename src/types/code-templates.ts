/**
 * 代码评估模板系统类型定义
 */

export interface CodeEvaluationTemplate {
  id: string;
  name: string;
  description: string;
  category: 'algorithm' | 'format' | 'performance' | 'quality';
  language: 'python' | 'javascript' | 'typescript' | 'cpp' | 'java' | 'go';
  template_code: string;       // 带占位符的模板代码
  config_schema: any;          // JSON Schema for user configuration
  example_config: any;         // 示例配置
  tags: string[];              // 搜索标签
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CodeTemplateListResponse {
  templates: CodeEvaluationTemplate[];
  total: number;
}

export interface CodeTemplateResponse {
  template: CodeEvaluationTemplate;
}

export interface GenerateCodeRequest {
  template_id: string;
  user_config: any;  // 用户的具体配置
}

export interface GenerateCodeResponse {
  generated_code: string;        // 替换占位符后的最终代码
  validation_errors?: string[];  // 配置验证错误
  operation_trace?: {            // 🔍 错误追踪信息
    operationId: string;
    templateId: string;
    templateName: string;
    timestamp: string;
    userConfigHash: string;
  };
}

// 模板配置验证结果
export interface TemplateConfigValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// 代码生成引擎接口
export interface CodeGenerator {
  generateCode(template: CodeEvaluationTemplate, userConfig: any): Promise<GenerateCodeResponse>;
  validateConfig(template: CodeEvaluationTemplate, userConfig: any): TemplateConfigValidation;
  replaceTemplatePlaceholders(templateCode: string, config: any): string;
}

// 模板类别信息
export interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  examples: string[];
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: 'algorithm',
    name: '算法测试',
    description: '测试算法的正确性、性能和复杂度',
    icon: '🎯',
    examples: ['排序算法', '搜索算法', '数学计算', '数据结构操作']
  },
  {
    id: 'format',
    name: '格式验证',
    description: '验证输出格式是否符合要求',
    icon: '📋',
    examples: ['JSON格式', 'XML结构', 'CSV格式', 'API响应']
  },
  {
    id: 'performance',
    name: '性能基准',
    description: '测试代码的执行性能和资源使用',
    icon: '⚡',
    examples: ['时间复杂度', '内存使用', '大数据集测试', '并发性能']
  },
  {
    id: 'quality',
    name: '代码质量',
    description: '检查代码规范和最佳实践',
    icon: '🧹',
    examples: ['命名规范', '注释完整性', '代码结构', '复杂度控制']
  }
];