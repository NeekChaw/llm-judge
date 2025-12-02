'use client';

import { Layout } from '@/components/layout/layout';
import { ClientOnly } from '@/components/ui/client-only';
import { Button } from '@/components/ui/button';
import { Dimension } from '@/types/database';
import { useEffect, useState } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { DimensionsPageSkeleton } from '@/components/ui/skeleton';
import { usePageLoadComplete } from '@/components/layout/page-loading';

export default function DimensionsPage() {
  return (
    <Layout>
      <ClientOnly fallback={<div className="text-center py-8">加载中...</div>}>
        <DimensionsContent />
      </ClientOnly>
    </Layout>
  );
}

function DimensionsContent() {
  // 🚀 立即清除全局loading状态
  usePageLoadComplete();

  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDimension, setEditingDimension] = useState<Dimension | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    has_more: false
  });

  useEffect(() => {
    fetchDimensions();
  }, [pagination.offset]);

  const fetchDimensions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString()
      });
      const response = await fetch(`/api/v2/library/dimensions?${params}`);
      if (response.ok) {
        const data = await response.json();
        console.log('🐛 API返回数据:', data);
        // 确保 dimensions 是数组
        setDimensions(Array.isArray(data.dimensions) ? data.dimensions : []);
        if (data.pagination) {
          setPagination(data.pagination);
        }
      }
    } catch (error) {
      console.error('Error fetching dimensions:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteDimension = async (id: string) => {
    if (!confirm('确定要删除这个维度吗？')) return;

    try {
      const response = await fetch(`/api/v2/library/dimensions/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchDimensions();
      }
    } catch (error) {
      console.error('Error deleting dimension:', error);
    }
  };

  const editDimension = (dimension: Dimension) => {
    setEditingDimension(dimension);
    setShowEditModal(true);
  };

  // 批量删除
  const batchDelete = async () => {
    if (selectedIds.size === 0) {
      alert('请先选择要删除的维度');
      return;
    }

    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个维度吗？`)) return;

    try {
      const deletePromises = Array.from(selectedIds).map(id =>
        fetch(`/api/v2/library/dimensions/${id}`, {
          method: 'DELETE',
        })
      );

      await Promise.all(deletePromises);
      setSelectedIds(new Set());
      fetchDimensions();
    } catch (error) {
      console.error('Error batch deleting dimensions:', error);
      alert('批量删除失败');
    }
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === dimensions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(dimensions.map(d => d.id)));
    }
  };

  // 单选切换
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  return (
    <div className="p-6">
      {/* 页面头部 */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">维度管理</h1>
            <p className="text-gray-600">管理评测的抽象视角，如"代码质量"、"安全性"等</p>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button
                variant="outline"
                onClick={batchDelete}
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删除选中 ({selectedIds.size})
              </Button>
            )}
            <Button
              onClick={() => setShowCreateModal(true)}
              disabled={loading}
              className="disabled:opacity-50"
            >
              <Plus className="h-4 w-4 mr-2" />
              创建维度
            </Button>
          </div>
        </div>
      </div>

      {/* 🎯 动态内容区域 */}
      {loading ? (
        /* 只显示表格数据的骨架 */
        <div className="bg-white shadow rounded-lg animate-pulse">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 w-12"><div className="h-4 w-4 bg-gray-200 rounded"></div></th>
                  <th className="px-6 py-3"><div className="h-4 w-16 bg-gray-200 rounded"></div></th>
                  <th className="px-6 py-3"><div className="h-4 w-20 bg-gray-200 rounded"></div></th>
                  <th className="px-6 py-3"><div className="h-4 w-24 bg-gray-200 rounded"></div></th>
                  <th className="px-6 py-3"><div className="h-4 w-12 bg-gray-200 rounded"></div></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Array.from({ length: 5 }, (_, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4"><div className="h-4 w-4 bg-gray-200 rounded"></div></td>
                    <td className="px-6 py-4"><div className="h-4 w-full bg-gray-200 rounded"></div></td>
                    <td className="px-6 py-4"><div className="h-4 w-full bg-gray-200 rounded"></div></td>
                    <td className="px-6 py-4"><div className="h-4 w-full bg-gray-200 rounded"></div></td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2 justify-end">
                        <div className="h-8 w-8 bg-gray-200 rounded"></div>
                        <div className="h-8 w-8 bg-gray-200 rounded"></div>
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
        <div className="bg-white shadow rounded-lg">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={dimensions.length > 0 && selectedIds.size === dimensions.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    名称
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
                {Array.isArray(dimensions) && dimensions.map((dimension) => (
                <tr key={dimension.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(dimension.id)}
                      onChange={() => toggleSelect(dimension.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {dimension.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {dimension.description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(dimension.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => editDimension(dimension)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteDimension(dimension.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页控件 */}
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
            </div>
          </div>
        )}

        {dimensions.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="text-gray-500">暂无维度数据</div>
            <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
              创建第一个维度
            </Button>
          </div>
        )}
        </div>
      )}

      {showCreateModal && (
        <CreateDimensionModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchDimensions();
          }}
        />
      )}

      {showEditModal && editingDimension && (
        <EditDimensionModal
          dimension={editingDimension}
          onClose={() => {
            setShowEditModal(false);
            setEditingDimension(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingDimension(null);
            fetchDimensions();
          }}
        />
      )}
    </div>
  );
}

function CreateDimensionModal({ 
  onClose, 
  onSuccess 
}: { 
  onClose: () => void; 
  onSuccess: () => void; 
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert('请输入维度名称');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/v2/library/dimensions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onSuccess();
      } else {
        const error = await response.json();
        alert(error.error || '创建失败');
      }
    } catch (error) {
      console.error('Error creating dimension:', error);
      alert('创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-semibold mb-4">创建新维度</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              名称 *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="如：代码质量"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="描述这个维度的评测内容..."
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? '创建中...' : '创建'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditDimensionModal({
  dimension,
  onClose,
  onSuccess
}: {
  dimension: Dimension;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: dimension.name,
    description: dimension.description || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('请输入维度名称');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/v2/library/dimensions/${dimension.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        onSuccess();
      } else {
        const error = await response.json();
        alert(error.error || '更新失败');
      }
    } catch (error) {
      console.error('Error updating dimension:', error);
      alert('更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">编辑维度</h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                维度名称 *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例如：代码质量"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="描述这个维度的评测内容..."
              />
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              取消
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? '更新中...' : '更新'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}