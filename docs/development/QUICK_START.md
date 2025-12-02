# AI Benchmark V2 - 快速启动指南

## 🚀 一键启动（推荐）

### 前置要求
- Docker Desktop 已安装
- 至少 4GB 可用内存
- 至少 10GB 可用磁盘空间

### 启动步骤

```bash
# 1. 克隆项目
git clone https://github.com/your-org/llm-judge-cc.git
cd llm-judge-cc

# 2. 复制环境配置
cp .env.full-stack.example .env

# 3. 编辑配置（至少修改加密密钥）
vim .env  # 或使用你喜欢的编辑器

# 4. 一键启动所有服务
docker-compose -f docker-compose.full-stack.yml up -d

# 5. 等待服务启动（约30-60秒）
docker-compose -f docker-compose.full-stack.yml logs -f app

# 6. 访问应用
open http://localhost:3000
```

就这么简单！✅

---

## 📦 包含的服务

启动后会运行以下容器：

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| **PostgreSQL** | ai-benchmark-postgres | 5432 | 本地数据库 |
| **Redis** | ai-benchmark-redis | 6379 | 任务队列 |
| **Next.js应用** | ai-benchmark-app | 3000 | Web应用 |
| **Nginx**（可选） | ai-benchmark-nginx | 80, 443 | 反向代理 |

---

## ⚙️ 配置说明

### 必须配置的项

编辑 `.env` 文件，修改以下内容：

#### 1. 加密密钥（⚠️ 必须修改）

```bash
# 生成随机密钥（Linux/Mac）
openssl rand -hex 32

# 或使用在线工具
# https://www.random.org/strings/

CONFIG_ENCRYPTION_KEY=your_generated_32_chars_key_here
```

#### 2. LLM API密钥（至少配置一个）

```bash
# 选择你有的API密钥填入
OPENAI_API_KEY=sk-your_key_here
# 或
ANTHROPIC_API_KEY=sk-ant-your_key_here
# 或
SILICONFLOW_API_KEY=sk-your_key_here
```

### 可选配置

其他配置使用默认值即可，需要时再调整：

- PostgreSQL密码（默认：`ai_benchmark_postgres_2025`）
- Redis密码（默认：`ai_benchmark_redis_2025`）
- 性能参数（并发、超时等）

---

## 🔍 验证安装

### 1. 检查容器状态

```bash
docker-compose -f docker-compose.full-stack.yml ps
```

应该看到所有容器状态为 `Up (healthy)`：

```
NAME                    STATUS
ai-benchmark-postgres   Up (healthy)
ai-benchmark-redis      Up (healthy)
ai-benchmark-app        Up (healthy)
```

### 2. 检查日志

```bash
# 查看应用日志
docker-compose -f docker-compose.full-stack.yml logs -f app

# 查看数据库日志
docker-compose -f docker-compose.full-stack.yml logs postgres
```

### 3. 访问Web界面

打开浏览器访问：http://localhost:3000

应该看到登录页面或主页。

---

## 🔧 常用命令

### 启动和停止

```bash
# 启动所有服务
docker-compose -f docker-compose.full-stack.yml up -d

# 停止所有服务
docker-compose -f docker-compose.full-stack.yml down

# 停止并删除数据（⚠️ 谨慎使用）
docker-compose -f docker-compose.full-stack.yml down -v
```

### 查看状态

```bash
# 查看容器状态
docker-compose -f docker-compose.full-stack.yml ps

# 查看资源使用
docker stats

# 查看日志
docker-compose -f docker-compose.full-stack.yml logs -f [服务名]
```

### 重启服务

```bash
# 重启应用
docker-compose -f docker-compose.full-stack.yml restart app

# 重启数据库
docker-compose -f docker-compose.full-stack.yml restart postgres

# 重启所有
docker-compose -f docker-compose.full-stack.yml restart
```

### 数据库操作

```bash
# 连接到PostgreSQL
docker exec -it ai-benchmark-postgres psql -U postgres -d ai_benchmark

# 备份数据库
docker exec ai-benchmark-postgres pg_dump -U postgres ai_benchmark > backup.sql

# 恢复数据库
cat backup.sql | docker exec -i ai-benchmark-postgres psql -U postgres ai_benchmark
```

---

## 🗂️ 数据持久化

数据存储在Docker Volumes中，重启容器不会丢失数据：

```bash
# 查看数据卷
docker volume ls | grep ai-benchmark

# 输出：
# ai-benchmark_postgres_data
# ai-benchmark_redis_data
# ai-benchmark_app_logs
```

### 备份数据

```bash
# 创建备份目录
mkdir -p backups

# 备份数据库
docker exec ai-benchmark-postgres pg_dump -U postgres ai_benchmark > backups/db-$(date +%Y%m%d).sql

# 备份数据卷
docker run --rm -v ai-benchmark_postgres_data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/postgres-data-$(date +%Y%m%d).tar.gz /data
```

---

## 🔄 切换到Supabase云端

如果之后想切换到Supabase云端服务：

```bash
# 1. 导出本地数据
docker exec ai-benchmark-postgres pg_dump -U postgres ai_benchmark > local-data.sql

# 2. 停止本地服务
docker-compose -f docker-compose.full-stack.yml down

# 3. 使用切换工具
npx tsx scripts/db-switch.ts --target=supabase-cloud --backup

# 4. 启动云端模式
docker-compose up -d
```

---

## 🆘 故障排查

### 问题1：容器启动失败

```bash
# 查看详细日志
docker-compose -f docker-compose.full-stack.yml logs

# 检查端口占用
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows
```

### 问题2：数据库连接失败

```bash
# 检查PostgreSQL健康状态
docker exec ai-benchmark-postgres pg_isready

# 检查网络连接
docker network inspect ai-benchmark_ai-benchmark-network
```

### 问题3：应用无法访问

```bash
# 检查应用健康状态
curl http://localhost:3000/api/system/health

# 进入容器调试
docker exec -it ai-benchmark-app sh
```

### 问题4：内存不足

```bash
# 查看资源使用
docker stats

# 增加Docker内存限制
# Docker Desktop -> Settings -> Resources -> Memory
```

---

## 🎓 下一步

1. **配置LLM API密钥**
   - 访问 http://localhost:3000/settings/keys
   - 添加你的API密钥

2. **创建第一个评测任务**
   - 访问 http://localhost:3000/workbench
   - 创建评测模板和任务

3. **查看系统状态**
   - 访问 http://localhost:3000/settings/environment
   - 查看数据库、Redis连接状态

4. **阅读完整文档**
   - 查看 `CLAUDE.md` 了解架构
   - 查看 `DEPLOYMENT.md` 了解部署细节

---

## 💡 提示

- 首次启动需要下载Docker镜像，可能需要5-10分钟
- PostgreSQL初始化脚本会自动创建数据库表结构
- 建议定期备份数据库数据
- 生产环境请修改所有默认密码

**祝使用愉快！** 🎉

如有问题，请查看 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) 或提交Issue。
