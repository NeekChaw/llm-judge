# Docker 部署模式说明

## 📋 项目的两种部署模式

### 1️⃣ **云端模式** (`docker-compose.yml`)
**适用场景**：生产环境或本地开发，使用 Supabase 云服务

```bash
docker-compose up -d
```

**数据流**：
- 服务器端 API：连接 Supabase 云端
- 客户端 JavaScript：连接 Supabase 云端
- 优点：完全托管，无需维护数据库，数据一致
- 缺点：依赖网络，数据在云端

---

### 2️⃣ **完全本地模式** (`docker-compose.full-local.yml`) ✅ 离线部署推荐

**适用场景**：完全离线部署，所有数据在本地

```bash
docker-compose -f docker-compose.full-local.yml up -d
```

**数据流**：
```
├─ 服务器端 API
│  └─ postgresql://postgres:password@postgres:5432/ai_benchmark  ✅ 本地
│
├─ 客户端 JavaScript (浏览器)
│  └─ http://localhost:3001 (PostgREST HTTP API)  ✅ 本地
│
└─ PostgREST 容器
   └─ postgresql://postgres:password@postgres:5432/ai_benchmark  ✅ 本地
```

**架构**：
- PostgreSQL：数据存储
- PostgREST：提供 HTTP API（模拟 Supabase REST API）
- Next.js App：应用服务器
- Redis：缓存和队列
- Nginx：反向代理（可选）

**端口分配**：
- 3000：Next.js 应用
- 3001：PostgREST API（客户端访问）
- 5432：PostgreSQL（仅容器内部）
- 6379：Redis（仅容器内部）

**优点**：
- ✅ 完全本地化，无需网络
- ✅ 客户端和服务器端数据一致
- ✅ 支持离线使用

**缺点**：
- ❌ 需要配置 PostgREST 和数据库角色
- ❌ 比云端模式复杂

---

## 🚀 快速开始指南

### **模式 1：云端模式**（最简单，推荐本地开发）
```bash
# 1. 配置 .env 文件
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key

# 2. 启动
docker-compose up -d

# 3. 访问
http://localhost:3000
```

### **模式 2：完全本地模式**（推荐离线部署）
```bash
# 1. 创建数据库角色 (首次需要)
docker-compose -f docker-compose.full-local.yml up -d postgres
docker exec -it ai-benchmark-postgres psql -U postgres -d ai_benchmark

# 在 psql 中执行：
CREATE ROLE anon NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
\q

# 2. 启动所有服务
docker-compose -f docker-compose.full-local.yml up -d

# 3. 访问
http://localhost:3000
```

---

## 🔍 验证部署模式

### 检查当前容器使用的数据库
```bash
# 查看服务器端数据库连接
docker exec ai-benchmark-app printenv SUPABASE_URL

# 查看客户端数据库连接（构建时注入）
docker exec ai-benchmark-app printenv NEXT_PUBLIC_SUPABASE_URL
```

### 验证数据一致性
```bash
# 方法 1：查看本地数据库
docker exec ai-benchmark-postgres psql -U postgres -d ai_benchmark -c "SELECT COUNT(*) FROM templates;"

# 方法 2：通过 API 查询（服务器端）
curl http://localhost:3000/api/templates

# 方法 3：浏览器访问（客户端）
# http://localhost:3000/library/templates
```

如果结果一致，说明配置正确。云端模式下结果取决于 Supabase 云端数据，完全本地模式下结果来自本地数据库。

---

## 🔧 切换部署模式

### 从云端模式切换到完全本地模式
```bash
# 1. 停止云端模式
docker-compose down

# 2. 创建数据库角色（首次）
docker-compose -f docker-compose.full-local.yml up -d postgres
sleep 10
docker exec ai-benchmark-postgres psql -U postgres -d ai_benchmark -c "
CREATE ROLE anon NOLOGIN;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
"

# 3. 启动完全本地模式
docker-compose -f docker-compose.full-local.yml up -d

# 4. 等待初始化完成（约60秒）

# 5. 验证
curl http://localhost:3001/  # PostgREST API 健康检查
```

### 从完全本地模式切换到云端模式
```bash
# 1. 停止本地模式
docker-compose -f docker-compose.full-local.yml down

# 2. 启动云端模式
docker-compose up -d

# 3. 验证
curl http://localhost:3000/api/system/health
```

### 数据迁移（可选）
```bash
# 从云端导出数据
# 在 Supabase Dashboard 中导出为 SQL

# 导入到本地数据库
docker exec -i ai-benchmark-postgres psql -U postgres -d ai_benchmark < backup.sql
```

---

## ⚠️ 常见问题

### Q1: 如何让客户端也使用本地数据库？
**A**: 使用完全本地模式（`docker-compose.full-local.yml`），部署 PostgREST 提供 HTTP API。

### Q2: PostgREST 是什么？
**A**: PostgREST 是一个独立的 HTTP API 服务器，自动将 PostgreSQL 数据库表转换为 RESTful API。Supabase 的核心组件之一就是 PostgREST。

### Q3: 不想用 PostgREST，有其他方案吗？
**A**: 可以修改代码，让所有客户端操作都通过 Next.js API routes，不直接连数据库。但这需要改动前端代码。

---

## 📊 部署模式对比表

| 特性 | 云端模式 | 完全本地模式 |
|------|----------|--------------|
| 服务器端数据库 | ☁️ 云端 | 🏠 本地 |
| 客户端数据库 | ☁️ 云端 | 🏠 本地 |
| 数据一致性 | ✅ 一致 | ✅ 一致 |
| 离线使用 | ❌ 不支持 | ✅ 完全支持 |
| 配置复杂度 | 🟢 简单 | 🟡 中等 |
| 容器数量 | 3 个 | 5 个 |
| 推荐场景 | 生产/开发 | 离线部署 |

---

## 📝 总结

- **生产环境/本地开发**：使用云端模式（`docker-compose.yml`），数据托管在 Supabase
- **离线部署/完全本地化**：使用完全本地模式（`docker-compose.full-local.yml`），所有数据在本地
