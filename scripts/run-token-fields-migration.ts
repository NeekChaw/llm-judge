/**
 * 运行token字段迁移脚本
 * 添加缺失的total_tokens和llm_response_time字段
 */

import { createClient } from '../src/lib/supabase';
import { readFileSync } from 'fs';

async function runTokenFieldsMigration() {
  console.log('🔧 开始添加缺失的token字段...\n');
  
  try {
    const supabase = createClient();
    
    // 读取迁移脚本
    const migrationSQL = readFileSync('./database/migrations/003_add_missing_token_fields.sql', 'utf8');
    console.log('📄 迁移脚本已读取');
    
    // 执行迁移
    console.log('🚀 执行数据库迁移...');
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      console.error('❌ 迁移失败:', error);
      return;
    }
    
    console.log('✅ 数据库迁移成功');
    
    // 验证字段是否添加成功
    console.log('\n🔍 验证字段添加结果...');
    
    const { data: testRecord, error: testError } = await supabase
      .from('evaluation_results')
      .select('id, prompt_tokens, completion_tokens, total_tokens, llm_response_time')
      .limit(1);
      
    if (testError) {
      console.error('❌ 验证查询失败:', testError);
    } else {
      console.log('✅ 字段验证成功，所有token字段都可以访问');
      if (testRecord && testRecord.length > 0) {
        const fields = Object.keys(testRecord[0]);
        console.log('可用的token字段:', fields);
      }
    }
    
  } catch (error) {
    console.error('💥 迁移过程出错:', error);
  }
}

// 运行迁移
runTokenFieldsMigration().then(() => {
  console.log('\n🏁 Token字段迁移完成');
  process.exit(0);
}).catch(error => {
  console.error('💥 迁移失败:', error);
  process.exit(1);
});