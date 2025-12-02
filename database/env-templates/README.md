# 环境配置模板

本目录包含不同部署环境的配置模板。

## 可用模板

### 1. `supabase-cloud.env`
- **用途**：使用 Supabase 云端托管服务
- **优点**：无需维护数据库，自动备份，全球CDN
- **适用场景**：生产环境、快速原型、多人协作

### 2. `postgres-local.env`
- **用途**：本地 PostgreSQL Docker 容器
- **优点**：完全本地化，数据自主可控
- **适用场景**：开发环境、离线使用、数据隐私要求高

## 使用方法

### 手动切换

```bash
# 1. 复制模板到项目根目录
cp database/env-templates/postgres-local.env .env

# 2. 编辑配置（替换your_*为实际值）
vim .env

# 3. 重启应用
docker-compose restart
```

### 使用切换工具（推荐）

```bash
# 切换到本地PostgreSQL
npx tsx scripts/db-switch.ts --target=postgres-local --backup

# 查看可用环境
npx tsx scripts/db-switch.ts --list

# 回滚到备份
npx tsx scripts/db-switch.ts --rollback
```

## 配置说明

### 必填字段

- `SUPABASE_URL`: 数据库连接URL
- `SUPABASE_ANON_KEY`: 匿名访问密钥（本地环境可用占位符）
- `CONFIG_ENCRYPTION_KEY`: API密钥加密密钥（至少32个字符）

### 可选字段

- `REDIS_HOST/PORT/PASSWORD`: Redis连接信息
- `NODE_ENV`: 运行环境（development/production）

## 安全注意事项

⚠️ **重要**：
1. 永远不要提交包含真实密钥的 `.env` 文件到Git
2. `CONFIG_ENCRYPTION_KEY` 丢失将无法解密已存储的API密钥
3. 切换环境前务必备份数据

## 迁移数据

在切换环境时，使用切换工具会自动：
1. 备份当前配置
2. 导出现有数据（可选）
3. 更新配置文件
4. 测试新环境连接
5. 失败时自动回滚
