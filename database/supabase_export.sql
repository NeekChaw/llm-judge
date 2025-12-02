-- AI Benchmark V2 完整数据库Schema
-- 版本: v2.5.1 (test_cases表结构同步更新)
-- 最后更新: 2025-11-21
-- 包含 18 张核心表（核心业务表 + 高级功能表）
--
-- 使用说明:
-- 1. 在 Supabase SQL Editor 中执行此文件
-- 2. 确保按顺序执行（已按依赖关系排序）
-- 3. 如果表已存在，会跳过创建（使用 IF NOT EXISTS）
-- 4. 系统配置默认值会自动插入（使用 ON CONFLICT DO NOTHING）

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- 表: dimensions
CREATE TABLE IF NOT EXISTS "dimensions" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255),
    "description" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "criteria" text[]
);

-- 表: evaluators
CREATE TABLE IF NOT EXISTS "evaluators" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255),
    "type" varchar(255),
    "config" jsonb,
    "description" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

-- 表: templates
CREATE TABLE IF NOT EXISTS "templates" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255),
    "description" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "status" varchar(255),
    "template_type" text
);

-- 表: test_cases
CREATE TABLE IF NOT EXISTS "test_cases" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "input" text,
    "reference_answer" text,
    "reference_answer_multimodal" jsonb,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "metadata" jsonb,
    "max_score" integer,
    "code_test_config" jsonb,
    "execution_environment" text,
    "validation_rules" jsonb,
    "modalities" jsonb DEFAULT '{"text": true}'::jsonb,
    "attachments" jsonb DEFAULT '[]'::jsonb,
    "input_type" varchar(20) DEFAULT 'text',
    CONSTRAINT test_cases_max_score_check CHECK (max_score > 0)
);

-- 表: models
CREATE TABLE IF NOT EXISTS "models" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255),
    "provider" text,
    "api_endpoint" varchar(500),
    "api_key_env_var" text,
    "input_cost_per_1k_tokens" numeric(10, 2),
    "output_cost_per_1k_tokens" numeric(10, 2),
    "max_context_window" integer,
    "role" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "status" varchar(255),
    "provider_id" uuid,
    "cost_unit" text,
    "default_max_tokens" integer,
    "default_temperature" numeric(10, 2),
    "default_thinking_budget" text,
    "cost_currency" text,
    "tags" text[],
    "logical_name" text,
    "vendor_name" text,
    "api_model_name" text,
    "priority" integer,
    "concurrent_limit" integer,
    "success_rate" integer,
    "model_group_id" uuid,
    "provider_input_cost_per_1k_tokens" text,
    "provider_output_cost_per_1k_tokens" text,
    "provider_cost_currency" text,
    "cost_last_updated" timestamptz,
    "input_modalities" text[],
    "output_modalities" text[],
    "vision_enabled" boolean,
    "image_generation_enabled" boolean
);

-- 表: system_configs
CREATE TABLE IF NOT EXISTS "system_configs" (
    "key" text PRIMARY KEY,
    "value" integer,
    "description" text,
    "updated_at" timestamptz
);

-- 表: api_providers
CREATE TABLE IF NOT EXISTS "api_providers" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255) UNIQUE NOT NULL,  -- ✅ UNIQUE constraint for provider names (migration 002)
    "display_name" text,
    "base_url" varchar(500),
    "api_key_env_var" text,
    "headers" jsonb,
    "auth_type" text,
    "request_template" jsonb,
    "response_mapping" jsonb,
    "rate_limit_rpm" integer,
    "timeout_ms" integer,
    "status" varchar(255),
    "is_builtin" boolean,
    "description" text,
    "created_at" timestamptz,
    "updated_at" timestamptz
);

-- 表: api_keys (API密钥加密存储)
CREATE TABLE IF NOT EXISTS "api_keys" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "provider_id" uuid REFERENCES api_providers(id) ON DELETE CASCADE,
    "key_name" varchar(100) NOT NULL,
    "key_value_encrypted" text NOT NULL,
    "key_hash" varchar(64) UNIQUE,
    "status" varchar(20) DEFAULT 'active',
    "quota_limit" integer,
    "usage_count" integer DEFAULT 0,
    "last_used_at" timestamptz,
    "expires_at" timestamptz,
    "created_at" timestamptz DEFAULT NOW(),
    "updated_at" timestamptz DEFAULT NOW(),
    "created_by" varchar(100),
    "notes" text,
    CONSTRAINT api_keys_provider_key_unique UNIQUE(provider_id, key_name),
    CONSTRAINT api_keys_status_check CHECK (status IN ('active', 'disabled')),
    CONSTRAINT api_keys_usage_count_check CHECK (usage_count >= 0),
    CONSTRAINT api_keys_quota_limit_check CHECK (quota_limit IS NULL OR quota_limit > 0)
);

