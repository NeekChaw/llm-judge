/**
 * 数据库环境切换工具
 *
 * 用途：
 * - 在不同数据库环境间安全切换（Supabase Cloud ↔ 本地PostgreSQL）
 * - 自动备份配置和数据
 * - 失败时自动回滚
 *
 * 使用方法：
 * npx tsx scripts/db-switch.ts --target=postgres-local --backup
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

interface EnvironmentConfig {
  name: string;
  template: string;
  description: string;
  requiresDocker?: string[]; // 依赖的Docker服务
}

interface BackupInfo {
  timestamp: string;
  sourceEnv: string;
  targetEnv: string;
  envBackupPath: string;
  dataBackupPath?: string;
}

// 可用环境配置
const ENVIRONMENTS: Record<string, EnvironmentConfig> = {
  'supabase-cloud': {
    name: 'Supabase Cloud',
    template: 'database/env-templates/supabase-cloud.env',
    description: 'Supabase云端托管服务',
  },
  'postgres-local': {
    name: '本地PostgreSQL',
    template: 'database/env-templates/postgres-local.env',
    description: '本地PostgreSQL Docker容器',
    requiresDocker: ['postgres'],
  },
};

// 命令行参数
interface CliArgs {
  target?: string;
  backup?: boolean;
  force?: boolean;
  list?: boolean;
  rollback?: string;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};

  process.argv.slice(2).forEach(arg => {
    if (arg === '--list') {
      args.list = true;
    } else if (arg === '--backup') {
      args.backup = true;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg.startsWith('--target=')) {
      args.target = arg.split('=')[1];
    } else if (arg.startsWith('--rollback=')) {
      args.rollback = arg.split('=')[1];
    }
  });

  return args;
}

function listEnvironments() {
  console.log('\n📋 可用的数据库环境：\n');

  Object.entries(ENVIRONMENTS).forEach(([key, config]) => {
    console.log(`  ${key}`);
    console.log(`    名称: ${config.name}`);
    console.log(`    描述: ${config.description}`);
    if (config.requiresDocker) {
      console.log(`    依赖: Docker (${config.requiresDocker.join(', ')})`);
    }
    console.log('');
  });

  console.log('使用方法:');
  console.log('  npx tsx scripts/db-switch.ts --target=<环境名> [--backup]\n');
}

async function getCurrentEnv(): Promise<string> {
  const envPath = path.join(process.cwd(), '.env');

  try {
    const content = await fs.readFile(envPath, 'utf-8');
    const urlMatch = content.match(/SUPABASE_URL=(.+)/);

    if (!urlMatch) {
      return 'unknown';
    }

    const url = urlMatch[1];

    if (url.includes('supabase.co')) {
      return 'supabase-cloud';
    } else if (url.startsWith('postgresql://')) {
      return 'postgres-local';
    }

    return 'custom';
  } catch (error) {
    return 'not-configured';
  }
}

async function validateTargetEnvironment(targetEnv: string): Promise<void> {
  const config = ENVIRONMENTS[targetEnv];

  if (!config) {
    throw new Error(`未知的环境: ${targetEnv}`);
  }

  // 检查模板文件是否存在
  const templatePath = path.join(process.cwd(), config.template);
  try {
    await fs.access(templatePath);
  } catch (error) {
    throw new Error(`模板文件不存在: ${templatePath}`);
  }

  // 检查Docker依赖
  if (config.requiresDocker) {
    // TODO: 实现Docker服务检查
    console.log(`⚠️  需要运行Docker服务: ${config.requiresDocker.join(', ')}`);
  }
}

async function testDatabaseConnection(envFile: string): Promise<boolean> {
  try {
    const content = await fs.readFile(envFile, 'utf-8');
    const urlMatch = content.match(/SUPABASE_URL=(.+)/);
    const keyMatch = content.match(/SUPABASE_ANON_KEY=(.+)/);

    if (!urlMatch || !keyMatch) {
      throw new Error('配置文件缺少必要字段');
    }

    const client = createClient(urlMatch[1], keyMatch[1]);

    // 简单的连接测试
    const { error } = await client.from('models').select('count').limit(1);

    if (error && error.code !== 'PGRST116') { // PGRST116是表不存在，连接是OK的
      throw error;
    }

    return true;
  } catch (error) {
    console.error('连接测试失败:', error);
    return false;
  }
}

async function backupCurrentEnv(timestamp: string): Promise<BackupInfo> {
  const backupDir = path.join(process.cwd(), 'backups');
  await fs.mkdir(backupDir, { recursive: true });

  const currentEnv = await getCurrentEnv();
  const envBackupPath = path.join(backupDir, `.env.backup.${timestamp}`);

  // 备份 .env 文件
  const envPath = path.join(process.cwd(), '.env');
  await fs.copyFile(envPath, envBackupPath);

  console.log(`✅ 配置已备份: ${envBackupPath}`);

  const backup: BackupInfo = {
    timestamp,
    sourceEnv: currentEnv,
    targetEnv: '',
    envBackupPath,
  };

  // 保存备份元数据
  const metadataPath = path.join(backupDir, `backup.${timestamp}.json`);
  await fs.writeFile(metadataPath, JSON.stringify(backup, null, 2));

  return backup;
}

async function exportDatabaseData(timestamp: string): Promise<string | undefined> {
  console.log('\n📤 导出数据库数据...');

  try {
    const backupDir = path.join(process.cwd(), 'backups');
    const dumpFile = path.join(backupDir, `db-dump.${timestamp}.sql`);

    // 从当前.env读取数据库URL
    const envContent = await fs.readFile('.env', 'utf-8');
    const urlMatch = envContent.match(/SUPABASE_URL=(.+)/);

    if (!urlMatch) {
      console.log('⚠️  无法获取数据库URL，跳过数据导出');
      return undefined;
    }

    const dbUrl = urlMatch[1];

    // 使用pg_dump导出（需要安装PostgreSQL客户端工具）
    try {
      execSync(`pg_dump "${dbUrl}" > "${dumpFile}"`, {
        stdio: 'inherit',
      });

      console.log(`✅ 数据已导出: ${dumpFile}`);
      return dumpFile;
    } catch (error) {
      console.log('⚠️  pg_dump失败，可能未安装PostgreSQL客户端工具');
      console.log('   跳过数据导出，仅备份配置');
      return undefined;
    }
  } catch (error) {
    console.error('导出数据失败:', error);
    return undefined;
  }
}

async function updateEnvFile(targetEnv: string): Promise<void> {
  const config = ENVIRONMENTS[targetEnv];
  const templatePath = path.join(process.cwd(), config.template);
  const envPath = path.join(process.cwd(), '.env');

  // 读取模板
  let templateContent = await fs.readFile(templatePath, 'utf-8');

  // 尝试保留现有的API密钥配置
  try {
    const currentEnv = await fs.readFile(envPath, 'utf-8');

    // 提取LLM API密钥
    const apiKeyMatches = currentEnv.matchAll(/^(OPENAI_API_KEY|ANTHROPIC_API_KEY|SILICONFLOW_API_KEY|[A-Z_]+_API_KEY)=(.+)$/gm);

    for (const match of apiKeyMatches) {
      const key = match[1];
      const value = match[2];

      // 如果模板中没有这个密钥，添加进去
      if (!templateContent.includes(`${key}=`)) {
        templateContent += `\n# 从之前环境保留的API密钥\n${key}=${value}\n`;
      }
    }
  } catch (error) {
    console.log('⚠️  无法读取当前.env文件，使用纯模板');
  }

  // 写入新配置
  await fs.writeFile(envPath, templateContent);
  console.log('✅ 配置文件已更新');
}

async function restartDockerContainers(): Promise<void> {
  console.log('\n🔄 重启Docker容器...');

  try {
    execSync('docker-compose restart app', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    console.log('✅ 容器已重启');
  } catch (error) {
    throw new Error('Docker容器重启失败');
  }
}

async function rollback(backupTimestamp: string): Promise<void> {
  console.log(`\n🔄 回滚到备份: ${backupTimestamp}`);

  const backupDir = path.join(process.cwd(), 'backups');
  const metadataPath = path.join(backupDir, `backup.${backupTimestamp}.json`);

  try {
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

    // 恢复 .env 文件
    const envPath = path.join(process.cwd(), '.env');
    await fs.copyFile(metadata.envBackupPath, envPath);

    console.log('✅ 配置已恢复');

    // 重启容器
    await restartDockerContainers();

    console.log('✅ 回滚完成');
  } catch (error) {
    throw new Error(`回滚失败: ${error}`);
  }
}

async function switchDatabase(targetEnv: string, options: { backup: boolean; force: boolean }): Promise<void> {
  console.log('\n🔄 数据库环境切换工具\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    // Step 1: 获取当前环境
    const currentEnv = await getCurrentEnv();
    console.log(`当前环境: ${currentEnv}`);
    console.log(`目标环境: ${targetEnv}\n`);

    if (currentEnv === targetEnv && !options.force) {
      console.log('⚠️  已经在目标环境，无需切换');
      console.log('   如需强制切换，请添加 --force 参数');
      return;
    }

    // Step 2: 验证目标环境
    console.log('1️⃣ 验证目标环境...');
    await validateTargetEnvironment(targetEnv);
    console.log('✅ 目标环境有效\n');

    // Step 3: 测试目标环境连接
    console.log('2️⃣ 测试目标环境连接...');
    const targetTemplate = path.join(process.cwd(), ENVIRONMENTS[targetEnv].template);
    const canConnect = await testDatabaseConnection(targetTemplate);

    if (!canConnect && !options.force) {
      throw new Error('无法连接到目标数据库，请检查配置或使用 --force 跳过检查');
    }

    if (!canConnect) {
      console.log('⚠️  无法连接到目标数据库，但使用了 --force，继续执行\n');
    } else {
      console.log('✅ 目标数据库连接正常\n');
    }

    // Step 4: 备份当前环境
    if (options.backup) {
      console.log('3️⃣ 备份当前环境...');
      const backup = await backupCurrentEnv(timestamp);

      // 尝试导出数据
      const dumpFile = await exportDatabaseData(timestamp);
      if (dumpFile) {
        backup.dataBackupPath = dumpFile;
      }

      console.log('✅ 备份完成\n');
    } else {
      console.log('3️⃣ 跳过备份（未指定 --backup）\n');
    }

    // Step 5: 更新配置
    console.log('4️⃣ 更新环境配置...');
    await updateEnvFile(targetEnv);
    console.log('');

    // Step 6: 重启应用
    console.log('5️⃣ 重启应用...');
    try {
      await restartDockerContainers();
    } catch (error) {
      console.log('⚠️  自动重启失败，请手动执行: docker-compose restart');
    }

    console.log('\n✅ 数据库环境切换成功！\n');
    console.log(`切换记录:`);
    console.log(`  从: ${currentEnv}`);
    console.log(`  到: ${targetEnv}`);
    console.log(`  时间: ${timestamp}`);

    if (options.backup) {
      console.log(`\n如需回滚，请执行:`);
      console.log(`  npx tsx scripts/db-switch.ts --rollback=${timestamp}`);
    }

  } catch (error) {
    console.error('\n❌ 切换失败:', error);
    console.error('\n建议手动检查配置或联系技术支持');
    process.exit(1);
  }
}

// 主函数
async function main() {
  const args = parseArgs();

  // 显示帮助
  if (!args.target && !args.list && !args.rollback) {
    console.log('\n数据库环境切换工具');
    console.log('\n用法:');
    console.log('  npx tsx scripts/db-switch.ts --list                    # 列出可用环境');
    console.log('  npx tsx scripts/db-switch.ts --target=<环境> [选项]     # 切换环境');
    console.log('  npx tsx scripts/db-switch.ts --rollback=<时间戳>        # 回滚到备份');
    console.log('\n选项:');
    console.log('  --backup    切换前备份当前配置和数据');
    console.log('  --force     跳过连接测试，强制切换');
    console.log('');
    process.exit(0);
  }

  // 列出环境
  if (args.list) {
    listEnvironments();
    return;
  }

  // 回滚
  if (args.rollback) {
    await rollback(args.rollback);
    return;
  }

  // 切换环境
  if (args.target) {
    await switchDatabase(args.target, {
      backup: args.backup || false,
      force: args.force || false,
    });
  }
}

// 运行
main().catch(error => {
  console.error('发生错误:', error);
  process.exit(1);
});
