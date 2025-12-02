'use client';

import { useState, useEffect } from 'react';
import { Plus, Key, Trash2, Edit, Eye, EyeOff, AlertCircle, CheckCircle, XCircle, Copy, Check, ArrowLeft, Shield } from 'lucide-react';
import type { MaskedAPIKey, CreateAPIKeyInput, UpdateAPIKeyInput } from '@/types/api-key';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

interface Provider {
  id: string;
  name: string;
  display_name: string;
}

export default function APIKeysPage() {
  const router = useRouter();
  const [apiKeys, setApiKeys] = useState<MaskedAPIKey[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<MaskedAPIKey | null>(null);
  const [showPlaintextKey, setShowPlaintextKey] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    provider_id: string;
    key_name: string;
    key_value: string;
    quota_limit: string;
    expires_at: string;
    notes: string;
  }>({
    provider_id: '',
    key_name: '',
    key_value: '',
    quota_limit: '',
    expires_at: '',
    notes: '',
  });

  // 加载API密钥列表
  const loadAPIKeys = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/api-keys');
      const result = await response.json();

      if (result.success && result.data) {
        setApiKeys(result.data);
      } else {
        console.error('加载API密钥失败:', result.error);
      }
    } catch (error) {
      console.error('加载API密钥失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载提供商列表
  const loadProviders = async () => {
    try {
      const response = await fetch('/api/providers');
      const result = await response.json();

      if (result.data?.providers) {
        setProviders(result.data.providers);
      }
    } catch (error) {
      console.error('加载提供商列表失败:', error);
    }
  };

  useEffect(() => {
    loadAPIKeys();
    loadProviders();
  }, []);

  // 表单提交处理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingKey) {
        // 更新现有密钥
        const updatePayload: UpdateAPIKeyInput = {
          key_name: formData.key_name,
          quota_limit: formData.quota_limit ? parseInt(formData.quota_limit) : null,
          expires_at: formData.expires_at || null,
          notes: formData.notes || null,
        };

        // 只有提供了新密钥值时才更新
        if (formData.key_value) {
          updatePayload.key_value = formData.key_value;
        }

        const response = await fetch(`/api/api-keys/${editingKey.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });

        const result = await response.json();

        if (result.success) {
          alert('API密钥更新成功！');
          setShowModal(false);
          setEditingKey(null);
          resetForm();
          loadAPIKeys();
        } else {
          alert(`更新失败: ${result.error}`);
        }
      } else {
        // 创建新密钥
        if (!formData.key_name || !formData.key_value) {
          alert('请填写密钥名称和密钥值');
          return;
        }

        const createPayload: CreateAPIKeyInput = {
          provider_id: formData.provider_id || null,
          key_name: formData.key_name,
          key_value: formData.key_value,
          quota_limit: formData.quota_limit ? parseInt(formData.quota_limit) : null,
          expires_at: formData.expires_at || null,
          notes: formData.notes || null,
        };

        const response = await fetch('/api/api-keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        });

        const result = await response.json();

        if (result.success && result.data) {
          // 显示明文密钥（仅此一次）
          setShowPlaintextKey(result.data.plaintext_key);

          // 3秒后自动关闭提示
          setTimeout(() => {
            setShowPlaintextKey(null);
            setShowModal(false);
            resetForm();
            loadAPIKeys();
          }, 10000); // 给用户10秒时间复制密钥
        } else {
          alert(`创建失败: ${result.error}`);
        }
      }
    } catch (error: any) {
      alert(`操作失败: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      provider_id: '',
      key_name: '',
      key_value: '',
      quota_limit: '',
      expires_at: '',
      notes: '',
    });
  };

  // 编辑密钥
  const handleEdit = (key: MaskedAPIKey) => {
    setEditingKey(key);
    setFormData({
      provider_id: key.provider_id || '',
      key_name: key.key_name,
      key_value: '', // 不预填密钥值
      quota_limit: key.quota_limit?.toString() || '',
      expires_at: key.expires_at || '',
      notes: key.notes || '',
    });
    setShowModal(true);
  };

  // 删除密钥
  const handleDelete = async (id: string, keyName: string) => {
    if (!confirm(`确定要删除密钥 "${keyName}" 吗？此操作不可恢复。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/api-keys/${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        alert('密钥删除成功');
        loadAPIKeys();
      } else {
        alert(`删除失败: ${result.error}`);
      }
    } catch (error: any) {
      alert(`删除失败: ${error.message}`);
    }
  };

  // 切换密钥状态
  const toggleStatus = async (key: MaskedAPIKey) => {
    const newStatus = key.status === 'active' ? 'disabled' : 'active';

    try {
      const response = await fetch(`/api/api-keys/${key.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await response.json();

      if (result.success) {
        loadAPIKeys();
      } else {
        alert(`状态更新失败: ${result.error}`);
      }
    } catch (error: any) {
      alert(`状态更新失败: ${error.message}`);
    }
  };

  // 复制到剪贴板
  const copyToClipboard = async (text: string, keyId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } catch (error) {
      alert('复制失败，请手动复制');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
        {/* 专家模式提示 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
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
                  此页面提供详细的密钥管理选项（配额、过期时间等）。如需快速配置，请使用简化界面。
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

        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Key className="w-8 h-8" />
              API密钥管理
              <Badge variant="secondary" className="text-xs">专家模式</Badge>
            </h1>
            <p className="text-gray-600 mt-2">
              集中管理所有LLM提供商的API密钥，采用AES-256-GCM加密存储
            </p>
          </div>
          <button
            onClick={() => {
              setEditingKey(null);
              resetForm();
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            添加密钥
          </button>
        </div>

        {/* 安全提示 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-semibold mb-1">安全提示</p>
            <ul className="list-disc list-inside space-y-1">
              <li>API密钥使用AES-256-GCM加密存储，仅在创建时显示明文一次</li>
              <li>密钥值在界面上将显示为脱敏格式（如：sk-1***cdef）</li>
              <li>请妥善保管密钥，删除后无法恢复</li>
            </ul>
          </div>
        </div>

        {/* API密钥列表 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600"></div>
            <p className="mt-4 text-gray-600">加载中...</p>
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Key className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">还没有添加任何API密钥</p>
            <button
              onClick={() => {
                setEditingKey(null);
                resetForm();
                setShowModal(true);
              }}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              立即添加第一个密钥 →
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* 密钥名称和状态 */}
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold">{key.key_name}</h3>
                      {key.status === 'active' ? (
                        <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                          <CheckCircle className="w-3 h-3" />
                          已启用
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                          <XCircle className="w-3 h-3" />
                          已禁用
                        </span>
                      )}
                    </div>

                    {/* 提供商信息 */}
                    {key.provider_name && (
                      <div className="text-sm text-gray-600 mb-2">
                        提供商: <span className="font-medium">{key.provider_name}</span>
                      </div>
                    )}

                    {/* 脱敏密钥值 */}
                    <div className="flex items-center gap-2 mb-3">
                      <code className="px-3 py-1 bg-gray-100 rounded font-mono text-sm">
                        {key.key_value_masked}
                      </code>
                      <button
                        onClick={() => copyToClipboard(key.key_value_masked, key.id)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="复制脱敏值"
                      >
                        {copiedKeyId === key.id ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-500" />
                        )}
                      </button>
                    </div>

                    {/* 使用统计 */}
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div>
                        使用次数: <span className="font-medium">{key.usage_count}</span>
                      </div>
                      {key.quota_limit && (
                        <div>
                          配额限制: <span className="font-medium">{key.quota_limit}</span>
                          {key.usage_percentage !== null && (
                            <span className={`ml-2 ${key.usage_percentage > 80 ? 'text-red-600' : 'text-green-600'}`}>
                              ({key.usage_percentage}%)
                            </span>
                          )}
                        </div>
                      )}
                      {key.last_used_at && (
                        <div>
                          最后使用: {new Date(key.last_used_at).toLocaleString('zh-CN')}
                        </div>
                      )}
                    </div>

                    {/* 备注 */}
                    {key.notes && (
                      <div className="mt-2 text-sm text-gray-600">
                        备注: {key.notes}
                      </div>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => toggleStatus(key)}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        key.status === 'active'
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                      title={key.status === 'active' ? '禁用密钥' : '启用密钥'}
                    >
                      {key.status === 'active' ? '禁用' : '启用'}
                    </button>
                    <button
                      onClick={() => handleEdit(key)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      title="编辑"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(key.id, key.key_name)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 添加/编辑密钥模态框 */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-6">
                  {editingKey ? '编辑API密钥' : '添加API密钥'}
                </h2>

                {/* 新密钥创建成功提示 */}
                {showPlaintextKey && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-green-800 mb-2">密钥创建成功！</p>
                        <p className="text-sm text-green-700 mb-3">
                          这是您的API密钥明文，请立即复制保存。此密钥将不会再次显示：
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 bg-white border border-green-300 rounded font-mono text-sm break-all">
                            {showPlaintextKey}
                          </code>
                          <button
                            onClick={() => copyToClipboard(showPlaintextKey, 'plaintext')}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
                          >
                            {copiedKeyId === 'plaintext' ? (
                              <>
                                <Check className="w-4 h-4" />
                                已复制
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                复制
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-green-600 mt-2">
                          窗口将在10秒后自动关闭
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* 提供商选择 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      关联提供商（可选）
                    </label>
                    <select
                      value={formData.provider_id}
                      onChange={(e) => setFormData({ ...formData, provider_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- 不关联提供商 --</option>
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.display_name || provider.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 密钥名称 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      密钥名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.key_name}
                      onChange={(e) => setFormData({ ...formData, key_name: e.target.value })}
                      placeholder="例如：OpenAI Production Key"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  {/* 密钥值 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      API密钥值 {!editingKey && <span className="text-red-500">*</span>}
                      {editingKey && <span className="text-gray-500 text-xs">（留空则不修改）</span>}
                    </label>
                    <input
                      type="password"
                      value={formData.key_value}
                      onChange={(e) => setFormData({ ...formData, key_value: e.target.value })}
                      placeholder={editingKey ? "如需更换密钥，请输入新密钥值" : "sk-..."}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required={!editingKey}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      密钥将使用AES-256-GCM加密存储
                    </p>
                  </div>

                  {/* 配额限制 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      配额限制（可选）
                    </label>
                    <input
                      type="number"
                      value={formData.quota_limit}
                      onChange={(e) => setFormData({ ...formData, quota_limit: e.target.value })}
                      placeholder="例如：1000（次）"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="1"
                    />
                  </div>

                  {/* 过期时间 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      过期时间（可选）
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.expires_at}
                      onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* 备注 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      备注（可选）
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="记录密钥用途、限制等信息"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* 按钮 */}
                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        setEditingKey(null);
                        setShowPlaintextKey(null);
                        resetForm();
                      }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      {showPlaintextKey ? '关闭' : '取消'}
                    </button>
                    {!showPlaintextKey && (
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        {editingKey ? '更新密钥' : '创建密钥'}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
