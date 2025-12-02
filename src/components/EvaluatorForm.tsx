'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  EvaluatorType, 
  EvaluatorFormData, 
  EvaluatorConfig,
  PromptEvaluatorConfig,
  RegexEvaluatorConfig,
  CodeEvaluatorConfig,
  HumanEvaluatorConfig,
  EvaluatorValidationError,
  BaseEvaluator
} from '@/types/evaluator';
import { EvaluatorConfigValidator } from '@/lib/evaluator-validator';
import EvaluatorPromptEditor from './EvaluatorPromptEditor';
import { ScoringRulesManager } from '@/components/scoring-rules/ScoringRulesManager';
import CodeTemplateSelector from './CodeTemplateSelector';
import TemplateConfigForm from './TemplateConfigForm';
import { Settings, Code2, FileText, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { CodeTestCaseReference } from './CodeTestCaseReference';
import type { CodeEvaluationTemplate } from '@/types/code-templates';

// 生成示例代码
function getCodeExample(language: string): string {
  switch (language) {
    case 'python':
      return `# Python代码评估示例
# 注意：以下变量已自动注入，可直接使用：
# - test_input: 测试用例输入
# - model_response: 大模型的回答内容
# - reference_answer: 参考答案
# - test_case_metadata: 测试用例元数据

import re
import json

# 1. 从大模型回答中提取代码
def extract_code_from_response(response):
    # 方法1：从代码块中提取
    code_pattern = r'\`\`\`python(.*?)\`\`\`'
    matches = re.findall(code_pattern, response, re.DOTALL)
    if matches:
        return matches[0].strip()
    
    # 方法2：查找函数定义
    function_pattern = r'def\\s+\\w+.*?(?=\\n\\S|\\n*$)'
    matches = re.findall(function_pattern, response, re.DOTALL)
    if matches:
        return matches[0].strip()
    
    return response.strip()

# 2. 执行并测试大模型生成的代码
try:
    # 直接使用预注入的model_response变量
    model_code = extract_code_from_response(model_response)
    print(f"提取的代码长度: {len(model_code)} 字符")
    
    # 创建安全的执行环境
    exec_globals = {
        '__builtins__': {
            'len': len, 'range': range, 'list': list, 'int': int,
            'float': float, 'str': str, 'print': print, 'sorted': sorted,
            'max': max, 'min': min, 'sum': sum, 'abs': abs
        }
    }
    
    # 执行模型代码
    exec(model_code, exec_globals)
    
    # 3. 测试功能正确性
    test_passed = 0
    total_tests = 1
    
    # 🚀 智能算法函数检测与测试（全自动）
    
    # 调试输出：显示解析后的输入格式
    print(f"📊 输入数据: {test_input}")
    print(f"📊 输入类型: {type(test_input)}")
    if isinstance(test_input, dict):
        filtered_params = {k: v for k, v in test_input.items() if not k.startswith('_')}
        if filtered_params:
            print(f"📊 输入参数: {list(filtered_params.keys())}")
    
    # 🔍 使用智能函数检测系统
    func_name, func = find_main_function()
    
    if func_name and func:
        print(f"🎯 智能检测到主函数: {func_name}")
        
        # 🚀 使用智能函数调用
        try:
            result = smart_function_call(func_name, func)
            print(f"📤 函数执行结果: {result}")
            
            # 智能结果比较
            if compare_result(result):
                test_passed += 1
                print(f"✅ {func_name} 测试通过！")
            else:
                print(f"❌ {func_name} 测试失败")
                print(f"   期望: {reference_answer}")
                print(f"   实际: {result}")
        
        except Exception as e:
            print(f"❌ 函数执行异常: {e}")
            # 尝试备用调用方式
            try:
                if isinstance(test_input, dict) and not test_input.get('_isSingleVar'):
                    # 尝试传递第一个参数值
                    params = get_all_params()
                    if params:
                        result = func(params[0][1])
                        if compare_result(result):
                            test_passed += 1
                            print(f"✅ {func_name} 备用调用成功！")
                        else:
                            print(f"❌ {func_name} 备用调用失败: 期望 {reference_answer}, 实际 {result}")
                    else:
                        print("❌ 无法准备函数参数")
                else:
                    result = func(get_direct_value())
                    if compare_result(result):
                        test_passed += 1
                        print(f"✅ {func_name} 备用调用成功！")
                    else:
                        print(f"❌ {func_name} 备用调用失败: 期望 {reference_answer}, 实际 {result}")
            except Exception as e2:
                print(f"❌ 备用调用也失败: {e2}")
    else:
        print("❌ 未检测到可执行的算法函数")
        print("💡 提示：请确保代码中包含主要的算法函数")
        
        # 显示所有检测到的函数（调试用）
        all_funcs = []
        for name, obj in globals().items():
            if callable(obj) and not name.startswith('_'):
                all_funcs.append(name)
        if all_funcs:
            print(f"🔍 检测到的所有函数: {all_funcs}")
    
    # 使用test_case_metadata获取额外信息（如果有）
    if test_case_metadata and 'expected_complexity' in test_case_metadata:
        print(f"期望时间复杂度: {test_case_metadata['expected_complexity']}")
    
    # 4. 计算最终分数
    correctness_score = (test_passed / total_tests) * 100
    final_score = max(0, min(correctness_score, 100))
    
    print(f"\\n最终评分: {final_score}/100")
    print(f"正确率: {test_passed}/{total_tests}")

except Exception as e:
    print(f"代码执行失败: {str(e)}")
    final_score = 0

# 必须输出最终分数供系统识别
print(f"SCORE: {final_score}")`;

    case 'javascript':
      return `// JavaScript代码评估示例
// 注意：以下变量已自动注入，可直接使用：
// - test_input: 测试用例输入
// - model_response: 大模型的回答内容
// - reference_answer: 参考答案
// - test_case_metadata: 测试用例元数据

// 1. 从大模型回答中提取代码
function extractCodeFromResponse(response) {
    // 方法1：从代码块中提取
    const codeMatch = response.match(/\\\`\\\`\\\`javascript([\\s\\S]*?)\\\`\\\`\\\`/);
    if (codeMatch) {
        return codeMatch[1].trim();
    }
    
    // 方法2：查找函数定义
    const funcMatch = response.match(/function\\s+\\w+.*?\\{[\\s\\S]*?\\}/);
    if (funcMatch) {
        return funcMatch[0].trim();
    }
    
    return response.trim();
}

try {
    // 直接使用预注入的变量
    console.log("测试输入:", test_input);
    console.log("模型回答长度:", model_response.length, "字符");
    console.log("参考答案:", reference_answer);
    
    // 从model_response中提取代码
    const modelCode = extractCodeFromResponse(model_response);
    console.log("提取的代码长度:", modelCode.length, "字符");
    
    // 执行模型代码
    eval(modelCode);
    
    // 3. 测试功能正确性
    let testPassed = 0;
    let totalTests = 1;
    
    // 🚀 智能算法函数检测与测试（全自动）
    
    // 调试输出：显示解析后的输入格式
    console.log("📊 输入数据:", test_input);
    console.log("📊 输入类型:", typeof test_input);
    if (typeof test_input === 'object' && test_input !== null) {
        const filteredParams = {};
        for (const [key, value] of Object.entries(test_input)) {
            if (!key.startsWith('_')) {
                filteredParams[key] = value;
            }
        }
        if (Object.keys(filteredParams).length > 0) {
            console.log("📊 输入参数:", Object.keys(filteredParams));
        }
    }
    
    // 🔍 使用智能函数检测系统
    const [funcName, func] = findMainFunction();
    
    if (funcName && func) {
        console.log("🎯 智能检测到主函数:", funcName);
        
        // 🚀 使用智能函数调用
        try {
            const result = smartFunctionCall(funcName, func);
            console.log("📤 函数执行结果:", result);
            
            // 智能结果比较
            if (compareResult(result)) {
                testPassed++;
                console.log(\`✅ \${funcName} 测试通过！\`);
            } else {
                console.log(\`❌ \${funcName} 测试失败\`);
                console.log("   期望:", reference_answer);
                console.log("   实际:", result);
            }
        
        } catch (e) {
            console.log("❌ 函数执行异常:", e.message);
            // 尝试备用调用方式
            try {
                let result;
                if (typeof test_input === 'object' && test_input !== null && !test_input._isSingleVar) {
                    // 尝试传递第一个参数值
                    const params = getAllParams();
                    if (params.length > 0) {
                        result = func(params[0][1]);
                    } else {
                        throw new Error("无法准备函数参数");
                    }
                } else {
                    result = func(getDirectValue());
                }
                
                if (compareResult(result)) {
                    testPassed++;
                    console.log(\`✅ \${funcName} 备用调用成功！\`);
                } else {
                    console.log(\`❌ \${funcName} 备用调用失败: 期望\`, reference_answer, \`, 实际\`, result);
                }
            } catch (e2) {
                console.log("❌ 备用调用也失败:", e2.message);
            }
        }
    } else {
        console.log("❌ 未检测到可执行的算法函数");
        console.log("💡 提示：请确保代码中包含主要的算法函数");
        
        // 显示所有检测到的函数（调试用）
        const allFuncs = [];
        for (const name in this) {
            if (typeof this[name] === 'function' && !name.startsWith('_')) {
                allFuncs.push(name);
            }
        }
        if (allFuncs.length > 0) {
            console.log("🔍 检测到的所有函数:", allFuncs);
        }
    }
    
    // 使用test_case_metadata获取额外信息（如果有）
    if (test_case_metadata && test_case_metadata.expected_complexity) {
        console.log("期望时间复杂度:", test_case_metadata.expected_complexity);
    }
    
    // 4. 计算最终分数
    const correctnessScore = (testPassed / totalTests) * 100;
    const finalScore = Math.max(0, Math.min(correctnessScore, 100));
    
    console.log("\\n最终评分:", finalScore + "/100");
    console.log("正确率:", testPassed + "/" + totalTests);
    
    // 必须输出最终分数供系统识别
    console.log("SCORE:", finalScore);
    
} catch (error) {
    console.log("代码执行失败:", error.message);
    console.log("SCORE: 0");
}`;

    default:
      return `# 请选择具体的编程语言以查看示例代码
# 可用变量：
# - model_response: 大模型的回答内容  
# - test_input: 测试用例输入
# - reference_answer: 参考答案
# - test_case_metadata: 测试用例元数据

print("请编写评分逻辑代码")`;
  }
}

// 生成占位文本
function getCodePlaceholder(language: string): string {
  switch (language) {
    case 'python':
      return `# 编写Python评分逻辑
# 这些变量已自动注入，无需声明：
# - test_input: 测试用例输入
# - model_response: 大模型的回答内容
# - reference_answer: 参考答案
# - test_case_metadata: 测试用例元数据
#
# 示例步骤：
# 1. 从model_response中提取代码
# 2. 执行并测试代码功能
# 3. 计算分数并输出 SCORE: 85
# 
# 点击"插入示例代码"查看完整示例`;
    case 'javascript':
      return `// 编写JavaScript评分逻辑
// 这些变量已自动注入，无需声明：
// - test_input: 测试用例输入
// - model_response: 大模型的回答内容
// - reference_answer: 参考答案
// - test_case_metadata: 测试用例元数据
//
// 示例步骤：
// 1. 从model_response中提取代码
// 2. 执行并测试代码功能
// 3. 计算分数并输出 SCORE: 85
// 
// 点击"插入示例代码"查看完整示例`;
    case 'typescript':
      return `// 编写TypeScript评分逻辑
// 这些变量已自动注入，无需声明：
// - test_input: any - 测试用例输入
// - model_response: string - 大模型的回答内容
// - reference_answer: any - 参考答案
// - test_case_metadata: any - 测试用例元数据
//
// 示例步骤：
// 1. 从model_response中提取代码
// 2. 执行并测试代码功能
// 3. 计算分数并输出 SCORE: 85`;
    default:
      return `编写评分逻辑代码...
可用的预注入变量：
- test_input: 测试用例输入
- model_response: 大模型的回答内容
- reference_answer: 参考答案
- test_case_metadata: 测试用例元数据

最终必须输出: SCORE: [分数]`;
  }
}

interface EvaluatorFormProps {
  evaluator?: BaseEvaluator;
  onSave: (data: EvaluatorFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const EVALUATOR_TYPE_OPTIONS = [
  { value: 'PROMPT' as const, label: 'AI提示词评分器', description: '使用AI模型根据提示词进行评分' },
  { value: 'REGEX' as const, label: '正则表达式评分器', description: '基于正则表达式模式匹配进行评分' },
  { value: 'CODE' as const, label: '代码执行评分器', description: '执行自定义代码逻辑进行评分' },
  { value: 'HUMAN' as const, label: '人工评估评分器', description: '需要人工干预的评分方式' }
];

export default function EvaluatorForm({ evaluator, onSave, onCancel, loading = false }: EvaluatorFormProps) {
  const [formData, setFormData] = useState<EvaluatorFormData>({
    name: '',
    type: 'PROMPT',
    description: '',
    config: {}
  });
  const [validationErrors, setValidationErrors] = useState<EvaluatorValidationError[]>([]);
  const [models, setModels] = useState<Array<{ 
    id: string; 
    name: string; 
    input_cost_per_1k_tokens?: number; 
    output_cost_per_1k_tokens?: number;
    cost_currency?: string;
  }>>([]);

  // 初始化表单数据
  useEffect(() => {
    if (evaluator) {
      setFormData({
        name: evaluator.name,
        type: evaluator.type,
        description: evaluator.description || '',
        config: evaluator.config
      });
    } else {
      // 新建时设置默认配置
      handleTypeChange('PROMPT');
    }
  }, [evaluator]);

  // 加载模型列表（用于PROMPT类型）
  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await fetch('/api/models?include_inactive=true');
        if (response.ok) {
          const data = await response.json();
          setModels(data.models || []);
        }
      } catch (error) {
        console.error('加载模型列表失败:', error);
      }
    };
    loadModels();
  }, []);

  // 处理类型变更
  const handleTypeChange = (type: EvaluatorType) => {
    const defaultConfig = EvaluatorConfigValidator.getDefaultConfig(type);
    setFormData(prev => ({
      ...prev,
      type,
      config: defaultConfig
    }));
    setValidationErrors([]);
  };

  // 处理基础字段变更
  const handleFieldChange = (field: keyof EvaluatorFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 处理配置变更
  const handleConfigChange = (path: string, value: any) => {
    setFormData(prev => {
      const newConfig = { ...prev.config };
      const keys = path.split('.');
      let current: any = newConfig;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      
      return {
        ...prev,
        config: newConfig
      };
    });
  };

  // 处理提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证表单
    const errors = EvaluatorConfigValidator.validate(formData.type, formData.config);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    
    try {
      await onSave(formData);
    } catch (error) {
      console.error('保存失败:', error);
    }
  };

  // 获取字段错误信息
  const getFieldError = (field: string) => {
    return validationErrors.find(error => error.field === field)?.message;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-screen overflow-y-auto">
        <h3 className="text-xl font-semibold mb-6">
          {evaluator ? '编辑评分器' : '创建评分器'}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 基础信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                名称 *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="输入评分器名称"
              />
              {getFieldError('name') && (
                <p className="text-red-600 text-sm mt-1">{getFieldError('name')}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                类型 *
              </label>
              <select
                value={formData.type}
                onChange={(e) => handleTypeChange(e.target.value as EvaluatorType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {EVALUATOR_TYPE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="描述这个评分器的用途和特点"
            />
          </div>

          {/* 类型特定配置 */}
          <div className="border-t pt-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4">配置详情</h4>
            
            {formData.type === 'PROMPT' && (
              <PromptConfigForm
                config={formData.config as PromptEvaluatorConfig}
                models={models}
                onChange={handleConfigChange}
                getFieldError={getFieldError}
              />
            )}
            
            {formData.type === 'REGEX' && (
              <RegexConfigForm
                config={formData.config as RegexEvaluatorConfig}
                onChange={handleConfigChange}
                getFieldError={getFieldError}
              />
            )}
            
            {formData.type === 'CODE' && (
              <CodeConfigForm
                config={formData.config as CodeEvaluatorConfig}
                onChange={handleConfigChange}
                getFieldError={getFieldError}
                evaluatorId={evaluator?.id}
              />
            )}
            
            {formData.type === 'HUMAN' && (
              <HumanConfigForm
                config={formData.config as HumanEvaluatorConfig}
                onChange={handleConfigChange}
                getFieldError={getFieldError}
              />
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '保存中...' : (evaluator ? '更新' : '创建')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// PROMPT类型配置表单
function PromptConfigForm({ 
  config, 
  models, 
  onChange, 
  getFieldError 
}: {
  config: PromptEvaluatorConfig;
  models: Array<{ id: string; name: string }>;
  onChange: (path: string, value: any) => void;
  getFieldError: (field: string) => string | undefined;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          评估模型 *
        </label>
        <select
          value={config.model_id || ''}
          onChange={(e) => onChange('model_id', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">选择模型</option>
          {models.map(model => {
            const inputCost = model.input_cost_per_1k_tokens;
            const outputCost = model.output_cost_per_1k_tokens;
            const currency = model.cost_currency || 'CNY';
            
            let costDisplay = '';
            if (inputCost !== undefined && inputCost !== null && outputCost !== undefined && outputCost !== null) {
              // 格式化成本数字，保留适当的小数位数
              const formatCost = (cost: number) => {
                if (cost >= 1) return cost.toFixed(2);
                if (cost >= 0.01) return cost.toFixed(3);
                if (cost >= 0.001) return cost.toFixed(4);
                return cost.toFixed(6);
              };
              
              costDisplay = ` (¥${formatCost(inputCost)}/¥${formatCost(outputCost)} 每1K)`;
            } else if ((inputCost !== undefined && inputCost !== null) || (outputCost !== undefined && outputCost !== null)) {
              costDisplay = ' - 成本信息不完整';
            } else {
              costDisplay = ' - 无成本信息';
            }
            
            return (
              <option key={model.id} value={model.id}>
                {model.name}{costDisplay}
              </option>
            );
          })}
        </select>
        {getFieldError('config.model_id') && (
          <p className="text-red-600 text-sm mt-1">{getFieldError('config.model_id')}</p>
        )}
      </div>

      <SystemPromptSection
        config={config}
        onChange={onChange}
        getFieldError={getFieldError}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          评估提示词 *
        </label>
        <EvaluatorPromptEditor
          value={config.evaluation_prompt || ''}
          onChange={(value) => onChange('evaluation_prompt', value)}
          evaluatorType="PROMPT"
          placeholder="具体的评估指令，可以使用系统变量如 {{test_case_input}}、{{model_response}}、{{EXECUTION_OUTPUT}} 等"
          hybridEvaluationEnabled={config.code_execution?.enabled ?? false}
          onEnableHybridEvaluation={() => {
            // 启用混合评估并设置默认配置
            onChange('code_execution', {
              enabled: true,
              language: 'python',
              timeout_ms: 30000,
              extract_code_strategy: { type: 'auto' },
              fallback_on_error: true
            });
          }}
        />
        {getFieldError('config.evaluation_prompt') && (
          <p className="text-red-600 text-sm mt-1">{getFieldError('config.evaluation_prompt')}</p>
        )}
      </div>

      {/* 🆕 混合评估配置（代码执行） */}
      <div className="border-t pt-4">
        <div className="mb-4">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={config.code_execution?.enabled ?? false}
              onChange={(e) => onChange('code_execution.enabled', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="text-sm font-medium text-gray-700">
              启用混合评估（代码执行 + AI评分）
            </span>
          </label>
          <p className="text-xs text-gray-500 ml-7 mt-1">
            从被测模型响应中提取代码并执行，将执行结果作为变量提供给AI评分器
          </p>
        </div>

        {config.code_execution?.enabled && (
          <div className="ml-7 space-y-4 border-l-2 border-blue-200 pl-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  执行语言 *
                </label>
                <select
                  value={config.code_execution?.language || 'python'}
                  onChange={(e) => onChange('code_execution.language', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="cpp">C++</option>
                  <option value="java">Java</option>
                  <option value="go">Go</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  超时时间 (毫秒)
                </label>
                <input
                  type="number"
                  min="1000"
                  max="300000"
                  value={config.code_execution?.timeout_ms ?? 30000}
                  onChange={(e) => onChange('code_execution.timeout_ms', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                代码提取策略 *
              </label>
              <select
                value={config.code_execution?.extract_code_strategy?.type || 'auto'}
                onChange={(e) => {
                  const strategyType = e.target.value as 'auto' | 'regex' | 'markers';
                  onChange('code_execution.extract_code_strategy', { 
                    type: strategyType,
                    ...(strategyType === 'regex' ? { pattern: '' } : {}),
                    ...(strategyType === 'markers' ? { markers: { start: '', end: '' } } : {})
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="auto">自动检测</option>
                <option value="regex">正则表达式</option>
                <option value="markers">标记提取</option>
              </select>
            </div>

            {/* 正则表达式策略配置 */}
            {config.code_execution?.extract_code_strategy?.type === 'regex' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  正则表达式模式 *
                </label>
                <input
                  type="text"
                  value={config.code_execution?.extract_code_strategy?.pattern || ''}
                  onChange={(e) => onChange('code_execution.extract_code_strategy.pattern', e.target.value)}
                  placeholder="例如: ```(?:python|py)?\n([\s\S]*?)\n```"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  正则表达式用于从模型响应中提取代码。使用捕获组()指定要提取的部分。
                </p>
              </div>
            )}

            {/* 标记策略配置 */}
            {config.code_execution?.extract_code_strategy?.type === 'markers' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    开始标记 *
                  </label>
                  <input
                    type="text"
                    value={config.code_execution?.extract_code_strategy?.markers?.start || ''}
                    onChange={(e) => onChange('code_execution.extract_code_strategy.markers.start', e.target.value)}
                    placeholder="例如: ```python"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    结束标记 *
                  </label>
                  <input
                    type="text"
                    value={config.code_execution?.extract_code_strategy?.markers?.end || ''}
                    onChange={(e) => onChange('code_execution.extract_code_strategy.markers.end', e.target.value)}
                    placeholder="例如: ```"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={config.code_execution?.fallback_on_error ?? true}
                  onChange={(e) => onChange('code_execution.fallback_on_error', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">失败时启用备用策略</span>
              </label>
              <p className="text-xs text-gray-500 ml-7 mt-1">
                当指定的提取策略失败时，自动尝试其他提取方法
              </p>
            </div>

            {/* 混合评估变量引导 */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center mb-3">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center mr-2">
                  <span className="text-white text-xs font-bold">🚀</span>
                </div>
                <h4 className="text-sm font-semibold text-blue-800">混合评估变量系统</h4>
              </div>
              
              <p className="text-xs text-blue-700 mb-3">
                启用代码执行后，系统将自动生成27个动态变量供您在评估提示词中使用。
              </p>

              {/* 变量分类展示 */}
              <div className="space-y-3">
                {/* 核心变量 */}
                <div>
                  <h5 className="text-xs font-medium text-blue-800 mb-1">🎯 核心变量</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{EXTRACTED_CODE}}'}</code>
                      <div className="text-gray-500 text-xs">提取的源代码</div>
                    </div>
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{EXECUTION_SUCCESS}}'}</code>
                      <div className="text-gray-500 text-xs">执行成功状态</div>
                    </div>
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{EXECUTION_OUTPUT}}'}</code>
                      <div className="text-gray-500 text-xs">程序输出结果</div>
                    </div>
                  </div>
                </div>

                {/* 性能指标 */}
                <div>
                  <h5 className="text-xs font-medium text-blue-800 mb-1">⚡ 性能指标</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{PERFORMANCE_LEVEL}}'}</code>
                      <div className="text-gray-500 text-xs">性能等级</div>
                    </div>
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{EXECUTION_TIME}}'}</code>
                      <div className="text-gray-500 text-xs">执行时间(ms)</div>
                    </div>
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{MEMORY_USAGE}}'}</code>
                      <div className="text-gray-500 text-xs">内存使用量</div>
                    </div>
                  </div>
                </div>

                {/* 代码质量 */}
                <div>
                  <h5 className="text-xs font-medium text-blue-800 mb-1">📊 代码质量</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{CODE_LANGUAGE}}'}</code>
                      <div className="text-gray-500 text-xs">编程语言</div>
                    </div>
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{CODE_LENGTH}}'}</code>
                      <div className="text-gray-500 text-xs">代码字符数</div>
                    </div>
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{EXTRACTION_QUALITY}}'}</code>
                      <div className="text-gray-500 text-xs">提取质量评级</div>
                    </div>
                  </div>
                </div>

                {/* 错误处理 */}
                <div>
                  <h5 className="text-xs font-medium text-blue-800 mb-1">🔍 错误处理</h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{EXECUTION_ERROR}}'}</code>
                      <div className="text-gray-500 text-xs">错误信息</div>
                    </div>
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{ERROR_TYPE}}'}</code>
                      <div className="text-gray-500 text-xs">错误类型分类</div>
                    </div>
                    <div className="bg-white px-2 py-1 rounded border border-blue-200">
                      <code className="text-blue-700 font-mono">{'{{EXIT_CODE}}'}</code>
                      <div className="text-gray-500 text-xs">程序退出码</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 使用示例 */}
              <div className="mt-3 p-2 bg-white border border-blue-200 rounded">
                <h6 className="text-xs font-medium text-blue-800 mb-1">💡 使用示例</h6>
                <div className="text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded text-left">
                  <div>评估代码: {'{{CODE_LANGUAGE}}'}</div>
                  <div>执行结果: {'{{EXECUTION_SUCCESS}}'}</div>  
                  <div>输出内容: {'{{EXECUTION_OUTPUT}}'}</div>
                  <div>性能等级: {'{{PERFORMANCE_LEVEL}}'}</div>
                </div>
              </div>

              {/* 提示信息 */}
              <div className="flex items-start space-x-2 mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                <span className="text-yellow-600 text-xs">💡</span>
                <div className="text-xs text-yellow-700">
                  <strong>智能提示：</strong>系统会根据代码执行结果动态生成这些变量。如果执行失败，将提供错误相关变量；如果成功，将提供输出和性能变量。
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            温度值
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={config.temperature ?? 0.3}
            onChange={(e) => onChange('temperature', parseFloat(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            最大Token数
          </label>
          <input
            type="number"
            min="1"
            value={config.max_tokens ?? 500}
            onChange={(e) => onChange('max_tokens', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* 🆕 可复用的CODE测试用例展示 */}
      <CodeTestCaseReference />

    </div>
  );
}

// REGEX类型配置表单
function RegexConfigForm({ 
  config, 
  onChange, 
  getFieldError 
}: {
  config: RegexEvaluatorConfig;
  onChange: (path: string, value: any) => void;
  getFieldError: (field: string) => string | undefined;
}) {
  const addPattern = () => {
    const patterns = [...(config.patterns || [])];
    patterns.push({ pattern: '', score: 0, description: '' });
    onChange('patterns', patterns);
  };

  const removePattern = (index: number) => {
    const patterns = [...(config.patterns || [])];
    patterns.splice(index, 1);
    onChange('patterns', patterns);
  };

  const updatePattern = (index: number, field: string, value: any) => {
    const patterns = [...(config.patterns || [])];
    patterns[index] = { ...patterns[index], [field]: value };
    onChange('patterns', patterns);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          默认分数
        </label>
        <input
          type="number"
          value={config.default_score ?? 0}
          onChange={(e) => onChange('default_score', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={config.case_sensitive ?? false}
            onChange={(e) => onChange('case_sensitive', e.target.checked)}
            className="mr-2"
          />
          区分大小写
        </label>
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <label className="block text-sm font-medium text-gray-700">
            正则表达式模式
          </label>
          <button
            type="button"
            onClick={addPattern}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            添加模式
          </button>
        </div>

        <div className="space-y-3">
          {(config.patterns || []).map((pattern, index) => (
            <div key={index} className="border rounded p-4 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">正则表达式</label>
                  <input
                    type="text"
                    value={pattern.pattern}
                    onChange={(e) => updatePattern(index, 'pattern', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="^.*\\.(jpg|png)$"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">分数</label>
                  <input
                    type="number"
                    value={pattern.score}
                    onChange={(e) => updatePattern(index, 'score', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">标志</label>
                  <input
                    type="text"
                    value={pattern.flags || ''}
                    onChange={(e) => updatePattern(index, 'flags', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="i, g, m 等"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">描述</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pattern.description || ''}
                    onChange={(e) => updatePattern(index, 'description', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="描述这个模式的用途"
                  />
                  <button
                    type="button"
                    onClick={() => removePattern(index)}
                    className="px-3 py-2 text-red-600 hover:text-red-800"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// CODE类型配置表单
function CodeConfigForm({
  config,
  onChange,
  getFieldError,
  evaluatorId
}: {
  config: CodeEvaluatorConfig;
  onChange: (path: string, value: any) => void;
  getFieldError: (field: string) => string | undefined;
  evaluatorId?: string;
}) {
  const [showScoringRules, setShowScoringRules] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<CodeEvaluationTemplate | null>(null);
  const [configMode, setConfigMode] = useState<'template' | 'manual'>(
    config.use_template ? 'template' : 'manual'
  );

  // 处理配置模式切换
  const handleModeChange = (mode: 'template' | 'manual') => {
    setConfigMode(mode);
    onChange('use_template', mode === 'template');
    
    if (mode === 'manual') {
      // 切换到手动模式时，清除模板相关配置
      onChange('template_id', undefined);
      onChange('template_config', undefined);
      setSelectedTemplate(null);
    } else {
      // 切换到模板模式时，清除手动代码
      onChange('code', undefined);
    }
  };

  // 处理模板选择 - 使用useCallback避免重渲染
  const handleTemplateSelect = useCallback((template: CodeEvaluationTemplate | null) => {
    setSelectedTemplate(template);
    if (template) {
      onChange('template_id', template.id);
      onChange('template_config', template.example_config);
    } else {
      onChange('template_id', undefined);
      onChange('template_config', undefined);
    }
  }, [onChange]);

  // 处理模板配置变更 - 使用useCallback避免重渲染
  const handleTemplateConfigChange = useCallback((newConfig: any) => {
    onChange('template_config', newConfig);
  }, [onChange]);

  return (
    <div className="space-y-6">
      {/* 配置模式选择 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">配置方式</h4>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              value="template"
              checked={configMode === 'template'}
              onChange={(e) => handleModeChange('template')}
              className="mr-2"
            />
            <div className="flex items-center">
              <Code2 className="h-4 w-4 mr-1 text-blue-600" />
              <span className="text-sm">使用预置模板</span>
            </div>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="manual"
              checked={configMode === 'manual'}
              onChange={(e) => handleModeChange('manual')}
              className="mr-2"
            />
            <div className="flex items-center">
              <FileText className="h-4 w-4 mr-1 text-green-600" />
              <span className="text-sm">手动编写代码</span>
            </div>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          编程语言 *
        </label>
        <select
          value={config.language || 'python'}
          onChange={(e) => onChange('language', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="cpp">C++</option>
          <option value="java">Java</option>
          <option value="go">Go</option>
        </select>
      </div>

      {/* 模板配置区域 */}
      {configMode === 'template' && (
        <div className="space-y-4">
          <CodeTemplateSelector
            selectedTemplateId={config.template_id}
            language={config.language || 'python'}
            onTemplateSelect={handleTemplateSelect}
            onConfigChange={handleTemplateConfigChange}
            templateConfig={config.template_config}
            className="border-0 bg-transparent p-0"
          />
          
          {selectedTemplate && (
            <div className="mt-4">
              <TemplateConfigForm
                template={selectedTemplate}
                config={config.template_config || {}}
                onChange={handleTemplateConfigChange}
              />
            </div>
          )}
        </div>
      )}

      {/* 手动代码编写区域 */}
      {configMode === 'manual' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              执行代码 *
            </label>
            <button
              type="button"
              onClick={() => {
                const example = getCodeExample(config.language || 'python');
                onChange('code', example);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              插入示例代码
            </button>
          </div>
          
          <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="flex items-start">
              <Info className="h-4 w-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-800">
                <p className="font-medium mb-1">可用变量：</p>
                <ul className="space-y-1">
                  <li><code className="bg-blue-100 px-1 rounded">model_response</code> - 大模型的回答内容</li>
                  <li><code className="bg-blue-100 px-1 rounded">test_input</code> - 测试用例输入</li>
                  <li><code className="bg-blue-100 px-1 rounded">reference_answer</code> - 参考答案</li>
                  <li><code className="bg-blue-100 px-1 rounded">test_case_metadata</code> - 测试用例元数据</li>
                </ul>
              </div>
            </div>
          </div>
          
          <textarea
            value={config.code || ''}
            onChange={(e) => onChange('code', e.target.value)}
            rows={16}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            placeholder={getCodePlaceholder(config.language || 'python')}
          />
          {getFieldError('config.code') && (
            <p className="text-red-600 text-sm mt-1">{getFieldError('config.code')}</p>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          超时时间 (毫秒)
        </label>
        <input
          type="number"
          min="1000"
          value={config.timeout_ms ?? 10000}
          onChange={(e) => onChange('timeout_ms', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* 评分规则管理 - 当前CODE评分器不使用多维度评分，此配置可能用于未来功能 */}
      {false && ( // 暂时隐藏，直到确认用途
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-lg font-medium text-gray-900">评分规则配置</h4>
              <p className="text-sm text-gray-600">配置代码执行的多维度评分规则（语法、功能、性能、内存）</p>
            </div>
          <button
            type="button"
            onClick={() => setShowScoringRules(!showScoringRules)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Settings className="w-4 h-4" />
            {showScoringRules ? '隐藏配置' : '配置评分规则'}
          </button>
        </div>

        {showScoringRules && evaluatorId && (
          <div className="bg-gray-50 rounded-lg p-4">
            <ScoringRulesManager
              evaluatorId={evaluatorId}
              onRulesChange={(rules) => {
                // 将评分规则保存到评分器配置中
                onChange('scoringRules', rules);
              }}
            />
          </div>
        )}

        {showScoringRules && !evaluatorId && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  需要先保存评分器
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>请先保存评分器，然后再配置评分规则。</p>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {/* CODE评分器使用说明 */}
      <div className="border-t pt-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                CODE评分器使用说明
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>CODE评分器通过执行代码获取最终分数：</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li><strong>您的代码完全控制评分逻辑</strong> - 无论使用模板还是手动编写</li>
                  <li><strong>必须输出最终分数</strong> - 格式为 <code className="bg-blue-100 px-1 rounded">SCORE: [数字]</code></li>
                  <li><strong>可用预注入变量</strong> - test_input, model_response, reference_answer, test_case_metadata</li>
                  <li><strong>分数范围</strong> - 建议 0-100 分，系统会自动限制在有效范围内</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// HUMAN类型配置表单
function HumanConfigForm({ 
  config, 
  onChange, 
  getFieldError 
}: {
  config: HumanEvaluatorConfig;
  onChange: (path: string, value: any) => void;
  getFieldError: (field: string) => string | undefined;
}) {
  const addCriterion = () => {
    const criteria = [...(config.scoring_criteria || [])];
    criteria.push({ criterion: '', weight: 0, description: '' });
    onChange('scoring_criteria', criteria);
  };

  const removeCriterion = (index: number) => {
    const criteria = [...(config.scoring_criteria || [])];
    criteria.splice(index, 1);
    onChange('scoring_criteria', criteria);
  };

  const updateCriterion = (index: number, field: string, value: any) => {
    const criteria = [...(config.scoring_criteria || [])];
    criteria[index] = { ...criteria[index], [field]: value };
    onChange('scoring_criteria', criteria);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          评估指南 *
        </label>
        <textarea
          value={config.guidelines || ''}
          onChange={(e) => onChange('guidelines', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="描述人工评估的标准和流程"
        />
        {getFieldError('config.guidelines') && (
          <p className="text-red-600 text-sm mt-1">{getFieldError('config.guidelines')}</p>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <label className="block text-sm font-medium text-gray-700">
            评分标准
          </label>
          <button
            type="button"
            onClick={addCriterion}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            添加标准
          </button>
        </div>

        <div className="space-y-3">
          {(config.scoring_criteria || []).map((criterion, index) => (
            <div key={index} className="border rounded p-4 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">标准名称</label>
                  <input
                    type="text"
                    value={criterion.criterion}
                    onChange={(e) => updateCriterion(index, 'criterion', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="评分标准名称"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">权重</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={criterion.weight}
                    onChange={(e) => updateCriterion(index, 'weight', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">描述</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={criterion.description || ''}
                    onChange={(e) => updateCriterion(index, 'description', e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="详细描述这个评分标准"
                  />
                  <button
                    type="button"
                    onClick={() => removeCriterion(index)}
                    className="px-3 py-2 text-red-600 hover:text-red-800"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 可折叠的系统提示词编辑器组件
function SystemPromptSection({
  config,
  onChange,
  getFieldError
}: {
  config: PromptEvaluatorConfig;
  onChange: (path: string, value: any) => void;
  getFieldError: (field: string) => string | undefined;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasContent = config.system_prompt && config.system_prompt.trim().length > 0;

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* 折叠/展开头部 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-t-lg transition-colors"
      >
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
            <span className="text-sm font-medium text-gray-700">
              系统提示词
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500">可选</span>
            {hasContent && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                已设置
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-400">
          {isExpanded ? '点击收起' : '点击展开'}
        </div>
      </button>

      {/* 折叠内容 */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          <div className="mb-3">
            <p className="text-sm text-gray-600 mb-2">
              定义AI助手的角色和基本行为。如果为空，LLM将直接使用评估提示词。
            </p>
          </div>

          <EvaluatorPromptEditor
            value={config.system_prompt || ''}
            onChange={(value) => onChange('system_prompt', value)}
            evaluatorType="PROMPT"
            placeholder="可选：设置系统角色和基本指令。例如：'你是一个专业的文学评论家，擅长分析小说的文学价值。'"
            height="150px"
          />

          <div className="mt-2 flex items-start space-x-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-gray-500">
              <p className="mb-1">
                <strong>使用建议：</strong>
              </p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li>简洁明确地定义AI助手的专业角色</li>
                <li>如果评估提示词中已包含完整的角色定义，可以留空</li>
                <li>避免与评估提示词中的指令重复</li>
              </ul>
            </div>
          </div>

          {getFieldError('config.system_prompt') && (
            <p className="text-red-600 text-sm mt-2">{getFieldError('config.system_prompt')}</p>
          )}
        </div>
      )}
    </div>
  );
}