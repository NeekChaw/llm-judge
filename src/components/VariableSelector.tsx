'use client';

import React, { useState } from 'react';
import { Tag, Info, Code2, Database, Settings, FileText, Hash } from 'lucide-react';
import { getVariableSelectorData, VariableDefinition } from '@/lib/evaluator-variables';

interface VariableSelectorProps {
  onVariableSelect: (variable: string) => void;
  evaluatorType?: 'PROMPT' | 'REGEX' | 'CODE' | 'HUMAN';
  className?: string;
}

// 获取系统变量数据
const variableSelectorData = getVariableSelectorData();

export default function VariableSelector({ 
  onVariableSelect, 
  evaluatorType = 'PROMPT',
  className = '' 
}: VariableSelectorProps) {
  const [selectedVariable, setSelectedVariable] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['basic']));

  const handleCategoryToggle = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  // 根据评分器类型过滤可用变量类别
  // 注意：PROMPT类型评估器在启用混合评估（代码执行）时也可以使用代码变量
  const availableCategories = variableSelectorData.categories;

  const handleVariableClick = (variable: VariableDefinition) => {
    setSelectedVariable(variable.name);
    onVariableSelect(`{{${variable.name}}}`);
    
    // 高亮效果延迟清除
    setTimeout(() => {
      setSelectedVariable(null);
    }, 1000);
  };

  const getCategoryIcon = (categoryId: string) => {
    switch (categoryId) {
      case 'basic': return Tag;
      case 'code': return Code2;
      case 'metadata': return Database;
      case 'context': return Settings;
      case 'advanced': return Hash;
      default: return FileText;
    }
  };

  const getCategoryColor = (categoryId: string) => {
    switch (categoryId) {
      case 'basic': return 'text-blue-600 bg-blue-50';
      case 'code': return 'text-green-600 bg-green-50';
      case 'metadata': return 'text-purple-600 bg-purple-50';
      case 'context': return 'text-orange-600 bg-orange-50';
      case 'advanced': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getVariableHighlight = (category: string, isSelected: boolean) => {
    if (isSelected) {
      switch (category) {
        case 'basic': return 'bg-blue-100 border-blue-300 text-blue-800';
        case 'code': return 'bg-green-100 border-green-300 text-green-800';
        case 'metadata': return 'bg-purple-100 border-purple-300 text-purple-800';
        case 'context': return 'bg-orange-100 border-orange-300 text-orange-800';
        case 'advanced': return 'bg-red-100 border-red-300 text-red-800';
        default: return 'bg-gray-100 border-gray-300 text-gray-800';
      }
    }
    return 'border-gray-200 hover:border-gray-300 hover:bg-gray-50';
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Tag className="h-5 w-5 mr-2 text-blue-600" />
          系统变量
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          点击变量名插入到模板中
        </p>
      </div>

      {/* 变量列表 */}
      <div className="p-4">
        <div className="space-y-4">
          {availableCategories.map((category) => {
            const CategoryIcon = getCategoryIcon(category.id);
            const categoryColor = getCategoryColor(category.id);
            const isExpanded = expandedCategories.has(category.id);

            return (
              <div key={category.id} className="border border-gray-200 rounded-lg">
                {/* 类别标题 */}
                <button
                  type="button"
                  className={`w-full px-4 py-3 flex items-center justify-between text-left rounded-t-lg transition-colors ${categoryColor} hover:opacity-80`}
                  onClick={() => handleCategoryToggle(category.id)}
                >
                  <div className="flex items-center">
                    <CategoryIcon className="h-4 w-4 mr-2" />
                    <div>
                      <div className="font-medium text-sm">{category.name}</div>
                      <div className="text-xs opacity-80">{category.description}</div>
                    </div>
                  </div>
                  <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* 变量列表 */}
                {isExpanded && (
                  <div className="p-3 space-y-2 bg-white rounded-b-lg">
                    {category.variables.map((variable) => {
                      const isSelected = selectedVariable === variable.name;
                      const highlightClass = getVariableHighlight(category.id, isSelected);

                      return (
                        <button
                          type="button"
                          key={variable.name}
                          className={`w-full p-2 border rounded text-left cursor-pointer transition-all duration-200 ${highlightClass}`}
                          onClick={() => handleVariableClick(variable)}
                        >
                          <div className="flex items-start">
                            <div className="flex-1 min-w-0">
                              {/* 变量名 */}
                              <div className="font-mono text-xs font-medium text-gray-900 mb-1">
                                {'{{' + variable.name + '}}'}
                              </div>
                              
                              {/* 描述 */}
                              <div className="text-xs text-gray-600 mb-1">
                                {variable.description}
                              </div>
                              
                              {/* 示例 */}
                              <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 font-mono truncate">
                                {variable.example.length > 40 
                                  ? variable.example.substring(0, 40) + '...' 
                                  : variable.example}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 混合评估提示 */}
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start">
            <Info className="h-4 w-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-green-800">
              <div className="font-medium">🚀 混合评估变量</div>
              <div className="mt-1">
                代码执行变量适用于启用了<strong>混合评估</strong>功能的PROMPT评分器。
                启用代码执行后，系统将自动生成27个动态变量供评估使用。
              </div>
            </div>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm text-blue-800">
            <div className="font-medium mb-2">使用说明</div>
            <div className="space-y-2 text-blue-700">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full mr-2 flex-shrink-0"></div>
                <div>变量使用双花括号包围，如 <code className="bg-blue-100 px-1 rounded text-xs">{'{{test_case_input}}'}</code></div>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full mr-2 flex-shrink-0"></div>
                <div>支持对象属性访问，如 <code className="bg-blue-100 px-1 rounded text-xs">{'{{test_case_metadata.category}}'}</code></div>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full mr-2 flex-shrink-0"></div>
                <div>变量会在评分器执行时自动替换为实际数据</div>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full mr-2 flex-shrink-0"></div>
                <div>共计 <span className="font-medium">{variableSelectorData.allVariables.length}</span> 个可用变量</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}