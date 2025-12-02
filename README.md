# AI Benchmark V2

一个先进的AI模型评估平台，支持多种评分器类型、实时任务监控和可视化分析。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)

## 快速开始

### Docker 部署模式

本项目提供两种 Docker 部署模式：

| 模式 | 文件 | 数据库 | 适用场景 |
|------|------|--------|----------|
| **混合模式** | `docker-compose.yml` | Supabase 云端 | 生产环境，需要 Supabase 账号 |
| **全本地模式** | `docker-compose.full-local.yml` | 本地 PostgreSQL | 开发测试，无需外部依赖 |

#### 混合模式（Supabase 云端数据库）

```bash
# 克隆项目
git clone https://github.com/NeekChaw/llm-judge.git
cd llm-judge

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 Supabase 配置和 API 密钥

# 启动服务
docker-compose up -d

# 访问 http://localhost:3000
```

#### 全本地模式（本地 PostgreSQL）

```bash
# 配置环境变量
cp database/env-templates/full-stack-local.env .env

# 启动所有服务（含本地数据库）
docker-compose -f docker-compose.full-local.yml up -d

# 访问 http://localhost:3000
```

**全本地模式包含**：
- PostgreSQL 数据库（自动初始化）
- PostgREST API 网关
- Redis 任务队列
- Next.js 应用
- Nginx 反向代理

### 本地开发

```bash
# 安装依赖
npm install --legacy-peer-deps

# 配置环境
cp .env.example .env.local

# 初始化数据库（在 Supabase SQL Editor 执行）
# database/supabase_export.sql

# 启动开发服务器
npm run dev          # Linux/macOS
npm run dev:windows  # Windows
```

## 核心功能

- **双模板系统**: 统一模板 + 自定义模板
- **多种评分器**: PROMPT / REGEX / CODE / HUMAN
- **E2B 代码沙箱**: 安全执行 LLM 生成的代码
- **多模态支持**: 图片、音频、视频附件
- **实时监控**: 任务进度、性能指标
- **Excel 导出**: 详细评测报告

## 评分计算说明

系统使用**加权平均**计算评分，确保不同满分值的题目对最终得分的贡献成正比。

### 单次运行

```
加权百分制分数 = (总得分 / 总满分) × 100
```

**示例**：
- 题目1: 得分 1 / 满分 8 = 12.5%
- 题目2: 得分 7 / 满分 7 = 100.0%
- **加权平均**: (1 + 7) / (8 + 7) × 100 = **53.3%**

### 多次运行

对于 run_count > 1 的任务，每次运行独立计算：

```
Run 1: (6 + 7) / (8 + 7) × 100 = 86.7%
Run 2: (5 + 8) / (8 + 8) × 100 = 81.3%
Run 3: (2 + 6) / (8 + 8) × 100 = 50.0%

显示: 86.7% / 81.3% / 50.0%
```

### 为什么使用加权平均？

| 方法 | 计算 | 结果 | 问题 |
|------|------|------|------|
| 简单平均 | (12.5% + 100%) / 2 | 56.3% | 小满分题目影响过大 |
| **加权平均** | (1 + 7) / (8 + 7) × 100 | **53.3%** | 按满分比例贡献 |

## 技术架构

```
Nginx:80 → Next.js:3000 → PostgreSQL (Supabase/本地)
                ↓
            Redis:6379 (任务队列)
                ↓
            E2B Cloud (代码沙箱)
```

**技术栈**: Next.js 15 + TypeScript + Tailwind CSS + Supabase + Redis + Docker

## 环境要求

- Docker 20.0+ / Node.js 18+
- Supabase 账号（混合模式）或无外部依赖（全本地模式）
- LLM API 密钥（OpenAI/Anthropic/SiliconFlow 等）
- E2B API 密钥（可选，CODE 评分器需要）

## 最小配置

```bash
# .env 或 .env.local
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

# 至少一个 LLM API
OPENAI_API_KEY=sk-your_key
```

完整配置请参考 [.env.example](./.env.example)

## 文档

| 文档 | 说明 |
|------|------|
| [环境配置](./docs/deployment/ENVIRONMENT_SETUP.md) | 环境变量详解 |
| [Docker 部署](./docs/deployment/DOCKER_DEPLOYMENT_GUIDE.md) | 生产部署指南 |
| [快速开始](./docs/development/QUICK_START.md) | 新手入门 |
| [系统架构](./docs/architecture/ARCHITECTURE.md) | 架构设计 |
| [E2B 集成](./docs/architecture/E2B_ARCHITECTURE.md) | 代码执行系统 |
| [用户指南](./docs/guides/COMPREHENSIVE_USER_GUIDE.md) | 完整使用指南 |
| [故障排查](./docs/troubleshooting.md) | 常见问题 |

更多文档请查看 [docs/README.md](./docs/README.md)

## 常见问题

```bash
# Docker 构建失败
docker-compose build --no-cache

# npm 依赖冲突
npm install --legacy-peer-deps

# 检查服务状态
curl http://localhost:3000/api/system/health

# 全本地模式重置数据库
docker-compose -f docker-compose.full-local.yml down -v
docker-compose -f docker-compose.full-local.yml up -d
```

## 贡献

1. Fork 项目
2. 创建分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'feat: xxx'`)
4. 推送 (`git push origin feature/xxx`)
5. 创建 Pull Request

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

**维护者**: [@NeekChaw](https://github.com/NeekChaw)