-- api_keys 表索引
CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash) WHERE key_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_created_at ON api_keys(created_at DESC);

-- api_keys 表触发器（自动更新 updated_at）
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_keys_updated_at_trigger
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_keys_updated_at();

-- api_keys 表注释
COMMENT ON TABLE api_keys IS 'API密钥加密存储表 - 支持多提供商密钥管理';
COMMENT ON COLUMN api_keys.key_value_encrypted IS 'AES-256-GCM加密的API密钥 (格式: iv:authTag:encryptedData)';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA256哈希值，用于查找和审计（无需解密）';

-- 表: code_evaluation_templates
CREATE TABLE IF NOT EXISTS "code_evaluation_templates" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255),
    "description" text,
    "category" text,
    "language" text,
    "template_code" text,
    "config_schema" jsonb,
    "example_config" jsonb,
    "tags" text[],
    "is_active" boolean,
    "created_at" timestamptz,
    "updated_at" timestamptz
);

-- 表: media_assets
CREATE TABLE IF NOT EXISTS "media_assets" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "file_name" text,
    "original_name" text,
    "file_type" text,
    "mime_type" text,
    "file_size" integer,
    "storage_type" text,
    "storage_path" text,
    "public_url" varchar(500),
    "metadata" jsonb,
    "upload_status" text,
    "uploaded_by" text,
    "tags" text,
    "created_at" timestamptz,
    "updated_at" timestamptz
);

-- 表: template_mappings
CREATE TABLE IF NOT EXISTS "template_mappings" (
    "id" uuid DEFAULT uuid_generate_v4(),
    "template_id" uuid,
    "dimension_id" uuid,
    "evaluator_id" uuid,
    "weight" integer,
    "config" text,
    "created_at" timestamptz,
    PRIMARY KEY (template_id, dimension_id, evaluator_id)
);

ALTER TABLE "template_mappings" ADD CONSTRAINT fk_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE;
ALTER TABLE "template_mappings" ADD CONSTRAINT fk_dimension FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE;
ALTER TABLE "template_mappings" ADD CONSTRAINT fk_evaluator FOREIGN KEY (evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE;

-- 表: template_custom_mappings
CREATE TABLE IF NOT EXISTS "template_custom_mappings" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "template_id" uuid,
    "dimension_id" uuid,
    "evaluator_id" uuid,
    "test_case_ids" text[],
    "system_prompt" text,
    "weight" numeric(10, 2),
    "created_at" timestamptz,
    "updated_at" timestamptz
);

ALTER TABLE "template_custom_mappings" ADD CONSTRAINT fk_template_custom FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE;
ALTER TABLE "template_custom_mappings" ADD CONSTRAINT fk_dimension_custom FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE;
ALTER TABLE "template_custom_mappings" ADD CONSTRAINT fk_evaluator_custom FOREIGN KEY (evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE;

-- 表: evaluation_tasks
CREATE TABLE IF NOT EXISTS "evaluation_tasks" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" varchar(255),
    "status" varchar(255),
    "config" jsonb,
    "created_at" timestamptz,
    "updated_at" timestamptz,
    "started_at" timestamptz,
    "finished_at" timestamptz,
    "error_message" text,
    "system_prompt" text,
    "template_id" uuid,
    "description" text
);

-- 表: evaluation_results
CREATE TABLE IF NOT EXISTS "evaluation_results" (
    "id" bigserial PRIMARY KEY,
    "task_id" uuid,
    "repetition_index" integer,
    "test_case_id" uuid,
    "model_id" uuid,
    "dimension_id" uuid,
    "evaluator_id" uuid,
    "model_response" text,
    "score" integer,
    "justification" text,
    "status" varchar(255),
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "error_message" text,
    "created_at" timestamptz,
    "started_at" timestamptz,
    "completed_at" timestamptz,
    "execution_time" integer,
    "updated_at" timestamptz,
    "reasoning" text,
    "metadata" text,
    "code_execution_result_id" uuid,
    "execution_priority" integer,
    "dependencies_resolved" boolean,
    "execution_details" jsonb,
    "total_tokens" integer,
    "llm_response_time" integer,
    "run_index" integer,
    "response_attachments" text[],
    "input_modalities_used" text[],
    "output_modalities_generated" text[]
);

