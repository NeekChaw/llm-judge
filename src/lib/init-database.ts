// Supabase数据库初始化脚本
import { supabase } from './db';

const SQL_SCHEMA = `
-- 开启 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 维度定义表
CREATE TABLE IF NOT EXISTS "dimensions" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255) NOT NULL,
    "description" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

-- 评分器定义表
CREATE TABLE IF NOT EXISTS "evaluators" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255) NOT NULL,
    "type" varchar(50) NOT NULL, -- 'PROMPT', 'REGEX', 'CODE', 'HUMAN'
    "config" jsonb NOT NULL,
    "description" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

-- 评测模板定义表
CREATE TABLE IF NOT EXISTS "templates" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255) NOT NULL,
    "description" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

-- 模板-维度-评分器 关联表
CREATE TABLE IF NOT EXISTS "template_mappings" (
    "template_id" uuid NOT NULL,
    "dimension_id" uuid NOT NULL,
    "evaluator_id" uuid NOT NULL,
    PRIMARY KEY ("template_id", "dimension_id", "evaluator_id")
);

-- 测试用例表
CREATE TABLE IF NOT EXISTS "test_cases" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "input" text NOT NULL,
    "reference_answer" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

-- 模型提供商与模型表
CREATE TABLE IF NOT EXISTS "models" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255) NOT NULL,
    "provider" varchar(100),
    "api_endpoint" varchar(255),
    "api_key_env_var" varchar(100),
    "input_cost_per_1k_tokens" numeric(10, 6),
    "output_cost_per_1k_tokens" numeric(10, 6),
    "max_context_window" integer,
    "tags" text[] DEFAULT '{"推理"}',
    -- 新增：被测评时的默认配置
    "default_max_tokens" integer,
    "default_temperature" numeric(3, 2),
    "default_thinking_budget" integer,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

-- 系统配置表
CREATE TABLE IF NOT EXISTS "system_configs" (
    "key" varchar(100) PRIMARY KEY,
    "value" jsonb NOT NULL,
    "description" text,
    "updated_at" timestamptz DEFAULT now()
);

-- 评测任务主表
CREATE TABLE IF NOT EXISTS "evaluation_tasks" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255),
    "status" varchar(20) NOT NULL DEFAULT 'pending',
    "config" jsonb,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "started_at" timestamptz,
    "finished_at" timestamptz,
    "error_message" text
);

-- 评测结果表
CREATE TABLE IF NOT EXISTS "evaluation_results" (
    "id" bigserial PRIMARY KEY,
    "task_id" uuid NOT NULL,
    "repetition_index" integer NOT NULL DEFAULT 1,
    "test_case_id" uuid NOT NULL,
    "model_id" uuid NOT NULL,
    "dimension_id" uuid NOT NULL,
    "evaluator_id" uuid NOT NULL,
    "model_response" jsonb,
    "score" numeric(10, 2),
    "justification" text,
    "status" varchar(20) NOT NULL DEFAULT 'success',
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "error_message" text,
    "created_at" timestamptz DEFAULT now()
);

-- 任务指标表
CREATE TABLE IF NOT EXISTS "task_metrics" (
    "task_id" uuid PRIMARY KEY,
    "total_subtasks" integer,
    "succeeded_subtasks" integer,
    "failed_subtasks" integer,
    "execution_time_ms" bigint,
    "created_at" timestamptz DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_template_mappings_dimension_id ON template_mappings(dimension_id);
CREATE INDEX IF NOT EXISTS idx_template_mappings_evaluator_id ON template_mappings(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_task_id ON evaluation_results(task_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_model_id ON evaluation_results(model_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_dimension_id ON evaluation_results(dimension_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_status ON evaluation_results(status);
CREATE INDEX IF NOT EXISTS idx_evaluation_tasks_status ON evaluation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_models_role ON models(role);

-- 插入默认系统配置
INSERT INTO "system_configs" ("key", "value", "description") VALUES
('task.concurrency.sub_tasks', '{"value": 20}', '工作单元(Worker)可以并行处理的子任务数量'),
('model_api_timeout_ms', '60000', '模型API调用超时(毫秒)'),
('evaluator_timeout_ms', '10000', '评分器执行超时(毫秒)'),
('max_retries_per_subtask', '3', '子任务最大重试次数'),
('retry_delay_strategy', '"exponential_backoff"', '重试延迟策略'),
('base_retry_delay_ms', '2000', '基础重试延迟(毫秒)'),
('task_failure_threshold_percent', '40', '任务失败阈值(%)')
ON CONFLICT ("key") DO NOTHING;

-- 插入测试数据
INSERT INTO "dimensions" ("name", "description") VALUES
('代码质量', '评估代码的可读性、可维护性和最佳实践'),
('功能正确性', '评估代码是否正确实现了预期功能'),
('安全性', '评估代码的安全性和潜在漏洞')
ON CONFLICT DO NOTHING;

INSERT INTO "models" ("name", "provider", "api_endpoint", "api_key_env_var", "role") VALUES
('硅基流动-GPT3.5', '硅基流动', 'https://api.siliconflow.cn/v1/chat/completions', 'SILICONFLOW_API_KEY', 'evaluator'),
('硅基流动-Claude', '硅基流动', 'https://api.siliconflow.cn/v1/chat/completions', 'SILICONFLOW_API_KEY', 'evaluatable'),
('硅基流动-Qwen', '硅基流动', 'https://api.siliconflow.cn/v1/chat/completions', 'SILICONFLOW_API_KEY', 'evaluatable')
ON CONFLICT DO NOTHING;
`;

export async function initializeDatabase() {
  try {
    console.log('开始初始化Supabase数据库...');
    
    // 执行SQL schema
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql: SQL_SCHEMA 
    });
    
    if (error) {
      console.error('数据库初始化失败:', error);
      throw error;
    }
    
    console.log('✅ 数据库初始化成功!');
    console.log('✅ 所有表已创建');
    console.log('✅ 索引已创建');  
    console.log('✅ 测试数据已插入');
    
    return { success: true, data };
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }
}

// 验证数据库表是否创建成功
export async function verifyDatabase() {
  try {
    console.log('验证数据库表...');
    
    const tables = [
      'dimensions', 'evaluators', 'templates', 'template_mappings',
      'test_cases', 'models', 'system_configs', 'evaluation_tasks',
      'evaluation_results', 'task_metrics'
    ];
    
    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
        
      if (error) {
        console.error(`❌ 表 ${table} 验证失败:`, error);
        return false;
      }
      
      console.log(`✅ 表 ${table} 验证成功`);
    }
    
    console.log('🎉 所有表验证成功!');
    return true;
  } catch (error) {
    console.error('❌ 数据库验证失败:', error);
    return false;
  }
}