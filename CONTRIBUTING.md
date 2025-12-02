# 贡献指南

感谢您考虑为 AI Benchmark V2 做出贡献！🎉

## 🌟 如何贡献

### 报告Bug
1. 在 [Issues](../../issues) 中搜索是否已有相同问题
2. 如果没有，创建新 Issue 并使用 Bug Report 模板
3. 提供详细的复现步骤、环境信息和错误日志

### 提出新功能
1. 在 [Issues](../../issues) 中创建 Feature Request
2. 描述功能的用途和预期行为
3. 等待维护者反馈再开始开发

### 提交代码

#### 开发流程
```bash
# 1. Fork 并克隆项目
git clone https://github.com/YOUR_USERNAME/ai-benchmark-v2.git
cd ai-benchmark-v2

# 2. 创建功能分支
git checkout -b feature/your-feature-name

# 3. 安装依赖
npm install

# 4. 开发并测试
npm run dev
npm run type-check
npm run lint

# 5. 提交代码
git add .
git commit -m "feat: add your feature description"

# 6. 推送到您的Fork
git push origin feature/your-feature-name

# 7. 创建 Pull Request
```

#### Commit 规范
我们使用 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` 新功能
- `fix:` Bug修复
- `docs:` 文档更新
- `style:` 代码格式（不影响功能）
- `refactor:` 重构（不是新功能也不是bug修复）
- `perf:` 性能优化
- `test:` 测试相关
- `chore:` 构建工具或辅助工具的变动

示例：
```
feat: add multi-modal support for reference answers
fix: resolve pagination issue in dimensions page
docs: update quick start guide
```

#### 代码规范
- 使用 TypeScript 严格模式
- 遵循项目现有的代码风格
- 添加必要的注释（中英文均可）
- 确保类型安全，避免 `any`
- 运行 `npm run lint` 确保无警告

#### Pull Request 要求
- ✅ 通过所有类型检查 (`npm run type-check`)
- ✅ 通过所有Lint检查 (`npm run lint`)
- ✅ 包含必要的测试（如果适用）
- ✅ 更新相关文档
- ✅ PR标题符合 Conventional Commits
- ✅ 描述清晰说明改动内容和原因

### 首次贡献？
查看标记为 [`good first issue`](../../labels/good%20first%20issue) 的 Issue

## 📝 开发指南

### 项目结构
```
src/
├── app/              # Next.js App Router 页面
├── components/       # React 组件
├── lib/             # 核心业务逻辑
├── types/           # TypeScript 类型定义
└── hooks/           # React Hooks
```

### 本地开发环境
- Node.js >= 18
- npm >= 9
- PostgreSQL (通过 Supabase)
- Redis (可选，用于任务队列)

### 测试数据
运行 `npm run db:seed` 加载演示数据

## 🤝 行为准则

请遵守我们的 [行为准则](CODE_OF_CONDUCT.md)

## 💡 需要帮助？

- 📖 查看 [文档](docs/)
- 💬 加入 [Discussions](../../discussions)
- 🐛 报告 [Issue](../../issues)

## 📄 许可证

贡献的代码将采用 [MIT License](LICENSE)
