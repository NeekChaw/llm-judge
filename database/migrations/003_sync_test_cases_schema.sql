-- 同步test_cases表结构与Supabase云端一致
-- 添加缺失字段并修改数据类型

-- 1. 添加 reference_answer_multimodal 字段（多模态参考答案支持）
ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS reference_answer_multimodal jsonb;

-- 2. 修改 metadata 从 text 到 jsonb
-- 先备份现有数据，然后转换类型
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_cases'
    AND column_name = 'metadata'
    AND data_type = 'text'
  ) THEN
    -- 添加临时列
    ALTER TABLE test_cases ADD COLUMN metadata_new jsonb;

    -- 迁移数据：尝试将text解析为JSON，失败则设为null
    UPDATE test_cases
    SET metadata_new = CASE
      WHEN metadata IS NULL THEN NULL
      WHEN metadata = '' THEN NULL
      ELSE metadata::jsonb
    END;

    -- 删除旧列，重命名新列
    ALTER TABLE test_cases DROP COLUMN metadata;
    ALTER TABLE test_cases RENAME COLUMN metadata_new TO metadata;
  END IF;
END $$;

-- 3. 修改 code_test_config 从 text 到 jsonb
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_cases'
    AND column_name = 'code_test_config'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE test_cases ADD COLUMN code_test_config_new jsonb;

    UPDATE test_cases
    SET code_test_config_new = CASE
      WHEN code_test_config IS NULL THEN NULL
      WHEN code_test_config = '' THEN NULL
      ELSE code_test_config::jsonb
    END;

    ALTER TABLE test_cases DROP COLUMN code_test_config;
    ALTER TABLE test_cases RENAME COLUMN code_test_config_new TO code_test_config;
  END IF;
END $$;

-- 4. 修改 validation_rules 从 text 到 jsonb
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_cases'
    AND column_name = 'validation_rules'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE test_cases ADD COLUMN validation_rules_new jsonb;

    UPDATE test_cases
    SET validation_rules_new = CASE
      WHEN validation_rules IS NULL THEN NULL
      WHEN validation_rules = '' THEN NULL
      ELSE validation_rules::jsonb
    END;

    ALTER TABLE test_cases DROP COLUMN validation_rules;
    ALTER TABLE test_cases RENAME COLUMN validation_rules_new TO validation_rules;
  END IF;
END $$;

-- 5. 修改 attachments 从 text[] 到 jsonb
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_cases'
    AND column_name = 'attachments'
    AND data_type = 'ARRAY'
  ) THEN
    ALTER TABLE test_cases ADD COLUMN attachments_new jsonb DEFAULT '[]'::jsonb;

    -- 将 text[] 转换为 jsonb 数组
    UPDATE test_cases
    SET attachments_new = CASE
      WHEN attachments IS NULL THEN '[]'::jsonb
      ELSE to_jsonb(attachments)
    END;

    ALTER TABLE test_cases DROP COLUMN attachments;
    ALTER TABLE test_cases RENAME COLUMN attachments_new TO attachments;
  END IF;
END $$;

-- 6. 添加 modalities 字段（如果不存在）
ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS modalities jsonb DEFAULT '{"text": true}'::jsonb;

-- 7. 修改 input_type 字段类型（如果是text，改为varchar(20)）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'test_cases'
    AND column_name = 'input_type'
    AND data_type = 'text'
  ) THEN
    ALTER TABLE test_cases
      ALTER COLUMN input_type TYPE varchar(20);
  END IF;
END $$;

-- 8. 如果 input_type 不存在，添加它
ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS input_type varchar(20) DEFAULT 'text';

-- 9. 添加 max_score 检查约束（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'test_cases_max_score_check'
  ) THEN
    ALTER TABLE test_cases
      ADD CONSTRAINT test_cases_max_score_check CHECK (max_score > 0);
  END IF;
END $$;

-- 10. 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_test_cases_metadata_gin
  ON test_cases USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_test_cases_category
  ON test_cases ((metadata->>'category'));

CREATE INDEX IF NOT EXISTS idx_test_cases_difficulty
  ON test_cases ((metadata->>'difficulty'));

CREATE INDEX IF NOT EXISTS idx_test_cases_max_score
  ON test_cases (max_score);

CREATE INDEX IF NOT EXISTS idx_test_cases_execution_environment
  ON test_cases (execution_environment);

CREATE INDEX IF NOT EXISTS idx_test_cases_code_config
  ON test_cases USING gin (code_test_config);

CREATE INDEX IF NOT EXISTS idx_test_cases_validation_rules
  ON test_cases USING gin (validation_rules);

CREATE INDEX IF NOT EXISTS idx_test_cases_input_type
  ON test_cases (input_type);

CREATE INDEX IF NOT EXISTS idx_test_cases_modalities
  ON test_cases USING gin (modalities);

CREATE INDEX IF NOT EXISTS idx_test_cases_reference_multimodal
  ON test_cases USING gin (reference_answer_multimodal)
  WHERE reference_answer_multimodal IS NOT NULL;
