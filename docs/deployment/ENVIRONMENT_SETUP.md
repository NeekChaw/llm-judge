# 环境配置指南

## 📁 环境文件说明

本项目使用多个环境文件来管理不同场景的配置：

### 本地开发环境

```
.env.local          # 本地开发配置（包含真实密钥，不提交到Git）
.env.example        # 配置模板（提交到Git，供参考）
```

### Docker部署环境

```
.env                # Docker Compose读取的配置文件（不提交到Git）
```

### Git仓库中

```
.env.example        # ✅ 唯一提交到Git的环境文件
```

---

## 🚀 快速开始

### 方式1: 本地开发（Next.js dev server）

1. **复制配置模板**
   ```bash
   cp .env.example .env.local
   ```

2. **填写真实配置**
   编辑 `.env.local`，填入你的实际配置：
   ```bash
   # Supabase配置
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your_real_anon_key
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_real_anon_key

   # LLM API密钥
   OPENAI_API_KEY=sk-your-real-key
   ANTHROPIC_API_KEY=sk-ant-your-real-key
   SILICONFLOW_API_KEY=sk-your-real-key

   # E2B沙箱
   E2B_API_KEY=e2b_your_real_key

   # Redis配置
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=ai_benchmark_redis_2025
   ```

3. **安装依赖并启动**
   ```bash
   npm install --legacy-peer-deps
   npm run dev
   ```

4. **访问应用**
   打开浏览器访问：http://localhost:3000

---

### 方式2: Docker部署（推荐用于生产环境）

1. **复制配置模板**
   ```bash
   cp .env.example .env
   ```

2. **填写真实配置**
   编辑 `.env`，填入实际配置（与方式1相同）

3. **启动Docker服务**
   ```bash
   docker-compose up -d
   ```

4. **验证服务状态**
   ```bash
   docker-compose ps
   curl http://localhost:3000/api/system/health
   ```

---

## 📋 必需的配置项

### 🔴 必须配置（否则无法运行）

