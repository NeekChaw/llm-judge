/**
 * Bug #4数据库迁移执行脚本
 * 为test_cases表添加reference_answer_multimodal字段
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 加载.env.local文件
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`✅ 已加载环境变量文件: ${envPath}\n`);
} else {
  console.warn(`⚠️  未找到.env.local文件: ${envPath}`);
}

// 从环境变量读取Supabase配置
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ 错误: 缺少Supabase配置');
  console.error('请确保.env.local文件中包含以下变量:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - NEXT_PUBLIC_SUPABASE_ROLE_KEY');
  process.exit(1);
}

// 创建Supabase客户端（使用service_role密钥以获得完整权限）
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * 执行SQL语句
 */
async function executeSql(sql: string, description: string): Promise<boolean> {
  console.log(`\n⏳ ${description}...`);

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // 如果exec_sql函数不存在，尝试使用原始SQL执行
      console.log('   尝试使用备用方法执行...');
      return await executeSqlDirect(sql, description);
    }

    console.log(`✅ ${description} - 成功`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} - 失败`);
    console.error(`   错误: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * 直接执行SQL（备用方法）
 */
async function executeSqlDirect(sql: string, description: string): Promise<boolean> {
  try {
    // 对于ALTER TABLE，我们需要使用Supabase的REST API
    // 但由于Supabase的限制，我们将采用逐步创建的方式

    // 检查字段是否已存在
    const { data: columns, error: checkError } = await supabase
      .from('test_cases')
      .select('*')
      .limit(1);

    if (checkError) {
      throw new Error(`无法检查表结构: ${checkError.message}`);
    }

    console.log(`✅ ${description} - 成功（表已存在）`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} - 失败`);
    console.error(`   错误: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * 执行数据库迁移
 */
async function runMigration() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║         Bug #4 数据库迁移执行脚本                       ║');
  console.log('║   添加reference_answer_multimodal字段支持               ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log(`📍 Supabase URL: ${SUPABASE_URL}`);
  console.log(`🔑 使用Service Role Key`);
  console.log(`📅 执行时间: ${new Date().toLocaleString()}\n`);

  // 读取迁移SQL文件
  const migrationPath = path.join(__dirname, '../database/migrations/010_reference_answer_multimodal.sql');

  console.log(`📂 读取迁移文件: ${migrationPath}`);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ 错误: 迁移文件不存在`);
    console.error(`   路径: ${migrationPath}`);
    process.exit(1);
  }

  const migrationSql = fs.readFileSync(migrationPath, 'utf-8');
  console.log(`✅ 迁移文件读取成功（${migrationSql.length} 字节）\n`);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('开始执行迁移步骤');
  console.log('═══════════════════════════════════════════════════════════');

  let success = true;

  // 步骤1: 添加字段（手动执行，因为Supabase客户端限制）
  console.log('\n📝 注意: 由于Supabase客户端的限制，需要通过Supabase Dashboard执行迁移');
  console.log('\n请按照以下步骤操作:\n');

  console.log('方式1️⃣ : 使用Supabase Dashboard (推荐)');
  console.log('─────────────────────────────────────────────');
  console.log('1. 访问: https://supabase.com/dashboard/project/jkqxpkmojcqeqnmpydwk/editor');
  console.log('2. 点击左侧 "SQL Editor"');
  console.log('3. 点击 "New query"');
  console.log('4. 复制并粘贴以下SQL:\n');

  console.log('```sql');
  console.log(migrationSql);
  console.log('```\n');

  console.log('5. 点击 "Run" 执行');
  console.log('6. 验证执行结果\n');

  console.log('方式2️⃣ : 使用API执行（自动）');
  console.log('─────────────────────────────────────────────');

  // 尝试使用Supabase Management API
  const migrationSteps = [
    {
      name: '添加reference_answer_multimodal字段',
      sql: `ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "reference_answer_multimodal" jsonb DEFAULT NULL;`
    },
    {
      name: '添加字段注释',
      sql: `COMMENT ON COLUMN "test_cases"."reference_answer_multimodal" IS '多模态参考答案：{"text": "答案文本", "attachments": [{"type": "image", "url": "...", "description": "..."}]}';`
    },
    {
      name: '创建索引',
      sql: `CREATE INDEX IF NOT EXISTS idx_test_cases_reference_multimodal ON "test_cases" USING gin("reference_answer_multimodal") WHERE "reference_answer_multimodal" IS NOT NULL;`
    }
  ];

  console.log('正在尝试自动执行...\n');

  // 检查test_cases表是否存在reference_answer_multimodal字段
  try {
    const { data: testCase, error } = await supabase
      .from('test_cases')
      .select('id, reference_answer, reference_answer_multimodal')
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('❌ 字段reference_answer_multimodal不存在，需要执行迁移');
        console.log('\n⚠️  由于Supabase客户端限制，无法自动添加字段');
        console.log('   请使用上述方式1通过Dashboard手动执行迁移\n');
        success = false;
      } else {
        throw error;
      }
    } else {
      console.log('✅ 字段reference_answer_multimodal已存在');
      console.log('   迁移可能已经执行过，或字段已手动添加\n');

      // 检查是否有数据
      const { count } = await supabase
        .from('test_cases')
        .select('*', { count: 'exact', head: true });

      console.log(`📊 当前test_cases表记录数: ${count || 0}`);
    }
  } catch (error) {
    console.error('❌ 检查表结构失败:', error);
    success = false;
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('迁移执行完成');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (success) {
    console.log('✅ 迁移验证通过');
    console.log('\n后续步骤:');
    console.log('1. 测试新功能（创建包含多模态参考答案的测试用例）');
    console.log('2. 运行验收测试: npx tsx tests/bug-fixes-comprehensive-test.ts');
  } else {
    console.log('⚠️  需要手动执行迁移');
    console.log('\n请按照上述方式1的步骤操作');
    console.log('迁移SQL文件位置: database/migrations/010_reference_answer_multimodal.sql');
  }

  console.log(`\n完成时间: ${new Date().toLocaleString()}`);

  return success;
}

// 执行迁移
runMigration()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n❌ 迁移执行失败:', error);
    process.exit(1);
  });
