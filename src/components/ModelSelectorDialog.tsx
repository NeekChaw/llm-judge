'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, DollarSign, Clock, AlertCircle } from 'lucide-react';

interface Model {
  id: string;
  name: string;
  logical_name?: string;
  provider: string;
  vendor_name?: string;
  role: 'evaluator' | 'evaluatable';
  tags: string[];
  input_cost_per_1k_tokens?: number;
  output_cost_per_1k_tokens?: number;
  cost_currency?: 'USD' | 'CNY';
  success_rate?: number;
  concurrent_limit?: number;
  max_context_window?: number;
}

interface ModelSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModelSelect: (modelId: string, modelInfo: Model) => void;
  currentModelId?: string;
  title?: string;
  description?: string;
}

export function ModelSelectorDialog({
  open,
  onOpenChange,
  onModelSelect,
  currentModelId,
  title = "选择评分模型",
  description = "选择模型来重新评分此测试用例（可以选择当前模型或其他模型）"
}: ModelSelectorDialogProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [filterRole, setFilterRole] = useState<'all' | 'evaluator' | 'evaluatable'>('evaluator');
  const [filterTag, setFilterTag] = useState<string>('all');

  // 加载可用模型
  const loadModels = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/models?limit=100&include_inactive=true`);
      const data = await response.json();
      
      if (data.models) {
        // 显示所有可用于评分的模型（evaluator 和 evaluatable），包括当前模型
        const filteredModels = data.models.filter((model: Model) =>
          (model.role === 'evaluator' || model.role === 'evaluatable')
        );
        setModels(filteredModels);
      }
    } catch (error) {
      console.error('加载模型列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadModels();
      // 默认选中当前模型
      if (currentModelId) {
        setSelectedModelId(currentModelId);
      }
    } else {
      // 对话框关闭时重置状态
      setSelectedModelId('');
    }
  }, [open, filterRole, currentModelId]);

  // 获取所有可用标签
  const availableTags = Array.from(new Set(
    models.flatMap(model => model.tags || [])
  )).filter(tag => tag);

  // 过滤模型
  const filteredModels = models.filter(model => {
    if (filterTag !== 'all' && !model.tags?.includes(filterTag)) {
      return false;
    }
    return true;
  });

  // 按逻辑名分组
  const groupedModels = filteredModels.reduce((acc, model) => {
    const key = model.logical_name || model.name;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(model);
    return acc;
  }, {} as Record<string, Model[]>);

  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    const selectedModel = models.find(m => m.id === selectedModelId);
    if (selectedModel) {
      setIsProcessing(true);
      
      try {
        // 显示确认提示
        const selectedLogicalName = selectedModel.logical_name || selectedModel.name;
        
        // 🆕 调用重新评分 - 使用仅重新评分模式
        await onModelSelect(selectedModelId, selectedModel);
        
        // 显示成功消息
        alert(`✅ 重新评分已开始！\n\n选择的模型: ${selectedLogicalName}\n\n页面将在几秒后自动刷新显示新的评分结果。`);
        
        // 关闭对话框并重置状态
        onOpenChange(false);
        setSelectedModelId('');

        // 延迟刷新页面以显示新结果
        setTimeout(() => {
          window.location.reload();
        }, 2000);
        
      } catch (error) {
        alert('❌ 重新评分失败，请稍后重试');
        console.error('重新评分失败:', error);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const formatCost = (inputCost: number = 0, outputCost: number = 0, currency: string = 'USD') => {
    const symbol = currency === 'CNY' ? '¥' : '$';
    return `${symbol}${inputCost.toFixed(4)}/${symbol}${outputCost.toFixed(4)}`;
  };

  const getTagColor = (tag: string) => {
    const colors = {
      '推理': 'bg-purple-100 text-purple-800',
      '非推理': 'bg-blue-100 text-blue-800', 
      '多模态': 'bg-green-100 text-green-800',
      'default': 'bg-gray-100 text-gray-800'
    };
    return colors[tag as keyof typeof colors] || colors.default;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* 过滤器 - 固定在顶部 */}
        <div className="flex gap-4 pb-4 border-b flex-shrink-0">
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-700 mb-1 block">标签过滤</label>
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger>
                <SelectValue placeholder="选择标签" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有模型</SelectItem>
                {availableTags.map(tag => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 模型列表 - 可滚动区域 */}
        <div className="flex-1 overflow-y-auto min-h-0 max-h-[400px] space-y-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">加载模型列表...</span>
            </div>
          ) : (
            <>
              {Object.entries(groupedModels).map(([logicalName, modelGroup]) => (
                <div 
                  key={logicalName}
                  className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 ${
                    selectedModelId === modelGroup[0].id 
                      ? 'border-blue-500 bg-blue-50 shadow-sm' 
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedModelId(modelGroup[0].id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* 选择指示器 */}
                      <div className={`w-4 h-4 rounded-full border-2 transition-colors ${
                        selectedModelId === modelGroup[0].id
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}>
                        {selectedModelId === modelGroup[0].id && (
                          <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5" />
                        )}
                      </div>
                      
                      {/* 模型名称 */}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={`font-medium ${
                            selectedModelId === modelGroup[0].id ? 'text-blue-900' : 'text-gray-900'
                          }`}>
                            {logicalName}
                          </h3>
                          {/* 当前模型指示器 */}
                          {modelGroup[0].id === currentModelId && (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                              当前模型
                            </Badge>
                          )}
                        </div>

                        {/* 标签 */}
                        <div className="flex gap-1 mt-1">
                          {modelGroup[0]?.tags?.map(tag => (
                            <Badge key={tag} variant="secondary" className={`text-xs ${getTagColor(tag)}`}>
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {/* 右侧信息 */}
                    <div className="text-right">
                      {modelGroup[0].input_cost_per_1k_tokens && modelGroup[0].output_cost_per_1k_tokens && (
                        <div className="text-sm font-medium text-gray-700">
                          {formatCost(
                            modelGroup[0].input_cost_per_1k_tokens,
                            modelGroup[0].output_cost_per_1k_tokens,
                            modelGroup[0].cost_currency
                          )}
                        </div>
                      )}
                      
                      {modelGroup[0].success_rate && (
                        <div className="text-xs text-gray-500 mt-1">
                          成功率 {(modelGroup[0].success_rate * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredModels.length === 0 && !loading && (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-6 w-6 mx-auto mb-2" />
                  <p>没有找到可用的评分模型</p>
                  <p className="text-sm">尝试调整过滤条件或联系管理员添加模型</p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 mt-4 border-t pt-4">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            取消
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!selectedModelId || isProcessing}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                正在提交...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                确定重新评分
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}