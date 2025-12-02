'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Settings, Plus, Edit, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react';

interface ModelProvider {
  id: string;
  name: string;
  provider: string;
  vendor_name: string;
  logical_name: string;
  input_cost_per_1k_tokens: number;
  output_cost_per_1k_tokens: number;
  cost_currency: string;
  provider_input_cost_per_1k_tokens?: number;
  provider_output_cost_per_1k_tokens?: number;
  provider_cost_currency?: string;
  cost_last_updated?: string;
}

interface LogicalModel {
  logical_name: string;
  providers: ModelProvider[];
}

interface ProviderCostConfig {
  provider_input_cost_per_1k_tokens?: number;
  provider_output_cost_per_1k_tokens?: number;
  provider_cost_currency?: 'USD' | 'CNY';
}

interface MultiProviderCostManagerProps {
  onUpdate?: () => void;
}

export default function MultiProviderCostManager({ onUpdate }: MultiProviderCostManagerProps) {
  const [logicalModels, setLogicalModels] = useState<LogicalModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<LogicalModel | null>(null);
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null);
  const [costConfig, setCostConfig] = useState<ProviderCostConfig>({});
  const [saving, setSaving] = useState(false);

  // 加载模型数据
  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();
      
      // 按logical_name分组
      const grouped = data.models.reduce((acc: Record<string, ModelProvider[]>, model: ModelProvider) => {
        const logicalName = model.logical_name || model.name;
        if (!acc[logicalName]) {
          acc[logicalName] = [];
        }
        acc[logicalName].push(model);
        return acc;
      }, {});

      // 只显示有多个提供商的模型
      const multiProviderModels = Object.entries(grouped)
        .filter(([_, providers]) => providers.length > 1)
        .map(([logical_name, providers]) => ({
          logical_name,
          providers: providers.sort((a, b) => a.provider.localeCompare(b.provider))
        }));

      setLogicalModels(multiProviderModels);
      setLoading(false);
    } catch (error) {
      console.error('加载模型失败:', error);
      setLoading(false);
    }
  };

  const openProviderEditor = (model: LogicalModel, provider: ModelProvider) => {
    setSelectedModel(model);
    setEditingProvider(provider);
    setCostConfig({
      provider_input_cost_per_1k_tokens: provider.provider_input_cost_per_1k_tokens || undefined,
      provider_output_cost_per_1k_tokens: provider.provider_output_cost_per_1k_tokens || undefined,
      provider_cost_currency: provider.provider_cost_currency as 'USD' | 'CNY' || 'USD'
    });
  };

  const saveCostConfig = async () => {
    if (!editingProvider) return;

    setSaving(true);
    try {
      // 使用PATCH方法只更新成本相关字段
      const response = await fetch(`/api/models/${editingProvider.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(costConfig),
      });

      if (response.ok) {
        await loadModels(); // 重新加载数据
        setEditingProvider(null);
        setSelectedModel(null);
        onUpdate?.();
      } else {
        const error = await response.json();
        alert(`保存失败: ${error.error}`);
      }
    } catch (error) {
      console.error('保存成本配置失败:', error);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const resetProviderCost = async (provider: ModelProvider) => {
    setSaving(true);
    try {
      // 使用PATCH方法重置成本相关字段
      const response = await fetch(`/api/models/${provider.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider_input_cost_per_1k_tokens: null,
          provider_output_cost_per_1k_tokens: null,
          provider_cost_currency: null
        }),
      });

      if (response.ok) {
        await loadModels();
        onUpdate?.();
      }
    } catch (error) {
      console.error('重置成本配置失败:', error);
    } finally {
      setSaving(false);
    }
  };

  const getCostStatus = (provider: ModelProvider) => {
    const hasProviderCost = provider.provider_input_cost_per_1k_tokens !== null || 
                           provider.provider_output_cost_per_1k_tokens !== null;
    
    if (hasProviderCost) {
      return { status: 'configured', label: '精确成本', color: 'green' };
    }
    
    const hasBaseCost = provider.input_cost_per_1k_tokens !== null || 
                       provider.output_cost_per_1k_tokens !== null;
    
    if (hasBaseCost) {
      return { status: 'base', label: '基础成本', color: 'yellow' };
    }
    
    return { status: 'none', label: '未配置', color: 'red' };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            多提供商成本管理
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">加载中...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            多提供商成本管理
          </CardTitle>
          <CardDescription>
            管理同一逻辑模型在不同提供商下的具体成本配置，支持精确的成本统计和分析
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>成本计算优先级:</strong> 提供商特定成本 &gt; 模型基础成本。配置提供商成本后，系统将使用更精确的定价进行统计。
            </AlertDescription>
          </Alert>

          <div className="space-y-6">
            {logicalModels.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <DollarSign className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>当前没有多提供商模型</p>
                <p className="text-sm">只有拥有多个提供商的模型才会在此显示</p>
              </div>
            ) : (
              logicalModels.map((model) => (
                <Card key={model.logical_name} className="border-l-4 border-l-blue-500">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {model.logical_name}
                      <Badge variant="outline">{model.providers.length} 个提供商</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4">
                      {model.providers.map((provider) => {
                        const costStatus = getCostStatus(provider);
                        return (
                          <div key={provider.id} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-medium">{provider.provider}</h4>
                                <Badge 
                                  variant={costStatus.color === 'green' ? 'default' : costStatus.color === 'yellow' ? 'secondary' : 'destructive'}
                                >
                                  {costStatus.label}
                                </Badge>
                                {provider.vendor_name && (
                                  <Badge variant="outline" className="text-xs">
                                    {provider.vendor_name}
                                  </Badge>
                                )}
                              </div>
                              
                              <div className="text-sm text-gray-600 space-y-1">
                                {provider.provider_input_cost_per_1k_tokens !== null ? (
                                  <div className="text-green-700 font-medium">
                                    提供商成本: 输入${provider.provider_input_cost_per_1k_tokens}/1K, 
                                    输出${provider.provider_output_cost_per_1k_tokens}/1K ({provider.provider_cost_currency})
                                  </div>
                                ) : (
                                  <div className="text-gray-500">
                                    基础成本: 输入${provider.input_cost_per_1k_tokens}/1K, 
                                    输出${provider.output_cost_per_1k_tokens}/1K ({provider.cost_currency})
                                  </div>
                                )}
                                {provider.cost_last_updated && (
                                  <div className="text-xs text-gray-400">
                                    更新时间: {new Date(provider.cost_last_updated).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openProviderEditor(model, provider)}
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                配置成本
                              </Button>
                              {provider.provider_input_cost_per_1k_tokens !== null && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => resetProviderCost(provider)}
                                  disabled={saving}
                                >
                                  重置
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* 编辑对话框 */}
      <Dialog open={!!editingProvider} onOpenChange={() => setEditingProvider(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>配置提供商成本</DialogTitle>
            <DialogDescription>
              为 {selectedModel?.logical_name} 在 {editingProvider?.provider} 设置特定成本
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <div className="font-medium text-gray-700 mb-1">当前基础成本:</div>
              <div>输入: ${editingProvider?.input_cost_per_1k_tokens}/1K</div>
              <div>输出: ${editingProvider?.output_cost_per_1k_tokens}/1K</div>
              <div>货币: {editingProvider?.cost_currency}</div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-base font-medium">提供商特定成本</Label>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="input-cost" className="text-sm">输入成本 ($/1K tokens)</Label>
                  <Input
                    id="input-cost"
                    type="number"
                    step="0.000001"
                    placeholder="0.000070"
                    value={costConfig.provider_input_cost_per_1k_tokens || ''}
                    onChange={(e) => setCostConfig({
                      ...costConfig,
                      provider_input_cost_per_1k_tokens: e.target.value ? Number(e.target.value) : undefined
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="output-cost" className="text-sm">输出成本 ($/1K tokens)</Label>
                  <Input
                    id="output-cost"
                    type="number"
                    step="0.000001"
                    placeholder="0.000280"
                    value={costConfig.provider_output_cost_per_1k_tokens || ''}
                    onChange={(e) => setCostConfig({
                      ...costConfig,
                      provider_output_cost_per_1k_tokens: e.target.value ? Number(e.target.value) : undefined
                    })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="currency" className="text-sm">货币单位</Label>
                <Select
                  value={costConfig.provider_cost_currency || 'USD'}
                  onValueChange={(value: 'USD' | 'CNY') => setCostConfig({
                    ...costConfig,
                    provider_cost_currency: value
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">美元 (USD)</SelectItem>
                    <SelectItem value="CNY">人民币 (CNY)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                配置后系统将优先使用提供商成本进行计算，确保统计数据的准确性
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingProvider(null)}>
                取消
              </Button>
              <Button onClick={saveCostConfig} disabled={saving}>
                {saving ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}