'use client';

import { useState, useEffect } from 'react';
import { Plus, Settings, TestTube, Trash2, Eye, EyeOff, RefreshCw, ArrowLeft, Shield } from 'lucide-react';
import { apiClient, ApiProvider } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

interface ProviderFormData {
  name: string;
  display_name: string;
  base_url: string;
  api_key_env_var: string;
  auth_type: string;
  description: string;
  rate_limit_rpm: number;
  timeout_ms: number;
}

export default function ProvidersPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ApiProvider | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [formData, setFormData] = useState<ProviderFormData>({
    name: '',
    display_name: '',
    base_url: '',
    api_key_env_var: '',
    auth_type: 'bearer',
    description: '',
    rate_limit_rpm: 60,
    timeout_ms: 30000
  });

  // 加载提供商列表
  const loadProviders = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getProviders();
      if (response.data) {
        setProviders(response.data.providers);
      }
    } catch (error) {
      console.error('加载提供商失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  // 表单处理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingProvider) {
        const response = await apiClient.updateProvider(editingProvider.id, formData);
        if (response.data) {
          alert('提供商更新成功！');
        }
      } else {
        const response = await apiClient.createProvider(formData);
        if (response.data) {
          alert('提供商创建成功！');
        }
      }
      
      setShowModal(false);
      setEditingProvider(null);
      resetForm();
      loadProviders();
    } catch (error: any) {
      alert(`操作失败: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      display_name: '',
      base_url: '',
      api_key_env_var: '',
      auth_type: 'bearer',
      description: '',
      rate_limit_rpm: 60,
      timeout_ms: 30000
    });
  };

  // 编辑提供商
  const handleEdit = (provider: ApiProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      display_name: provider.display_name,
      base_url: provider.base_url,
      api_key_env_var: provider.api_key_env_var || '',
      auth_type: provider.auth_type || 'bearer',
      description: provider.description || '',
      rate_limit_rpm: provider.rate_limit_rpm || 60,
      timeout_ms: provider.timeout_ms || 30000
    });
    setShowModal(true);
  };

  // 删除提供商
  const handleDelete = async (provider: ApiProvider) => {
    if (!confirm(`确定要删除提供商 "${provider.display_name}" 吗？`)) {
      return;
    }

    try {
      await apiClient.deleteProvider(provider.id);
      alert('提供商删除成功！');
      loadProviders();
    } catch (error: any) {
      alert(`删除失败: ${error.message}`);
    }
  };

  // 测试连接
  const handleTest = async (provider: ApiProvider) => {
    try {
      setTestResults(prev => ({ ...prev, [provider.id]: { testing: true } }));
      
      const response = await apiClient.testProvider(provider.id);
      setTestResults(prev => ({ 
        ...prev, 
        [provider.id]: response.data || response.error 
      }));
    } catch (error: any) {
      setTestResults(prev => ({ 
        ...prev, 
        [provider.id]: { success: false, error: error.message } 
      }));
    }
  };

  // 切换状态
  const handleToggleStatus = async (provider: ApiProvider) => {
    try {
      const newStatus = provider.status === 'active' ? 'disabled' : 'active';
      await apiClient.updateProvider(provider.id, { status: newStatus });
      loadProviders();
    } catch (error: any) {
      alert(`状态更新失败: ${error.message}`);
    }
  };

  const getStatusBadge = (status?: string) => {
    const isActive = status === 'active';
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
      }`}>
        {isActive ? '启用' : '禁用'}
      </span>
    );
  };

  const getTestResultBadge = (result: any) => {
    if (!result) return null;
    if (result.testing) {
      return <span className="text-blue-600 text-sm">测试中...</span>;
    }
    
    return (
      <span className={`text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
        {result.success ? '✅ 连接正常' : `❌ ${result.error || '连接失败'}`}
      </span>
    );
  };

  return (
    <div className="space-y-6">
        {/* 专家模式提示 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-yellow-600" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-yellow-900">专家模式</span>
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                    高级配置
                  </Badge>
                </div>
                <p className="text-sm text-yellow-700 mt-1">
                  此页面提供详细的提供商配置选项。如需快速配置，请使用简化界面。
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/settings/api-management')}
              className="inline-flex items-center px-3 py-2 border border-yellow-300 rounded-md text-sm font-medium text-yellow-700 bg-white hover:bg-yellow-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回简化界面
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">API提供商管理</h1>
              <Badge variant="secondary" className="text-xs">专家模式</Badge>
            </div>
            <p className="mt-2 text-gray-600">管理AI模型API提供商配置和连接设置</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="mr-2 h-4 w-4" />
            添加提供商
          </button>
        </div>

        {/* 提供商列表 */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">提供商列表</h2>
          </div>
          
          {loading ? (
            <div className="p-6 text-center">
              <RefreshCw className="mx-auto h-8 w-8 animate-spin text-gray-400" />
              <p className="mt-2 text-gray-500">加载中...</p>
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      提供商
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      基础URL
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      连接测试
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {providers.map((provider) => (
                    <tr key={provider.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {provider.display_name}
                            {provider.is_builtin && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                内置
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{provider.name}</div>
                          {provider.description && (
                            <div className="text-xs text-gray-400 mt-1">{provider.description}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {provider.base_url}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(provider.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getTestResultBadge(testResults[provider.id])}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleTest(provider)}
                          disabled={testResults[provider.id]?.testing}
                          className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                          title="测试连接"
                        >
                          <TestTube className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(provider)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="编辑"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(provider)}
                          className="text-gray-600 hover:text-gray-900"
                          title={provider.status === 'active' ? '禁用' : '启用'}
                        >
                          {provider.status === 'active' ? 
                            <EyeOff className="h-4 w-4" /> : 
                            <Eye className="h-4 w-4" />
                          }
                        </button>
                        {!provider.is_builtin && (
                          <button
                            onClick={() => handleDelete(provider)}
                            className="text-red-600 hover:text-red-900"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {providers.length === 0 && (
                <div className="p-6 text-center">
                  <p className="text-gray-500">暂无提供商配置</p>
                </div>
              )}
            </div>
          )}
        </div>

      {/* 添加/编辑提供商模态框 */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 text-center">
                {editingProvider ? '编辑提供商' : '添加提供商'}
              </h3>
              
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">名称 *</label>
                  <input
                    type="text"
                    required
                    disabled={editingProvider?.is_builtin}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    placeholder="如: openai"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">显示名称 *</label>
                  <input
                    type="text"
                    required
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="如: OpenAI"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">基础URL *</label>
                  <input
                    type="url"
                    required
                    value={formData.base_url}
                    onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">API密钥环境变量</label>
                  <input
                    type="text"
                    value={formData.api_key_env_var}
                    onChange={(e) => setFormData({ ...formData, api_key_env_var: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="OPENAI_API_KEY"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">认证类型</label>
                  <select
                    value={formData.auth_type}
                    onChange={(e) => setFormData({ ...formData, auth_type: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="bearer">Bearer Token</option>
                    <option value="api_key">API Key</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">描述</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="提供商描述信息"
                  />
                </div>

                <div className="flex space-x-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">限流(RPM)</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.rate_limit_rpm}
                      onChange={(e) => setFormData({ ...formData, rate_limit_rpm: parseInt(e.target.value) })}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">超时(ms)</label>
                    <input
                      type="number"
                      min="1000"
                      value={formData.timeout_ms}
                      onChange={(e) => setFormData({ ...formData, timeout_ms: parseInt(e.target.value) })}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingProvider(null);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    {editingProvider ? '更新' : '创建'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}