ALTER TABLE "evaluation_results" ADD CONSTRAINT fk_task FOREIGN KEY (task_id) REFERENCES evaluation_tasks(id) ON DELETE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT fk_test_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT fk_model FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT fk_dimension_result FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE;
ALTER TABLE "evaluation_results" ADD CONSTRAINT fk_evaluator_result FOREIGN KEY (evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE;

-- 表: code_execution_details
CREATE TABLE IF NOT EXISTS "code_execution_details" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "evaluation_result_id" bigint,
    "sandbox_id" uuid,
    "stdout" text,
    "stderr" text,
    "execution_time_ms" integer,
    "memory_usage_mb" text,
    "exit_code" text,
    "files_created" text,
    "test_results" jsonb,
    "created_at" timestamptz
);

ALTER TABLE "code_execution_details" ADD CONSTRAINT fk_result_code_exec FOREIGN KEY (evaluation_result_id) REFERENCES evaluation_results(id) ON DELETE CASCADE;

-- 表: task_metrics (任务指标表 - 空表但保留结构)
CREATE TABLE IF NOT EXISTS "task_metrics" (
    "task_id" uuid PRIMARY KEY,
    "total_subtasks" integer,
    "succeeded_subtasks" integer,
    "failed_subtasks" integer,
    "execution_time_ms" bigint,
    "created_at" timestamptz DEFAULT now()
);

ALTER TABLE "task_metrics" ADD CONSTRAINT fk_task_metrics FOREIGN KEY (task_id) REFERENCES evaluation_tasks(id) ON DELETE CASCADE;

