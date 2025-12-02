'use client';

import React, { useState, useEffect } from 'react';
import { 
  Code2, 
  Zap, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Settings,
  Eye,
  ChevronDown,
  ChevronUp,
  Play
} from 'lucide-react';
import type { 
  CodeEvaluationTemplate, 
  TemplateCategory
} from '@/types/code-templates';
import { TEMPLATE_CATEGORIES } from '@/types/code-templates';

interface CodeTemplateSelectorProps {
  selectedTemplateId?: string;
  language: 'python' | 'javascript' | 'typescript' | 'cpp' | 'java' | 'go';
  onTemplateSelect: (template: CodeEvaluationTemplate | null) => void;
  onConfigChange: (config: any) => void;
  templateConfig?: any;
  className?: string;
}

function CodeTemplateSelector({
  selectedTemplateId,
  language,
  onTemplateSelect,
  onConfigChange,
  templateConfig,
  className = ''
}: CodeTemplateSelectorProps) {
  const [templates, setTemplates] = useState<CodeEvaluationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [previewCode, setPreviewCode] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // 加载可用模板
  useEffect(() => {
    loadTemplates();
  }, [language]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/code-templates?language=${language}&limit=50`);
      
      if (!response.ok) {
        throw new Error('加载模板失败');
      }

      const data = await response.json();
      setTemplates(data.templates || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载模板失败');
    } finally {
      setLoading(false);
    }
  };

  // 根据类别分组模板
  const templatesByCategory = templates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, CodeEvaluationTemplate[]>);

  // 获取类别信息
  const getCategoryInfo = (categoryId: string): TemplateCategory => {
    return TEMPLATE_CATEGORIES.find(cat => cat.id === categoryId) || {
      id: categoryId,
      name: categoryId,
      description: '',
      icon: '📋',
      examples: []
    };
  };

  // 选择模板
  const handleTemplateSelect = (template: CodeEvaluationTemplate) => {
    onTemplateSelect(template);
    setPreviewCode(''); // 清空预览代码
    
    // 应用示例配置
    if (template.example_config) {
      onConfigChange(template.example_config);
    }
    
    // 延迟设置展开状态，避免状态冲突导致模态框闪退
    setTimeout(() => {
      setExpandedTemplate(template.id);
    }, 50);
  };

  // 切换模板展开状态
  const toggleTemplateExpansion = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const isExpanded = expandedTemplate === templateId;
    setExpandedTemplate(isExpanded ? null : templateId);
  };

  // 生成代码预览
  const generateCodePreview = async () => {
    if (!selectedTemplateId || !templateConfig) return;

    try {
      console.log('🔍 代码预览请求:', { selectedTemplateId, templateConfig });
      
      const response = await fetch('/api/code-templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplateId,
          user_config: templateConfig
        })
      });

      console.log('📡 API响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API请求失败:', errorText);
        setValidationErrors([`API请求失败 (${response.status}): ${errorText}`]);
        return;
      }

      const result = await response.json();
      console.log('📄 API响应数据:', result);
      
      if (result.validation_errors) {
        setValidationErrors(result.validation_errors);
        setPreviewCode('');
      } else {
        setValidationErrors([]);
        setPreviewCode(result.generated_code || '');
      }
    } catch (error) {
      console.error('🚨 代码预览异常:', error);
      setValidationErrors([`预览生成失败: ${error instanceof Error ? error.message : '未知错误'}`]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">加载模板中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
          <div>
            <h3 className="text-red-800 font-medium">加载失败</h3>
            <p className="text-red-700 text-sm mt-1">{error}</p>
            <button
              onClick={loadTemplates}
              className="text-red-700 text-sm underline mt-2"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <Code2 className="h-5 w-5 mr-2 text-blue-600" />
          选择评分模板
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          选择适合的模板快速配置评分逻辑，支持 {language} 语言
        </p>
      </div>

      {/* 模板列表 */}
      <div className="p-4 space-y-4">
        {Object.entries(templatesByCategory).map(([categoryId, categoryTemplates]) => {
          const categoryInfo = getCategoryInfo(categoryId);
          
          return (
            <div key={categoryId} className="border border-gray-200 rounded-lg">
              {/* 类别标题 */}
              <div className="px-4 py-3 bg-gray-50 rounded-t-lg">
                <div className="flex items-center">
                  <span className="text-lg mr-2">{categoryInfo.icon}</span>
                  <div>
                    <h4 className="font-medium text-gray-900">{categoryInfo.name}</h4>
                    <p className="text-sm text-gray-600">{categoryInfo.description}</p>
                  </div>
                </div>
              </div>

              {/* 模板卡片 */}
              <div className="p-3 space-y-3">
                {categoryTemplates.map((template) => {
                  const isSelected = selectedTemplateId === template.id;
                  const isExpanded = expandedTemplate === template.id;

                  return (
                    <div
                      key={template.id}
                      className={`border rounded-lg cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {/* 模板基本信息 */}
                      <div 
                        className="p-4 flex items-center justify-between"
                        onClick={() => handleTemplateSelect(template)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center">
                            <CheckCircle 
                              className={`h-5 w-5 mr-3 ${
                                isSelected ? 'text-blue-600' : 'text-gray-400'
                              }`} 
                            />
                            <div>
                              <h5 className="font-medium text-gray-900">{template.name}</h5>
                              <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                              <div className="flex items-center mt-2 space-x-2">
                                {template.tags.map(tag => (
                                  <span 
                                    key={tag}
                                    className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {isSelected && (
                          <button
                            onClick={(e) => toggleTemplateExpansion(e, template.id)}
                            className="ml-4 p-1 text-blue-600 hover:bg-blue-100 rounded"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* 扩展配置区域 */}
                      {isSelected && isExpanded && (
                        <div className="border-t border-blue-200 bg-white rounded-b-lg">
                          <div className="p-4 space-y-4">
                            {/* 配置表单会在这里渲染 */}
                            <div className="text-sm text-gray-600">
                              <strong>示例配置：</strong>
                              <pre className="mt-2 p-3 bg-gray-50 rounded-md overflow-x-auto text-xs">
                                {JSON.stringify(template.example_config, null, 2)}
                              </pre>
                            </div>

                            {/* 代码预览 */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">代码预览</span>
                                <button
                                  onClick={generateCodePreview}
                                  disabled={!templateConfig}
                                  className="flex items-center px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Play className="h-3 w-3 mr-1" />
                                  生成预览
                                </button>
                              </div>

                              {validationErrors.length > 0 && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded">
                                  <div className="text-sm text-red-800">
                                    <strong>配置错误：</strong>
                                    <ul className="mt-1 list-disc list-inside">
                                      {validationErrors.map((error, index) => (
                                        <li key={index}>{error}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              )}

                              {previewCode && (
                                <div className="relative">
                                  <pre className="p-3 bg-gray-900 text-gray-100 rounded-md text-xs overflow-x-auto max-h-64">
                                    {previewCode}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 空状态 */}
      {templates.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          <Code2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>暂无可用的 {language} 模板</p>
          <p className="text-sm mt-1">请选择其他编程语言或创建自定义代码</p>
        </div>
      )}
    </div>
  );
}

// 使用React.memo包装组件以避免不必要的重渲染
export default React.memo(CodeTemplateSelector);