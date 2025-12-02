'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Layers, AlertCircle, CheckCircle, Settings, Target, Users, Filter, Check } from 'lucide-react';
import type { 
  CreateTemplateRequest,
  TemplateType,
  TemplateValidation,
  CustomTemplateMapping,
  UnifiedTemplateMapping
} from '@/lib/template-types';

interface DualTemplateBuilderProps {
  onSave: (data: CreateTemplateRequest) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  initialData?: any; // 用于编辑模式的初始数据
  resources: {
    dimensions: Array<{ id: string; name: string; description?: string }>;
    evaluators: Array<{ id: string; name: string; type: string }>;
    testCases: Array<{ id: string; input: string; category?: string }>;
  };
}

export default function DualTemplateBuilder({
  onSave,
  onCancel,
  loading = false,
  initialData,
  resources
}: DualTemplateBuilderProps) {
  const [templateType, setTemplateType] = useState<TemplateType>(
    initialData?.template_type || 'unified'
  );
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    status: initialData?.status || 'draft', // 添加状态字段
    mappings: initialData?.mappings || [] as any[],
    custom_mappings: initialData?.custom_mappings || [] as any[]
  });
  
  const [validation, setValidation] = useState<TemplateValidation>({
    valid: false,
    errors: [],
    warnings: []
  });

  // 验证表单
  const validateForm = (): TemplateValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!formData.name.trim()) {
      errors.push('模板名称不能为空');
    }

    if (templateType === 'unified') {
      if (formData.mappings.length === 0) {
        errors.push('统一模板必须包含至少一个维度-评分器映射');
      }
      
    } else {
      if (formData.custom_mappings.length === 0) {
        errors.push('自定义模板必须包含至少一个维度配置');
      }
      
      // 验证每个自定义映射
      formData.custom_mappings.forEach((mapping, index) => {
        if (!mapping.dimension_id) {
          errors.push(`第${index + 1}个维度配置缺少维度选择`);
        }
        if (!mapping.evaluator_id) {
          errors.push(`第${index + 1}个维度配置缺少评分器选择`);
        }
        if (!mapping.test_case_ids || mapping.test_case_ids.length === 0) {
          errors.push(`第${index + 1}个维度配置必须选择测试用例`);
        }
      });
    }

    const result = {
      valid: errors.length === 0,
      errors,
      warnings
    };
    
    setValidation(result);
    return result;
  };

  // 添加统一模板映射
  const addUnifiedMapping = () => {
    const availableDimension = resources.dimensions.find(d => 
      !formData.mappings.some(m => m.dimension_id === d.id)
    );
    
    const availableEvaluator = resources.evaluators.find(e => 
      !formData.mappings.some(m => m.evaluator_id === e.id)
    );

    const newMapping = {
      dimension_id: availableDimension?.id || '',
      evaluator_id: availableEvaluator?.id || ''
    };

    setFormData(prev => ({
      ...prev,
      mappings: [...prev.mappings, newMapping]
    }));
  };

  // 添加自定义模板映射
  const addCustomMapping = () => {
    const availableDimension = resources.dimensions.find(d => 
      !formData.custom_mappings.some(m => m.dimension_id === d.id)
    );
    
    const availableEvaluator = resources.evaluators.find(e => 
      !formData.custom_mappings.some(m => m.evaluator_id === e.id)
    );

    const newMapping = {
      dimension_id: availableDimension?.id || '',
      evaluator_id: availableEvaluator?.id || '',
      test_case_ids: [] as string[],
      system_prompt: ''
    };

    setFormData(prev => ({
      ...prev,
      custom_mappings: [...prev.custom_mappings, newMapping]
    }));
  };

  // 删除映射
  const removeMapping = (index: number, type: 'unified' | 'custom') => {
    if (type === 'unified') {
      setFormData(prev => ({
        ...prev,
        mappings: prev.mappings.filter((_, i) => i !== index)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        custom_mappings: prev.custom_mappings.filter((_, i) => i !== index)
      }));
    }
  };

  // 更新映射
  const updateMapping = (index: number, field: string, value: any, type: 'unified' | 'custom') => {
    if (type === 'unified') {
      setFormData(prev => ({
        ...prev,
        mappings: prev.mappings.map((mapping, i) => 
          i === index ? { ...mapping, [field]: value } : mapping
        )
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        custom_mappings: prev.custom_mappings.map((mapping, i) => 
          i === index ? { ...mapping, [field]: value } : mapping
        )
      }));
    }
  };


  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationResult = validateForm();
    if (!validationResult.valid) {
      return;
    }

    // 安全的类型构建，避免强制类型断言
    let request: CreateTemplateRequest;
    
    if (templateType === 'unified') {
      request = {
        name: formData.name,
        description: formData.description,
        status: formData.status,
        template_type: 'unified',
        mappings: formData.mappings
      };
    } else {
      request = {
        name: formData.name,
        description: formData.description,
        status: formData.status,
        template_type: 'custom',
        custom_mappings: formData.custom_mappings
      };
    }

    try {
      await onSave(request);
    } catch (error) {
      // 错误处理已在父组件处理
    }
  };

  // 切换模板类型时重置映射
  const handleTemplateTypeChange = (newType: TemplateType) => {
    setTemplateType(newType);
    setFormData(prev => ({
      ...prev,
      mappings: [],
      custom_mappings: []
    }));
  };

  // 实时验证
  useEffect(() => {
    if (formData.name.trim() || formData.mappings.length > 0 || formData.custom_mappings.length > 0) {
      validateForm();
    }
  }, [formData, templateType]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-6xl w-full max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold">创建评测模板</h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 基本信息 */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">基本信息</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模板名称 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="输入模板名称"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模板类型 *
                </label>
                <select
                  value={templateType}
                  onChange={(e) => handleTemplateTypeChange(e.target.value as TemplateType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="unified">统一模板</option>
                  <option value="custom">自定义模板</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  模板状态 *
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="draft">草稿 - 仅编辑，不可用于任务</option>
                  <option value="active">活跃 - 可用于创建任务</option>
                  <option value="inactive">非活跃 - 暂时禁用</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  只有"活跃"状态的模板可用于创建评测任务
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="输入模板描述（可选）"
              />
            </div>

            {/* 模板类型说明 */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-blue-600 mt-1">
                  {templateType === 'unified' ? <Layers className="w-5 h-5" /> : <Target className="w-5 h-5" />}
                </div>
                <div>
                  <h5 className="font-medium text-blue-900 mb-1">
                    {templateType === 'unified' ? '统一模板' : '自定义模板'}
                  </h5>
                  <p className="text-sm text-blue-800">
                    {templateType === 'unified' 
                      ? '所有测试用例都将使用相同的维度-评分器组合进行评测，适用于标准化评测场景。'
                      : '每个维度可以设置专属的测试用例集和角色，适用于需要针对性评测的复杂场景。'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 配置区域 */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium text-gray-900">
                {templateType === 'unified' ? '维度-评分器映射' : '自定义维度配置'}
              </h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={templateType === 'unified' ? addUnifiedMapping : addCustomMapping}
                  className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  添加{templateType === 'unified' ? '映射' : '维度'}
                </button>
              </div>
            </div>

            {templateType === 'unified' ? (
              // 统一模板映射界面
              <>
                {formData.mappings.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Layers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <div className="text-gray-500 mb-2">暂无映射配置</div>
                    <button
                      type="button"
                      onClick={addUnifiedMapping}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      添加第一个映射
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.mappings.map((mapping, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              维度 *
                            </label>
                            <select
                              value={mapping.dimension_id}
                              onChange={(e) => updateMapping(index, 'dimension_id', e.target.value, 'unified')}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                              required
                            >
                              <option value="">选择维度</option>
                              {resources.dimensions.map(dimension => (
                                <option key={dimension.id} value={dimension.id}>
                                  {dimension.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              评分器 *
                            </label>
                            <select
                              value={mapping.evaluator_id}
                              onChange={(e) => updateMapping(index, 'evaluator_id', e.target.value, 'unified')}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                              required
                            >
                              <option value="">选择评分器</option>
                              {resources.evaluators.map(evaluator => (
                                <option key={evaluator.id} value={evaluator.id}>
                                  {evaluator.name} ({evaluator.type})
                                </option>
                              ))}
                            </select>
                          </div>
                          
                          
                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => removeMapping(index, 'unified')}
                              className="w-full px-3 py-2 text-red-600 border border-red-300 rounded-md hover:bg-red-50 flex items-center justify-center gap-1"
                            >
                              <Trash2 className="w-4 h-4" />
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              // 自定义模板映射界面
              <>
                {formData.custom_mappings.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <div className="text-gray-500 mb-2">暂无维度配置</div>
                    <button
                      type="button"
                      onClick={addCustomMapping}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      添加第一个维度配置
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {formData.custom_mappings.map((mapping, index) => (
                      <div key={index} className="border rounded-lg p-6 bg-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              维度 *
                            </label>
                            <select
                              value={mapping.dimension_id}
                              onChange={(e) => updateMapping(index, 'dimension_id', e.target.value, 'custom')}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                              required
                            >
                              <option value="">选择维度</option>
                              {resources.dimensions.map(dimension => (
                                <option key={dimension.id} value={dimension.id}>
                                  {dimension.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              评分器 *
                            </label>
                            <select
                              value={mapping.evaluator_id}
                              onChange={(e) => updateMapping(index, 'evaluator_id', e.target.value, 'custom')}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                              required
                            >
                              <option value="">选择评分器</option>
                              {resources.evaluators.map(evaluator => (
                                <option key={evaluator.id} value={evaluator.id}>
                                  {evaluator.name} ({evaluator.type})
                                </option>
                              ))}
                            </select>
                          </div>
                          
                        </div>

                        {/* 测试用例选择 */}
                        <TestCaseSelectionWithCategories
                          testCases={resources.testCases}
                          selectedIds={mapping.test_case_ids || []}
                          onSelectionChange={(newIds) => updateMapping(index, 'test_case_ids', newIds, 'custom')}
                        />

                        {/* 角色设定 */}
                        <div className="mb-4">
                          <label className="block text-xs font-medium text-gray-500 mb-2">
                            <Users className="w-4 h-4 inline mr-1" />
                            角色设定 (可选)
                          </label>
                          <textarea
                            value={mapping.system_prompt || ''}
                            onChange={(e) => updateMapping(index, 'system_prompt', e.target.value, 'custom')}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                            placeholder="为该维度设置专门的角色，如：你是一个Python编程专家..."
                          />
                          <div className="text-xs text-gray-500 mt-1">
                            该角色仅影响模型回答阶段，不影响评分阶段
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeMapping(index, 'custom')}
                            className="px-3 py-1 text-red-600 border border-red-300 rounded-md hover:bg-red-50 flex items-center gap-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            删除维度配置
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

          </div>

          {/* 验证结果 */}
          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <div className="space-y-2">
              {validation.errors.map((error, index) => (
                <div key={index} className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              ))}
              {validation.warnings.map((warning, index) => (
                <div key={index} className="flex items-center gap-2 text-yellow-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* 提交按钮 */}
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
              disabled={loading || !validation.valid}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                '创建中...'
              ) : (
                <>
                  {validation.valid && <CheckCircle className="w-4 h-4" />}
                  创建模板
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 支持按类别选择的测试用例选择组件
interface TestCaseSelectionWithCategoriesProps {
  testCases: Array<{ id: string; input: string; category?: string; metadata?: any }>;
  selectedIds: string[];
  onSelectionChange: (newIds: string[]) => void;
}

function TestCaseSelectionWithCategories({ 
  testCases, 
  selectedIds, 
  onSelectionChange 
}: TestCaseSelectionWithCategoriesProps) {
  const [categoryFilter, setCategoryFilter] = useState('');
  
  // 提取所有可用的类别
  const availableCategories = Array.from(new Set(
    testCases.map(tc => tc.metadata?.category || tc.category || '未分类')
  )).sort();
  
  // 根据类别筛选测试用例
  const filteredTestCases = categoryFilter 
    ? testCases.filter(tc => {
        const testCaseCategory = tc.metadata?.category || tc.category || '未分类';
        return testCaseCategory === categoryFilter;
      })
    : testCases;
  
  // 按类别分组的测试用例
  const testCasesByCategory = testCases.reduce((acc, tc) => {
    const category = tc.metadata?.category || tc.category || '未分类';
    if (!acc[category]) acc[category] = [];
    acc[category].push(tc);
    return acc;
  }, {} as Record<string, typeof testCases>);
  
  // 处理单个测试用例选择
  const handleTestCaseToggle = (testCaseId: string) => {
    const newIds = selectedIds.includes(testCaseId)
      ? selectedIds.filter(id => id !== testCaseId)
      : [...selectedIds, testCaseId];
    onSelectionChange(newIds);
  };
  
  // 处理类别全选/取消全选
  const handleCategoryToggle = (category: string) => {
    const categoryTestCases = testCasesByCategory[category] || [];
    const categoryIds = categoryTestCases.map(tc => tc.id);
    const allSelected = categoryIds.every(id => selectedIds.includes(id));
    
    if (allSelected) {
      // 取消选择该类别的所有测试用例
      const newIds = selectedIds.filter(id => !categoryIds.includes(id));
      onSelectionChange(newIds);
    } else {
      // 选择该类别的所有测试用例
      const newIds = Array.from(new Set([...selectedIds, ...categoryIds]));
      onSelectionChange(newIds);
    }
  };
  
  // 获取类别的选择状态
  const getCategorySelectionStatus = (category: string) => {
    const categoryTestCases = testCasesByCategory[category] || [];
    const categoryIds = categoryTestCases.map(tc => tc.id);
    const selectedCount = categoryIds.filter(id => selectedIds.includes(id)).length;
    
    if (selectedCount === 0) return 'none';
    if (selectedCount === categoryIds.length) return 'all';
    return 'partial';
  };
  
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-gray-500 mb-2">
        <Target className="w-4 h-4 inline mr-1" />
        测试用例选择 * ({selectedIds.length} 个已选择)
      </label>
      
      {/* 类别筛选器 */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="">显示所有类别</option>
            {availableCategories.map(category => (
              <option key={category} value={category}>
                {category} ({testCasesByCategory[category]?.length || 0})
              </option>
            ))}
          </select>
        </div>
        
        {/* 类别快捷操作 */}
        {availableCategories.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">快速选择:</span>
            {availableCategories.map(category => {
              const status = getCategorySelectionStatus(category);
              const categoryCount = testCasesByCategory[category]?.length || 0;
              const selectedCount = testCasesByCategory[category]?.filter(tc => 
                selectedIds.includes(tc.id)
              ).length || 0;
              
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => handleCategoryToggle(category)}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                    status === 'all' 
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : status === 'partial'
                      ? 'bg-yellow-100 border-yellow-300 text-yellow-700'
                      : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={`${category}: ${selectedCount}/${categoryCount} 已选择`}
                >
                  {status === 'all' && <Check className="w-3 h-3 inline mr-1" />}
                  {category}
                  <span className="ml-1 text-xs opacity-75">
                    {status === 'none' ? categoryCount : `${selectedCount}/${categoryCount}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      
      {/* 测试用例列表 */}
      <div className="border border-gray-300 rounded-md max-h-48 overflow-y-auto">
        {filteredTestCases.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {categoryFilter ? `"${categoryFilter}" 类别下暂无测试用例` : '暂无测试用例'}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredTestCases.map((testCase) => {
              const isSelected = selectedIds.includes(testCase.id);
              const category = testCase.metadata?.category || testCase.category || '未分类';
              
              return (
                <label
                  key={testCase.id}
                  className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50 ${
                    isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleTestCaseToggle(testCase.id)}
                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 line-clamp-2">
                      {testCase.input}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                        {category}
                      </span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
      
      {/* 选择统计 */}
      {selectedIds.length > 0 && (
        <div className="mt-2 text-xs text-gray-600">
          已选择 {selectedIds.length} 个测试用例
          {categoryFilter && (
            <span className="ml-2">
              (当前类别: {filteredTestCases.filter(tc => selectedIds.includes(tc.id)).length} 个)
            </span>
          )}
        </div>
      )}
    </div>
  );
}