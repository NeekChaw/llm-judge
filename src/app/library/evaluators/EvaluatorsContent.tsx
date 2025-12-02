'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, Eye } from 'lucide-react';
import { BaseEvaluator, EvaluatorType, EvaluatorFormData } from '@/types/evaluator';
import { EvaluatorConfigValidator } from '@/lib/evaluator-validator';
import EvaluatorForm from '@/components/EvaluatorForm';
import { EvaluatorsPageSkeleton } from '@/components/ui/skeleton';
import { usePageLoadComplete } from '@/components/layout/page-loading';

interface EvaluatorListResponse {
  evaluators: BaseEvaluator[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

const EVALUATOR_TYPE_LABELS: Record<EvaluatorType, string> = {
  'PROMPT': 'AI提示词',
  'REGEX': '正则表达式',
  'CODE': '代码执行',
  'HUMAN': '人工评估'
};

const EVALUATOR_TYPE_COLORS: Record<EvaluatorType, string> = {
  'PROMPT': 'bg-blue-100 text-blue-800',
  'REGEX': 'bg-green-100 text-green-800',
  'CODE': 'bg-purple-100 text-purple-800',
  'HUMAN': 'bg-orange-100 text-orange-800'
};

export default function EvaluatorsContent() {
  // 🚀 立即清除全局loading状态
  usePageLoadComplete();

  const [evaluators, setEvaluators] = useState<BaseEvaluator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<EvaluatorType | ''>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingEvaluator, setEditingEvaluator] = useState<BaseEvaluator | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewingEvaluator, setViewingEvaluator] = useState<BaseEvaluator | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    has_more: false
  });

  // 加载评分器列表
  const loadEvaluators = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString()
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (typeFilter) params.append('type', typeFilter);

      const response = await fetch(`/api/evaluators?${params}`);
      if (!response.ok) {
        throw new Error('加载评分器列表失败');
      }

      const data: EvaluatorListResponse = await response.json();
      setEvaluators(data.evaluators);
      setPagination(data.pagination);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除评分器
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个评分器吗？')) return;

    try {
      const response = await fetch(`/api/evaluators/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除失败');
      }

      await loadEvaluators();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  // 保存评分器（创建或更新）
  const handleSave = async (data: EvaluatorFormData) => {
    setSaving(true);
    try {
      const url = editingEvaluator 
        ? `/api/evaluators/${editingEvaluator.id}`
        : '/api/evaluators';
      
      const method = editingEvaluator ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.validation_errors) {
          throw new Error(`验证失败: ${error.validation_errors.map((e: any) => e.message).join(', ')}`);
        }
        throw new Error(error.error || '保存失败');
      }

      // 重新加载列表
      await loadEvaluators();
      
      // 如果是编辑模式，获取最新数据并更新editingEvaluator状态
      if (editingEvaluator) {
        try {
          const updatedResponse = await fetch(`/api/evaluators/${editingEvaluator.id}`);
          if (updatedResponse.ok) {
            const updatedData = await updatedResponse.json();
            setEditingEvaluator(updatedData.evaluator); // 更新为最新数据
            console.log('✅ 评分器数据已更新到最新版本');
          }
        } catch (error) {
          console.warn('⚠️ 获取最新评分器数据失败，但保存成功:', error);
        }
      }
      
      // 关闭表单
      setShowCreateForm(false);
      if (!editingEvaluator) { 
        setEditingEvaluator(null); // 只有创建模式才清空
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
      throw err; // 重新抛出错误，让表单知道保存失败
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadEvaluators();
  }, [searchTerm, typeFilter, pagination.offset]);

  // 移除这个完整的loading检查，改为内联显示

  return (
    <div className="p-6">
      {/* 页面头部 */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">评分器管理</h1>
            <p className="text-gray-600">管理AI评测系统的评分器配置</p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建评分器
          </button>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex gap-4 bg-white p-4 rounded-lg border mb-6">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="搜索评分器名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={loading}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as EvaluatorType | '')}
          disabled={loading}
          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
        >
          <option value="">所有类型</option>
          {Object.entries(EVALUATOR_TYPE_LABELS).map(([type, label]) => (
            <option key={type} value={type}>{label}</option>
          ))}
        </select>
      </div>

      {/* 🎯 动态内容区域 - 根据状态显示不同内容 */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-700">错误: {error}</div>
          <button
            onClick={loadEvaluators}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            重新加载
          </button>
        </div>
      ) : loading ? (
        /* 只对数据内容显示骨架动画 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border p-6 animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 w-6 bg-gray-200 rounded-full shimmer"></div>
                <div className="h-8 w-20 bg-gray-200 rounded-full shimmer"></div>
              </div>
              <div className="h-6 w-3/4 bg-gray-200 rounded mb-2 shimmer"></div>
              <div className="h-4 w-full bg-gray-200 rounded mb-4 shimmer"></div>
              <div className="flex items-center justify-between">
                <div className="h-4 w-20 bg-gray-200 rounded shimmer"></div>
                <div className="flex space-x-2">
                  <div className="h-8 w-8 bg-gray-200 rounded shimmer"></div>
                  <div className="h-8 w-8 bg-gray-200 rounded shimmer"></div>
                  <div className="h-8 w-8 bg-gray-200 rounded shimmer"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* 实际数据内容 */
        <div className="bg-white rounded-lg border">
          {evaluators.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 mb-2">暂无评分器</div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="text-blue-600 hover:text-blue-800"
            >
              创建第一个评分器
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    名称
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    类型
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    描述
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    创建时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {evaluators.map((evaluator) => (
                  <tr key={evaluator.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {evaluator.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${EVALUATOR_TYPE_COLORS[evaluator.type]}`}>
                        {EVALUATOR_TYPE_LABELS[evaluator.type]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500 max-w-xs truncate">
                        {evaluator.description || '无描述'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(evaluator.created_at).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setViewingEvaluator(evaluator)}
                          className="text-gray-600 hover:text-gray-900"
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingEvaluator(evaluator)}
                          className="text-blue-600 hover:text-blue-900"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(evaluator.id)}
                          className="text-red-600 hover:text-red-900"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {pagination.total > pagination.limit && (
          <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              显示 {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} 
              / 共 {pagination.total} 个
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                disabled={pagination.offset === 0}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                disabled={!pagination.has_more}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        )}
        </div>
      )}

      {/* 创建/编辑表单 */}
      {showCreateForm && (
        <EvaluatorForm
          onSave={handleSave}
          onCancel={() => setShowCreateForm(false)}
          loading={saving}
        />
      )}

      {editingEvaluator && (
        <EvaluatorForm
          evaluator={editingEvaluator}
          onSave={handleSave}
          onCancel={() => setEditingEvaluator(null)}
          loading={saving}
        />
      )}

      {viewingEvaluator && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">评分器详情</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">名称</label>
                <div className="mt-1 text-sm text-gray-900">{viewingEvaluator.name}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">类型</label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${EVALUATOR_TYPE_COLORS[viewingEvaluator.type]} mt-1`}>
                  {EVALUATOR_TYPE_LABELS[viewingEvaluator.type]}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">描述</label>
                <div className="mt-1 text-sm text-gray-900">{viewingEvaluator.description || '无描述'}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">配置</label>
                <pre className="mt-1 text-xs bg-gray-100 p-3 rounded overflow-x-auto">
                  {JSON.stringify(viewingEvaluator.config, null, 2)}
                </pre>
              </div>
            </div>
            <button
              onClick={() => setViewingEvaluator(null)}
              className="mt-4 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}