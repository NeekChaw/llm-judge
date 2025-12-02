'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  AlertTriangle, 
  Info, 
  Settings,
  Copy,
  Download
} from 'lucide-react';
import type { CodeEvaluationTemplate } from '@/types/code-templates';

interface TemplateConfigFormProps {
  template: CodeEvaluationTemplate;
  config: any;
  onChange: (config: any) => void;
  className?: string;
}

export default function TemplateConfigForm({
  template,
  config,
  onChange,
  className = ''
}: TemplateConfigFormProps) {
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['main']));

  // 验证配置
  useEffect(() => {
    validateConfig();
  }, [config, template]);

  const validateConfig = async () => {
    try {
      const response = await fetch('/api/code-templates/generate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.id,
          user_config: config
        })
      });

      const result = await response.json();
      setValidationErrors(result.validation?.errors || []);
    } catch (error) {
      setValidationErrors(['配置验证失败']);
    }
  };

  const updateConfig = (path: string, value: any) => {
    const newConfig = { ...config };
    setNestedValue(newConfig, path, value);
    onChange(newConfig);
  };

  const setNestedValue = (obj: any, path: string, value: any) => {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  };

  const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // 加载示例配置
  const loadExampleConfig = () => {
    if (template.example_config) {
      onChange({ ...template.example_config });
    }
  };

  // 根据模板类别渲染不同的配置表单
  const renderConfigForm = () => {
    switch (template.category) {
      case 'algorithm':
        return renderAlgorithmConfig();
      case 'format':
        return renderFormatConfig();
      case 'performance':
        return renderPerformanceConfig();
      case 'quality':
        return renderQualityConfig();
      default:
        return renderGenericConfig();
    }
  };

  // 算法测试配置
  const renderAlgorithmConfig = () => {
    const testCases = config.test_cases || [];
    
    return (
      <div className="space-y-6">
        {/* 测试用例配置 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                测试用例 *
              </label>
              <p className="text-xs text-gray-500 mt-1">
                🚀 <strong>智能格式支持</strong>：数组、对象、字符串、数字等多种输入输出格式
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const newTestCases = [...testCases, {
                  input: [],
                  expected: [],
                  description: `测试用例 ${testCases.length + 1}`
                }];
                updateConfig('test_cases', newTestCases);
              }}
              className="flex items-center px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Plus className="h-3 w-3 mr-1" />
              添加用例
            </button>
          </div>
          
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {testCases.map((testCase: any, index: number) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">用例 {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newTestCases = testCases.filter((_: any, i: number) => i !== index);
                      updateConfig('test_cases', newTestCases);
                    }}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">描述</label>
                    <input
                      type="text"
                      value={testCase.description || ''}
                      onChange={(e) => {
                        const newTestCases = [...testCases];
                        newTestCases[index].description = e.target.value;
                        updateConfig('test_cases', newTestCases);
                      }}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                      placeholder="测试用例描述"
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-gray-600">输入数据 (支持多种格式)</label>
                      <div className="text-xs text-blue-600 hover:text-blue-800 cursor-help" title="支持的格式示例">
                        ❓ 格式说明
                      </div>
                    </div>
                    <textarea
                      value={JSON.stringify(testCase.input || [])}
                      onChange={(e) => {
                        try {
                          const input = JSON.parse(e.target.value);
                          const newTestCases = [...testCases];
                          newTestCases[index].input = input;
                          updateConfig('test_cases', newTestCases);
                        } catch {
                          // 忽略JSON解析错误，用户可能正在输入
                        }
                      }}
                      rows={2}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded font-mono"
                      placeholder='数组: [3,1,4] | 对象: {"s":"ab","p":".*"} | 字符串: "hello" | 数字: 42'
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      <details className="cursor-pointer">
                        <summary className="hover:text-gray-700">💡 支持格式示例（点击展开）</summary>
                        <div className="mt-2 p-2 bg-gray-50 rounded border text-xs font-mono space-y-1">
                          <div><strong>数组排序:</strong> [3,1,4,1,5,9,2,6]</div>
                          <div><strong>正则匹配:</strong> {"{"}"s": "ab", "p": ".*"{"}"}</div>
                          <div><strong>两数之和:</strong> {"{"}"nums": [2,7,11,15], "target": 9{"}"}</div>
                          <div><strong>字符串处理:</strong> "hello world"</div>
                          <div><strong>二分查找:</strong> {"{"}"nums": [1,3,5,7], "target": 5{"}"}</div>
                          <div><strong>链表节点:</strong> [1,2,3,4,5]</div>
                          <div><strong>多参数:</strong> ["ab", ".*"]</div>
                          <div><strong>单数值:</strong> 42</div>
                        </div>
                      </details>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-gray-600">期望输出 (支持多种格式)</label>
                      <div className="text-xs text-green-600 hover:text-green-800 cursor-help" title="与输入格式对应">
                        ✓ 输出格式
                      </div>
                    </div>
                    <textarea
                      value={JSON.stringify(testCase.expected || [])}
                      onChange={(e) => {
                        try {
                          const expected = JSON.parse(e.target.value);
                          const newTestCases = [...testCases];
                          newTestCases[index].expected = expected;
                          updateConfig('test_cases', newTestCases);
                        } catch {
                          // 忽略JSON解析错误
                        }
                      }}
                      rows={2}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded font-mono"
                      placeholder='数组: [1,1,3,4,5] | 布尔值: true | 字符串: "result" | 数字: 100'
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      <details className="cursor-pointer">
                        <summary className="hover:text-gray-700">💡 输出格式示例（点击展开）</summary>
                        <div className="mt-2 p-2 bg-green-50 rounded border text-xs font-mono space-y-1">
                          <div><strong>排序结果:</strong> [1,1,2,3,4,5,6,9]</div>
                          <div><strong>匹配结果:</strong> true</div>
                          <div><strong>两数之和:</strong> [0,1]</div>
                          <div><strong>字符串结果:</strong> "Hello World"</div>
                          <div><strong>查找索引:</strong> 2</div>
                          <div><strong>链表结果:</strong> [5,4,3,2,1]</div>
                          <div><strong>布尔值:</strong> false</div>
                          <div><strong>复杂结构:</strong> {"{"}"found": true, "index": 3{"}"}</div>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 评分权重配置 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              正确性权重
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={config.correctness_weight || 0.7}
              onChange={(e) => updateConfig('correctness_weight', parseFloat(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              性能权重
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={config.performance_weight || 0.3}
              onChange={(e) => updateConfig('performance_weight', parseFloat(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        {/* 超时设置 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            单个测试超时 (毫秒)
          </label>
          <input
            type="number"
            min="100"
            max="30000"
            value={config.timeout_per_test || 1000}
            onChange={(e) => updateConfig('timeout_per_test', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>
    );
  };

  // JSON格式验证配置
  const renderFormatConfig = () => {
    const requiredFields = config.required_fields || [];
    const fieldTypes = config.field_types || {};
    const optionalFields = config.optional_fields || [];

    return (
      <div className="space-y-6">
        {/* 必需字段 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            必需字段 *
          </label>
          <div className="space-y-2">
            {requiredFields.map((field: string, index: number) => (
              <div key={index} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={field}
                  onChange={(e) => {
                    const newFields = [...requiredFields];
                    newFields[index] = e.target.value;
                    updateConfig('required_fields', newFields);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="字段名"
                />
                <select
                  value={fieldTypes[field] || 'string'}
                  onChange={(e) => {
                    const newTypes = { ...fieldTypes };
                    newTypes[field] = e.target.value;
                    updateConfig('field_types', newTypes);
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="string">字符串</option>
                  <option value="number">数字</option>
                  <option value="integer">整数</option>
                  <option value="boolean">布尔值</option>
                  <option value="array">数组</option>
                  <option value="object">对象</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const newFields = requiredFields.filter((_: string, i: number) => i !== index);
                    const newTypes = { ...fieldTypes };
                    delete newTypes[field];
                    updateConfig('required_fields', newFields);
                    updateConfig('field_types', newTypes);
                  }}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                updateConfig('required_fields', [...requiredFields, '']);
              }}
              className="flex items-center px-3 py-2 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50"
            >
              <Plus className="h-4 w-4 mr-1" />
              添加必需字段
            </button>
          </div>
        </div>

        {/* 可选字段 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            可选字段 (加分项)
          </label>
          <div className="space-y-2">
            {optionalFields.map((field: string, index: number) => (
              <div key={index} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={field}
                  onChange={(e) => {
                    const newFields = [...optionalFields];
                    newFields[index] = e.target.value;
                    updateConfig('optional_fields', newFields);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="字段名"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newFields = optionalFields.filter((_: string, i: number) => i !== index);
                    updateConfig('optional_fields', newFields);
                  }}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                updateConfig('optional_fields', [...optionalFields, '']);
              }}
              className="flex items-center px-3 py-2 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50"
            >
              <Plus className="h-4 w-4 mr-1" />
              添加可选字段
            </button>
          </div>
        </div>

        {/* 最高分数 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            最高分数
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={config.max_score || 100}
            onChange={(e) => updateConfig('max_score', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>
    );
  };

  // 性能测试配置
  const renderPerformanceConfig = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            小数据集大小
          </label>
          <input
            type="number"
            min="10"
            max="1000"
            value={config.small_dataset_size || 100}
            onChange={(e) => updateConfig('small_dataset_size', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            大数据集大小
          </label>
          <input
            type="number"
            min="1000"
            max="100000"
            value={config.large_dataset_size || 10000}
            onChange={(e) => updateConfig('large_dataset_size', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          时间限制 (毫秒)
        </label>
        <input
          type="number"
          min="10"
          max="5000"
          value={config.time_limit_ms || 100}
          onChange={(e) => updateConfig('time_limit_ms', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
    </div>
  );

  // 代码质量配置
  const renderQualityConfig = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={config.check_naming !== false}
              onChange={(e) => updateConfig('check_naming', e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">检查命名规范</span>
          </label>
        </div>
        
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={config.check_comments !== false}
              onChange={(e) => updateConfig('check_comments', e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">检查注释完整性</span>
          </label>
        </div>
        
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={config.check_complexity !== false}
              onChange={(e) => updateConfig('check_complexity', e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">检查代码复杂度</span>
          </label>
        </div>
        
        <div>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={config.check_structure !== false}
              onChange={(e) => updateConfig('check_structure', e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm text-gray-700">检查代码结构</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          最大行长度
        </label>
        <input
          type="number"
          min="60"
          max="120"
          value={config.max_line_length || 88}
          onChange={(e) => updateConfig('max_line_length', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
    </div>
  );

  // 通用配置（如果不匹配特定类别）
  const renderGenericConfig = () => (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div className="flex items-center">
        <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
        <div>
          <h4 className="text-yellow-800 font-medium">配置界面开发中</h4>
          <p className="text-yellow-700 text-sm mt-1">
            该模板类别的配置界面正在开发中，请使用示例配置或手动编辑JSON。
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 头部操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-lg font-medium text-gray-900">模板配置</h4>
          <p className="text-sm text-gray-600">{template.name}</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={loadExampleConfig}
            className="flex items-center px-3 py-2 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50"
          >
            <Copy className="h-4 w-4 mr-1" />
            加载示例
          </button>
        </div>
      </div>

      {/* 验证错误 */}
      {validationErrors.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2 mt-0.5" />
            <div>
              <h4 className="text-red-800 font-medium">配置错误</h4>
              <ul className="text-red-700 text-sm mt-1 list-disc list-inside">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 配置表单 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        {renderConfigForm()}
      </div>

      {/* 配置提示 */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
          <div className="text-blue-800 text-sm">
            <h4 className="font-medium">配置说明</h4>
            <p className="mt-1">
              配置完成后，系统将根据您的设置自动生成相应的评分代码。
              您可以随时预览生成的代码或返回修改配置。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}