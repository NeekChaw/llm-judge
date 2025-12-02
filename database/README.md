# 数据库初始化指南

## 文件说明

本目录包含 AI Benchmark V2 数据库初始化所需的SQL文件：

- **`supabase_export.sql`** - 完整的v2.5数据库Schema（唯一需要执行的文件）

## 快速开始（新用户）

### 方法1: Supabase Dashboard（推荐）

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 点击左侧菜单 **SQL Editor**
4. 点击 **New Query**
5. 复制 `supabase_export.sql` 的全部内容粘贴到编辑器
6. 点击 **Run** 执行
7. 确认显示成功信息

### 方法2: psql 命令行

```bash
psql "postgresql://postgres:[密码]@[主机]:5432/postgres" -f supabase_export.sql
```

## `supabase_export.sql` 包含内容

### 18个核心表
- `api_providers` - API提供商配置
- `dimensions` - 评测维度
- `evaluators` - 评分器
- `templates` - 评测模板
- `models` - LLM模型（包含v2.5默认配置字段）
- `test_cases` - 测试用例（支持多模态）
- `system_configs` - 系统配置
- `code_evaluation_templates` - E2B代码评测模板
- `media_assets` - 媒体资源
- `template_mappings` - 模板映射
- `template_custom_mappings` - 自定义模板映射
- `evaluation_tasks` - 评测任务
- `evaluation_results` - 评测结果
- `code_execution_details` - 代码执行详情
- `task_metrics` - 任务指标
- `evaluator_dependencies` - 评分器依赖
- `evaluation_result_dependencies` - 结果依赖
- `media_relations` - 媒体关联

### 完整约束
- 18个外键约束（数据完整性）
- 15个性能索引
- 14个表注释

### 系统配置默认值
```sql
-- 自动插入必需的系统配置
task_default_concurrent_limit = 15    -- 任务默认并发限制
zombie_task_timeout_minutes = 25      -- 僵尸任务超时时间
api_timeout = 60000                   -- API超时时间（毫秒）
max_retries = 3                       -- 最大重试次数
```

### v2.5 新特性
- **模型默认配置**: `default_max_tokens`, `default_temperature`, `default_thinking_budget`
- **标签系统**: `tags` 字段支持 非推理/推理/多模态 分类
- **多模态支持**: `modalities`, `attachments`, `input_modalities` 等字段
- **成本追踪**: `cost_currency`, `cost_last_updated` 等字段

## 验证安装

执行以下SQL验证数据库初始化成功：

```sql
-- 检查表数量（应该是18个）
SELECT COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE';

-- 检查系统配置是否存在
SELECT * FROM system_configs;

-- 检查models表的v2.5字段
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'models'
AND column_name IN ('default_max_tokens', 'default_temperature', 'default_thinking_budget', 'tags')
ORDER BY column_name;
```

预期结果：
- 18个表
- 4条系统配置记录
- 4个v2.5新字段

## 重要提醒

1. **幂等性**: 脚本使用 `IF NOT EXISTS` 和 `ON CONFLICT DO NOTHING`，可安全重复执行
2. **权限要求**: 需要数据库管理员权限
3. **PostgreSQL版本**: 兼容 PostgreSQL 13+ (Supabase默认版本)
4. **备份建议**: 生产环境执行前建议备份数据

## 故障排除

### 扩展创建失败
```
ERROR: permission denied to create extension "uuid-ossp"
```
解决：Supabase项目默认已启用这些扩展，可以注释掉前两行。

### 表已存在
脚本使用 `CREATE TABLE IF NOT EXISTS`，不会报错，会跳过已存在的表。

### 系统配置未插入
使用 `ON CONFLICT DO NOTHING`，如果配置已存在不会重复插入。

---

**版本**: v2.5
**最后更新**: 2025-11-16
