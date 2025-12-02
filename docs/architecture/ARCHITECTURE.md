# 🏗️ CODE评分器架构演进说明

## 概述

本文档描述了AI Benchmark系统中CODE评分器架构的重要演进，从评分器级别测试用例迁移到题目级别测试用例的设计变更。

## 架构演进历史

### 旧架构 (v1.0) - 评分器级别测试用例

**设计思路：**
- 测试用例绑定在评分器配置中
- 每个评分器有固定的测试用例集合
- 一个评分器对应一类特定的题目

**数据结构：**
```javascript
// 评分器配置
{
  "id": "evaluator-123",
  "name": "排序算法评分器",
  "type": "CODE",
  "config": {
    "test_cases": [
      {
        "input": [3, 1, 4, 1, 5],
        "expected": [1, 1, 3, 4, 5],
        "description": "基本排序测试"
      },
      {
        "input": [9, 8, 7, 6, 5],
        "expected": [5, 6, 7, 8, 9],
        "description": "逆序排序测试"
      }
    ]
  }
}
```

**优点：**
- 结构清晰，测试用例与评分逻辑紧密绑定
- 评分器可以针对特定算法优化

**缺点：**
- 不够灵活，无法复用评分器
- 每个新题目需要创建新的评分器
- 维护成本高，测试用例分散

### 新架构 (v2.0) - 题目级别测试用例

**设计思路：**
- 评分器作为通用工具，不绑定特定测试用例
- 测试用例数据存储在题目级别
- 系统动态解析题目描述中的示例数据

**数据结构：**
```javascript
// 通用评分器配置
{
  "id": "universal-code-evaluator",
  "name": "通用代码评分器",
  "type": "CODE",
  "config": {
    "test_cases": [], // 🔥 关键：空数组！
    "template_id": "algorithm-template",
    "language": "python"
  }
}

// 题目数据
{
  "id": "test-case-123",
  "input": `
编程题：给你两个编码后的字符串 s1 和 s2，判断是否存在原字符串能同时编码为这两个字符串。

示例 1：
输入：s1 = "internationalization", s2 = "i18n"
输出：true

示例 2：
输入：s1 = "l123e", s2 = "44"
输出：true

示例 3：
输入：s1 = "a5b", s2 = "c5b"
输出：false
  `,
  "reference_answer": "def possiblyEquals(s1, s2): ..."
}
```

**优点：**
- 评分器高度复用，一个评分器可用于所有CODE题目
- 题目与测试用例解耦，便于题目管理
- 测试用例与题目描述统一，减少数据冗余

**缺点：**
- 需要复杂的解析逻辑
- 对题目描述格式有要求

## 关键技术实现

### 1. 示例解析器 (`extractExamplesFromDescription`)

**位置：** `src/lib/evaluator-engine.ts:2128`

**功能：** 将题目描述中的示例文本转换为结构化测试用例

**输入格式：**
```
示例 1：
输入：s1 = "internationalization", s2 = "i18n"
输出：true
```

**输出格式：**
```javascript
{
  input: {s1: "internationalization", s2: "i18n"},
  expected: true,
  description: "示例 1"
}
```

### 2. 字段兼容性映射

**位置：** `src/lib/evaluator-engine.ts:527`

**优先级：**
1. `testCase.expected` (新格式)
2. `testCase.expected_output` (中间格式)
3. `testCase.reference_answer` (旧格式)

### 3. 模板配置验证

**位置：** `src/lib/code-template-engine.ts:238`

**逻辑：**
- 如果 `config.test_cases = []` → 正常（新架构）
- 如果 `config.test_cases` 有数据 → 验证完整性（旧架构兼容）

## 识别架构版本的方法

### 🔍 如何判断是新架构还是旧架构？

**检查评分器配置：**
```javascript
if (evaluator.config.test_cases.length === 0) {
  // 新架构：通用评分器，测试用例来源于题目级别
  console.log("使用新架构：题目级别测试用例");
} else {
  // 旧架构：评分器级别测试用例
  console.log("使用旧架构：评分器级别测试用例");
}
```

**检查题目数据：**
```javascript
if (testCase.input.includes('示例') && testCase.input.length > 500) {
  // 新架构：题目描述包含示例，需要解析
  console.log("检测到题目描述型测试用例，启动示例解析器");
} else {
  // 旧架构或简单题目：直接使用数据
  console.log("使用简单测试用例数据");
}
```

## 常见问题与解决方案

### ❌ 错误认知：评分器配置为空是bug

**错误想法：**
> "评分器的test_cases是空数组，肯定是数据丢失了，需要修复"

**正确理解：**
> 在新架构中，通用评分器的test_cases应该是空数组，这是设计如此！测试用例数据来源于题目级别的动态解析。

### ❌ 错误操作：在评分器配置中添加测试用例

**错误做法：**
```javascript
// 不要这样做！
evaluator.config.test_cases = [
  {input: [...], expected: [...]}
];
```

**正确做法：**
```javascript
// 确保解析器正常工作
const examples = extractExamplesFromDescription(testCase.input);
// 让系统动态提供测试用例给模板
```

### ❌ 错误调试：查看评分器配置找测试用例

**错误思路：**
> "CODE评分器失败了，先检查evaluator.config.test_cases"

**正确思路：**
> "CODE评分器失败了，先检查extractExamplesFromDescription是否正确解析了题目描述中的示例"

## 迁移指南

### 从旧架构迁移到新架构

1. **清空评分器配置的测试用例：**
   ```javascript
   evaluator.config.test_cases = [];
   ```

2. **将测试用例数据迁移到题目描述：**
   ```javascript
   testCase.input = `
   编程题：[问题描述]

   示例 1：
   输入：[...]
   输出：[...]
   `;
   ```

3. **确保解析器支持新格式：**
   - 检查 `extractExamplesFromDescription` 正则表达式
   - 验证输入/输出格式解析逻辑

### 保持向后兼容

系统同时支持新旧架构：
- 新架构：`config.test_cases = []` + 动态解析
- 旧架构：`config.test_cases = [...]` + 直接使用

## 最佳实践

### ✅ 正确的新架构实现

1. **通用评分器设计：**
   ```javascript
   {
     "name": "通用Python代码评分器",
     "type": "CODE",
     "config": {
       "test_cases": [], // 空数组！
       "language": "python",
       "template_id": "algorithm-template"
     }
   }
   ```

2. **标准化题目格式：**
   ```
   编程题：[清晰的问题描述]

   示例 1：
   输入：param1 = value1, param2 = value2
   输出：expected_result

   示例 2：
   输入：param1 = value3, param2 = value4
   输出：expected_result2
   ```

3. **健壮的解析逻辑：**
   - 支持多种输入格式（变量赋值、JSON、直接值）
   - 处理不同输出类型（布尔值、数字、字符串）
   - 提供详细的解析日志

### ❌ 需要避免的反模式

1. **不要在新架构中查找评分器级别的测试用例**
2. **不要认为空的test_cases配置是错误**
3. **不要为每个题目创建专用的评分器**

## 架构优势总结

新架构实现了：

1. **🔄 评分器复用：** 一个通用评分器可用于所有CODE题目
2. **📊 数据统一：** 题目描述和测试用例在同一位置
3. **🛠️ 维护简化：** 不需要为每个题目单独配置评分器
4. **🔧 灵活扩展：** 支持复杂的算法题格式
5. **🔀 向后兼容：** 旧架构仍然可以正常工作

---

**重要提醒：** 如果你发现CODE评分器的配置中`test_cases`是空数组，不要惊慌！这是新架构的正确设计。请检查示例解析逻辑，而不是试图在评分器配置中添加测试用例。