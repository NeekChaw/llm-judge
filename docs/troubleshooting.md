# AI评测平台问题排查指南

## 🔍 概述

本指南帮助您诊断和解决AI评测平台使用过程中可能遇到的问题，特别是与新增强功能相关的问题。

## 🚨 常见问题及解决方案

### 1. 页面加载和渲染问题

#### **ChunkLoadError 错误**
```
错误信息: ChunkLoadError at __webpack_require__.f.j
```

**原因**: Next.js webpack chunk 加载失败
**解决方案**:
1. 清理浏览器缓存 (Ctrl+F5 强制刷新)
2. 清理项目缓存:
   ```bash
   rm -rf .next
   npm run dev
   ```
3. 检查开发服务器是否正常运行

#### **组件渲染失败**
```
错误信息: Cannot resolve module '@heroicons/react/24/outline'
```

**原因**: 图标库依赖问题
**解决方案**:
- ✅ **已修复**: 所有组件已更新为使用 `lucide-react`
- 如果仍有问题，检查是否有自定义组件使用了错误的图标库

### 2. LLM配置和API调用问题

#### **API端点404错误 (2025-08-12已修复)**
```
错误信息: SiliconFlow API error: 404 404 page not found
```

**原因**: 数据库中部分模型的api_endpoint字段不完整，缺少`/chat/completions`路径
**解决方案**:
- ✅ **已修复**: 在`llm-client.ts`中添加智能端点补齐逻辑
- **自动修复**: 系统现在会自动补齐不完整的API端点
- **验证方法**: 检查任务处理器日志，确认API调用成功

#### **Token配置无限制模式失效 (2025-08-12已修复)**
```
问题描述: 选择"无限制"时响应仍被截断
```

**原因**: API请求体中包含`max_tokens: undefined`字段，导致提供商误解
**解决方案**:
- ✅ **已修复**: 优化请求体构建逻辑，只有明确提供max_tokens时才包含该字段
- **验证方法**: 检查日志中的`token_limit_applied: 'unlimited'`状态

#### **getLLMCallConfig 未定义错误**
```
错误信息: Cannot read properties of undefined (reading 'getLLMCallConfig')
```

**原因**: LLM配置管理器导入错误
**解决方案**:
- ✅ **已修复**: 导入方式已更正为 `{ llmConfigManager }`
- 验证修复: 检查任务处理器日志中是否还有此错误

#### **模型配置未找到错误**
```
错误信息: 模型配置未找到: [object Object]
```

**原因**: 传递对象而不是字符串给配置方法
**解决方案**:
- ✅ **已修复**: 添加了模型ID类型验证
- 验证修复: 创建新任务测试PROMPT评分器是否正常工作

#### **API密钥配置问题**
```
错误信息: LLM API调用失败: 401 Unauthorized
```

**解决方案**:
1. 检查环境变量配置:
   ```bash
   # .env.local 文件中
   SILICONFLOW_API_KEY=your_api_key
   OPENAI_API_KEY=your_api_key
   ANTHROPIC_API_KEY=your_api_key
   ```
2. 重启开发服务器使环境变量生效
3. 访问 `/api/llm-config` 检查配置状态

### 3. 系统变量功能问题

#### **变量选择器不显示**
**症状**: 点击"显示变量"按钮无反应

**排查步骤**:
1. 检查浏览器控制台是否有JavaScript错误
2. 确认页面完全加载完成
3. 尝试刷新页面重新操作

**解决方案**:
```javascript
// 检查组件是否正确加载
console.log('VariableSelector loaded:', !!window.VariableSelector);
```

#### **变量没有被替换**
**症状**: PROMPT评分器结果中仍显示 `{{variable_name}}`

**排查步骤**:
1. 检查变量语法是否正确 (双花括号)
2. 确认评分器类型为PROMPT
3. 检查变量名称是否拼写正确

**解决方案**:
```javascript
// 测试变量替换功能
const { replaceSystemVariables } = require('./src/lib/evaluator-variables');
const result = replaceSystemVariables('{{test_case_input}}', {
  test_case_input: 'test value'
});
console.log(result); // 应该输出: 'test value'
```

#### **变量验证失败**
**症状**: 编辑器显示"模板验证失败"

**常见原因**:
- 使用了不存在的变量名
- 变量语法错误 (单花括号、拼写错误等)
- 对象属性访问语法错误

**解决方案**:
1. 使用变量选择器插入变量，避免手动输入
2. 检查变量名称是否在支持列表中
3. 验证对象属性访问语法: `{{object.property}}`

### 4. 代码执行详情问题

#### **代码执行详情不显示**
**症状**: CODE类型评测结果没有"代码执行详情"组件

**排查步骤**:
1. 确认评测结果类型为CODE
2. 检查是否有代码执行数据
3. 查看浏览器控制台错误

