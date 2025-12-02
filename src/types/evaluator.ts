// 评分器类型定义
export type EvaluatorType = 'PROMPT' | 'REGEX' | 'CODE' | 'HUMAN';

// 基础评分器接口
export interface BaseEvaluator {
  id: string;
  name: string;
  type: EvaluatorType;
  description?: string;
  config: EvaluatorConfig;
  created_at: string;
  updated_at: string;
}

// 评分器配置联合类型
export type EvaluatorConfig = 
  | PromptEvaluatorConfig 
  | RegexEvaluatorConfig 
  | CodeEvaluatorConfig 
  | HumanEvaluatorConfig;

// 代码提取策略类型
export interface CodeExtractionStrategy {
  type: 'auto' | 'regex' | 'markers';
  pattern?: string;         // 当type为regex时使用
  markers?: {               // 当type为markers时使用
    start: string;          // 如：```python
    end: string;            // 如：```
  };
}

// 代码执行配置
export interface CodeExecutionConfig {
  enabled: boolean;
  language: 'python' | 'javascript' | 'typescript';
  timeout_ms?: number;
  extract_code_strategy: CodeExtractionStrategy;
  extract_pattern?: string;     // 当strategy为regex时使用
  code_markers?: {              // 当strategy为markers时使用  
    start: string;              // 如：```python
    end: string;                // 如：```
  };
  fallback_on_error?: boolean;  // 代码执行失败时是否继续AI评分
}

// PROMPT类型评分器配置
export interface PromptEvaluatorConfig {
  type: 'PROMPT';
  model_id: string;
  system_prompt?: string;
  evaluation_prompt: string;
  temperature?: number;
  max_tokens?: number;
  
  // 🆕 混合评估配置
  code_execution?: CodeExecutionConfig;
}

// REGEX类型评分器配置
export interface RegexEvaluatorConfig {
  type: 'REGEX';
  patterns: Array<{
    pattern: string;
    flags?: string;
    score: number;
    weight?: number;
    expected_matches?: number;
    description?: string;
  }>;
  default_score: number;
  score_max?: number;
  case_sensitive?: boolean;
}

// CODE类型评分器配置
export interface CodeEvaluatorConfig {
  type: 'CODE';
  language: 'python' | 'javascript' | 'typescript';
  
  // 现有字段
  code?: string;                    // 自定义代码（与template_config互斥）
  timeout_ms?: number;
  default_score?: number;
  score_max?: number;
  requirements?: string[];
  environment_vars?: Record<string, string>;
  
  // 🆕 模板配置字段
  use_template?: boolean;           // 是否使用模板
  template_id?: string;             // 模板ID
  template_config?: any;            // 根据模板schema的用户配置
}

// HUMAN类型评分器配置
export interface HumanEvaluatorConfig {
  type: 'HUMAN';
  guidelines: string;
  scoring_criteria: Array<{
    criterion: string;
    weight: number;
    description?: string;
  }>;
  required_qualifications?: string[];
}

// 评分器创建/更新表单数据
export interface EvaluatorFormData {
  name: string;
  type: EvaluatorType;
  description?: string;
  config: Partial<EvaluatorConfig>;
}

// 评分器验证错误
export interface EvaluatorValidationError {
  field: string;
  message: string;
}

// 评分器列表查询参数
export interface EvaluatorListParams {
  type?: EvaluatorType;
  search?: string;
  limit?: number;
  offset?: number;
}

// 评分器执行结果
export interface EvaluatorResult {
  score: number;
  justification?: string;
  metadata?: Record<string, any>;
  execution_time_ms: number;
  status: 'success' | 'error';
  error_message?: string;
}

// 代码提取结果
export interface ExtractedCode {
  code: string;
  language?: string;
  confidence: number;
  extraction_method?: string;
}

// 代码执行结果（用于混合评估的系统变量）
export interface CodeExecutionResult {
  stdout: string;
  stderr: string;
  execution_status: 'success' | 'failed' | 'timeout';
  execution_time_ms: number;
  test_results?: any;  // 可扩展的测试结果
  extracted_code?: ExtractedCode;
}

// 扩展系统变量类型以支持代码执行结果
export interface HybridEvaluationVariables {
  code_execution_result: CodeExecutionResult;
}