'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Search, Edit, Trash2, Eye, Download, Upload,
  Tag, Filter, FileText, BarChart3, CheckSquare, Square
} from 'lucide-react';
import { TestCasesPageSkeleton } from '@/components/ui/skeleton';
import { usePageLoadComplete } from '@/components/layout/page-loading';
import {
  TestCase,
  TestCaseFormData,
  TestCaseListResponse,
  TestCaseStats
} from '@/types/test-case';
import ImportExportModal from '@/components/ImportExportModal';
import { ImageUploadBox } from '@/components/ImageUploadBox';
import { ImagePreviewUpload } from '@/components/ImagePreviewUpload';
import { useImagePreview } from '@/hooks/useImagePreview';
import MultimodalEditor from '@/components/multimodal/MultimodalEditor';


export default function TestCasesContent() {
  // 🚀 立即清除全局loading状态
  usePageLoadComplete();

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState<TestCase | null>(null);
  const [viewingTestCase, setViewingTestCase] = useState<TestCase | null>(null);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<TestCaseStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTestCases, setSelectedTestCases] = useState<Set<string>>(new Set());
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    has_more: false
  });

  // 加载测试用例列表
  const loadTestCases = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
        _t: Date.now().toString() // 🐛 防止缓存
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (categoryFilter) params.append('category', categoryFilter);
      if (selectedTags.length > 0) params.append('tags', selectedTags.join(','));

      const response = await fetch(`/api/test-cases?${params}`);
      if (!response.ok) {
        throw new Error('加载测试用例列表失败');
      }

      const data: TestCaseListResponse = await response.json();
      setTestCases(data.test_cases);
      setPagination(data.pagination);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载统计信息
  const loadStats = async () => {
    try {
      const response = await fetch('/api/test-cases/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
        
        // 提取可用的分类和标签
        setAvailableCategories(Object.keys(data.stats.by_category || {}));
        setAvailableTags(Object.keys(data.stats.by_tags || {}));
      }
    } catch (err) {
      console.error('加载统计信息失败:', err);
    }
  };

  // 删除测试用例
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个测试用例吗？')) return;

    try {
      const response = await fetch(`/api/test-cases/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除失败');
      }

      await loadTestCases();
      await loadStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  // 保存测试用例（创建或更新）
  const handleSave = async (data: TestCaseFormData) => {
    setSaving(true);
    try {
      const url = editingTestCase 
        ? `/api/test-cases/${editingTestCase.id}`
        : '/api/test-cases';
      
      const method = editingTestCase ? 'PUT' : 'POST';
      
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

      // 关闭表单
      setShowCreateForm(false);
      setEditingTestCase(null);
      
      // 重新加载列表和统计
      await loadTestCases();
      await loadStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  // 标签切换
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // 选择测试用例
  const toggleTestCaseSelection = (id: string) => {
    setSelectedTestCases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedTestCases.size === testCases.length) {
      setSelectedTestCases(new Set());
    } else {
      setSelectedTestCases(new Set(testCases.map(tc => tc.id)));
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedTestCases.size === 0) return;

    const confirmed = confirm(`确定要删除选中的 ${selectedTestCases.size} 个测试用例吗？此操作不可撤销。`);
    if (!confirmed) return;

    setBatchDeleting(true);
    try {
      const response = await fetch('/api/test-cases/batch-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ids: Array.from(selectedTestCases)
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '批量删除失败');
      }

      const result = await response.json();
      alert(`成功删除 ${result.deleted_count} 个测试用例`);
      
      // 清空选择并重新加载
      setSelectedTestCases(new Set());
      setShowBatchActions(false);
      await loadTestCases();
      await loadStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : '批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  };

  // 清空选择
  const clearSelection = () => {
    setSelectedTestCases(new Set());
    setShowBatchActions(false);
  };

  useEffect(() => {
    loadTestCases();
    loadStats();
  }, [searchTerm, categoryFilter, selectedTags, pagination.offset]);

  // 监听选择变化，自动显示/隐藏批量操作工具栏
  useEffect(() => {
    setShowBatchActions(selectedTestCases.size > 0);
  }, [selectedTestCases]);

  return (
    <div className="p-6">
      {/* 页面头部 */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">测试用例管理</h1>
            <p className="text-gray-600">管理AI评测系统的测试问题和参考答案</p>
          </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            disabled={loading}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 disabled:bg-gray-50 flex items-center gap-2 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            统计信息
          </button>
          <div className="relative group">
            <button
              onClick={() => setShowImportExport(true)}
              disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-green-400 flex items-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4" />
              导入/导出
            </button>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建测试用例
          </button>
        </div>
        </div>
      </div>

      {/* 统计信息 */}
      {showStats && stats && (
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">统计信息</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">总览</h4>
              <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-gray-500">总测试用例数</div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-2">分类分布</h4>
              <div className="space-y-1">
                {Object.entries(stats.by_category).map(([category, count]) => (
                  <div key={category} className="flex justify-between text-sm">
                    <span>{category}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* 搜索和筛选 */}
      <div className="bg-white p-4 rounded-lg border space-y-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索测试用例内容..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={loading}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            disabled={loading}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
          >
            <option value="">所有分类</option>
            {availableCategories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

        </div>
        
        {/* 标签筛选 */}
        {availableTags.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">标签筛选:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 批量操作工具栏 */}
      {showBatchActions && (
        <div className={`border rounded-lg p-4 ${
          batchDeleting 
            ? 'bg-yellow-50 border-yellow-200' 
            : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className={`text-sm font-medium ${
                batchDeleting ? 'text-yellow-700' : 'text-blue-700'
              }`}>
                {batchDeleting 
                  ? `正在删除 ${selectedTestCases.size} 个测试用例...` 
                  : `已选择 ${selectedTestCases.size} 个测试用例`
                }
              </span>
              {!batchDeleting && (
                <button
                  onClick={toggleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  {selectedTestCases.size === testCases.length ? '取消全选' : '全选当前页'}
                </button>
              )}
              {batchDeleting && (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
                  <span className="text-sm text-yellow-600">
                    请耐心等待，正在检查使用情况并执行删除...
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting}
                className={`px-4 py-2 rounded-md flex items-center gap-2 ${
                  batchDeleting
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {batchDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    删除中...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    批量删除
                  </>
                )}
              </button>
              <button
                onClick={clearSelection}
                disabled={batchDeleting}
                className={`px-4 py-2 rounded-md ${
                  batchDeleting
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                取消选择
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎯 动态内容区域 - 根据状态显示不同内容 */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-700">错误: {error}</div>
          <button
            onClick={loadTestCases}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            重新加载
          </button>
        </div>
      ) : loading ? (
        /* 只对数据内容显示骨架动画 */
        <div className="bg-white rounded-lg border">
          <div className="divide-y divide-gray-200">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="p-6 animate-pulse">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="h-6 w-6 bg-gray-200 rounded-full"></div>
                    <div>
                      <div className="h-5 w-48 bg-gray-200 rounded mb-1"></div>
                      <div className="h-4 w-32 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <div className="h-8 w-16 bg-gray-200 rounded-full"></div>
                    <div className="h-8 w-8 bg-gray-200 rounded"></div>
                    <div className="h-8 w-8 bg-gray-200 rounded"></div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="h-4 w-full bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 w-2/3 bg-gray-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* 实际数据内容 */
        <div className="bg-white rounded-lg border">
          {testCases.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <div className="text-gray-500 mb-2">暂无测试用例</div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="text-blue-600 hover:text-blue-800"
            >
              创建第一个测试用例
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-12" />
                <col className="w-1/3" />
                <col className="w-1/3" />
                <col className="w-20" />
                <col className="w-24" />
                <col className="w-20" />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={toggleSelectAll}
                      disabled={batchDeleting}
                      className={`${
                        batchDeleting 
                          ? 'text-gray-300 cursor-not-allowed' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      title={
                        batchDeleting 
                          ? '删除进行中，无法修改选择' 
                          : (selectedTestCases.size === testCases.length ? '取消全选' : '全选')
                      }
                    >
                      {selectedTestCases.size === testCases.length ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : selectedTestCases.size > 0 ? (
                        <div className="w-4 h-4 border-2 border-gray-400 bg-blue-100 rounded"></div>
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    输入内容
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    参考答案
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    分类
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    标签
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {testCases.map((testCase) => {
                  const metadata = testCase.metadata || {};
                  const tags = metadata.tags || [];
                  const category = metadata.category || '未分类';
                  
                  return (
                    <tr key={testCase.id} className={`hover:bg-gray-50 ${selectedTestCases.has(testCase.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleTestCaseSelection(testCase.id)}
                          disabled={batchDeleting}
                          className={`${
                            batchDeleting 
                              ? 'text-gray-300 cursor-not-allowed' 
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                          title={batchDeleting ? '删除进行中，无法修改选择' : '点击选择/取消选择'}
                        >
                          {selectedTestCases.has(testCase.id) ? (
                            <CheckSquare className={`w-4 h-4 ${batchDeleting ? 'text-gray-300' : 'text-blue-600'}`} />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">
                          <div className="line-clamp-2" title={testCase.input}>
                            {testCase.input}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-500">
                          <div className="line-clamp-2" title={testCase.reference_answer || '无'}>
                            {testCase.reference_answer || '无'}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div className="truncate" title={category}>
                          {category}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 1).map((tag: string, index: number) => (
                            <span key={index} className="inline-flex px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded truncate max-w-full">
                              {tag}
                            </span>
                          ))}
                          {tags.length > 1 && (
                            <span className="text-xs text-gray-400">+{tags.length - 1}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewingTestCase(testCase)}
                            className="text-gray-600 hover:text-gray-900 p-1"
                            title="查看详情"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingTestCase(testCase)}
                            className="text-blue-600 hover:text-blue-900 p-1"
                            title="编辑"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(testCase.id)}
                            className="text-red-600 hover:text-red-900 p-1"
                            title="删除"
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
        <TestCaseForm
          onSave={handleSave}
          onCancel={() => setShowCreateForm(false)}
          loading={saving}
          availableCategories={availableCategories}
          availableTags={availableTags}
        />
      )}

      {editingTestCase && (
        <TestCaseForm
          testCase={editingTestCase}
          onSave={handleSave}
          onCancel={() => setEditingTestCase(null)}
          loading={saving}
          availableCategories={availableCategories}
          availableTags={availableTags}
        />
      )}

      {/* 查看详情模态框 */}
      {viewingTestCase && (
        <TestCaseDetailModal
          testCase={viewingTestCase}
          onClose={() => setViewingTestCase(null)}
        />
      )}

      {/* 导入/导出模态框 */}
      {showImportExport && (
        <ImportExportModal
          onClose={() => setShowImportExport(false)}
          onImportSuccess={() => {
            loadTestCases();
            loadStats();
          }}
        />
      )}
    </div>
  );
}

// 测试用例表单组件
interface TestCaseFormProps {
  testCase?: TestCase;
  onSave: (data: TestCaseFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  availableCategories: string[];
  availableTags: string[];
}

function TestCaseForm({
  testCase,
  onSave,
  onCancel,
  loading = false,
  availableCategories,
  availableTags
}: TestCaseFormProps) {
  // 🔧 清理旧数据中的Markdown图片URL的函数
  const cleanupMarkdownImages = (text: string): string => {
    if (!text) return '';
    // 移除所有的图片Markdown格式 ![filename](url)
    return text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '').trim();
  };

  // 🆕 使用图片预览Hook
  const { previewImages, uploading, addImagePreview, removeImagePreview, uploadAllImages, clearPreviews } = useImagePreview();

  const metadata = testCase?.metadata || {};
  const [formData, setFormData] = useState<TestCaseFormData>(() => {
    const initialFormData = {
      input: cleanupMarkdownImages(testCase?.input || ''), // 🔧 清理旧的图片URL
      reference_answer: testCase?.reference_answer || '',
      // 🆕 Bug #4修复: 多模态参考答案支持
      reference_answer_multimodal: testCase?.reference_answer_multimodal || {
        text: testCase?.reference_answer || '',
        attachments: []
      },
      max_score: testCase?.max_score || 100, // 默认满分100分
      tags: metadata.tags || [],
      category: metadata.category || '',
      // 🆕 CODE配置字段
      code_test_config: testCase?.code_test_config || undefined,
      execution_environment: testCase?.execution_environment || '',
      validation_rules: testCase?.validation_rules || {
        strict_output_match: false,
        ignore_whitespace: true
      },
      // 🆕 多模态支持
      attachments: testCase?.attachments || []
    };

    console.log('🐛 表单初始化 formData:', {
      isEditing: !!testCase,
      testCaseId: testCase?.id,
      attachments: initialFormData.attachments,
      attachmentsLength: initialFormData.attachments?.length || 0
    });

    return initialFormData;
  });

  const [newTag, setNewTag] = useState('');
  const [showCodeConfig, setShowCodeConfig] = useState(!!testCase?.code_test_config);
  const [newTestCase, setNewTestCase] = useState({ input: '', expected: '', description: '' });
  const [editingTestCaseIndex, setEditingTestCaseIndex] = useState<number | null>(null);
  const [editingTestCaseData, setEditingTestCaseData] = useState({ input: '', expected: '', description: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 🆕 先上传所有预览图片
      console.log('📤 开始上传预览图片...');
      const uploadResults = await uploadAllImages();
      console.log('🐛 上传结果:', uploadResults);

      // 处理上传结果，构建最终的attachments数组
      const newAttachments = [];
      let hasUploadError = false;

      // 🔧 获取更新后的已保存图片（可能有删除）
      // 这里需要从ImagePreviewUpload组件获取最新的已保存图片状态
      // 暂时保留现有逻辑，后续需要组件间通信优化
      console.log('🐛 当前 formData.attachments:', formData.attachments);
      if (formData.attachments) {
        newAttachments.push(...formData.attachments);
      }
      console.log('🐛 添加已保存图片后 newAttachments:', newAttachments);

      // 添加成功上传的新图片
      console.log('🐛 开始处理上传结果，数量:', uploadResults.length);
      for (const result of uploadResults) {
        console.log('🐛 处理上传结果:', result);
        if (result.success && result.url) {
          const newAttachment = {
            type: 'image',
            url: result.url,
            media_id: result.media_id, // 🆕 保存 media_id 用于删除
            metadata: {
              filename: result.filename,
              alt_text: `用户上传的图片：${result.filename}`
            }
          };
          console.log('🐛 添加新附件:', newAttachment);
          newAttachments.push(newAttachment);
        } else {
          hasUploadError = true;
          console.error('🐛 图片上传失败:', result.error);
          alert(`图片上传失败：${result.error}`);
        }
      }
      console.log('🐛 处理完成后最终 newAttachments:', newAttachments);

      // 如果有上传错误，停止提交
      if (hasUploadError) {
        return;
      }

      // 如果未启用CODE配置，清除相关字段
      const submitData = { ...formData };
      if (!showCodeConfig) {
        delete submitData.code_test_config;
        delete submitData.execution_environment;
        delete submitData.validation_rules;
      }

      // 更新attachments
      submitData.attachments = newAttachments;

      console.log('💾 提交数据:', submitData);
      await onSave(submitData);

      // 🧹 保存成功后清理预览
      clearPreviews();
    } catch (error) {
      // 错误已在父组件处理
      console.error('提交表单时出错:', error);
    }
  };

  const handleFieldChange = (field: keyof TestCaseFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags?.includes(newTag.trim())) {
      handleFieldChange('tags', [...(formData.tags || []), newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    handleFieldChange('tags', formData.tags?.filter(tag => tag !== tagToRemove) || []);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto">
        <h3 className="text-xl font-semibold mb-6">
          {testCase ? '编辑测试用例' : '创建测试用例'}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              输入内容 *
            </label>
            <div className="space-y-3">
              <textarea
                value={formData.input}
                onChange={(e) => handleFieldChange('input', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="输入测试问题或提示内容"
                required
              />

              {/* 🖼️ 图片预览上传功能 - 延迟上传模式 */}
              <ImagePreviewUpload
                onImagesReady={(attachments) => {
                  // 此回调将在保存时处理，这里暂时不需要实现
                }}
                initialAttachments={formData.attachments || []}
                onAttachmentsChange={(updatedAttachments) => {
                  // 🆕 实时更新formData中的attachments
                  console.log('🐛 表单接收到 onAttachmentsChange:', updatedAttachments);
                  handleFieldChange('attachments', updatedAttachments);
                  console.log('🐛 表单更新后的 formData.attachments:', formData.attachments);
                }}
                previewImages={previewImages}
                uploading={uploading}
                addImagePreview={addImagePreview}
                removeImagePreview={removeImagePreview}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              参考答案
              <span className="text-xs text-gray-500 ml-2">（支持文本、图片、音频、视频等多媒体内容）</span>
            </label>
            <MultimodalEditor
              value={formData.reference_answer_multimodal || { text: '', attachments: [] }}
              onChange={(value) => {
                handleFieldChange('reference_answer_multimodal', value);
                // 同步更新纯文本字段以保持向后兼容
                handleFieldChange('reference_answer', value.text);
              }}
              placeholder="输入期望的答案或输出，可添加图片、音频、视频等多媒体内容（可选）"
              textRows={4}
              maxAttachments={5}
              allowedTypes={['image', 'audio', 'video']}
              showPreview={true}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              题目满分（总得分点数）
              <span className="text-xs text-gray-500 ml-1">- 每个得分点1分，用于标准化评分计算</span>
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              step="1"
              value={formData.max_score || 100}
              onChange={(e) => handleFieldChange('max_score', parseInt(e.target.value) || 100)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="100"
            />
            <p className="text-xs text-gray-500 mt-1">
              设置该题目的总得分点数。复杂题目可设置更多得分点，简单题目可设置较少得分点。默认100分。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                分类
              </label>
              <input
                type="text"
                list="categories"
                value={formData.category}
                onChange={(e) => handleFieldChange('category', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="输入或选择分类"
              />
              <datalist id="categories">
                {availableCategories.map(category => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
            
          </div>

          {/* 🆕 CODE配置区域 */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-medium text-gray-900">CODE评分器配置</h4>
              <button
                type="button"
                onClick={() => setShowCodeConfig(!showCodeConfig)}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  showCodeConfig
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {showCodeConfig ? '隐藏CODE配置' : '启用CODE配置'}
              </button>
            </div>
            
            {showCodeConfig && (
              <div className="space-y-6">
                {/* 执行环境配置 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    执行环境
                  </label>
                  <select
                    value={formData.execution_environment || 'python'}
                    onChange={(e) => handleFieldChange('execution_environment', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="python">Python 3.11</option>
                    <option value="javascript">JavaScript (Node.js)</option>
                    <option value="typescript">TypeScript</option>
                    <option value="java">Java</option>
                    <option value="cpp">C++</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    选择代码执行的环境类型
                  </p>
                </div>

                {/* 验证规则配置 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    验证规则
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.validation_rules?.strict_output_match || false}
                        onChange={(e) => handleFieldChange('validation_rules', {
                          ...formData.validation_rules,
                          strict_output_match: e.target.checked
                        })}
                        className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">严格输出匹配</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.validation_rules?.ignore_whitespace !== false}
                        onChange={(e) => handleFieldChange('validation_rules', {
                          ...formData.validation_rules,
                          ignore_whitespace: e.target.checked
                        })}
                        className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">忽略空白字符</span>
                    </label>
                  </div>
                </div>

                {/* 测试用例数据配置 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    测试用例数据
                  </label>
                  
                  {/* 现有测试用例列表 */}
                  {formData.code_test_config?.test_data && formData.code_test_config.test_data.length > 0 && (
                    <div className="mb-4">
                      <div className="space-y-2">
                        {formData.code_test_config.test_data.map((testCase, index) => (
                          <div key={index} className="p-2 bg-gray-50 rounded-md">
                            {editingTestCaseIndex === index ? (
                              // 编辑模式
                              <div className="space-y-2">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">输入值</label>
                                    <input
                                      type="text"
                                      value={editingTestCaseData.input}
                                      onChange={(e) => setEditingTestCaseData(prev => ({ ...prev, input: e.target.value }))}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">期望输出</label>
                                    <input
                                      type="text"
                                      value={editingTestCaseData.expected}
                                      onChange={(e) => setEditingTestCaseData(prev => ({ ...prev, expected: e.target.value }))}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">描述</label>
                                    <input
                                      type="text"
                                      value={editingTestCaseData.description}
                                      onChange={(e) => setEditingTestCaseData(prev => ({ ...prev, description: e.target.value }))}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      placeholder="可选描述"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // 保存编辑
                                      const newTestData = [...(formData.code_test_config?.test_data || [])];
                                      newTestData[index] = {
                                        input: editingTestCaseData.input,
                                        expected: editingTestCaseData.expected,
                                        description: editingTestCaseData.description || undefined
                                      };
                                      handleFieldChange('code_test_config', {
                                        ...formData.code_test_config,
                                        test_data: newTestData
                                      });
                                      setEditingTestCaseIndex(null);
                                    }}
                                    disabled={!editingTestCaseData.input || !editingTestCaseData.expected}
                                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    保存
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTestCaseIndex(null)}
                                    className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              // 查看模式
                              <div className="flex items-center gap-2">
                                <div className="flex-1 text-sm">
                                  <span className="font-medium">输入:</span> {JSON.stringify(testCase.input)} 
                                  <span className="font-medium ml-2">期望:</span> {JSON.stringify(testCase.expected)}
                                  {testCase.description && (
                                    <span className="text-gray-500 ml-2">({testCase.description})</span>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTestCaseIndex(index);
                                      setEditingTestCaseData({
                                        input: String(testCase.input),
                                        expected: String(testCase.expected),
                                        description: testCase.description || ''
                                      });
                                    }}
                                    className="text-blue-500 hover:text-blue-700 text-sm px-2 py-1 rounded hover:bg-blue-50"
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newTestData = [...(formData.code_test_config?.test_data || [])];
                                      newTestData.splice(index, 1);
                                      handleFieldChange('code_test_config', {
                                        ...formData.code_test_config,
                                        test_data: newTestData
                                      });
                                    }}
                                    className="text-red-500 hover:text-red-700 text-sm px-2 py-1 rounded hover:bg-red-50"
                                  >
                                    删除
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 添加新测试用例 */}
                  <div className="border rounded-md p-4">
                    <h5 className="text-sm font-medium text-gray-700 mb-3">添加测试用例</h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">输入值</label>
                        <input
                          type="text"
                          value={newTestCase.input}
                          onChange={(e) => setNewTestCase(prev => ({ ...prev, input: e.target.value }))}
                          placeholder='如: "hello"'
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">期望输出</label>
                        <input
                          type="text"
                          value={newTestCase.expected}
                          onChange={(e) => setNewTestCase(prev => ({ ...prev, expected: e.target.value }))}
                          placeholder='如: "HELLO"'
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">描述（可选）</label>
                        <input
                          type="text"
                          value={newTestCase.description}
                          onChange={(e) => setNewTestCase(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="测试用例描述"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (newTestCase.input && newTestCase.expected) {
                          const newTestData = {
                            input: newTestCase.input,
                            expected: newTestCase.expected,
                            description: newTestCase.description || undefined
                          };
                          
                          const currentConfig = formData.code_test_config || {
                            test_data: [],
                            execution_config: {
                              timeout_ms: 30000,
                              memory_limit_mb: 256,
                              entry_point_strategy: 'intelligent'
                            }
                          };
                          
                          handleFieldChange('code_test_config', {
                            ...currentConfig,
                            test_data: [...currentConfig.test_data, newTestData]
                          });
                          
                          setNewTestCase({ input: '', expected: '', description: '' });
                        }
                      }}
                      disabled={!newTestCase.input || !newTestCase.expected}
                      className="mt-3 px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      添加测试用例
                    </button>
                  </div>
                  
                  {/* 执行配置 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        超时时间 (毫秒)
                      </label>
                      <input
                        type="number"
                        min="1000"
                        max="300000"
                        step="1000"
                        value={formData.code_test_config?.execution_config?.timeout_ms || 30000}
                        onChange={(e) => {
                          const currentConfig = formData.code_test_config || {
                            test_data: [],
                            execution_config: {
                              timeout_ms: 30000,
                              memory_limit_mb: 256,
                              entry_point_strategy: 'intelligent'
                            }
                          };
                          handleFieldChange('code_test_config', {
                            ...currentConfig,
                            execution_config: {
                              ...currentConfig.execution_config,
                              timeout_ms: parseInt(e.target.value) || 30000
                            }
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        内存限制 (MB)
                      </label>
                      <input
                        type="number"
                        min="64"
                        max="2048"
                        step="64"
                        value={formData.code_test_config?.execution_config?.memory_limit_mb || 256}
                        onChange={(e) => {
                          const currentConfig = formData.code_test_config || {
                            test_data: [],
                            execution_config: {
                              timeout_ms: 30000,
                              memory_limit_mb: 256,
                              entry_point_strategy: 'intelligent'
                            }
                          };
                          handleFieldChange('code_test_config', {
                            ...currentConfig,
                            execution_config: {
                              ...currentConfig.execution_config,
                              memory_limit_mb: parseInt(e.target.value) || 256
                            }
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              标签
            </label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  list="tags"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="输入标签后按回车添加"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  添加
                </button>
              </div>
              <datalist id="tags">
                {availableTags.map(tag => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
              
              {formData.tags && formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="text-blue-500 hover:text-blue-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={() => {
                // 🧹 取消时清理预览图片
                clearPreviews();
                onCancel();
              }}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '保存中...' : (testCase ? '更新' : '创建')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 测试用例详情模态框
interface TestCaseDetailModalProps {
  testCase: TestCase;
  onClose: () => void;
}

function TestCaseDetailModal({ testCase, onClose }: TestCaseDetailModalProps) {
  const metadata = testCase.metadata || {};

  // 🐛 调试信息
  console.log('TestCaseDetailModal 渲染:', {
    id: testCase.id,
    hasAttachments: !!testCase.attachments,
    attachmentsType: typeof testCase.attachments,
    attachmentsLength: testCase.attachments?.length,
    attachments: testCase.attachments
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">测试用例详情</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">输入内容</label>
            <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm whitespace-pre-wrap font-mono">
              {testCase.input}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">参考答案</label>
            <div className="mt-1 p-3 bg-gray-50 rounded-md text-sm whitespace-pre-wrap font-mono">
              {testCase.reference_answer || '无'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">分类</label>
              <div className="mt-1 text-sm text-gray-900">
                {metadata.category || '未分类'}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">题目满分</label>
              <div className="mt-1 text-sm text-gray-900">
                {testCase.max_score || 100} 分
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">标签</label>
            <div className="mt-1">
              {metadata.tags && metadata.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {metadata.tags.map((tag: string, index: number) => (
                    <span key={index} className="inline-flex px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-gray-500">无标签</span>
              )}
            </div>
          </div>

          {/* 🆕 CODE配置显示 */}
          {testCase.code_test_config && (
            <div className="border-t pt-4">
              <h4 className="text-md font-medium text-gray-900 mb-3">CODE评分器配置</h4>
              
              <div className="space-y-4">
                {/* 执行环境 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">执行环境</label>
                  <div className="mt-1 text-sm text-gray-900">
                    {testCase.execution_environment || 'python'}
                  </div>
                </div>
                
                {/* 验证规则 */}
                {testCase.validation_rules && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">验证规则</label>
                    <div className="mt-1 space-y-1">
                      <div className="text-sm text-gray-900">
                        严格输出匹配: {testCase.validation_rules.strict_output_match ? '启用' : '禁用'}
                      </div>
                      <div className="text-sm text-gray-900">
                        忽略空白字符: {testCase.validation_rules.ignore_whitespace !== false ? '启用' : '禁用'}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 测试用例数据 */}
                {testCase.code_test_config.test_data && testCase.code_test_config.test_data.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">测试用例数据 ({testCase.code_test_config.test_data.length} 个)</label>
                    <div className="space-y-2">
                      {testCase.code_test_config.test_data.map((testData, index) => (
                        <div key={index} className="p-2 bg-gray-50 rounded-md text-sm">
                          <div><span className="font-medium">输入:</span> <code className="bg-gray-200 px-1 rounded">{JSON.stringify(testData.input)}</code></div>
                          <div><span className="font-medium">期望:</span> <code className="bg-gray-200 px-1 rounded">{JSON.stringify(testData.expected)}</code></div>
                          {testData.description && (
                            <div><span className="font-medium">描述:</span> {testData.description}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 执行配置 */}
                {testCase.code_test_config.execution_config && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">执行配置</label>
                    <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div>超时时间: {testCase.code_test_config.execution_config.timeout_ms}ms</div>
                      <div>内存限制: {testCase.code_test_config.execution_config.memory_limit_mb}MB</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 🆕 附件显示 */}
          {testCase.attachments && testCase.attachments.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-md font-medium text-gray-900 mb-3">
                附件 ({testCase.attachments.length} 个)
              </h4>
              <div className="space-y-3">
                {testCase.attachments.map((attachment, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-md">
                    <div className="flex items-start space-x-3">
                      {/* 图片预览 */}
                      <div className="flex-shrink-0">
                        {attachment.type === 'image' ? (
                          <div className="w-16 h-16 bg-gray-200 rounded-md overflow-hidden">
                            <img
                              src={attachment.url}
                              alt={attachment.metadata?.filename || '附件图片'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // 图片加载失败时显示占位符
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                target.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                            <div className="hidden w-full h-full flex items-center justify-center text-gray-400 text-xs">
                              <span>📷</span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-16 h-16 bg-blue-100 rounded-md flex items-center justify-center">
                            <span className="text-blue-600 text-xl">📎</span>
                          </div>
                        )}
                      </div>

                      {/* 文件信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {attachment.metadata?.filename || '未命名文件'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          类型: {attachment.type}
                        </div>
                        {attachment.metadata?.alt_text && (
                          <div className="text-xs text-gray-500 mt-1">
                            {attachment.metadata.alt_text}
                          </div>
                        )}
                        {(attachment.metadata?.width && attachment.metadata?.height) && (
                          <div className="text-xs text-gray-500 mt-1">
                            尺寸: {attachment.metadata.width} x {attachment.metadata.height}
                          </div>
                        )}
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex-shrink-0">
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm underline"
                        >
                          查看原图
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                💡 这些图片会在多模态任务中传递给AI模型进行识别和分析
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
            <div>
              <label className="block font-medium">创建时间</label>
              <div>{new Date(testCase.created_at).toLocaleString('zh-CN')}</div>
            </div>
            <div>
              <label className="block font-medium">更新时间</label>
              <div>{new Date(testCase.updated_at).toLocaleString('zh-CN')}</div>
            </div>
          </div>
        </div>
        
        <button
          onClick={onClose}
          className="mt-6 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
        >
          关闭
        </button>
      </div>
    </div>
  );
}