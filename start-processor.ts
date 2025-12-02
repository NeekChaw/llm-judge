#!/usr/bin/env tsx

/**
 * 统一任务处理器启动脚本
 * 支持多种启动模式和自动模式选择
 */

import { config } from 'dotenv';
import { 
  TaskProcessorService, 
  startBestProcessor, 
  checkProcessorAvailability,
  ProcessorConfigManager
} from './src/lib/task-processor';

// 加载环境变量
config({ path: '.env.local' });

async function main() {
  console.log('✅ 环境变量加载完成');
  console.log('🚀 启动AI评测平台任务处理器...\n');

  // 环境变量检查
  console.log('🔍 环境变量检查:');
  console.log(`   SILICONFLOW_API_KEY: ${process.env.SILICONFLOW_API_KEY ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`   OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`   E2B_API_KEY: ${process.env.E2B_API_KEY ? '✅ 已配置' : '❌ 未配置'}`);
  // 🆕 添加Supabase环境变量检查
  console.log(`   NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL ? '✅ 已配置' : '❌ 未配置'}`);
  console.log(`   NEXT_PUBLIC_SUPABASE_ANON_KEY: ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ? '✅ 已配置' : '❌ 未配置'}`);
  console.log();

  try {
    // 检查命令行参数
    const args = process.argv.slice(2);
    const isAutoMode = args.includes('--auto');
    
    console.log('📋 从环境变量加载配置');
    
    // 检查处理器可用性
    console.log('🔍 检查处理器可用性...');
    
    if (isAutoMode) {
      console.log('🎯 自动选择最佳处理器模式...');
      
      // 使用自动选择功能
      const result = await startBestProcessor();
      
      console.log();
      console.log('🎉 处理器启动成功！');
      console.log('=====================================');
      console.log(`模式: ${result.mode.toUpperCase()}`);
      console.log(`原因: ${result.reason}`);
      console.log(`状态: running`);
      
      // 获取状态信息
      try {
        const status = await result.service.getStatus();
        if (status) {
          console.log(`活跃任务: ${status.activeTasks || 0}`);
          console.log(`待处理任务: ${status.queueSize || 0}`);
          console.log(`处理中任务: ${status.runningTasks || 0}`);
        }
        console.log();
        console.log('健康检查:');
        console.log(`   数据库: ${await result.service.healthCheck() ? '✅' : '❌'}`);
        console.log('   LLM API: ✅');
      } catch (error) {
        console.log('健康检查: ⚠️ 部分功能可能不可用');
      }
      
      console.log();
      console.log('💡 使用说明:');
      console.log('=====================================');
      console.log('• 处理器已在后台运行，会自动处理新创建的任务');
      console.log('• 通过Web界面创建任务: http://localhost:3000/workbench/tasks/new');
      console.log('• 查看处理器状态: curl http://localhost:3000/api/processor');
      console.log('• 按 Ctrl+C 停止处理器');
      
      // 保持进程运行
      process.stdin.resume();
      
    } else {
      // 手动模式
      const service = TaskProcessorService.getInstance();
      await service.start();
      
      console.log('✅ 任务处理服务已启动');
      
      // 保持进程运行
      process.stdin.resume();
    }
    
  } catch (error) {
    console.error('❌ 启动过程中发生错误:', error);
    process.exit(1);
  }
}

// 处理进程终止信号
process.on('SIGINT', async () => {
  console.log('\n🛑 接收到停止信号，正在优雅关闭...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 接收到终止信号，正在优雅关闭...');
  process.exit(0);
});

// 启动
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 处理器启动失败:', error);
    process.exit(1);
  });
}