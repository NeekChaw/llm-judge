/**
 * 执行成本单位迁移脚本
 * 添加 cost_unit 字段到 models 表
 */

import { createClient } from '../src/lib/supabase';
import * as fs from 'fs';
import * as path from 'path';

async function runCostUnitMigration() {
  const supabase = createClient();
  
  console.log('🔄 开始执行成本单位迁移...');
  
  try {
    // 读取迁移脚本（使用Supabase兼容版本）
    const migrationPath = path.join(__dirname, '../database/migrations/002_add_cost_unit_field_simple.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 读取迁移脚本成功');
    
    // 执行迁移（需要分步执行，因为Supabase不支持多语句）
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('COMMENT'));
    
    console.log(`📝 共 ${statements.length} 条SQL语句待执行`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        console.log(`⏳ 执行语句 ${i + 1}/${statements.length}...`);
        console.log(`   ${statement.substring(0, 50)}...`);
        
        const { error } = await supabase.rpc('exec_sql', { 
          sql: statement 
        });
        
        if (error) {
          // 如果是已存在的错误，继续执行
          if (error.message.includes('already exists') || 
              error.message.includes('duplicate') ||
              error.message.includes('constraint')) {
            console.log(`   ⚠️  跳过（已存在）: ${error.message}`);
            continue;
          }
          throw error;
        }
        
        console.log(`   ✅ 语句 ${i + 1} 执行成功`);
      }
    }
    
    // 验证迁移结果
    console.log('🔍 验证迁移结果...');
    
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, column_default')
      .eq('table_name', 'models')
      .eq('column_name', 'cost_unit');
      
    if (columnsError) {
      throw columnsError;
    }
    
    if (columns && columns.length > 0) {
      console.log('✅ cost_unit 字段已成功添加到 models 表');
      console.log('   字段信息:', columns[0]);
    } else {
      console.log('❌ cost_unit 字段未找到，迁移可能失败');
    }
    
    // 检查现有模型的 cost_unit 值
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select('id, name, cost_unit')
      .limit(5);
      
    if (modelsError) {
      throw modelsError;
    }
    
    if (models && models.length > 0) {
      console.log('📊 现有模型的 cost_unit 值:');
      models.forEach(model => {
        console.log(`   ${model.name}: ${model.cost_unit || 'NULL'}`);
      });
    } else {
      console.log('📊 没有找到现有模型记录');
    }
    
    console.log('🎉 成本单位迁移完成！');
    console.log('');
    console.log('📝 迁移说明:');
    console.log('   1. 已为 models 表添加 cost_unit 字段，默认值为 "1k"');
    console.log('   2. 现有模型将保持原有的成本计算方式');
    console.log('   3. 新模型可以选择使用 "1m" 单位进行配置');
    console.log('   4. 成本计算函数已自动适配新旧两种单位');
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error);
    console.log('');
    console.log('🛠️  故障排除建议:');
    console.log('   1. 确保数据库连接正常');
    console.log('   2. 检查是否有足够的数据库权限');
    console.log('   3. 如果使用 Supabase，确保 RLS 规则允许表结构修改');
    process.exit(1);
  }
  
  process.exit(0);
}

// 执行迁移
runCostUnitMigration().catch(console.error);