-- 表: evaluator_dependencies (评分器依赖关系 - 空表但保留结构)
CREATE TABLE IF NOT EXISTS "evaluator_dependencies" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "evaluator_id" uuid NOT NULL,
    "depends_on_evaluator_id" uuid NOT NULL,
    "template_id" uuid,
    "dependency_type" varchar(50) DEFAULT 'sequential',
    "data_fields_required" text[],
    "execution_order" integer DEFAULT 0,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE "evaluator_dependencies" ADD CONSTRAINT fk_evaluator_dep FOREIGN KEY (evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE;
ALTER TABLE "evaluator_dependencies" ADD CONSTRAINT fk_depends_on FOREIGN KEY (depends_on_evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE;

-- 表: evaluation_result_dependencies (评测结果依赖关系 - 空表但保留结构)
CREATE TABLE IF NOT EXISTS "evaluation_result_dependencies" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "result_id" bigint NOT NULL,
    "depends_on_result_id" bigint NOT NULL,
    "dependency_type" varchar(50) DEFAULT 'data_dependency',
    "data_passed" jsonb,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

ALTER TABLE "evaluation_result_dependencies" ADD CONSTRAINT fk_result_dep FOREIGN KEY (result_id) REFERENCES evaluation_results(id) ON DELETE CASCADE;
ALTER TABLE "evaluation_result_dependencies" ADD CONSTRAINT fk_depends_on_result FOREIGN KEY (depends_on_result_id) REFERENCES evaluation_results(id) ON DELETE CASCADE;

-- 表: media_relations (媒体关联关系 - 空表但保留结构)
CREATE TABLE IF NOT EXISTS "media_relations" (
    "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "media_id" uuid NOT NULL,
    "entity_type" varchar(100) NOT NULL,
    "entity_id" uuid NOT NULL,
    "relation_type" varchar(50) DEFAULT 'attachment',
    "display_order" integer DEFAULT 0,
    "metadata" jsonb,
    "created_at" timestamptz DEFAULT now()
);

ALTER TABLE "media_relations" ADD CONSTRAINT fk_media_asset FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE;

-- 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_template_mappings_dimension ON template_mappings(dimension_id);
CREATE INDEX IF NOT EXISTS idx_template_mappings_evaluator ON template_mappings(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_task ON evaluation_results(task_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_model ON evaluation_results(model_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_dimension ON evaluation_results(dimension_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_status ON evaluation_results(status);
CREATE INDEX IF NOT EXISTS idx_evaluation_tasks_status ON evaluation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_models_role ON models(role);
CREATE INDEX IF NOT EXISTS idx_code_execution_result ON code_execution_details(evaluation_result_id);
CREATE INDEX IF NOT EXISTS idx_media_relations_entity ON media_relations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_media_relations_media ON media_relations(media_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_storage ON media_assets(storage_type);
CREATE INDEX IF NOT EXISTS idx_evaluator_dependencies_evaluator ON evaluator_dependencies(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_evaluator_dependencies_template ON evaluator_dependencies(template_id);
CREATE INDEX IF NOT EXISTS idx_result_dependencies_result ON evaluation_result_dependencies(result_id);

-- test_cases 表索引（优化查询和过滤性能）
CREATE INDEX IF NOT EXISTS idx_test_cases_metadata_gin ON test_cases USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_test_cases_category ON test_cases ((metadata->>'category'));
CREATE INDEX IF NOT EXISTS idx_test_cases_difficulty ON test_cases ((metadata->>'difficulty'));
CREATE INDEX IF NOT EXISTS idx_test_cases_max_score ON test_cases (max_score);
CREATE INDEX IF NOT EXISTS idx_test_cases_execution_environment ON test_cases (execution_environment);
CREATE INDEX IF NOT EXISTS idx_test_cases_code_config ON test_cases USING gin (code_test_config);
CREATE INDEX IF NOT EXISTS idx_test_cases_validation_rules ON test_cases USING gin (validation_rules);
CREATE INDEX IF NOT EXISTS idx_test_cases_input_type ON test_cases (input_type);
CREATE INDEX IF NOT EXISTS idx_test_cases_modalities ON test_cases USING gin (modalities);
CREATE INDEX IF NOT EXISTS idx_test_cases_reference_multimodal ON test_cases USING gin (reference_answer_multimodal) WHERE reference_answer_multimodal IS NOT NULL;

-- 注释说明
COMMENT ON TABLE dimensions IS '存储评测的抽象视角，如"代码质量"、"安全性"等';
COMMENT ON TABLE evaluators IS '存储具体的评分方法和配置';
COMMENT ON TABLE templates IS '存储可复用的评测方案';
COMMENT ON TABLE template_mappings IS '核心关联表，将模板、维度、评分器绑定在一起';
COMMENT ON TABLE test_cases IS '存储评测的基本单元，即评测题目';
COMMENT ON TABLE models IS '存储所有可用的AI模型及其配置信息';
COMMENT ON TABLE system_configs IS '存储动态的系统级配置参数';
COMMENT ON TABLE evaluation_tasks IS '评测任务的主记录';
COMMENT ON TABLE evaluation_results IS '存储最细粒度的评测结果';
COMMENT ON TABLE task_metrics IS '存储任务执行的度量指标';
COMMENT ON TABLE code_evaluation_templates IS 'E2B代码评测模板配置';
COMMENT ON TABLE code_execution_details IS 'E2B代码执行的详细信息';
COMMENT ON TABLE media_assets IS '统一的媒体文件存储和管理';
COMMENT ON TABLE media_relations IS '媒体文件与实体的关联关系';

-- 系统配置默认值（必须）
-- 这些配置是系统正常运行的必要条件
INSERT INTO system_configs (key, value, description, updated_at) VALUES
    ('task_default_concurrent_limit', 15, '任务默认并发限制', NOW()),
    ('zombie_task_timeout_minutes', 25, '僵尸任务超时时间（分钟）', NOW()),
    ('api_timeout', 60000, 'API请求超时时间（毫秒）', NOW()),
    ('max_retries', 3, '最大重试次数', NOW())
ON CONFLICT (key) DO NOTHING;

-- 数据库初始化完成
-- 版本: v2.5.1 (test_cases表结构同步更新)
-- 更新时间: 2025-11-21
-- 主要更新:
--   - test_cases表添加reference_answer_multimodal字段（多模态参考答案）
--   - 字段类型优化：metadata/code_test_config/validation_rules/attachments改为jsonb
--   - 添加10个性能优化索引（GIN和B-tree）
--   - 添加max_score检查约束