| 配置项 | 说明 | 获取方式 |
|--------|------|----------|
| `SUPABASE_URL` | Supabase项目URL | [Supabase Dashboard](https://app.supabase.com) → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase匿名密钥 | 同上 |
| `NEXT_PUBLIC_SUPABASE_URL` | 浏览器端Supabase URL | 与SUPABASE_URL相同 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器端密钥 | 与SUPABASE_ANON_KEY相同 |
| `NEXT_PUBLIC_SUPABASE_ROLE_KEY` | 浏览器端service_role密钥（可选） | Supabase Dashboard → Settings → API |

### 🟡 推荐配置（LLM提供商 - 至少配置一个）

| 提供商 | API Key | Base URL | 获取地址 |
|--------|---------|----------|----------|
| **OpenAI** | `OPENAI_API_KEY` | https://api.openai.com/v1 | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic** | `ANTHROPIC_API_KEY` | https://api.anthropic.com/v1 | [console.anthropic.com](https://console.anthropic.com/) |
| **硅基流动** | `SILICONFLOW_API_KEY` | https://api.siliconflow.cn/v1 | [cloud.siliconflow.cn](https://cloud.siliconflow.cn/account/ak) |
| **火山引擎** | `VOLCENGINE_API_KEY` | https://ark.cn-beijing.volces.com/api/v3 | [console.volcengine.com](https://console.volcengine.com/ark) |
| **智谱AI** | `ZHIPU_API_KEY` | https://open.bigmodel.cn/api/paas/v4 | [open.bigmodel.cn](https://open.bigmodel.cn/usercenter/apikeys) |
| **阿里云** | `ALI_API_KEY` | https://dashscope.aliyuncs.com/compatible-mode/v1 | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/apiKey) |
| **月之暗面** | `MOONSHOT_API_KEY` | https://api.moonshot.cn/v1 | [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys) |
| **OpenRouter** | `OPENROUTER_API_KEY` | https://openrouter.ai/api/v1 | [openrouter.ai](https://openrouter.ai/keys) |
| **DeepSeek** | `DEEPSEEK_API_KEY` | https://api.deepseek.com/v1 | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| **Google Gemini** | `GOOGLE_API_KEY` | https://generativelanguage.googleapis.com/v1beta | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **DMX API** | `DMX_API_KEY` | https://www.dmxapi.com/v1 | [dmxapi.com](https://www.dmxapi.com/) |

### 🟡 其他推荐配置

| 配置项 | 说明 | 功能 |
|--------|------|------|
| `E2B_API_KEY` | E2B代码沙箱密钥 | CODE评分器需要，获取: [e2b.dev](https://e2b.dev/dashboard) |
| `REDIS_HOST` | Redis主机地址 | 任务队列（Docker自动配置） |
| `REDIS_PORT` | Redis端口 | 默认6379 |
| `REDIS_PASSWORD` | Redis密码 | 默认ai_benchmark_redis_2025 |

### 🟢 可选配置（增强功能）

- `LLM_TIMEOUT`: LLM API超时时间（毫秒），默认60000
- `JWT_SECRET`: 如果启用用户认证
- `SMTP_*`: 如果需要邮件通知
- `WEBHOOK_URL`: 如果需要Webhook集成

---

## 🔒 安全最佳实践

### ✅ 正确的做法

```bash
# 本地开发
.env.local          # ✅ 存储真实密钥，不提交到Git

# 示例模板
.env.example        # ✅ 提交到Git，不包含真实值

# Docker部署
.env                # ✅ 存储真实密钥，不提交到Git
```

### ❌ 错误的做法

```bash
.env.backup         # ❌ 永远不要提交
.env.production     # ❌ 永远不要提交
.env.local.backup   # ❌ 永远不要提交
.env.supabase.*     # ❌ 永远不要提交
```

---

## 🛠️ 常见问题

### Q1: 为什么有这么多.env文件？

**A**: 不同工具读取不同的文件：
- **Next.js**: 优先读取 `.env.local`，然后 `.env`
- **Docker Compose**: 读取 `.env`
- **Git**: 只提交 `.env.example`

### Q2: 我应该提交哪些文件到Git？

**A**:
- ✅ 提交：`.env.example`（配置模板）
- ❌ 不提交：`.env`、`.env.local`、任何包含真实密钥的文件

### Q3: 如何验证配置是否正确？

**A**: 启动服务后检查健康接口：
```bash
curl http://localhost:3000/api/system/health
```

预期返回：
```json
{
  "status": "healthy",
  "timestamp": "2025-11-13T...",
  "uptime": 123
}
```

### Q4: 我的本地备份文件会被提交吗？

**A**: 不会。`.gitignore` 已配置以下规则：
```
.env*.backup        # 所有备份文件
.env*.reference     # 所有参考文件
.env.supabase*      # 所有Supabase相关文件
```

### Q5: Docker构建失败怎么办？

**A**: 确保 `.env` 文件包含构建所需的变量：
```bash
# 必须有这两个变量才能构建
SUPABASE_URL=your_url
SUPABASE_ANON_KEY=your_key
```

---

## 📚 相关文档

- [Docker部署指南](./DOCKER_DEPLOYMENT.md) - 完整Docker部署说明
- [数据库初始化指南](./database/README.md) - 数据库设置
- [数据库Schema](./database/supabase_export.sql) - 完整v2.5 Schema

---

## 🔍 配置检查清单

在启动项目前，确保：

- [ ] 已复制 `.env.example` 到 `.env.local` 或 `.env`
- [ ] 已填写 Supabase URL 和密钥
- [ ] 已填写至少一个 LLM API 密钥
- [ ] 已填写 E2B API 密钥（如使用CODE评分器）
- [ ] Redis配置正确（Docker自动处理）
- [ ] 运行健康检查确认服务正常

---

**最后更新**: 2025-11-16
**项目版本**: v2.5
