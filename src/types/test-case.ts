// 测试用例类型定义

import type { ContentAttachment } from '@/types/multimodal';

export interface TestCase {
  id: string;
  input: string;
  reference_answer?: string;
  // 🆕 Bug #4修复: 多模态参考答案支持
  reference_answer_multimodal?: {
    text: string;
    attachments: ContentAttachment[];
  };
  max_score?: number; // 题目满分（总得分点数），默认100分
  tags?: string[];
  category?: string;
  metadata?: Record<string, any>;
  // 🆕 新架构字段
  code_test_config?: CodeTestConfig;
  execution_environment?: string;
  validation_rules?: ValidationRules;
  // 🆕 多模态支持
  attachments?: ContentAttachment[];
  created_at: string;
  updated_at: string;
}

// 代码测试配置
export interface CodeTestConfig {
  test_data: Array<{
    input: any;
    expected: any;
    description?: string;
    name?: string;
    timeout?: number;
  }>;
  execution_config: {
    timeout_ms: number;
    memory_limit_mb: number;
    entry_point_strategy: string;
  };
}

// 验证规则
export interface ValidationRules {
  strict_output_match: boolean;
  ignore_whitespace: boolean;
  custom_validator?: string;
}

// 测试用例创建/更新表单数据
export interface TestCaseFormData {
  input: string;
  reference_answer?: string;
  // 🆕 Bug #4修复: 多模态参考答案支持
  reference_answer_multimodal?: {
    text: string;
    attachments: ContentAttachment[];
  };
  max_score?: number; // 题目满分（总得分点数），默认100分
  tags?: string[];
  category?: string;
  metadata?: Record<string, any>;
  // 🆕 新架构字段
  code_test_config?: CodeTestConfig;
  execution_environment?: string;
  validation_rules?: ValidationRules;
  // 🆕 多模态支持
  attachments?: ContentAttachment[];
}

// 测试用例列表查询参数
export interface TestCaseListParams {
  search?: string;
  category?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

// 测试用例列表响应
export interface TestCaseListResponse {
  test_cases: TestCase[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

// 批量导入数据格式
export interface TestCaseImportData {
  input: string;
  reference_answer?: string;
  max_score?: number; // 题目满分（总得分点数），默认100分
  tags?: string[];
  category?: string;
  metadata?: Record<string, any>;
}

// 批量导入结果
export interface TestCaseImportResult {
  success: boolean;
  total: number;
  imported: number;
  failed: number;
  errors: Array<{
    row: number;
    error: string;
    data: TestCaseImportData;
  }>;
}

// 导出格式选项
export type ExportFormat = 'json' | 'csv' | 'xlsx';

// 统计信息
export interface TestCaseStats {
  total: number;
  by_category: Record<string, number>;
  by_tags: Record<string, number>;
}