**解决方案**:
```bash
# 检查API端点
curl http://localhost:3000/api/evaluation-results/[id]/code-details
```

#### **执行详情数据缺失**
**症状**: 详情面板显示但数据为空

**可能原因**:
- E2B代码执行失败
- 数据库记录不完整
- API响应异常

**解决方案**:
1. 检查E2B服务状态
2. 查看任务处理器日志
3. 验证数据库中的 `code_execution_details` 表

### 5. 任务处理器问题

#### **任务一直在运行状态**
**症状**: 任务状态长时间保持"running"

**排查步骤**:
1. 检查任务处理器状态:
   ```bash
   curl http://localhost:3000/api/processor
   ```
2. 查看开发服务器日志
3. 检查子任务状态

**解决方案**:
1. 重启任务处理器:
   ```bash
   # 停止当前服务
   pkill -f "next dev"
   # 重新启动
   npm run dev
   ```
2. 手动重置任务状态 (如果必要)

#### **子任务处理失败**
**症状**: 子任务状态为"failed"

**常见原因**:
- LLM API调用失败
- 代码执行超时
- 评分器配置错误

**排查方法**:
1. 查看子任务的错误信息
2. 检查评分器配置
3. 验证LLM API可用性

### 6. 数据库相关问题

#### **数据库连接失败**
```
错误信息: 数据库连接失败: connection refused
```

**解决方案**:
1. 检查Supabase配置:
   ```bash
   # .env.local 文件中
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_key
   ```
2. 验证网络连接
3. 检查Supabase项目状态

#### **数据查询异常**
**症状**: API返回空数据或错误

**排查步骤**:
1. 检查数据库表结构
2. 验证查询权限
3. 查看Supabase日志

## 🛠️ 调试工具和方法

### 1. 浏览器开发者工具

#### **控制台检查**
```javascript
// 检查关键组件是否加载
console.log('Components loaded:', {
  VariableSelector: !!window.VariableSelector,
  CodeExecutionDetails: !!window.CodeExecutionDetails
});

// 检查API响应
fetch('/api/processor').then(r => r.json()).then(console.log);
```

#### **网络面板**
- 检查API请求状态
- 查看请求/响应数据
- 识别失败的网络调用

### 2. 服务器日志分析

#### **关键日志模式**
```bash
# 成功的任务处理
✅ 任务处理器启动成功
🔧 处理子任务: [id]
✅ CODE评分器处理完成: [score]/100

# 错误模式
❌ LLM API调用失败
❌ 模型配置未找到
❌ 代码执行失败
```

#### **日志级别**
- `INFO`: 正常操作信息
- `WARN`: 警告信息 (不影响功能)
- `ERROR`: 错误信息 (需要处理)

### 3. API端点测试

#### **健康检查端点**
```bash
# 处理器状态
curl http://localhost:3000/api/processor

# LLM配置状态
curl http://localhost:3000/api/llm-config

# 模型列表
curl http://localhost:3000/api/models
```

#### **功能测试端点**
```bash
# 特定任务详情
curl http://localhost:3000/api/tasks/[task-id]

# 代码执行详情
curl http://localhost:3000/api/evaluation-results/[result-id]/code-details
```

## 🔧 预防性维护

### 1. 定期检查

#### **每日检查项**
- [ ] 开发服务器运行状态
- [ ] 任务处理器健康状态
- [ ] LLM API配额使用情况
- [ ] 数据库连接状态

#### **每周检查项**
- [ ] 清理临时文件和缓存
- [ ] 检查错误日志趋势
- [ ] 验证新功能正常工作
- [ ] 更新依赖包 (如需要)

### 2. 性能监控

#### **关键指标**
- API响应时间
- 任务处理速度
- 内存使用情况
- 数据库查询性能

#### **监控命令**
```bash
# 检查进程状态
ps aux | grep node

# 检查端口占用
netstat -tulpn | grep :3000

# 检查内存使用
free -h
```

## 📞 获取支持

### 1. 自助排查清单
- [ ] 查看浏览器控制台错误
- [ ] 检查服务器日志输出
- [ ] 验证环境变量配置
- [ ] 测试API端点响应
- [ ] 清理缓存并重启服务

### 2. 报告问题时请提供
- 具体的错误信息和堆栈跟踪
- 重现问题的步骤
- 浏览器和操作系统信息
- 相关的服务器日志
- 当前的配置信息 (隐藏敏感数据)

### 3. 紧急问题处理
对于影响核心功能的严重问题:
1. 立即重启所有服务
2. 检查数据完整性
3. 回滚到最后已知的稳定状态
4. 记录问题详情以便后续分析

**🔧 记住：大多数问题都可以通过重启服务和清理缓存来解决！**
