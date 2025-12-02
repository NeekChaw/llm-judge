'use client';

/**
 * 统一 API 管理界面 v2
 *
 * 一站式管理：查看提供商、添加密钥、创建自定义提供商
 * 卡片式布局，简洁直观
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  ExternalLink,
  Key,
  Settings,
  Search,
  Clock,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ProviderInfo {
  name: string;
  display_name: string;
  base_url: string;
  auth_type: string;
  env_key_name: string;
  description?: string;
  website?: string;
  default_model?: string;

  // 配置状态
  id?: string;
  configured_in_env: boolean;
  configured_in_db: boolean;
  configuration_status: 'env' | 'database' | 'not_configured';
  has_api_key: boolean;
  api_keys_count: number;
  active_keys?: Array<{
    id: string;
    key_name: string;
    status: string;
    usage_percentage: number | null;
    last_used_at: string | null;
    expires_at: string | null;
  }>;
}

interface KeyFormData {
  provider_name: string;
  api_key_value: string;
  key_name: string;
  notes: string;
}

interface ProviderFormData {
  name: string;
  display_name: string;
  base_url: string;
  auth_type: 'bearer' | 'custom';
  description: string;
  // 同时添加密钥
  add_key: boolean;
  key_name: string;
  api_key_value: string;
}

type FilterType = 'all' | 'configured' | 'not_configured';

export default function APIManagementPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  // 展开的提供商卡片
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

  // 添加密钥对话框
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
  const [showKeyValue, setShowKeyValue] = useState(false);
  const [keyFormData, setKeyFormData] = useState<KeyFormData>({
    provider_name: '',
    api_key_value: '',
    key_name: '',
    notes: ''
  });

  // 新建/编辑提供商对话框
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderInfo | null>(null);
  const [showProviderKeyValue, setShowProviderKeyValue] = useState(false);
  const [providerFormData, setProviderFormData] = useState<ProviderFormData>({
    name: '',
    display_name: '',
    base_url: '',
    auth_type: 'bearer',
    description: '',
    add_key: true,
    key_name: '',
    api_key_value: ''
  });

  // 加载提供商列表
  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/api-management');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.success) {
        setProviders(result.data || []);
      } else {
        setError(result.error || '加载提供商列表失败');
      }
    } catch (err) {
      console.error('加载提供商失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  // 搜索过滤
  const filteredProviders = useMemo(() => {
    let result = providers;

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.display_name.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.active_keys?.some(k => k.key_name.toLowerCase().includes(query))
      );
    }

    // 状态过滤
    if (filter === 'configured') {
      result = result.filter(p => p.configuration_status !== 'not_configured');
    } else if (filter === 'not_configured') {
      result = result.filter(p => p.configuration_status === 'not_configured');
    }

    return result;
  }, [providers, searchQuery, filter]);

  // 去重：优先保留有 env_key_name 的提供商
  const deduplicatedProviders = useMemo(() => {
    const seen = new Map<string, ProviderInfo>();

    const sorted = [...filteredProviders].sort((a, b) => {
      const aHasEnv = !!a.env_key_name;
      const bHasEnv = !!b.env_key_name;
      if (aHasEnv && !bHasEnv) return -1;
      if (!aHasEnv && bHasEnv) return 1;
      return 0;
    });

    for (const provider of sorted) {
      const baseUrl = provider.base_url.toLowerCase().replace(/\/+$/, '');
      if (!seen.has(baseUrl)) {
        seen.set(baseUrl, provider);
      }
    }

    return Array.from(seen.values()).sort((a, b) =>
      a.display_name.localeCompare(b.display_name)
    );
  }, [filteredProviders]);

  // 打开添加密钥对话框
  const openAddKeyDialog = (provider: ProviderInfo) => {
    setSelectedProvider(provider);
    setKeyFormData({
      provider_name: provider.name,
      api_key_value: '',
      key_name: '',
      notes: ''
    });
    setError(null);
    setSuccess(null);
    setShowKeyValue(false);
    setKeyDialogOpen(true);
  };

  // 打开新建提供商对话框
  const openNewProviderDialog = () => {
    setEditingProvider(null);
    setProviderFormData({
      name: '',
      display_name: '',
      base_url: '',
      auth_type: 'bearer',
      description: '',
      add_key: true,
      key_name: '',
      api_key_value: ''
    });
    setError(null);
    setSuccess(null);
    setShowProviderKeyValue(false);
    setProviderDialogOpen(true);
  };

  // 打开编辑提供商对话框
  const openEditProviderDialog = (provider: ProviderInfo) => {
    setEditingProvider(provider);
    setProviderFormData({
      name: provider.name,
      display_name: provider.display_name,
      base_url: provider.base_url,
      auth_type: provider.auth_type as 'bearer' | 'custom',
      description: provider.description || '',
      add_key: false,
      key_name: '',
      api_key_value: ''
    });
    setError(null);
    setSuccess(null);
    setShowProviderKeyValue(false);
    setProviderDialogOpen(true);
  };

  // 提交添加密钥
  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!keyFormData.api_key_value || keyFormData.api_key_value.length < 8) {
      setError('请输入有效的 API 密钥（至少8个字符）');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch('/api/api-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_name: keyFormData.provider_name,
          use_default_config: true,
          api_key: {
            key_value: keyFormData.api_key_value,
            key_name: keyFormData.key_name || `${keyFormData.provider_name}_key`,
            notes: keyFormData.notes || undefined
          }
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('API 密钥添加成功！');
        setKeyDialogOpen(false);
        loadProviders();
      } else {
        setError(result.error || '添加失败');
      }
    } catch (err) {
      console.error('提交失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setSubmitting(false);
    }
  };

  // 提交创建/编辑提供商
  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!providerFormData.name || !providerFormData.display_name || !providerFormData.base_url) {
      setError('请填写必填字段');
      return;
    }

    if (providerFormData.add_key && (!providerFormData.api_key_value || providerFormData.api_key_value.length < 8)) {
      setError('请输入有效的 API 密钥（至少8个字符）');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const requestBody: any = {
        provider_name: providerFormData.name,
        use_default_config: false,
        provider_config: {
          name: providerFormData.name,
          display_name: providerFormData.display_name,
          base_url: providerFormData.base_url,
          auth_type: providerFormData.auth_type,
          description: providerFormData.description || undefined
        }
      };

      if (providerFormData.add_key && providerFormData.api_key_value) {
        requestBody.api_key = {
          key_value: providerFormData.api_key_value,
          key_name: providerFormData.key_name || `${providerFormData.name}_key`
        };
      }

      const response = await fetch('/api/api-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(editingProvider ? '提供商更新成功！' : '提供商创建成功！');
        setProviderDialogOpen(false);
        loadProviders();
      } else {
        setError(result.error || '操作失败');
      }
    } catch (err) {
      console.error('提交失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setSubmitting(false);
    }
  };

  // 删除密钥
  const handleDeleteKey = async (keyId: string, keyName: string) => {
    if (!confirm(`确定要删除密钥 "${keyName}" 吗？此操作不可恢复。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/api-keys/${keyId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('密钥删除成功');
        loadProviders();
      } else {
        setError(result.error || '删除失败');
      }
    } catch (err) {
      console.error('删除失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
    }
  };

  // 切换卡片展开状态
  const toggleExpand = (providerName: string) => {
    setExpandedProviders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(providerName)) {
        newSet.delete(providerName);
      } else {
        newSet.add(providerName);
      }
      return newSet;
    });
  };

  // 格式化最后使用时间
  const formatLastUsed = (timestamp: string | null) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    return `${diffDays}天前`;
  };

  // 获取状态徽章
  const getStatusBadge = (provider: ProviderInfo) => {
    if (provider.configured_in_env) {
      return <Badge className="bg-green-500 text-white">环境变量</Badge>;
    }
    if (provider.has_api_key) {
      return <Badge className="bg-yellow-500 text-white">数据库</Badge>;
    }
    return <Badge variant="secondary">未配置</Badge>;
  };

  // 统计数字
  const configuredCount = deduplicatedProviders.filter(p => p.configuration_status !== 'not_configured').length;
  const unconfiguredCount = deduplicatedProviders.filter(p => p.configuration_status === 'not_configured').length;

  return (
    <div className="p-6">
      {/* 页面头部 */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">API 提供商管理</h1>
        <p className="text-gray-600">统一管理 LLM API 提供商和密钥</p>
      </div>

      {/* 搜索和新建按钮 */}
      <div className="flex gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="搜索提供商、密钥..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={openNewProviderDialog}>
          <Plus className="w-4 h-4 mr-2" />
          新建自定义提供商
        </Button>
      </div>

      {/* 筛选标签 */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          全部 ({deduplicatedProviders.length})
        </Button>
        <Button
          variant={filter === 'configured' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('configured')}
        >
          已配置 ({configuredCount})
        </Button>
        <Button
          variant={filter === 'not_configured' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('not_configured')}
        >
          未配置 ({unconfiguredCount})
        </Button>
      </div>

      {/* 成功/错误提示 */}
      {success && (
        <Alert className="bg-green-50 border-green-200 mb-4">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="bg-red-50 border-red-200 mb-4">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {/* 提供商表格列表 */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : deduplicatedProviders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {searchQuery ? '没有找到匹配的提供商' : '暂无提供商'}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">提供商</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">状态</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">API 端点</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deduplicatedProviders.map((provider) => {
                const isExpanded = expandedProviders.has(provider.name);
                const hasKeys = provider.active_keys && provider.active_keys.length > 0;

                return (
                  <React.Fragment key={provider.name}>
                    {/* 主行 */}
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {hasKeys && (
                            <button
                              onClick={() => toggleExpand(provider.name)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          <span className="font-medium">{provider.display_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(provider)}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-gray-600">{provider.base_url}</code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAddKeyDialog(provider)}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            添加密钥
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditProviderDialog(provider)}
                            title="编辑提供商"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {/* 展开的密钥列表 */}
                    {hasKeys && isExpanded && (
                      <tr>
                        <td colSpan={4} className="px-4 py-3 bg-gray-50">
                          <div className="space-y-2 pl-8">
                            <div className="text-sm font-medium text-gray-700 mb-2">
                              配置的密钥 ({provider.api_keys_count})
                            </div>
                            {provider.active_keys?.map((key) => (
                              <div
                                key={key.id}
                                className="flex items-center justify-between p-3 bg-white rounded border"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <Key className="w-4 h-4 text-gray-400" />
                                    <span className="font-medium text-sm">{key.key_name}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {provider.configured_in_env ? '环境变量' : '数据库'}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 ml-6">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      最后使用: {formatLastUsed(key.last_used_at)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {!provider.configured_in_env && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteKey(key.id, key.key_name)}
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 添加密钥对话框 */}
      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加 API 密钥 - {selectedProvider?.display_name}</DialogTitle>
            <DialogDescription>
              为 {selectedProvider?.display_name} 添加新的 API 密钥
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddKey} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key_name">密钥名称 *</Label>
              <Input
                id="key_name"
                type="text"
                placeholder={`${keyFormData.provider_name || 'provider'}_key`}
                value={keyFormData.key_name}
                onChange={(e) => setKeyFormData({ ...keyFormData, key_name: e.target.value })}
              />
              <p className="text-xs text-gray-500">用于区分不同用途的密钥</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api_key">API 密钥 *</Label>
              <div className="relative">
                <Input
                  id="api_key"
                  type={showKeyValue ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={keyFormData.api_key_value}
                  onChange={(e) => setKeyFormData({ ...keyFormData, api_key_value: e.target.value })}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKeyValue(!showKeyValue)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKeyValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">密钥将使用 AES-256-GCM 加密后安全存储</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">备注 (可选)</Label>
              <Input
                id="notes"
                type="text"
                placeholder="例如：生产环境主密钥"
                value={keyFormData.notes}
                onChange={(e) => setKeyFormData({ ...keyFormData, notes: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setKeyDialogOpen(false)}
                disabled={submitting}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '添加中...' : '添加密钥'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 新建/编辑提供商对话框 */}
      <Dialog open={providerDialogOpen} onOpenChange={setProviderDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? '编辑提供商' : '新建自定义提供商'}
            </DialogTitle>
            <DialogDescription>
              {editingProvider ? '修改提供商配置' : '添加一个新的 API 提供商'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProvider} className="space-y-3">
            {/* 第一行：名称 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="provider_name" className="text-xs">提供商标识 *</Label>
                <Input
                  id="provider_name"
                  type="text"
                  placeholder="my-custom-llm"
                  value={providerFormData.name}
                  onChange={(e) => setProviderFormData({ ...providerFormData, name: e.target.value })}
                  required
                  disabled={!!editingProvider}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="display_name" className="text-xs">显示名称 *</Label>
                <Input
                  id="display_name"
                  type="text"
                  placeholder="我的自定义 LLM"
                  value={providerFormData.display_name}
                  onChange={(e) => setProviderFormData({ ...providerFormData, display_name: e.target.value })}
                  required
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* 第二行：URL + 认证 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="base_url" className="text-xs">API 端点 *</Label>
                <Input
                  id="base_url"
                  type="url"
                  placeholder="https://my-api.com/v1"
                  value={providerFormData.base_url}
                  onChange={(e) => setProviderFormData({ ...providerFormData, base_url: e.target.value })}
                  required
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">认证方式</Label>
                <div className="flex gap-3 h-8 items-center">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="auth_type"
                      value="bearer"
                      checked={providerFormData.auth_type === 'bearer'}
                      onChange={() => setProviderFormData({ ...providerFormData, auth_type: 'bearer' })}
                      className="w-3 h-3"
                    />
                    <span className="text-xs">Bearer</span>
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="auth_type"
                      value="custom"
                      checked={providerFormData.auth_type === 'custom'}
                      onChange={() => setProviderFormData({ ...providerFormData, auth_type: 'custom' })}
                      className="w-3 h-3"
                    />
                    <span className="text-xs">Custom</span>
                  </label>
                </div>
              </div>
            </div>

            {/* 同时添加密钥 */}
            {!editingProvider && (
              <div className="border-t pt-3">
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={providerFormData.add_key}
                    onChange={(e) => setProviderFormData({ ...providerFormData, add_key: e.target.checked })}
                    className="w-3 h-3"
                  />
                  <span className="text-xs font-medium">创建后立即添加密钥</span>
                </label>

                {providerFormData.add_key && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="provider_key_name" className="text-xs">密钥名称</Label>
                      <Input
                        id="provider_key_name"
                        type="text"
                        placeholder="main_key"
                        value={providerFormData.key_name}
                        onChange={(e) => setProviderFormData({ ...providerFormData, key_name: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label htmlFor="provider_api_key" className="text-xs">密钥内容</Label>
                      <div className="relative">
                        <Input
                          id="provider_api_key"
                          type={showProviderKeyValue ? 'text' : 'password'}
                          placeholder="sk-..."
                          value={providerFormData.api_key_value}
                          onChange={(e) => setProviderFormData({ ...providerFormData, api_key_value: e.target.value })}
                          className="pr-8 h-8 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowProviderKeyValue(!showProviderKeyValue)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showProviderKeyValue ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setProviderDialogOpen(false)}
                disabled={submitting}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
