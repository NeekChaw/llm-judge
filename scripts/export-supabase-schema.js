/**
 * 从 Supabase 导出完整的数据库表结构
 * 使用 .env.local 中的连接信息
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 从环境变量加载配置
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少 Supabase 配置信息');
  console.error('请确保 .env.local 包含:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - NEXT_PUBLIC_SUPABASE_ROLE_KEY 或 NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function exportSchema() {
  console.log('🔍 正在连接到 Supabase...');
  console.log(`📍 URL: ${supabaseUrl}`);

  try {
    // 直接使用已知的表列表 - 18张核心表
    console.log('\n📋 步骤 1/5: 使用已知表列表...');

    // 优先级1: 核心业务表 (12张)
    const coreTables = [
      'dimensions',
      'evaluators',
      'templates',
      'template_mappings',
      'template_custom_mappings',
      'test_cases',
      'models',
      'system_configs',
      'api_providers',
      'evaluation_tasks',
      'evaluation_results',
      'task_metrics'
    ];

    // 优先级2: 高级功能表 (6张)
    const advancedTables = [
      'code_evaluation_templates',      // E2B代码评测模板
      'code_execution_details',         // E2B执行详情
      'evaluator_dependencies',         // 评分器依赖关系
      'evaluation_result_dependencies', // 结果依赖关系
      'media_assets',                   // 媒体文件存储
      'media_relations'                 // 媒体关联关系
    ];

    const knownTables = [...coreTables, ...advancedTables];

    console.log(`📝 将导出 ${knownTables.length} 个表:`);
    knownTables.forEach(name => console.log(`   - ${name}`));

    // 2. 导出每个表的结构
    await exportKnownTables(knownTables);

  } catch (error) {
    console.error('\n❌ 导出失败:', error);
    console.error('\n💡 提示: 如果权限不足，请尝试:');
    console.error('   1. 使用 NEXT_PUBLIC_SUPABASE_ROLE_KEY (service role)');
    console.error('   2. 在 Supabase Dashboard 的 SQL Editor 中手动导出');
    process.exit(1);
  }
}

async function exportKnownTables(tableNames) {
  let sqlOutput = `-- Supabase 数据库表结构导出
-- 导出时间: ${new Date().toISOString()}
-- 来源: ${supabaseUrl}
-- 包含 18 张核心表（核心业务表 + 高级功能表）

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

`;

  console.log('\n📋 步骤 2/5: 导出表结构...');

  const tableStructures = [];

  for (const tableName of tableNames) {
    try {
      console.log(`   ⏳ 正在导出: ${tableName}`);

      // 获取表的前几行数据来推断结构
      const { data: sampleData, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(5);  // 增加样本数量以更好推断类型

      if (error && !error.message.includes('permission denied')) {
        console.log(`   ⚠️  跳过 ${tableName}: ${error.message}`);
        continue;
      }

      // 尝试获取表的列信息
      const { data: columns, error: colError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_schema', 'public')
        .eq('table_name', tableName)
        .order('ordinal_position');

      let finalColumns;

      if (colError || !columns || columns.length === 0) {
        // 如果无法获取列信息，从样本数据推断
        if (sampleData && sampleData.length > 0) {
          finalColumns = Object.keys(sampleData[0]).map(key => {
            const value = sampleData[0][key];
            let dataType = 'text';

            // 智能类型推断
            if (key === 'id' && typeof value === 'number') {
              dataType = 'bigserial';  // evaluation_results 使用 bigserial
            } else if (key === 'id' || key.endsWith('_id')) {
              dataType = 'uuid';
            } else if (typeof value === 'number') {
              if (Number.isInteger(value)) {
                dataType = value > 2147483647 ? 'bigint' : 'integer';
              } else {
                dataType = 'numeric(10, 2)';
              }
            } else if (typeof value === 'boolean') {
              dataType = 'boolean';
            } else if (value && typeof value === 'object' && !Array.isArray(value)) {
              dataType = 'jsonb';
            } else if (Array.isArray(value)) {
              dataType = 'text[]';
            } else if (key.includes('_at') || key.includes('date')) {
              dataType = 'timestamptz';
            } else if (key.includes('url') || key.includes('endpoint')) {
              dataType = 'varchar(500)';
            } else if (key === 'name' || key === 'type' || key === 'status') {
              dataType = 'varchar(255)';
            }

            return {
              column_name: key,
              data_type: dataType,
              is_nullable: 'YES',
              column_default: (key === 'id' && dataType === 'uuid') ? 'uuid_generate_v4()' : null
            };
          });

          console.log(`   ✅ ${tableName} (从 ${sampleData.length} 行数据推断)`);
        } else {
          console.log(`   ⚠️  跳过 ${tableName}: 无法获取结构且无样本数据`);
          continue;
        }
      } else {
        finalColumns = columns;
        console.log(`   ✅ ${tableName} (从 schema 获取)`);
      }

      tableStructures.push({
        name: tableName,
        columns: finalColumns
      });

    } catch (err) {
      console.log(`   ⚠️  跳过 ${tableName}: ${err.message}`);
    }
  }

  // 生成表定义（按依赖顺序）
  sqlOutput += generateTablesWithConstraints(tableStructures);

  // 3. 保存到文件
  console.log('\n📋 步骤 3/5: 保存到文件...');
  const outputPath = path.join(__dirname, '..', 'database', 'supabase_export.sql');
  fs.writeFileSync(outputPath, sqlOutput);
  console.log(`✅ 已保存到: ${outputPath}`);

  // 4. 创建 .env.local.pg 用于本地 PostgreSQL
  console.log('\n📋 步骤 4/5: 创建本地数据库配置...');
  const envPgPath = path.join(__dirname, '..', '.env.local.pg');
  const envPgContent = `# 本地 PostgreSQL 配置
# 从 Supabase 切换到本地数据库时使用

# 数据库连接 (PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_benchmark
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=ai_benchmark
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# 注释掉 Supabase 配置（切换时使用）
# NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# 其他配置保持不变
`;
  fs.writeFileSync(envPgPath, envPgContent);
  console.log(`✅ 已创建: ${envPgPath}`);

  // 5. 创建统计报告
  console.log('\n📋 步骤 5/5: 生成统计报告...');
  const reportPath = path.join(__dirname, '..', 'database', 'export_report.txt');
  const report = `Supabase 数据库导出报告
==================

导出时间: ${new Date().toISOString()}
Supabase URL: ${supabaseUrl}

表列表 (${tableNames.length} 个):
${tableNames.map(name => `  - ${name}`).join('\n')}

导出文件:
  - database/supabase_export.sql (完整表结构)
  - .env.local.pg (本地数据库配置)

下一步操作:
  1. 启动本地 PostgreSQL: docker-compose up -d postgres
  2. 初始化数据库: npm run db:init:local
  3. 切换到本地数据库: cp .env.local.pg .env.local
  4. 测试连接: npm run db:test
`;
  fs.writeFileSync(reportPath, report);
  console.log(`✅ 已创建: ${reportPath}`);

  console.log('\n✅ 导出完成!');
  console.log('\n📄 生成的文件:');
  console.log(`   1. ${outputPath}`);
  console.log(`   2. ${envPgPath}`);
  console.log(`   3. ${reportPath}`);
}

function generateTablesWithConstraints(tableStructures) {
  let sql = '';

  // 定义表的创建顺序（根据外键依赖）
  const tableOrder = [
    // 基础表（无依赖）
    'dimensions', 'evaluators', 'templates', 'test_cases', 'models',
    'system_configs', 'api_providers', 'code_evaluation_templates',
    'media_assets',
    // 依赖基础表的表
    'template_mappings', 'template_custom_mappings', 'evaluation_tasks',
    'evaluator_dependencies', 'media_relations',
    // 依赖多个表的表
    'evaluation_results', 'code_execution_details', 'evaluation_result_dependencies',
    'task_metrics'
  ];

  // 按顺序创建表
  for (const tableName of tableOrder) {
    const table = tableStructures.find(t => t.name === tableName);
    if (table) {
      sql += generateCreateTable(table.name, table.columns);
    }
  }

  // 添加索引
  sql += generateIndexes();

  return sql;
}

function generateCreateTable(tableName, columns) {
  let sql = `\n-- 表: ${tableName}\n`;
  sql += `CREATE TABLE IF NOT EXISTS "${tableName}" (\n`;

  const columnDefs = columns.map(col => {
    let def = `    "${col.column_name}" `;

    // 数据类型映射
    const typeMap = {
      'character varying': 'varchar(255)',
      'timestamp with time zone': 'timestamptz',
      'timestamp without time zone': 'timestamp',
      'bigint': 'bigint',
      'bigserial': 'bigserial',
      'integer': 'integer',
      'numeric': 'numeric',
      'text': 'text',
      'boolean': 'boolean',
      'jsonb': 'jsonb',
      'uuid': 'uuid',
      'ARRAY': col.data_type.includes('[]') ? col.data_type : 'text[]'
    };

    def += typeMap[col.data_type] || col.data_type;

    // 主键
    if (col.column_name === 'id' ||
        (tableName === 'system_configs' && col.column_name === 'key')) {
      def += ' PRIMARY KEY';
    }

    // 可空性
    if (col.is_nullable === 'NO') {
      def += ' NOT NULL';
    }

    // 默认值
    if (col.column_default) {
      let defaultVal = col.column_default;
      if (defaultVal.includes('uuid_generate_v4')) {
        def += ' DEFAULT uuid_generate_v4()';
      } else if (defaultVal.includes('gen_random_uuid')) {
        def += ' DEFAULT gen_random_uuid()';
      } else if (defaultVal.includes('now()') || defaultVal.includes('CURRENT_TIMESTAMP')) {
        def += ' DEFAULT now()';
      } else if (!defaultVal.includes('nextval')) {
        def += ` DEFAULT ${defaultVal}`;
      }
    }

    return def;
  });

  sql += columnDefs.join(',\n');

  // 添加复合主键（针对关联表）
  if (tableName === 'template_mappings') {
    sql += ',\n    PRIMARY KEY (template_id, dimension_id, evaluator_id)';
  }

  sql += '\n);\n';

  // 添加外键约束
  sql += generateForeignKeys(tableName);

  return sql;
}

function generateForeignKeys(tableName) {
  const foreignKeys = {
    'template_mappings': [
      'ALTER TABLE "template_mappings" ADD CONSTRAINT fk_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE;',
      'ALTER TABLE "template_mappings" ADD CONSTRAINT fk_dimension FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE;',
      'ALTER TABLE "template_mappings" ADD CONSTRAINT fk_evaluator FOREIGN KEY (evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE;'
    ],
    'template_custom_mappings': [
      'ALTER TABLE "template_custom_mappings" ADD CONSTRAINT fk_template_custom FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE;',
      'ALTER TABLE "template_custom_mappings" ADD CONSTRAINT fk_dimension_custom FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE;',
      'ALTER TABLE "template_custom_mappings" ADD CONSTRAINT fk_evaluator_custom FOREIGN KEY (evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE;'
    ],
    'evaluation_results': [
      'ALTER TABLE "evaluation_results" ADD CONSTRAINT fk_task FOREIGN KEY (task_id) REFERENCES evaluation_tasks(id) ON DELETE CASCADE;',
      'ALTER TABLE "evaluation_results" ADD CONSTRAINT fk_test_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE;',
      'ALTER TABLE "evaluation_results" ADD CONSTRAINT fk_model FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE;',
      'ALTER TABLE "evaluation_results" ADD CONSTRAINT fk_dimension_result FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE;',
      'ALTER TABLE "evaluation_results" ADD CONSTRAINT fk_evaluator_result FOREIGN KEY (evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE;'
    ],
    'task_metrics': [
      'ALTER TABLE "task_metrics" ADD CONSTRAINT fk_task_metrics FOREIGN KEY (task_id) REFERENCES evaluation_tasks(id) ON DELETE CASCADE;'
    ],
    'code_execution_details': [
      'ALTER TABLE "code_execution_details" ADD CONSTRAINT fk_result_code_exec FOREIGN KEY (result_id) REFERENCES evaluation_results(id) ON DELETE CASCADE;'
    ],
    'evaluator_dependencies': [
      'ALTER TABLE "evaluator_dependencies" ADD CONSTRAINT fk_evaluator_dep FOREIGN KEY (evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE;',
      'ALTER TABLE "evaluator_dependencies" ADD CONSTRAINT fk_depends_on FOREIGN KEY (depends_on_evaluator_id) REFERENCES evaluators(id) ON DELETE CASCADE;'
    ],
    'evaluation_result_dependencies': [
      'ALTER TABLE "evaluation_result_dependencies" ADD CONSTRAINT fk_result_dep FOREIGN KEY (result_id) REFERENCES evaluation_results(id) ON DELETE CASCADE;',
      'ALTER TABLE "evaluation_result_dependencies" ADD CONSTRAINT fk_depends_on_result FOREIGN KEY (depends_on_result_id) REFERENCES evaluation_results(id) ON DELETE CASCADE;'
    ],
    'media_relations': [
      'ALTER TABLE "media_relations" ADD CONSTRAINT fk_media_asset FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE;'
    ]
  };

  if (foreignKeys[tableName]) {
    return '\n' + foreignKeys[tableName].join('\n') + '\n';
  }

  return '';
}

function generateIndexes() {
  return `
-- 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_template_mappings_dimension ON template_mappings(dimension_id);
CREATE INDEX IF NOT EXISTS idx_template_mappings_evaluator ON template_mappings(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_task ON evaluation_results(task_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_model ON evaluation_results(model_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_dimension ON evaluation_results(dimension_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_status ON evaluation_results(status);
CREATE INDEX IF NOT EXISTS idx_evaluation_tasks_status ON evaluation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_models_role ON models(role);
CREATE INDEX IF NOT EXISTS idx_code_execution_result ON code_execution_details(result_id);
CREATE INDEX IF NOT EXISTS idx_media_relations_entity ON media_relations(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_type ON media_assets(media_type);

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
`;
}

// 运行导出
console.log('🚀 开始从 Supabase 导出数据库结构...\n');
exportSchema().catch(err => {
  console.error('❌ 导出失败:', err);
  process.exit(1);
});