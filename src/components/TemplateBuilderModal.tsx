'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Scale, Layers, AlertCircle, CheckCircle } from 'lucide-react';
import { 
  TemplateFormData, 
  TemplateMappingFormData, 
  TemplateBuilderResources,
  TemplateWithMappings,
  TemplateValidationResult
} from '@/types/template';

interface TemplateBuilderModalProps {
  template?: TemplateWithMappings | null;
  resources: TemplateBuilderResources;
  onSave: (data: TemplateFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export default function TemplateBuilderModal({
  template,
  resources,
  onSave,
  onCancel,
  loading = false
}: TemplateBuilderModalProps) {
  const [formData, setFormData] = useState<TemplateFormData>({
    name: template?.name || '',
    description: template?.description || '',
    status: (template?.status === 'archived' ? 'draft' : template?.status) || 'draft',
    mappings: template?.mappings?.map(m => ({
      dimension_id: m.dimension_id,
      evaluator_id: m.evaluator_id,
      weight: m.weight,
      config: m.config
    })) || []
  });

  const [validation, setValidation] = useState<TemplateValidationResult>({
    valid: false,
    errors: [],
    warnings: []
  });

  // 验证表单数据
  const validateForm = () => {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // 验证基本信息
    if (!formData.name.trim()) {
      errors.push({ field: 'name', message: '模板名称不能为空' });
    }

    // 验证映射数据
    if (formData.mappings.length === 0) {
      errors.push({ field: 'mappings', message: '模板必须包含至少一个维度-评分器映射' });
    }

    // 检查重复的维度-评分器组合
    const combinations = new Set();
    for (let i = 0; i < formData.mappings.length; i++) {
      const mapping = formData.mappings[i];
      const key = `${mapping.dimension_id}-${mapping.evaluator_id}`;
      
      if (combinations.has(key)) {
        errors.push({ 
          field: `mappings.${i}`, 
          message: '存在重复的维度-评分器组合' 
        });
      }
      combinations.add(key);

      // 验证权重
      if (mapping.weight <= 0 || mapping.weight > 1) {
        errors.push({ 
          field: `mappings.${i}.weight`, 
          message: '权重必须在0-1之间' 
        });
      }
    }

    // 验证权重总和
    const totalWeight = formData.mappings.reduce((sum, mapping) => sum + mapping.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      errors.push({ 
        field: 'mappings', 
        message: `权重总和必须等于1.0，当前为${totalWeight.toFixed(3)}` 
      });
    } else if (Math.abs(totalWeight - 1.0) > 0.001) {
      warnings.push({ 
        field: 'mappings', 
        message: `权重总和接近但不完全等于1.0：${totalWeight.toFixed(3)}` 
      });
    }

    // 检查是否所有维度都有对应的评分器
    const usedDimensions = new Set(formData.mappings.map(m => m.dimension_id));
    if (usedDimensions.size < formData.mappings.length) {
      warnings.push({ 
        field: 'mappings', 
        message: '部分维度被多次使用，可能会影响评测结果' 
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

  // 添加映射
  const addMapping = () => {
    const availableDimension = resources.dimensions.find(d => 
      !formData.mappings.some(m => m.dimension_id === d.id)
    );
    
    const availableEvaluator = resources.evaluators.find(e => 
      !formData.mappings.some(m => m.evaluator_id === e.id)
    );

    const newMapping: TemplateMappingFormData = {
      dimension_id: availableDimension?.id || '',
      evaluator_id: availableEvaluator?.id || '',
      weight: 0.1
    };

    setFormData(prev => ({
      ...prev,
      mappings: [...prev.mappings, newMapping]
    }));
  };

  // 删除映射
  const removeMapping = (index: number) => {
    setFormData(prev => ({
      ...prev,
      mappings: prev.mappings.filter((_, i) => i !== index)
    }));
  };

  // 更新映射
  const updateMapping = (index: number, field: keyof TemplateMappingFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      mappings: prev.mappings.map((mapping, i) => 
        i === index ? { ...mapping, [field]: value } : mapping
      )
    }));
  };

  // 自动平衡权重
  const balanceWeights = () => {
    if (formData.mappings.length === 0) return;
    
    const weight = 1.0 / formData.mappings.length;
    setFormData(prev => ({
      ...prev,
      mappings: prev.mappings.map(mapping => ({
        ...mapping,
        weight: Math.round(weight * 1000) / 1000
      }))
    }));
  };

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationResult = validateForm();
    if (!validationResult.valid) {
      return;
    }

    try {
      await onSave(formData);
    } catch (error) {
      // 错误已在父组件处理
    }
  };

  // 实时验证
  useEffect(() => {
    if (formData.name.trim() || formData.mappings.length > 0) {
      validateForm();
    }
  }, [formData]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold">
            {template ? '编辑模板' : '创建模板'}
          </h3>
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  状态
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="draft">草稿</option>
                  <option value="active">活跃</option>
                  <option value="archived">已归档</option>
                </select>
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
          </div>

          {/* 维度-评分器映射 */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium text-gray-900">维度-评分器映射</h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={balanceWeights}
                  className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-md hover:bg-green-200"
                  disabled={formData.mappings.length === 0}
                >
                  <Scale className="w-4 h-4 inline mr-1" />
                  平衡权重
                </button>
                <button
                  type="button"
                  onClick={addMapping}
                  className="bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  添加映射
                </button>
              </div>
            </div>

            {formData.mappings.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Layers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <div className="text-gray-500 mb-2">暂无映射配置</div>
                <button
                  type="button"
                  onClick={addMapping}
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
                          onChange={(e) => updateMapping(index, 'dimension_id', e.target.value)}
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
                          onChange={(e) => updateMapping(index, 'evaluator_id', e.target.value)}
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
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          权重 *
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            value={mapping.weight}
                            onChange={(e) => updateMapping(index, 'weight', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                            required
                          />
                          <span className="text-xs text-gray-500">
                            {(mapping.weight * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removeMapping(index)}
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

            {/* 权重总和显示 */}
            {formData.mappings.length > 0 && (
              <div className="bg-blue-50 p-3 rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-800">权重总和:</span>
                  <span className={`text-sm font-medium ${
                    Math.abs(formData.mappings.reduce((sum, m) => sum + m.weight, 0) - 1.0) <= 0.01
                      ? 'text-green-700'
                      : 'text-red-700'
                  }`}>
                    {formData.mappings.reduce((sum, m) => sum + m.weight, 0).toFixed(3)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 验证结果 */}
          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <div className="space-y-2">
              {validation.errors.map((error, index) => (
                <div key={index} className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error.message}</span>
                </div>
              ))}
              {validation.warnings.map((warning, index) => (
                <div key={index} className="flex items-center gap-2 text-yellow-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{warning.message}</span>
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
                '保存中...'
              ) : (
                <>
                  {validation.valid && <CheckCircle className="w-4 h-4" />}
                  {template ? '更新模板' : '创建模板'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}