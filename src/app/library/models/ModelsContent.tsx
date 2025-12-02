'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, Eye, Globe, CheckCircle, XCircle, GripVertical, Save, X, RefreshCw } from 'lucide-react';
import { apiClient, ApiProvider } from '@/lib/api-client';
import { extractVendorName } from '@/lib/model-utils';
import { ModelsPageSkeleton } from '@/components/ui/skeleton';
import { usePageLoadComplete } from '@/components/layout/page-loading';

// 单位转换工具函数
const convertCostToMillion = (costPer1k?: number | null): number | undefined => {
  if (costPer1k == null) return undefined;
  return costPer1k * 1000; // 1K token 价格 * 1000 = 1M token 价格
};

const convertCostFrom1k = (costPerMillion?: number | undefined): number | undefined => {
  if (costPerMillion == null) return undefined;
  return costPerMillion / 1000; // 1M token 价格 / 1000 = 1K token 价格
};

const formatContextWindow = (tokens?: number | null): string => {
  if (!tokens) return '未设置';
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k`;
  }
  return tokens.toString();
};

const parseContextWindow = (value: string): number | undefined => {
  if (!value) return undefined;
  const numMatch = value.match(/^(\d+(?:\.\d+)?)\s*([kKmM]?)$/);
  if (!numMatch) return parseInt(value) || undefined;
  
  const num = parseFloat(numMatch[1]);
  const unit = numMatch[2].toLowerCase();
  
  switch (unit) {
    case 'k': return Math.round(num * 1000);
    case 'm': return Math.round(num * 1000000);
    default: return Math.round(num);
  }
};

interface Model {
  id: string;
  name: string;
  provider: string;
  api_endpoint: string;
  api_key_env_var: string;
  input_cost_per_1k_tokens: number | null;
  output_cost_per_1k_tokens: number | null;
  cost_currency?: 'USD' | 'CNY'; // 成本货币单位，非必填，默认USD
  max_context_window: number | null;
  tags: string[];
  // 新增：被测评时的默认配置
  default_max_tokens?: number | null;
  default_temperature?: number | null;
  default_thinking_budget?: number | null;
  // 🆕 多厂商架构字段
  logical_name?: string;           // 逻辑模型名 (如 "GPT-4o")
  vendor_name?: string;            // 厂商名 (如 "OpenAI") 
  api_model_name?: string;         // API调用名 (如 "gpt-4o")
  priority?: number;               // 厂商优先级 (1=高, 3=低)
  concurrent_limit?: number;       // 并发限制
  success_rate?: number;           // 历史成功率 (0.0-1.0)
  status?: 'active' | 'inactive' | 'maintenance'; // 厂商状态
  model_group_id?: string;         // 模型分组ID
  created_at: string;
  updated_at: string;
}

interface ModelListResponse {
  models: Model[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

interface ModelFormData {
  name: string;
  provider: string;
  api_endpoint: string;
  api_key_env_var: string;
  input_cost_per_1k_tokens?: number;
  output_cost_per_1k_tokens?: number;
  cost_currency?: 'USD' | 'CNY';
  max_context_window?: number;
  tags: string[];
  // 新增：被测评时的默认配置
  default_max_tokens?: number;
  default_temperature?: number;
  default_thinking_budget?: number;
  // 🆕 多厂商架构字段
  logical_name?: string;
  vendor_name?: string;
  api_model_name?: string;
  priority?: number;
  status?: 'active' | 'inactive' | 'maintenance';
}

// 表单显示数据结构（使用新单位）
interface ModelFormDisplayData {
  name: string;
  provider: string;
  api_endpoint: string;
  api_key_env_var: string;
  input_cost_per_million?: number;
  output_cost_per_million?: number;
  cost_currency?: 'USD' | 'CNY';
  context_window_display?: string;
  tags: string[];
  // 新增：被测评时的默认配置
  default_max_tokens?: number;
  default_temperature?: number;
  default_thinking_budget?: number;
  // 🆕 多厂商架构字段
  logical_name?: string;
  api_model_name?: string;  // 🔧 修复：添加API模型名称字段
  priority?: number;
  status?: 'active' | 'inactive' | 'maintenance';
}

const TAG_LABELS = {
  '非推理': '非推理',
  '推理': '推理',
  '多模态': '多模态'
};

const TAG_COLORS = {
  '非推理': 'bg-gray-100 text-gray-800',
  '推理': 'bg-blue-100 text-blue-800',
  '多模态': 'bg-purple-100 text-purple-800'
};

const AVAILABLE_TAGS = ['非推理', '推理', '多模态'];

// 智能推导工具函数
function extractLogicalModelName(modelName: string): string {
  if (!modelName) return '';
  
  // 如果包含"/"，取最后一部分作为逻辑名称
  if (modelName.includes('/')) {
    const parts = modelName.split('/');
    return parts[parts.length - 1];
  }
  
  // 🔧 如果包含":"（如 gpt-oss-20b:free），取":" 之前的部分
  if (modelName.includes(':')) {
    return modelName.split(':')[0];
  }
  
  return modelName;
}

function extractVendorName(modelName: string, providerName: string): string {
  if (!modelName) return '';
  
  // 如果模型名称包含"/"，取第一部分作为厂商名称
  if (modelName.includes('/')) {
    const parts = modelName.split('/');
    return parts[0];
  }
  
  // 如果没有"/"，根据提供商名称推导
  if (providerName?.toLowerCase().includes('openrouter')) {
    // OpenRouter的情况，厂商信息通常在模型名称的前缀
    const knownVendors = ['openai', 'deepseek', 'anthropic', 'qwen', 'baidu'];
    const modelLower = modelName.toLowerCase();
    
    for (const vendor of knownVendors) {
      if (modelLower.includes(vendor)) {
        return vendor;
      }
    }
  }
  
  return providerName || 'Unknown';
}

export default function ModelsContent() {
  // 🚀 立即清除全局loading状态
  usePageLoadComplete();

  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(''); // 输入框的值
  const [searchTerm, setSearchTerm] = useState(''); // 实际用于搜索的值
  const [tagFilter, setTagFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>(''); // 新增状态筛选
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [viewingModel, setViewingModel] = useState<Model | null>(null);
  const [managingProvidersModel, setManagingProvidersModel] = useState<Model | null>(null);
  const [saving, setSaving] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    has_more: false
  });

  // 加载提供商列表
  const loadProviders = async () => {
    try {
      const response = await apiClient.getProviders(true);
      if (response.data) {
        setProviders(response.data.providers);
      }
    } catch (err) {
      console.error('加载提供商失败:', err);
    }
  };

  // 加载模型列表
  const loadModels = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
        include_inactive: 'true' // 默认包含所有状态的模型
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (tagFilter) params.append('tag', tagFilter);
      if (statusFilter) params.append('status', statusFilter);
      
      // 添加时间戳强制破坏缓存
      params.append('_t', Date.now().toString());

      const response = await fetch(`/api/models?${params}`, {
        cache: 'no-store'
      });
      if (!response.ok) {
        throw new Error('加载模型列表失败');
      }

      const data: ModelListResponse = await response.json();
      setModels(data.models);
      setPagination(data.pagination);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 🆕 改为删除整个逻辑模型（所有提供商）
  const handleDeleteLogicalModel = async (logicalName: string, providers: Model[]) => {
    const activeProviders = providers.filter(p => p.status === 'active');
    const hasEvaluationResults = providers.some(p => p.id); // 简化检查，实际应检查评测结果
    
    let confirmMessage = `确定要删除整个逻辑模型"${logicalName}"吗？\n\n`;
    confirmMessage += `这将删除所有${providers.length}个提供商的配置：\n`;
    providers.forEach(p => {
      confirmMessage += `- ${p.provider} (${p.status === 'active' ? '启用' : '停用'})\n`;
    });
    confirmMessage += `\n注意：如果只想停用某个提供商，请使用"管理提供商"功能。`;
    
    if (!confirm(confirmMessage)) return;

    // 🆕 删除所有提供商
    const deletePromises = providers.map(async (provider) => {
      try {
        const response = await fetch(`/api/models/${provider.id}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(`删除${provider.provider}失败: ${error.error}`);
        }
        return { success: true, provider: provider.provider };
      } catch (err) {
        return { success: false, provider: provider.provider, error: err.message };
      }
    });

    try {
      const results = await Promise.all(deletePromises);
      const failures = results.filter(r => !r.success);
      
      if (failures.length > 0) {
        const errorMsg = failures.map(f => `${f.provider}: ${f.error}`).join('\n');
        alert(`部分删除失败：\n${errorMsg}`);
      } else {
        console.log(`✅ 逻辑模型"${logicalName}"已完全删除`);
      }

      await loadModels();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  // 🆕 自动配置推理参数
  const autoConfigureReasoningParams = async (data: ModelFormData) => {
    // 只对推理模型进行自动配置
    if (!(data.tags || []).includes('推理') || !data.default_thinking_budget) {
      return;
    }

    try {
      console.log(`🔧 推理模型自动配置: ${data.name} (${data.provider})`);
      
      const response = await fetch('/api/models/auto-configure-reasoning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider_name: data.provider,
          thinking_budget: data.default_thinking_budget,
          max_tokens: data.default_max_tokens,
          model_name: data.name
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ 推理参数自动配置成功:', result.message);
      } else {
        const error = await response.json();
        console.warn('⚠️ 推理参数自动配置失败:', error.error);
        // 不抛出错误，让模型保存继续进行
      }
    } catch (error) {
      console.warn('⚠️ 推理参数自动配置异常:', error);
      // 不抛出错误，让模型保存继续进行
    }
  };

  // 保存模型（创建或更新）
  const handleSave = async (data: ModelFormData) => {
    setSaving(true);
    try {
      const url = editingModel 
        ? `/api/models/${editingModel.id}`
        : '/api/models';
      
      const method = editingModel ? 'PATCH' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '保存失败');
      }

      const result = await response.json();

      // 🆕 保存成功后，自动配置推理参数
      await autoConfigureReasoningParams(data);

      // 关闭表单
      setShowCreateForm(false);
      setEditingModel(null);
      
      // 强制重新加载列表（清除缓存）
      await loadModels();
      
      console.log('模型保存成功:', result);
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
      throw err; // 重新抛出错误，让表单知道保存失败
    } finally {
      setSaving(false);
    }
  };

  // 处理搜索
  const handleSearch = () => {
    setSearchTerm(searchInput);
    setPagination(prev => ({ ...prev, offset: 0 })); // 重置到第一页
  };

  // 处理回车键
  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 清除搜索
  const handleClearSearch = () => {
    setSearchInput('');
    setSearchTerm('');
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  useEffect(() => {
    loadProviders();
    loadModels();
  }, [searchTerm, tagFilter, statusFilter, pagination.offset, pagination.limit]);

  // 按逻辑模型分组
  const groupedModels = useMemo(() => {
    const groups = new Map<string, {
      logical_name: string;
      display_name: string;
      providers: Model[];
      tags: string[];
      status: string;
    }>();

    models.forEach((model) => {
      const logicalName = model.logical_name || extractLogicalModelName(model.name);
      
      if (!groups.has(logicalName)) {
        groups.set(logicalName, {
          logical_name: logicalName,
          display_name: model.logical_name || extractLogicalModelName(model.name),
          providers: [],
          tags: model.tags || [],
          status: model.status || 'active'
        });
      }
      
      const group = groups.get(logicalName)!;
      group.providers.push(model);
    });

    return Array.from(groups.values());
  }, [models]);

  return (
    <div className="p-6">
      {/* 页面头部 */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">模型管理</h1>
            <p className="text-gray-600">管理AI评测系统的模型配置</p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建模型
          </button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex gap-4 bg-white p-4 rounded-lg border mb-6">
        <div className="flex-1 flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索模型名称..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={handleSearchKeyPress}
              disabled={loading}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            搜索
          </button>
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:bg-gray-50 transition-colors"
            >
              清除
            </button>
          )}
        </div>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          disabled={loading}
          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
        >
          <option value="">所有标签</option>
          <option value="非推理">非推理</option>
          <option value="推理">推理</option>
          <option value="多模态">多模态</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          disabled={loading}
          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
        >
          <option value="">所有状态</option>
          <option value="active">激活</option>
          <option value="inactive">停用</option>
          <option value="maintenance">维护</option>
        </select>
      </div>

      {/* 🎯 动态内容区域 - 根据状态显示不同内容 */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-700">错误: {error}</div>
          <button
            onClick={() => { loadModels(); loadProviders(); }}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            重新加载
          </button>
        </div>
      ) : loading ? (
        /* 只对数据内容显示骨架动画 */
        <div className="bg-white rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left"><div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div></th>
                  <th className="px-6 py-3 text-left"><div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div></th>
                  <th className="px-6 py-3 text-left"><div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div></th>
                  <th className="px-6 py-3 text-left"><div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div></th>
                  <th className="px-6 py-3 text-right"><div className="h-4 w-12 bg-gray-200 rounded animate-pulse"></div></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4"><div className="h-4 w-full bg-gray-200 rounded animate-pulse"></div></td>
                    <td className="px-6 py-4"><div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse"></div></td>
                    <td className="px-6 py-4"><div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse"></div></td>
                    <td className="px-6 py-4"><div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse"></div></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* 实际数据内容 */
        <div className="bg-white rounded-lg border">
          {groupedModels.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 mb-2">暂无模型</div>
              <button
                onClick={() => setShowCreateForm(true)}
                className="text-blue-600 hover:text-blue-800"
              >
                创建第一个模型
              </button>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    模型名称
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    标签
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    提供商数量
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupedModels.map((group) => {
                  // 取第一个提供商作为代表模型（仅用于查看等操作）
                  const representativeModel = group.providers[0];
                  
                  // 为编辑操作创建逻辑模型对象
                  const logicalModel: Model = {
                    // 使用第一个提供商的ID作为逻辑模型ID（仅用于API调用）
                    id: representativeModel.id,
                    // 逻辑模型属性
                    name: group.logical_name,
                    logical_name: group.logical_name,
                    // 使用第一个提供商的基础属性作为默认值
                    provider: representativeModel.provider,
                    api_endpoint: representativeModel.api_endpoint,
                    api_key_env_var: representativeModel.api_key_env_var,
                    // 成本相关：使用第一个提供商的值
                    input_cost_per_1k_tokens: representativeModel.input_cost_per_1k_tokens,
                    output_cost_per_1k_tokens: representativeModel.output_cost_per_1k_tokens,
                    cost_currency: representativeModel.cost_currency,
                    max_context_window: representativeModel.max_context_window,
                    // 标签：合并所有提供商的标签
                    tags: group.tags || Array.from(new Set(group.providers.flatMap(p => p.tags || []))),
                    // 默认配置：使用第一个提供商的值
                    default_max_tokens: representativeModel.default_max_tokens,
                    default_temperature: representativeModel.default_temperature,
                    default_thinking_budget: representativeModel.default_thinking_budget,
                    // 其他属性
                    status: representativeModel.status,
                    created_at: representativeModel.created_at,
                    updated_at: representativeModel.updated_at
                  };
                  
                  return (
                    <tr key={group.logical_name} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {group.display_name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {group.providers.map(p => p.provider).join(', ')} 提供商
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {(group.tags || ['推理']).map(tag => (
                            <span key={tag} className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${TAG_COLORS[tag]}`}>
                              {TAG_LABELS[tag]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {group.providers.length}个提供商
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          group.status === 'active' ? 'bg-green-100 text-green-800' :
                          group.status === 'inactive' ? 'bg-red-100 text-red-800' :
                          group.status === 'maintenance' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {group.status === 'active' ? '活跃' :
                           group.status === 'inactive' ? '停用' :
                           group.status === 'maintenance' ? '维护中' : '活跃'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setManagingProvidersModel(representativeModel)}
                            className="text-green-600 hover:text-green-900"
                          title="管理提供商"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                          <button
                            onClick={() => setViewingModel(representativeModel)}
                            className="text-gray-600 hover:text-gray-900"
                            title="查看详情"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingModel(logicalModel)}
                            className="text-blue-600 hover:text-blue-900"
                            title="编辑"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteLogicalModel(group.logical_name, group.providers)}
                            className="text-red-600 hover:text-red-900"
                            title={`删除整个逻辑模型（${group.providers.length}个提供商）`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {pagination.total > 0 && (
          <div className="px-6 py-3 border-t bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-700">
                显示 {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} 
                / 共 {pagination.total} 个
              </div>
              <div className="text-sm text-gray-600">
                第 {Math.floor(pagination.offset / pagination.limit) + 1} 页 / 共 {Math.ceil(pagination.total / pagination.limit)} 页
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              {/* 每页大小选择器 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">每页显示:</span>
                <select
                  value={pagination.limit}
                  onChange={(e) => setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), offset: 0 }))}
                  className="text-sm border rounded px-2 py-1"
                >
                  <option value={10}>10 条</option>
                  <option value={20}>20 条</option>
                  <option value={50}>50 条</option>
                  <option value={100}>100 条</option>
                </select>
              </div>
              
              {/* 分页按钮 */}
              <div className="flex gap-1">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, offset: 0 }))}
                  disabled={pagination.offset === 0}
                  className="px-2 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  title="第一页"
                >
                  ««
                </button>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                  disabled={pagination.offset === 0}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                  disabled={!pagination.has_more}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  下一页
                </button>
                <button
                  onClick={() => {
                    const lastPageOffset = Math.floor((pagination.total - 1) / pagination.limit) * pagination.limit;
                    setPagination(prev => ({ ...prev, offset: lastPageOffset }));
                  }}
                  disabled={!pagination.has_more}
                  className="px-2 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  title="最后一页"
                >
                  »»
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {/* 创建/编辑表单 */}
      {showCreateForm && (
        <ModelForm
          providers={providers}
          onSave={handleSave}
          onCancel={() => setShowCreateForm(false)}
          loading={saving}
        />
      )}

      {editingModel && (
        <ModelForm
          model={editingModel}
          providers={providers}
          onSave={handleSave}
          onCancel={() => setEditingModel(null)}
          loading={saving}
        />
      )}

      {/* 查看详情模态框 */}
      {viewingModel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">模型详情</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">名称</label>
                  <div className="mt-1 text-sm text-gray-900">{viewingModel.name}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">提供商</label>
                  <div className="mt-1 text-sm text-gray-900">{viewingModel.provider}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">标签</label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {viewingModel.tags.map(tag => (
                      <span key={tag} className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${TAG_COLORS[tag]}`}>
                        {TAG_LABELS[tag]}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">API密钥环境变量</label>
                  <div className="mt-1 text-sm text-gray-900">{viewingModel.api_key_env_var}</div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">API端点</label>
                <div className="mt-1 text-sm text-gray-900 break-all">{viewingModel.api_endpoint}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">输入成本 ({viewingModel.cost_currency === 'CNY' ? '¥' : '$'}/1M tokens)</label>
                  <div className="mt-1 text-sm text-gray-900">
                    {viewingModel.input_cost_per_1k_tokens 
                      ? `${viewingModel.cost_currency === 'CNY' ? '¥' : '$'}${convertCostToMillion(viewingModel.input_cost_per_1k_tokens)?.toFixed(3)}`
                      : '未设置'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">输出成本 ({viewingModel.cost_currency === 'CNY' ? '¥' : '$'}/1M tokens)</label>
                  <div className="mt-1 text-sm text-gray-900">
                    {viewingModel.output_cost_per_1k_tokens 
                      ? `${viewingModel.cost_currency === 'CNY' ? '¥' : '$'}${convertCostToMillion(viewingModel.output_cost_per_1k_tokens)?.toFixed(3)}`
                      : '未设置'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">上下文窗口</label>
                  <div className="mt-1 text-sm text-gray-900">
                    {formatContextWindow(viewingModel.max_context_window)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
                <div>
                  <label className="block font-medium">创建时间</label>
                  <div>{new Date(viewingModel.created_at).toLocaleString('zh-CN')}</div>
                </div>
                <div>
                  <label className="block font-medium">更新时间</label>
                  <div>{new Date(viewingModel.updated_at).toLocaleString('zh-CN')}</div>
                </div>
              </div>
            </div>
            <button
              onClick={() => setViewingModel(null)}
              className="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 提供商管理模态框 */}
      {managingProvidersModel && (
        <ProviderManagementModal
          model={managingProvidersModel}
          providers={providers}
          onClose={() => setManagingProvidersModel(null)}
          onUpdate={loadModels}
        />
      )}
    </div>
  );
}

// 模型表单组件
interface ModelFormProps {
  model?: Model;
  providers: ApiProvider[];
  onSave: (data: ModelFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

function ModelForm({ model, providers, onSave, onCancel, loading = false }: ModelFormProps) {
  // 内部状态使用新的显示单位
  const [displayData, setDisplayData] = useState<ModelFormDisplayData>({
    name: model?.name || '',
    provider: model?.provider || '',
    api_endpoint: model?.api_endpoint || '',
    api_key_env_var: model?.api_key_env_var || '',
    input_cost_per_million: convertCostToMillion(model?.input_cost_per_1k_tokens),
    output_cost_per_million: convertCostToMillion(model?.output_cost_per_1k_tokens),
    cost_currency: model?.cost_currency || 'USD',
    context_window_display: model?.max_context_window ? formatContextWindow(model.max_context_window) : '',
    tags: model?.tags || ['推理'],
    // 新增：默认配置字段
    default_max_tokens: model?.default_max_tokens || undefined,
    default_temperature: model?.default_temperature || undefined,
    default_thinking_budget: model?.default_thinking_budget || undefined,
    // 🆕 多厂商架构字段
    logical_name: model?.logical_name || '',
    api_model_name: model?.api_model_name || model?.name || '', // 🔧 修复：初始化API模型名称
    priority: model?.priority || 1, // 🔧 新建模型默认为高优先级（1=高优先级，3=低优先级）
    status: model?.status || 'active'
  });
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [isCustomProvider, setIsCustomProvider] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 🐛 调试日志
      console.log('🔍 提交表单，displayData:', {
        logical_name: displayData.logical_name,
        api_model_name: displayData.api_model_name,
        name: displayData.name
      });

      // 🔧 验证：创建新模型时必须填写 API 模型名称
      if (!model && !displayData.api_model_name?.trim()) {
        alert('请填写 API 模型名称');
        return;
      }

      // 🔧 验证：必须填写逻辑模型名称
      if (!displayData.logical_name?.trim()) {
        alert('请填写逻辑模型名称');
        return;
      }

      // 🔧 清理输入值
      const apiModelName = displayData.api_model_name?.trim() || displayData.name?.trim() || '';
      const logicalName = displayData.logical_name.trim();

      console.log('🔍 清理后的值:', {
        apiModelName,
        logicalName
      });

      // 将显示数据转换为存储格式
      const formData: ModelFormData = {
        name: apiModelName, // ✨ 自动使用 api_model_name 作为 name
        provider: displayData.provider,
        api_endpoint: displayData.api_endpoint,
        api_key_env_var: displayData.api_key_env_var,
        // 🔧 修复：创建新模型时，将成本保存为提供商级别成本
        input_cost_per_1k_tokens: model ? convertCostFrom1k(displayData.input_cost_per_million) : undefined,
        output_cost_per_1k_tokens: model ? convertCostFrom1k(displayData.output_cost_per_million) : undefined,
        cost_currency: model ? displayData.cost_currency : undefined,
        // 新模型时使用提供商级别成本
        provider_input_cost_per_1k_tokens: !model ? convertCostFrom1k(displayData.input_cost_per_million) : undefined,
        provider_output_cost_per_1k_tokens: !model ? convertCostFrom1k(displayData.output_cost_per_million) : undefined,
        provider_cost_currency: !model ? displayData.cost_currency : undefined,
        max_context_window: parseContextWindow(displayData.context_window_display || ''),
        tags: displayData.tags,
        // 新增：默认配置字段
        default_max_tokens: displayData.default_max_tokens,
        default_temperature: displayData.default_temperature,
        default_thinking_budget: displayData.default_thinking_budget,
        // 🆕 多厂商架构字段
        logical_name: logicalName,
        vendor_name: extractVendorName(apiModelName, displayData.provider),
        api_model_name: apiModelName, // ✅ 直接使用清理后的值，不使用 fallback
        priority: displayData.priority,
        status: displayData.status
      };

      console.log('🔍 最终 formData:', {
        name: formData.name,
        logical_name: formData.logical_name,
        api_model_name: formData.api_model_name
      });

      await onSave(formData);
    } catch (error) {
      // 错误已在父组件处理
    }
  };

  const handleFieldChange = (field: keyof ModelFormDisplayData, value: any) => {
    setDisplayData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 处理提供商选择变化
  const handleProviderChange = (providerId: string) => {
    setSelectedProviderId(providerId);
    
    if (providerId === 'custom') {
      setIsCustomProvider(true);
      // 清空自动填充的字段，让用户手动输入
      setDisplayData(prev => ({
        ...prev,
        provider: '',
        api_endpoint: '',
        api_key_env_var: ''
      }));
    } else if (providerId) {
      setIsCustomProvider(false);
      const provider = providers.find(p => p.id === providerId);
      if (provider) {
        setDisplayData(prev => ({
          ...prev,
          provider: provider.name,
          api_endpoint: provider.base_url,
          api_key_env_var: provider.api_key_env_var || ''
        }));
      }
    } else {
      setIsCustomProvider(false);
      setDisplayData(prev => ({
        ...prev,
        provider: '',
        api_endpoint: '',
        api_key_env_var: ''
      }));
    }
  };

  // 初始化时根据现有模型设置提供商选择
  useEffect(() => {
    if (model && providers.length > 0) {
      const matchingProvider = providers.find(p => 
        p.name === model.provider || p.base_url === model.api_endpoint
      );
      if (matchingProvider) {
        setSelectedProviderId(matchingProvider.id);
        setIsCustomProvider(false);
      } else {
        setSelectedProviderId('custom');
        setIsCustomProvider(true);
      }
    }
  }, [model, providers]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto">
        <h3 className="text-xl font-semibold mb-6">
          {model ? '编辑模型' : '创建模型'}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 主要信息 - 简洁的顶部区域 */}
          <div className="space-y-4">
            <div>
              <label className="block text-lg font-medium text-gray-900 mb-2">
                逻辑模型名称
              </label>
              <input
                type="text"
                value={displayData.logical_name || displayData.name}
                onChange={(e) => handleFieldChange('logical_name', e.target.value)}
                className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="输入逻辑模型名称，如 GPT-4o"
                required
              />
              <p className="text-sm text-gray-500 mt-1">这是用户看到的模型名称</p>
            </div>

            {/* 仅在创建模式下显示提供商选择 */}
            {!model && (
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  选择提供商 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  <select
                    value={selectedProviderId}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">请选择提供商</option>
                    {providers.map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} {provider.is_builtin ? '(内置)' : '(自定义)'}
                      </option>
                    ))}
                    <option value="custom">自定义提供商</option>
                  </select>

                  {/* 显示提供商信息或自定义输入 */}
                  {selectedProviderId && selectedProviderId !== 'custom' && (
                    <div className="text-sm text-gray-600 bg-white p-3 rounded border">
                      <div><strong>API端点:</strong> {displayData.api_endpoint}</div>
                      <div><strong>密钥变量:</strong> {displayData.api_key_env_var}</div>
                    </div>
                  )}

                  {isCustomProvider && (
                    <div className="space-y-3 border-t pt-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          提供商名称 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={displayData.provider}
                          onChange={(e) => handleFieldChange('provider', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="如 OpenAI"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          API端点 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="url"
                          value={displayData.api_endpoint}
                          onChange={(e) => handleFieldChange('api_endpoint', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="https://api.openai.com/v1"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          API密钥环境变量 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={displayData.api_key_env_var}
                          onChange={(e) => handleFieldChange('api_key_env_var', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="OPENAI_API_KEY"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-blue-600">
                    <div>💡 选择已配置的提供商或自定义新的提供商配置</div>
                    <div>⚠️ 提供商管理请前往【设置 {'>'} API提供商】页面</div>
                  </div>
                </div>
              </div>
            )}

            {/* API模型名称 - 仅在创建模式下显示 */}
            {!model && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API模型名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={displayData.api_model_name}
                  onChange={(e) => handleFieldChange('api_model_name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="gpt-4o-mini"
                  required
                />
                <p className="text-sm text-gray-500 mt-1">用于API调用的精确模型名称（如 gpt-4o-mini）</p>
              </div>
            )}
          </div>

          {/* 模型特性 - 简洁的水平布局 */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                模型特性
              </label>
              <div className="flex flex-wrap gap-3">
                {AVAILABLE_TAGS.map(tag => (
                  <label key={tag} className="flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={(displayData.tags || []).includes(tag)}
                      onChange={(e) => {
                        const currentTags = displayData.tags || [];
                        const newTags = e.target.checked
                          ? [...currentTags, tag]
                          : currentTags.filter(t => t !== tag);
                        handleFieldChange('tags', newTags);
                      }}
                      className="sr-only"
                    />
                    <span className={`px-4 py-2 text-sm font-medium rounded-full border-2 transition-all duration-200 ${
                      (displayData.tags || []).includes(tag)
                        ? `${TAG_COLORS[tag]} border-current shadow-sm`
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300 group-hover:bg-gray-100'
                    }`}>
                      {TAG_LABELS[tag]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  上下文窗口
                </label>
                <input
                  type="text"
                  value={displayData.context_window_display || ''}
                  onChange={(e) => handleFieldChange('context_window_display', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="128k"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  状态
                </label>
                <select
                  value={displayData.status || 'active'}
                  onChange={(e) => handleFieldChange('status', e.target.value as 'active' | 'inactive' | 'maintenance')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="active">✅ 活跃</option>
                  <option value="inactive">⏸️ 停用</option>
                  <option value="maintenance">🔧 维护中</option>
                </select>
              </div>
            </div>
          </div>

          {/* 默认配置 - 渐进式披露 */}
          <details className="group border border-gray-200 rounded-lg">
            <summary className="flex items-center justify-between p-4 font-medium cursor-pointer hover:bg-gray-50 rounded-lg">
              <span>默认参数配置</span>
              <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="px-4 pb-4 space-y-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">模型被测评时的默认参数</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">最大Token数</label>
                  <input
                    type="number"
                    min="1"
                    value={displayData.default_max_tokens || ''}
                    onChange={(e) => handleFieldChange('default_max_tokens', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1000"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">温度值</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={displayData.default_temperature || ''}
                    onChange={(e) => handleFieldChange('default_temperature', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.7"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">思维链Token数</label>
                  <input
                    type="number"
                    min="1"
                    value={displayData.default_thinking_budget || ''}
                    onChange={(e) => handleFieldChange('default_thinking_budget', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1000"
                    disabled={!(displayData.tags || []).includes('推理')}
                  />
                  {!(displayData.tags || []).includes('推理') && (
                    <p className="text-xs text-gray-500 mt-1">仅推理模型可用</p>
                  )}
                </div>
              </div>
            </div>
          </details>

          {/* 成本配置 - 仅在创建新模型时显示 */}
          {!model && (
            <details className="group border border-gray-200 rounded-lg">
              <summary className="flex items-center justify-between p-4 font-medium cursor-pointer hover:bg-gray-50 rounded-lg">
                <span>成本配置</span>
                <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-4 pb-4 space-y-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">配置该提供商的模型使用成本</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">货币单位</label>
                  <select
                    value={displayData.cost_currency || 'USD'}
                    onChange={(e) => handleFieldChange('cost_currency', e.target.value as 'USD' | 'CNY')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="USD">美元 ($)</option>
                    <option value="CNY">人民币 (¥)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">输入成本</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={displayData.input_cost_per_million || ''}
                    onChange={(e) => handleFieldChange('input_cost_per_million', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">{displayData.cost_currency === 'CNY' ? '¥' : '$'} / 1M tokens</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">输出成本</label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={displayData.output_cost_per_million || ''}
                    onChange={(e) => handleFieldChange('output_cost_per_million', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="3.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">{displayData.cost_currency === 'CNY' ? '¥' : '$'} / 1M tokens</p>
                </div>
              </div>
            </div>
            </details>
          )}

          {/* 操作按钮 - 乔布斯式简洁设计 */}
          <div className="flex items-center justify-between pt-8">
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all duration-200"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  保存中
                </div>
              ) : (
                model ? '更新模型' : '创建模型'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 提供商管理组件
interface ProviderManagementModalProps {
  model: Model;
  providers: ApiProvider[];
  onClose: () => void;
  onUpdate: () => void;
}

function ProviderManagementModal({ model, providers, onClose, onUpdate }: ProviderManagementModalProps) {
  const [modelProviders, setModelProviders] = useState<Array<{
    id: string;
    provider_id: string;
    provider_name: string;
    api_model_name: string;
    priority: number;
    status: 'active' | 'inactive' | 'maintenance';
    // 🆕 添加成本相关字段
    input_cost_per_1k_tokens?: number;
    output_cost_per_1k_tokens?: number;
    cost_currency?: 'USD' | 'CNY';
    provider_input_cost_per_1k_tokens?: number;
    provider_output_cost_per_1k_tokens?: number;
    provider_cost_currency?: 'USD' | 'CNY';
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editingModelName, setEditingModelName] = useState('');
  const [draggedProvider, setDraggedProvider] = useState<string | null>(null);
  // 🆕 添加正在操作的提供商状态
  const [operatingProvider, setOperatingProvider] = useState<string | null>(null);
  // 🆕 添加拖拽完成状态，避免自动修正立即干预
  const [justFinishedDrag, setJustFinishedDrag] = useState(false);
  // 🆕 添加成本更新状态，避免自动修正干扰
  const [justUpdatedCost, setJustUpdatedCost] = useState(false);
  // 🆕 成本编辑相关状态
  const [editingCost, setEditingCost] = useState<string | null>(null);
  const [editingCostData, setEditingCostData] = useState({
    provider_input_cost_per_1k_tokens: '',
    provider_output_cost_per_1k_tokens: '',
    provider_cost_currency: 'USD' as 'USD' | 'CNY'
  });

  // 加载模型的提供商列表
  useEffect(() => {
    if (model) {
      loadModelProviders();
    }
  }, [model, providers]);

  const loadModelProviders = async () => {
    if (!model) {
      console.log('❌ loadModelProviders: model is null');
      return;
    }
    
    try {
      const logicalName = model.logical_name || model.name;
      console.log(`🔄 loadModelProviders: 开始加载 ${logicalName} 的提供商...`);
      
      // 查询所有具有相同逻辑名称的模型记录 - 添加时间戳防止缓存
      // 🔧 包含非活跃模型以便在UI中显示为可切换状态
      const url = `/api/models?search=${encodeURIComponent(logicalName)}&limit=100&include_inactive=true&_t=${Date.now()}`;
      console.log(`🌐 API请求URL: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load models');
      
      const data = await response.json();
      const allModelsWithSameLogical = data.models.filter((m: any) => 
        (m.logical_name && m.logical_name === logicalName) || 
        (m.name === logicalName)
      );
      
      // 转换为提供商列表格式
      const providerList = allModelsWithSameLogical
        .map((m: any) => ({
          id: m.id,
          provider_id: m.provider_id || '',
          provider_name: m.provider || 'Unknown',
          api_model_name: m.api_model_name || m.name,
          priority: m.priority || 3,
          status: m.status || 'active',
          // 🆕 添加成本信息
          input_cost_per_1k_tokens: m.input_cost_per_1k_tokens,
          output_cost_per_1k_tokens: m.output_cost_per_1k_tokens,
          cost_currency: m.cost_currency,
          provider_input_cost_per_1k_tokens: m.provider_input_cost_per_1k_tokens,
          provider_output_cost_per_1k_tokens: m.provider_output_cost_per_1k_tokens,
          provider_cost_currency: m.provider_cost_currency
        }))
        .sort((a, b) => {
          // 🔧 优先显示活跃提供商，然后按优先级排序
          if (a.status !== b.status) {
            if (a.status === 'active') return -1;
            if (b.status === 'active') return 1;
          }
          return a.priority - b.priority;
        });
      
      console.log(`📊 加载模型提供商: ${logicalName}`, {
        total: providerList.length,
        active: providerList.filter(p => p.status === 'active').length,
        inactive: providerList.filter(p => p.status === 'inactive').length,
        providers: providerList.map(p => `${p.provider_name}(${p.status}): ${p.api_model_name}`)
      });
      
      setModelProviders(providerList);

      // 🔧 如果刚完成拖拽或成本更新，跳过自动修正避免干扰用户操作
      if (!justFinishedDrag && !justUpdatedCost) {
        console.log('🔍 检查并自动修正优先级排序...');
        await checkAndFixPrioritySequence(providerList);
      } else {
        if (justFinishedDrag) {
          console.log('⏭️ 跳过自动修正（刚完成拖拽操作）');
          setTimeout(() => setJustFinishedDrag(false), 1000);
        }
        if (justUpdatedCost) {
          console.log('⏭️ 跳过自动修正（刚完成成本更新）');
          setTimeout(() => setJustUpdatedCost(false), 1000);
        }
      }
    } catch (error) {
      console.error('Failed to load model providers:', error);
      // 回退到单一提供商显示
      setModelProviders([{
        id: model.id,
        provider_id: model.provider_id || '',
        provider_name: model.provider,
        api_model_name: model.api_model_name || model.name,
        priority: model.priority || 3,
        status: model.status || 'active'
      }]);
    }
  };

  const handleAddProvider = async (providerData: AddProviderData) => {
    setLoading(true);
    try {
      // 获取选择的提供商信息
      const selectedProvider = providers.find(p => p.id === providerData.provider_id);
      if (!selectedProvider) {
        throw new Error('找不到选择的提供商信息');
      }

      // 为该模型创建一个新的提供商记录
      const newModelData = {
        // 继承原模型的基本信息
        name: providerData.api_model_name, // 使用提供商定义的模型名作为name
        logical_name: model.logical_name || model.name, // 保持相同的逻辑名称，如果没有则使用原name
        provider: providerData.provider_name,
        vendor_name: extractVendorName(providerData.api_model_name),
        api_model_name: providerData.api_model_name,
        status: providerData.status,
        priority: 1, // 🔧 新提供商默认为高优先级
        concurrent_limit: 50,
        success_rate: 1.0,
        // 使用选择的提供商信息
        api_endpoint: selectedProvider.base_url,
        api_key_env_var: selectedProvider.api_key_env_var,
        input_cost_per_1k_tokens: model.input_cost_per_1k_tokens,
        output_cost_per_1k_tokens: model.output_cost_per_1k_tokens,
        cost_currency: model.cost_currency,
        // 🆕 Phase 3: 提供商级别成本配置
        provider_input_cost_per_1k_tokens: providerData.use_provider_cost ? providerData.provider_input_cost_per_1k_tokens : undefined,
        provider_output_cost_per_1k_tokens: providerData.use_provider_cost ? providerData.provider_output_cost_per_1k_tokens : undefined,
        provider_cost_currency: providerData.use_provider_cost ? providerData.provider_cost_currency : undefined,
        max_context_window: model.max_context_window,
        tags: model.tags,
        default_max_tokens: model.default_max_tokens,
        default_temperature: model.default_temperature,
        default_thinking_budget: model.default_thinking_budget,
        model_group_id: model.model_group_id || model.id // 使用相同的分组ID
      };

      console.log('Creating new provider model record:', newModelData);

      const response = await fetch('/api/models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newModelData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '添加提供商失败');
      }

      console.log('✅ 新提供商添加成功');
      await onUpdate();
      await loadModelProviders(); // 刷新提供商列表
      setShowAddProvider(false);
    } catch (error) {
      console.error('❌ 添加提供商失败:', error);
      alert(`添加提供商失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 检查并修正优先级序列，确保从1开始连续
  const checkAndFixPrioritySequence = async (providers: Array<{
    id: string;
    provider_id: string;
    provider_name: string;
    api_model_name: string;
    priority: number;
    status: 'active' | 'inactive' | 'maintenance';
  }>) => {
    if (providers.length === 0) return;

    try {
      let needsUpdate = false;
      const updates: Array<{id: string, oldPriority: number, newPriority: number}> = [];
      
      // 🔧 分别处理活跃和非活跃提供商的优先级
      const activeProviders = providers.filter(p => p.status === 'active');
      const inactiveProviders = providers.filter(p => p.status !== 'active');
      
      if (activeProviders.length === 0) return;
      
      // 检查活跃提供商的优先级是否需要修正（应该从1开始连续）
      const sortedActiveProviders = [...activeProviders].sort((a, b) => a.priority - b.priority);
      
      // 为非活跃提供商分配不冲突的优先级（从活跃提供商的最大优先级+1开始）
      const maxActivePriority = sortedActiveProviders.length;
      const inactiveUpdates: Array<{id: string, oldPriority: number, newPriority: number}> = [];
      
      inactiveProviders.forEach((provider, index) => {
        const newPriority = maxActivePriority + index + 1;
        if (provider.priority !== newPriority) {
          inactiveUpdates.push({
            id: provider.id,
            oldPriority: provider.priority,
            newPriority: newPriority
          });
        }
      });
      
      // 检查活跃提供商优先级
      for (let i = 0; i < sortedActiveProviders.length; i++) {
        const provider = sortedActiveProviders[i];
        const expectedPriority = i + 1;
        
        if (provider.priority !== expectedPriority) {
          needsUpdate = true;
          updates.push({
            id: provider.id,
            oldPriority: provider.priority,
            newPriority: expectedPriority
          });
        }
      }
      
      // 将非活跃提供商的更新添加到总更新列表
      if (inactiveUpdates.length > 0) {
        needsUpdate = true;
        updates.push(...inactiveUpdates);
        console.log('🔧 需要更新非活跃提供商优先级:', inactiveUpdates);
      }
      
      // 如果需要更新，执行批量更新
      if (needsUpdate) {
        console.log('🔧 发现提供商优先级不连续，自动修正中...');
        
        for (const update of updates) {
          console.log(`🔄 更新提供商优先级: ${update.oldPriority} -> ${update.newPriority}`);
          
          const response = await fetch(`/api/models/${update.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: update.newPriority }),
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error(`❌ 更新优先级失败: ${update.id}`, {
              status: response.status,
              statusText: response.statusText,
              error: errorData
            });
          } else {
            const successData = await response.json();
            console.log(`✅ 优先级更新成功: ${update.id} -> ${update.newPriority}`);
          }
        }
        
        // 重新加载数据以反映更新
        console.log('✅ 优先级修正完成，重新加载数据...');
        await loadModelProviders();
      }
    } catch (error) {
      console.error('❌ 检查优先级序列失败:', error);
    }
  };

  // 重新排序提供商优先级，确保从1开始连续排列
  const reorderProviderPriorities = async () => {
    if (modelProviders.length === 0) return;

    try {
      // 按当前优先级排序，然后重新分配从1开始的连续优先级
      const sortedProviders = [...modelProviders].sort((a, b) => a.priority - b.priority);
      
      for (let i = 0; i < sortedProviders.length; i++) {
        const provider = sortedProviders[i];
        const newPriority = i + 1;
        
        // 只更新优先级发生变化的提供商
        if (provider.priority !== newPriority) {
          console.log(`🔄 更新 ${provider.provider_name} 的优先级: ${provider.priority} -> ${newPriority}`);
          
          const response = await fetch(`/api/models/${provider.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority: newPriority }),
          });
          
          if (!response.ok) {
            console.error(`❌ 更新 ${provider.provider_name} 优先级失败`);
          }
        }
      }
      
      // 重新加载数据以反映更新
      await loadModelProviders();
    } catch (error) {
      console.error('❌ 重新排序优先级失败:', error);
    }
  };

  // 🆕 修改为停用/启用功能，而不是删除
  const handleToggleProvider = async (providerId: string, currentStatus: string, providerName: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? '启用' : '停用';
    
    if (!confirm(`确定要${action}提供商"${providerName}"吗？`)) return;
    
    setLoading(true);
    setOperatingProvider(providerId);
    try {
      const response = await fetch(`/api/models/${providerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `${action}失败`);
      }

      console.log(`✅ 提供商${action}成功`);
      
      // 🆕 显示成功消息
      // alert(`✅ 提供商"${providerName}"已成功${action}`);
      
      // 🔧 修复：立即更新本地状态并重新排序优先级
      setModelProviders(prev => {
        const updated = prev.map(p =>
          p.id === providerId
            ? { ...p, status: newStatus as 'active' | 'inactive' | 'maintenance' }
            : p
        );

        // 🔧 重新排序：活跃提供商按优先级排序，非活跃提供商排在后面
        return updated.sort((a, b) => {
          if (a.status !== b.status) {
            if (a.status === 'active') return -1;
            if (b.status === 'active') return 1;
          }
          return a.priority - b.priority;
        });
      });

      // 🔧 重要：状态切换后需要重新调整活跃提供商的优先级
      const reorderAndRefresh = async () => {
        try {
          // 重新加载数据获取最新状态
          await loadModelProviders();

          // 获取当前活跃提供商
          const { data: latestModels } = await fetch(`/api/models?logical_name=${encodeURIComponent(logicalName)}`).then(r => r.json());
          const activeProviders = latestModels
            .filter((m: any) => m.status === 'active')
            .sort((a: any, b: any) => a.priority - b.priority);

          if (activeProviders.length > 0) {
            console.log(`🔧 重新排序 ${activeProviders.length} 个活跃提供商的优先级`);

            // 检查是否需要重新排序（如果不是连续的1,2,3...）
            const needsReorder = activeProviders.some((p: any, index: number) => p.priority !== index + 1);

            if (needsReorder) {
              // 使用现有的重排序函数
              await handleReorderProviders(activeProviders.map((p: any, index: number) => ({
                provider_id: p.id,
                provider_name: p.provider,
                api_model_name: p.api_model_name || p.name,
                priority: index + 1, // 重新分配连续优先级
                status: p.status
              })));

              // 重新排序后再次加载
              await loadModelProviders();
            }
          }

          // 通知父组件更新主列表
          await onUpdate();
        } catch (reorderError) {
          console.error('重新排序优先级失败:', reorderError);
          // 即使重新排序失败，也要重新加载数据
          await loadModelProviders();
          await onUpdate();
        }
      };

      // 异步执行重新排序，不阻塞UI响应
      reorderAndRefresh();
    } catch (error) {
      console.error(`${action}提供商失败:`, error);
      alert(`${action}失败: ${error instanceof Error ? error.message : '未知错误'}`);

      // 🔧 出错时恢复原状态
      setModelProviders(prev =>
        prev.map(p =>
          p.id === providerId
            ? { ...p, status: currentStatus as 'active' | 'inactive' | 'maintenance' }
            : p
        )
      );
    } finally {
      setLoading(false);
      setOperatingProvider(null);
    }
  };

  // 🆕 永久删除提供商（仅在没有评测结果时允许）
  const handlePermanentDelete = async (providerId: string, providerName: string) => {
    const confirmMsg = `警告：这将永久删除提供商"${providerName}"的所有数据！\n\n如果该提供商有评测结果，删除会失败。\n\n建议：首先尝试“停用”而不是删除。\n\n确定要继续删除吗？`;
    
    if (!confirm(confirmMsg)) return;
    
    setLoading(true);
    setOperatingProvider(providerId);
    try {
      const response = await fetch(`/api/models/${providerId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        // 🆕 更友好的错误消息
        if (errorData.error && errorData.error.includes('评测结果')) {
          alert(`无法删除：该提供商有评测结果。\n\n建议：使用“停用”功能代替删除。`);
        } else {
          throw new Error(errorData.error || '删除失败');
        }
        return;
      }

      console.log('✅ 提供商永久删除成功');
      
      // 🆕 显示成功消息
      // alert(`✅ 提供商"${providerName}"已成功删除`);
      
      // 🆕 立即从本地状态中移除，给用户即时反馈
      setModelProviders(prev => prev.filter(p => p.id !== providerId));
      
      // 然后重新加载数据确保一致性
      await loadModelProviders();
      await reorderProviderPriorities();
      await onUpdate();
    } catch (error) {
      console.error('永久删除提供商失败:', error);
      alert(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setLoading(false);
      setOperatingProvider(null);
    }
  };

  const handleEditModelName = (providerId: string, currentName: string) => {
    setEditingProvider(providerId);
    setEditingModelName(currentName);
  };

  const handleSaveModelName = async (providerId: string) => {
    setLoading(true);
    try {
      console.log(`💾 保存模型名称: ${providerId} -> "${editingModelName}"`);
      
      const response = await fetch(`/api/models/${providerId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_model_name: editingModelName
        }),
      });

      if (!response.ok) {
        throw new Error('更新失败');
      }

      const result = await response.json();
      console.log('✅ 模型名称保存成功:', result.message);

      // 🔧 先清除编辑状态
      setEditingProvider(null);
      setEditingModelName('');
      
      // 🔧 重新加载提供商列表以反映更改（不依赖本地状态更新）
      console.log('🔄 重新加载提供商列表...');
      await loadModelProviders();
      
      // 🔧 通知父组件更新
      await onUpdate();
    } catch (error) {
      console.error('保存模型名称失败:', error);
      alert('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingProvider(null);
    setEditingModelName('');
  };

  // 🆕 成本编辑相关函数
  const handleEditCost = (providerId: string, provider: any) => {
    setEditingCost(providerId);
    setEditingCostData({
      provider_input_cost_per_1k_tokens: provider.provider_input_cost_per_1k_tokens ? (provider.provider_input_cost_per_1k_tokens * 1000).toString() : '',
      provider_output_cost_per_1k_tokens: provider.provider_output_cost_per_1k_tokens ? (provider.provider_output_cost_per_1k_tokens * 1000).toString() : '',
      provider_cost_currency: provider.provider_cost_currency || 'USD'
    });
  };

  const handleSaveCost = async (providerId: string) => {
    setLoading(true);
    try {
      const costData: any = {};

      // 只有非空值才发送到API - 注意：UI显示的是每M tokens，需要转换为每1K tokens存储
      if (editingCostData.provider_input_cost_per_1k_tokens.trim()) {
        costData.provider_input_cost_per_1k_tokens = parseFloat(editingCostData.provider_input_cost_per_1k_tokens) / 1000;
      }
      if (editingCostData.provider_output_cost_per_1k_tokens.trim()) {
        costData.provider_output_cost_per_1k_tokens = parseFloat(editingCostData.provider_output_cost_per_1k_tokens) / 1000;
      }
      if (costData.provider_input_cost_per_1k_tokens !== undefined || costData.provider_output_cost_per_1k_tokens !== undefined) {
        costData.provider_cost_currency = editingCostData.provider_cost_currency;
      }

      console.log('💰 开始更新提供商成本...', { providerId, costData });

      // 🔧 乐观更新：立即更新本地状态
      const optimisticUpdate = modelProviders.map(provider =>
        provider.id === providerId
          ? {
              ...provider,
              provider_input_cost_per_1k_tokens: costData.provider_input_cost_per_1k_tokens,
              provider_output_cost_per_1k_tokens: costData.provider_output_cost_per_1k_tokens,
              provider_cost_currency: costData.provider_cost_currency
            }
          : provider
      );
      setModelProviders(optimisticUpdate);
      setEditingCost(null); // 立即关闭编辑状态

      // 🔧 标记刚完成成本更新，避免自动修正干扰
      setJustUpdatedCost(true);

      // API调用
      const response = await fetch(`/api/models/${providerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(costData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '更新成本失败');
      }

      const result = await response.json();
      console.log('✅ 提供商成本更新成功:', result);

      // 🔧 API成功后，用返回的数据更新状态（如果API返回了更新后的模型数据）
      if (result.model) {
        setModelProviders(prev => prev.map(provider =>
          provider.id === providerId
            ? {
                ...provider,
                provider_input_cost_per_1k_tokens: result.model.provider_input_cost_per_1k_tokens,
                provider_output_cost_per_1k_tokens: result.model.provider_output_cost_per_1k_tokens,
                provider_cost_currency: result.model.provider_cost_currency
              }
            : provider
        ));
      }

      // 通知父组件刷新（如果需要）
      await onUpdate();

    } catch (error) {
      console.error('❌ 更新提供商成本失败:', error);

      // 🔧 发生错误时回滚乐观更新
      console.log('🔄 回滚成本数据到服务器状态...');
      try {
        await loadModelProviders();
      } catch (rollbackError) {
        console.error('回滚失败:', rollbackError);
      }

      // 🔧 改进错误提示（不使用alert）
      console.error(`💰 成本更新失败: ${error instanceof Error ? error.message : '未知错误'}`);
      // 这里可以添加更好的错误提示UI，比如toast通知

    } finally {
      setLoading(false);
    }
  };

  const handleCancelCostEdit = () => {
    setEditingCost(null);
    setEditingCostData({
      provider_input_cost_per_1k_tokens: '',
      provider_output_cost_per_1k_tokens: '',
      provider_cost_currency: 'USD'
    });
  };

  const handleDragStart = (e: React.DragEvent, providerId: string) => {
    console.log('🚀 开始拖拽:', providerId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', providerId);
    setDraggedProvider(providerId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnd = () => {
    console.log('🏁 拖拽结束');
    setDraggedProvider(null);
  };

  const handleDrop = async (e: React.DragEvent, targetProviderId: string) => {
    e.preventDefault();
    console.log('📥 放置到:', targetProviderId);
    
    const draggedProviderId = draggedProvider || e.dataTransfer.getData('text/plain');
    
    if (!draggedProviderId || draggedProviderId === targetProviderId) {
      console.log('⚠️ 无效拖拽，取消操作');
      setDraggedProvider(null);
      return;
    }

    const draggedIndex = modelProviders.findIndex(p => p.id === draggedProviderId);
    const targetIndex = modelProviders.findIndex(p => p.id === targetProviderId);

    if (draggedIndex === -1 || targetIndex === -1) {
      console.log('❌ 找不到提供商索引:', { draggedIndex, targetIndex });
      return;
    }

    console.log('🔄 重新排序:', { from: draggedIndex, to: targetIndex });

    // 重新排列提供商列表
    const newProviders = [...modelProviders];
    const [draggedItem] = newProviders.splice(draggedIndex, 1);
    newProviders.splice(targetIndex, 0, draggedItem);

    // 更新优先级
    const updatedProviders = newProviders.map((provider, index) => ({
      ...provider,
      priority: index + 1
    }));

    setModelProviders(updatedProviders);
    setDraggedProvider(null);

    // 🔧 标记刚完成拖拽，避免自动修正干扰
    setJustFinishedDrag(true);

    // 批量更新优先级到数据库
    try {
      setLoading(true);
      console.log('🔄 开始批量更新优先级...');

      // 批量更新数据库
      const updateResults = await Promise.allSettled(
        updatedProviders.map(async (provider, index) => {
          console.log(`📝 更新提供商 ${provider.provider_name}: 优先级 ${provider.priority}`);
          const response = await fetch(`/api/models/${provider.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              priority: provider.priority
            }),
          });

          if (!response.ok) {
            throw new Error(`更新提供商 ${provider.provider_name} 失败: ${response.statusText}`);
          }

          return { providerId: provider.id, success: true };
        })
      );

      // 检查更新结果
      const failures = updateResults.filter(result => result.status === 'rejected');
      if (failures.length > 0) {
        console.error('❌ 部分更新失败:', failures);
        throw new Error(`${failures.length} 个提供商更新失败`);
      }

      console.log('✅ 所有提供商优先级更新成功');

      // 🔧 延迟触发父组件更新，避免立即覆盖拖拽结果
      setTimeout(() => {
        console.log('🔄 延迟触发父组件更新...');
        onUpdate();
      }, 300); // 给UI时间稳定显示拖拽结果

    } catch (error) {
      console.error('❌ 更新优先级失败:', error);
      // 回滚本地状态
      console.log('🔄 回滚到数据库状态...');
      loadModelProviders();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-screen overflow-y-auto">
        <h3 className="text-xl font-semibold mb-6">
          管理模型提供商: {model.logical_name || extractLogicalModelName(model.name)}
        </h3>
        
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-medium">当前提供商</h4>
            <button
              onClick={() => setShowAddProvider(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              <Plus className="w-4 h-4" />
              添加提供商
            </button>
          </div>
          
          <div className="space-y-3">
            {modelProviders.map((provider, index) => (
              <div
                key={provider.id}
                className={`border rounded-lg p-4 transition-all ${
                  draggedProvider === provider.id ? 'opacity-50 bg-blue-50' : 'opacity-100'
                }`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, provider.id)}
              >
                <div className="flex items-center gap-4">
                  {/* 拖拽手柄 */}
                  <div 
                    className="cursor-grab hover:cursor-grabbing text-gray-400 hover:text-gray-600"
                    draggable
                    onDragStart={(e) => handleDragStart(e, provider.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <GripVertical className="w-5 h-5" />
                  </div>
                  
                  {/* 优先级显示 */}
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-sm font-semibold">
                      {provider.priority}
                    </div>
                  </div>
                  
                  {/* 提供商信息 */}
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-2">
                      <h5 className="font-medium text-lg text-gray-900">{provider.provider_name}</h5>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        provider.status === 'active' ? 'bg-green-100 text-green-800' :
                        provider.status === 'inactive' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {provider.status === 'active' ? '启用' :
                         provider.status === 'inactive' ? '停用' : '维护中'}
                      </span>
                    </div>
                    
                    {/* 模型名称 - 可编辑 */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">模型名称：</span>
                      {editingProvider === provider.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingModelName}
                            onChange={(e) => setEditingModelName(e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm flex-1 min-w-0"
                            placeholder="输入模型名称"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveModelName(provider.id)}
                            className="text-green-600 hover:text-green-800 p-1"
                            title="保存"
                            disabled={loading}
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="text-gray-600 hover:text-gray-800 p-1"
                            title="取消"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-1">
                          <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono text-gray-800">
                            {provider.api_model_name}
                          </code>
                          <button
                            onClick={() => handleEditModelName(provider.id, provider.api_model_name)}
                            className="text-blue-600 hover:text-blue-800 p-1"
                            title="编辑模型名称"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* 🆕 成本信息显示 */}
                    <div className="mt-2">
                      {editingCost === provider.id ? (
                        /* 成本编辑表单 */
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-16">输入成本:</span>
                            <input
                              type="number"
                              step="0.000001"
                              value={editingCostData.provider_input_cost_per_1k_tokens}
                              onChange={(e) => setEditingCostData(prev => ({
                                ...prev,
                                provider_input_cost_per_1k_tokens: e.target.value
                              }))}
                              className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-0"
                              placeholder="2.00"
                            />
                            <span className="text-xs text-gray-500">/M tokens</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-16">输出成本:</span>
                            <input
                              type="number"
                              step="0.000001"
                              value={editingCostData.provider_output_cost_per_1k_tokens}
                              onChange={(e) => setEditingCostData(prev => ({
                                ...prev,
                                provider_output_cost_per_1k_tokens: e.target.value
                              }))}
                              className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-0"
                              placeholder="6.00"
                            />
                            <span className="text-xs text-gray-500">/M tokens</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-16">货币:</span>
                            <select
                              value={editingCostData.provider_cost_currency}
                              onChange={(e) => setEditingCostData(prev => ({
                                ...prev,
                                provider_cost_currency: e.target.value as 'USD' | 'CNY'
                              }))}
                              className="px-2 py-1 border border-gray-300 rounded text-xs flex-1 min-w-0"
                            >
                              <option value="USD">USD</option>
                              <option value="CNY">CNY</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveCost(provider.id)}
                              className="text-green-600 hover:text-green-800 p-1"
                              title="保存成本"
                              disabled={loading}
                            >
                              <Save className="w-3 h-3" />
                            </button>
                            <button
                              onClick={handleCancelCostEdit}
                              className="text-gray-600 hover:text-gray-800 p-1"
                              title="取消"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* 成本显示 */
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-600">成本:</span>
                          {provider.provider_input_cost_per_1k_tokens !== undefined || provider.provider_output_cost_per_1k_tokens !== undefined ? (
                            <div className="flex items-center gap-1">
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                                输入: {provider.provider_input_cost_per_1k_tokens ? (provider.provider_input_cost_per_1k_tokens * 1000).toFixed(3) : 'N/A'} {provider.provider_cost_currency || 'USD'}/M
                              </span>
                              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                输出: {provider.provider_output_cost_per_1k_tokens ? (provider.provider_output_cost_per_1k_tokens * 1000).toFixed(3) : 'N/A'} {provider.provider_cost_currency || 'USD'}/M
                              </span>
                            </div>
                          ) : provider.input_cost_per_1k_tokens !== undefined || provider.output_cost_per_1k_tokens !== undefined ? (
                            <div className="flex items-center gap-1">
                              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">
                                使用基础成本: 输入 {provider.input_cost_per_1k_tokens ? (provider.input_cost_per_1k_tokens * 1000).toFixed(3) : 'N/A'}, 输出 {provider.output_cost_per_1k_tokens ? (provider.output_cost_per_1k_tokens * 1000).toFixed(3) : 'N/A'} {provider.cost_currency || 'USD'}/M
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">未配置</span>
                          )}
                          <button
                            onClick={() => handleEditCost(provider.id, provider)}
                            className="text-blue-600 hover:text-blue-800 p-1"
                            title="编辑成本"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* 操作按钮 */}
                  <div className="flex gap-2">
                    {/* 🆕 停用/启用按钮 */}
                    <button
                      onClick={() => handleToggleProvider(provider.id, provider.status, provider.provider_name)}
                      disabled={operatingProvider === provider.id || loading}
                      className={`p-2 ${
                        operatingProvider === provider.id 
                          ? 'text-gray-400 cursor-not-allowed'
                          : provider.status === 'active' 
                            ? 'text-orange-600 hover:text-orange-900' 
                            : 'text-green-600 hover:text-green-900'
                      }`}
                      title={operatingProvider === provider.id 
                        ? '正在处理...' 
                        : provider.status === 'active' ? '停用提供商' : '启用提供商'
                      }
                    >
                      {operatingProvider === provider.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : provider.status === 'active' ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                    </button>
                    
                    {/* 🆕 真正的删除按钮（仅在没有评测结果时显示） */}
                    {modelProviders.length > 1 && (
                      <button
                        onClick={() => handlePermanentDelete(provider.id, provider.provider_name)}
                        disabled={operatingProvider === provider.id || loading}
                        className={`p-2 ${
                          operatingProvider === provider.id 
                            ? 'text-gray-400 cursor-not-allowed' 
                            : 'text-red-600 hover:text-red-900'
                        }`}
                        title={operatingProvider === provider.id 
                          ? '正在处理...' 
                          : '永久删除提供商数据（不可恢复）'
                        }
                      >
                        {operatingProvider === provider.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {showAddProvider && (
          <div className="border-t pt-6 mb-6">
            <h4 className="text-lg font-medium mb-4">添加新提供商</h4>
            <AddProviderForm
              availableProviders={providers}
              onSubmit={handleAddProvider}
              onCancel={() => setShowAddProvider(false)}
              loading={loading}
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

// 添加提供商表单组件
interface AddProviderData {
  provider_id: string;
  provider_name: string;
  api_model_name: string;
  status: 'active' | 'inactive' | 'maintenance';
  // 🆕 Phase 3: 提供商级别成本配置
  provider_input_cost_per_1k_tokens?: number;
  provider_output_cost_per_1k_tokens?: number;
  provider_cost_currency?: 'USD' | 'CNY';
  use_provider_cost?: boolean; // 是否使用提供商特定成本
}

interface AddProviderFormProps {
  availableProviders: ApiProvider[];
  onSubmit: (data: AddProviderData) => void;
  onCancel: () => void;
  loading: boolean;
}

function AddProviderForm({ availableProviders, onSubmit, onCancel, loading }: AddProviderFormProps) {
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [apiModelName, setApiModelName] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'maintenance'>('active');
  // 🆕 Phase 3: 提供商成本配置状态
  const [useProviderCost, setUseProviderCost] = useState(false);
  const [providerInputCost, setProviderInputCost] = useState<string>('');
  const [providerOutputCost, setProviderOutputCost] = useState<string>('');
  const [providerCostCurrency, setProviderCostCurrency] = useState<'USD' | 'CNY'>('USD');

  const selectedProvider = availableProviders.find(p => p.id === selectedProviderId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider || !apiModelName.trim()) return;

    const submitData: AddProviderData = {
      provider_id: selectedProvider.id,
      provider_name: selectedProvider.name,
      api_model_name: apiModelName.trim(),
      status: status
    };

    // 🆕 Phase 3: 添加提供商成本配置
    if (useProviderCost) {
      submitData.use_provider_cost = true;
      submitData.provider_input_cost_per_1k_tokens = providerInputCost ? parseFloat(providerInputCost) / 1000 : undefined;
      submitData.provider_output_cost_per_1k_tokens = providerOutputCost ? parseFloat(providerOutputCost) / 1000 : undefined;
      submitData.provider_cost_currency = providerCostCurrency;
    }

    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            选择提供商 *
          </label>
          <select
            value={selectedProviderId}
            onChange={(e) => setSelectedProviderId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="">请选择提供商</option>
            {availableProviders.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.name} {provider.is_builtin ? '(内置)' : '(自定义)'}
              </option>
            ))}
          </select>
        </div>

        {selectedProviderId && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              该提供商的API模型名称 *
              <span className="text-xs text-gray-500 ml-1">
                (提供商实际调用时使用的模型名)
              </span>
            </label>
            <input
              type="text"
              value={apiModelName}
              onChange={(e) => setApiModelName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="例如: gpt-4o, openai/gpt-4o, deepseek-ai/deepseek-chat"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              不同提供商对同一模型可能使用不同的API调用名称
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            在此模型下的状态
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="active">启用</option>
            <option value="inactive">停用</option>
            <option value="maintenance">维护中</option>
          </select>
        </div>
      </div>

      {/* 🆕 Phase 3: 提供商成本配置部分 */}
      <div className="border rounded-lg p-4 bg-blue-50">
        <div className="flex items-center justify-between mb-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useProviderCost}
              onChange={(e) => setUseProviderCost(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm font-medium text-gray-700">为此提供商设置专属成本</span>
          </label>
          <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
            可选配置
          </span>
        </div>

        {useProviderCost && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  输入成本 (每M tokens)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={providerInputCost}
                  onChange={(e) => setProviderInputCost(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="2.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  输出成本 (每M tokens)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={providerOutputCost}
                  onChange={(e) => setProviderOutputCost(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  placeholder="6.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  成本货币单位
                </label>
                <select
                  value={providerCostCurrency}
                  onChange={(e) => setProviderCostCurrency(e.target.value as 'USD' | 'CNY')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="USD">美元 (USD)</option>
                  <option value="CNY">人民币 (CNY)</option>
                </select>
              </div>
            </div>
            <div className="bg-yellow-50 p-3 rounded-md">
              <p className="text-xs text-yellow-700">
                💡 <strong>提示：</strong>如果不设置提供商专属成本，系统将使用模型的默认成本配置。
                设置后将优先使用此提供商的成本进行计算。
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedProvider && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h5 className="font-medium mb-2">将添加的提供商</h5>
          <div className="text-sm text-gray-600">
            <span className="font-medium">{selectedProvider.name}</span>
            <span className="ml-2 text-xs text-gray-500">
              ({selectedProvider.is_builtin ? '内置' : '自定义'}提供商)
            </span>
          </div>
          <div className="mt-2 p-2 bg-blue-50 rounded text-xs text-blue-700">
            💡 提供商的具体配置请前往【设置 {'>'}  API提供商】页面管理
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={loading || !selectedProvider || !apiModelName.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '添加中...' : '添加提供商'}
        </button>
      </div>
    </form>
  );
}