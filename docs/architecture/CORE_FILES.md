# 核心文件清单

⚠️ **重要**：以下文件是项目运行的核心文件，**不能删除**！

## 启动脚本（被 package.json 引用）

- `start-dev-fixed.sh` - 主开发环境启动脚本（Linux/Mac）
- `start-dev.bat` - Windows 启动脚本
- `start-processor.ts` - 任务处理器启动脚本

## 配置文件

- `package.json` - NPM 配置和依赖
- `tsconfig.json` - TypeScript 配置
- `next.config.js` - Next.js 配置
- `.env.local` - 环境变量（不在 Git 中，需本地创建）

## 核心源代码目录

- `src/` - 应用源代码
- `public/` - 静态资源
- `database/` - 数据库脚本（保留核心迁移和架构文件）

## 文档

- `README.md` - 项目说明
- `CLAUDE.md` - Claude Code 开发指南
- `ARCHITECTURE.md` - 架构文档
- `ENVIRONMENT_SETUP.md` - 环境配置

## 清理时的检查清单

在删除文件前，请：

1. ✅ 检查 `package.json` 中的 `scripts` 是否引用该文件
2. ✅ 搜索代码库中是否有 `import` 或 `require` 引用
3. ✅ 确认不是启动脚本（`start-*.sh`, `*.bat`）
4. ✅ 确认不是配置文件（`*.config.js`, `tsconfig.json`）
5. ✅ 如果不确定，先移动到 `archive/` 目录而不是直接删除

---

**最后更新**：2025-11-16（修复误删 start-dev-fixed.sh 后创建）
