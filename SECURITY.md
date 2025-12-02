# 安全政策

## 🔒 支持的版本

当前维护的版本：

| 版本 | 支持状态 |
| --- | --- |
| 2.5.x | ✅ 完全支持 |
| 2.4.x | ✅ 安全更新 |
| < 2.4 | ❌ 不再支持 |

## 🐛 报告安全漏洞

**请不要公开报告安全漏洞！**

如果您发现安全问题，请通过以下方式私密报告：

### 报告渠道
1. **GitHub Security Advisory** (推荐)
   - 访问项目页面
   - 点击 "Security" 标签
   - 点击 "Report a vulnerability"

2. **邮件报告**
   - 发送至：security@your-domain.com
   - 主题：[SECURITY] Brief description

### 报告内容
请包含以下信息：
- 漏洞类型（如：XSS、SQL注入、CSRF等）
- 受影响的组件和版本
- 详细的复现步骤
- 概念验证代码（如果可能）
- 潜在影响评估
- 建议的修复方案（如果有）

## 🔐 安全最佳实践

### 部署建议
1. **环境变量安全**
   ```bash
   # 永远不要提交 .env 文件到Git
   # 使用强密码
   # 定期轮换API密钥
   ```

2. **数据库安全**
   - 启用 Supabase Row Level Security (RLS)
   - 使用最小权限原则
   - 定期备份数据

3. **API密钥管理**
   - 使用独立的开发/生产密钥
   - 限制API密钥的访问范围
   - 监控API使用情况

4. **网络安全**
   - 使用 HTTPS
   - 配置 CORS 白名单
   - 启用 Rate Limiting

### 代码安全
- ✅ 所有用户输入都经过验证和清理
- ✅ 使用参数化查询防止SQL注入
- ✅ XSS防护（React默认转义）
- ✅ CSRF Token保护
- ✅ 安全的依赖管理（定期更新）

### 依赖安全
```bash
# 定期检查依赖漏洞
npm audit

# 自动修复
npm audit fix

# 查看详细报告
npm audit --json
```

## 🚨 已知安全注意事项

### 1. API密钥存储
- 确保 `.env` 文件不会被提交到版本控制
- 生产环境使用环境变量或密钥管理服务

### 2. E2B代码执行
- 代码在隔离沙盒中执行
- 有超时和资源限制
- 不要执行不可信的代码

### 3. LLM API调用
- API密钥通过环境变量传递
- 不会在日志中暴露完整密钥
- 建议设置API使用配额

## 📢 安全公告

安全更新将通过以下渠道发布：
- GitHub Security Advisories
- Release Notes
- 项目文档

## 🙏 致谢

我们感谢负责任地报告安全问题的研究者。

符合条件的报告可能会被列入：
- 项目的 Security Hall of Fame
- 特别感谢名单

## 📞 联系方式

安全相关问题请联系：
- Security Team: security@your-domain.com
- GitHub: 通过私密渠道
