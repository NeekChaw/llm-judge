// 数据库实体类型定义

export interface Dimension {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Evaluator {
  id: string;
  name: string;
  type: 'PROMPT' | 'REGEX' | 'CODE' | 'HUMAN';
  config: EvaluatorConfig;
  description?: string;
  created_at: string;
  updated_at: string;
}

export type EvaluatorConfig = 
  | PromptEvaluatorConfig 
  | RegexEvaluatorConfig 
  | CodeEvaluatorConfig 
  | HumanEvaluatorConfig;

export interface PromptEvaluatorConfig {
  score_range: [number, number];
  model_id: string;
  prompt_template: string;
  output_parser: {
    type: 'json_path' | 'regex';
    path: string;
  };
}

export interface RegexEvaluatorConfig {
  score_range: [number, number];
  pattern: string;
  match_action: 'score_if_match' | 'score_if_no_match';
  score: number;
}

export interface CodeEvaluatorConfig {
  score_range: [number, number];
  e2b_template_id: string;
  entrypoint_code: string;
  timeout_ms: number;
}

export interface HumanEvaluatorConfig {
  score_range: [number, number];
  instructions: string;
  schema: object;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateMapping {
  template_id: string;
  dimension_id: string;
  evaluator_id: string;
}

export interface TestCase {
  id: string;
  input: string;
  reference_answer?: string;
  max_score?: number; // 题目满分（总得分点数），默认100分
  created_at: string;
  updated_at: string;
}

export interface Model {
  id: string;
  name: string;
  provider?: string;
  api_endpoint?: string;
  api_key_env_var?: string;
  input_cost_per_1k_tokens?: number;
  output_cost_per_1k_tokens?: number;
  cost_currency?: 'USD' | 'CNY'; // 成本货币单位，非必填，默认USD
  // 🆕 Phase 1: 多提供商成本管理字段
  provider_input_cost_per_1k_tokens?: number;   // 提供商特定输入成本
  provider_output_cost_per_1k_tokens?: number;  // 提供商特定输出成本
  provider_cost_currency?: 'USD' | 'CNY';       // 提供商成本货币单位
  cost_last_updated?: string;                    // 成本最后更新时间
  max_context_window?: number;
  tags: string[];
  // 新增：被测评时的默认配置
  default_max_tokens?: number;
  default_temperature?: number;
  default_thinking_budget?: number; // 仅推理模型可用
  // 🆕 多厂商架构新字段
  logical_name?: string;           // 逻辑模型名 (如 "GPT-4o")
  vendor_name?: string;            // 厂商名 (如 "OpenAI") 
  api_model_name?: string;         // API调用名 (如 "gpt-4o")
  priority?: number;               // 厂商优先级 (1=高, 3=低)
  concurrent_limit?: number;       // 并发限制
  success_rate?: number;           // 历史成功率 (0.0-1.0)
  status?: 'active' | 'inactive' | 'maintenance'; // 厂商状态
  model_group_id?: string;         // 模型分组ID
  created_at: string;
  updated_at: string;
}

export interface EvaluationTask {
  id: string;
  name?: string;
  status: 'pending' | 'preparing' | 'queued' | 'running' | 'completed' | 'partial_success' | 'failed' | 'cancelled';
  config?: object;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
}

export interface EvaluationResult {
  id: number;
  task_id: string;
  repetition_index: number;
  test_case_id: string;
  model_id: string;
  dimension_id: string;
  evaluator_id: string;
  model_response?: object;
  score?: number;
  justification?: string;
  status: 'success' | 'failed';
  prompt_tokens?: number;
  completion_tokens?: number;
  error_message?: string;
  created_at: string;
}

export interface SystemConfig {
  key: string;
  value: any;
  description?: string;
  updated_at: string;
}

export interface TaskMetric {
  task_id: string;
  total_subtasks: number;
  succeeded_subtasks: number;
  failed_subtasks: number;
  execution_time_ms: number;
  created_at: string;
}