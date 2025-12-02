'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Search, Edit, Trash2, Eye, Copy, Settings,
  Layers, Scale, CheckCircle, Clock, Archive, BarChart3,
  X, GitBranch, ChevronLeft, ChevronRight, Target
} from 'lucide-react';
import { TemplatesPageSkeleton } from '@/components/ui/skeleton';
import { usePageLoadComplete } from '@/components/layout/page-loading';
import { 
  Template, 
  TemplateWithMappings, 
  TemplateListResponse,
  TemplateStats,
  TemplateFormData,
  TemplateBuilderResources
} from '@/types/template';
import DualTemplateBuilder from '@/components/DualTemplateBuilder';
import DualTemplateList from '@/components/DualTemplateList';
import TemplateDetailModal from '@/components/TemplateDetailModal';
import type { Template as NewTemplate, CreateTemplateRequest } from '@/lib/template-types';
import { templateService } from '@/lib/template-service';
import { EvaluatorFlowChart } from '@/components/evaluator-flow/EvaluatorFlowChart';

const STATUS_LABELS = {
  'draft': '草稿',
  'active': '活跃',
  'inactive': '非活跃'
};

const STATUS_COLORS = {
  'draft': 'bg-gray-100 text-gray-800',
  'active': 'bg-green-100 text-green-800',
  'inactive': 'bg-yellow-100 text-yellow-800'
};

export default function TemplatesContent() {
  // 🚀 立即清除全局loading状态
  usePageLoadComplete();

  const [templates, setTemplates] = useState<NewTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'draft' | 'active' | 'inactive'>('');
  const [templateTypeFilter, setTemplateTypeFilter] = useState<'all' | 'unified' | 'custom'>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NewTemplate | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<NewTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<TemplateStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [builderResources, setBuilderResources] = useState<any>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    has_more: false
  });

  // 计算分页信息
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const totalPages = Math.ceil(pagination.total / pagination.limit);
  const pageSize = pagination.limit;

  // 加载模板列表
  const loadTemplates = async () => {
    try {
      setLoading(true);

      // 构建API查询参数
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString()
      });

      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('status', statusFilter);

      const response = await fetch(`/api/templates?${params}`);
      if (!response.ok) {
        throw new Error('加载模板列表失败');
      }

      const data = await response.json();
      setTemplates(data.templates);
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
      const response = await fetch('/api/templates/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (err) {
      console.error('加载统计信息失败:', err);
    }
  };

  // 加载构建器资源
  const loadBuilderResources = async () => {
    try {
      // 使用现有的构建器资源API端点
      const response = await fetch('/api/templates/builder-resources');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      setBuilderResources({
        dimensions: data.resources?.dimensions || [],
        evaluators: data.resources?.evaluators || [],
        testCases: data.resources?.testCases || []
      });
    } catch (err) {
      console.error('加载构建器资源失败:', err);
      // 设置默认空资源以避免界面崩溃
      setBuilderResources({
        dimensions: [],
        evaluators: [],
        testCases: []
      });
    }
  };

  // 删除模板
  const handleDelete = async (id: string) => {
    const template = templates.find(t => t.id === id);
    if (!confirm(`确定要删除模板 "${template?.name}" 吗？`)) return;

    try {
      setSaving(true);
      
      const response = await fetch(`/api/templates/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '删除失败');
      }

      const result = await response.json();
      console.log('模板删除成功:', result.message);
      
      // 重新加载列表和统计
      await loadTemplates();
      await loadStats();
      
    } catch (err) {
      console.error('删除模板失败:', err);
      alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  // 克隆模板
  const handleClone = async (template: NewTemplate) => {
    const newName = prompt(`克隆模板 "${template.name}"，请输入新模板名称:`, `${template.name} - 副本`);
    if (!newName) return;

    try {
      setSaving(true);
      
      // 获取模板详情
      const response = await fetch(`/api/templates/${template.id}`);
      if (!response.ok) {
        throw new Error('获取模板详情失败');
      }
      
      const { template: templateDetail } = await response.json();
      
      // 构建克隆请求数据
      const cloneData: CreateTemplateRequest = {
        name: newName,
        description: `克隆自: ${templateDetail.description || templateDetail.name}`,
        template_type: templateDetail.template_type || 'unified'
      };
      
      if (templateDetail.template_type === 'custom' && templateDetail.custom_mappings) {
        cloneData.custom_mappings = templateDetail.custom_mappings.map((mapping: any) => ({
          dimension_id: mapping.dimension_id,
          evaluator_id: mapping.evaluator_id,
          test_case_ids: mapping.test_case_ids || [],
          system_prompt: mapping.system_prompt,
          weight: mapping.weight
        }));
      } else if (templateDetail.mappings) {
        cloneData.mappings = templateDetail.mappings.map((mapping: any) => ({
          dimension_id: mapping.dimension_id,
          evaluator_id: mapping.evaluator_id,
          weight: mapping.weight,
          config: mapping.config
        }));
      }
      
      // 创建克隆模板
      const templateId = await templateService.createTemplate(cloneData);
      console.log('模板克隆成功:', templateId);
      
      // 重新加载列表和统计
      await loadTemplates();
      await loadStats();
      
    } catch (err) {
      console.error('克隆模板失败:', err);
      alert(err instanceof Error ? err.message : '克隆失败');
    } finally {
      setSaving(false);
    }
  };

  // 保存模板
  const handleSave = async (data: CreateTemplateRequest) => {
    setSaving(true);
    try {
      if (editingTemplate) {
        // 编辑模板 - 🔧 修复：使用RESTful路径参数格式
        const response = await fetch(`/api/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: data.name,
            description: data.description,
            template_type: data.template_type, // 🔧 修复：传递模板类型
            status: data.status || 'active', // 🔧 修复：使用用户选择的状态
            // 🔧 修复：根据模板类型传递映射数据
            ...(data.template_type === 'unified' 
              ? { mappings: data.mappings }
              : { custom_mappings: data.custom_mappings }
            )
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '更新失败');
        }

        const result = await response.json();
        console.log('模板更新成功:', result.message);
      } else {
        // 创建新模板
        const templateId = await templateService.createTemplate(data);
        console.log('模板创建成功:', templateId);
      }

      // 关闭表单
      setShowCreateForm(false);
      setEditingTemplate(null);
      
      // 重新加载列表和统计
      await loadTemplates();
      await loadStats();
    } catch (err) {
      console.error('保存模板失败:', err);
      alert(err instanceof Error ? err.message : '保存失败');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    loadStats();
    loadBuilderResources();
  }, [searchTerm, statusFilter, pagination.offset]);

  // 当搜索条件变化时，重置到第一页
  useEffect(() => {
    setPagination(prev => ({ ...prev, offset: 0 }));
  }, [searchTerm, statusFilter, templateTypeFilter]);

  // 客户端过滤模板（模板类型）
  const filteredTemplates = templates.filter(template => {
    if (templateTypeFilter !== 'all' && template.template_type !== templateTypeFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="p-6">
      {/* 页面头部 */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">模板管理</h1>
            <p className="text-gray-600">管理评测模板，配置维度-评分器组合</p>
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
            <button
              onClick={() => setShowCreateForm(true)}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建模板
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
              <div className="text-sm text-gray-500">总模板数</div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-2">状态分布</h4>
              <div className="space-y-1">
                {Object.entries(stats.by_status).map(([status, count]) => (
                  <div key={status} className="flex justify-between text-sm">
                    <span>{STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-2">复杂度分析</h4>
              <div className="text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>平均映射数</span>
                  <span className="font-medium">{stats.avg_mappings_per_template}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 筛选器 */}
      <div className="bg-white p-4 rounded-lg border mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* 搜索框 */}
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="搜索模板名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={loading}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
            />
          </div>

          {/* 模板类型筛选 */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTemplateTypeFilter('all')}
              className={`px-3 py-2 text-sm rounded-md transition-colors ${
                templateTypeFilter === 'all'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              全部类型
            </button>
            <button
              onClick={() => setTemplateTypeFilter('unified')}
              className={`px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-1 ${
                templateTypeFilter === 'unified'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              统一模板
            </button>
            <button
              onClick={() => setTemplateTypeFilter('custom')}
              className={`px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-1 ${
                templateTypeFilter === 'custom'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Target className="w-4 h-4" />
              自定义模板
            </button>
          </div>

          {/* 状态筛选 */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            disabled={loading}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
          >
            <option value="">所有状态</option>
            <option value="draft">草稿</option>
            <option value="active">活跃</option>
            <option value="inactive">非活跃</option>
          </select>
        </div>
      </div>

      {/* 🎯 动态内容区域 - 根据状态显示不同内容 */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-700">错误: {error}</div>
          <button
            onClick={loadTemplates}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            重新加载
          </button>
        </div>
      ) : loading ? (
        /* 只对数据内容显示骨架动画 */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border p-6 animate-pulse">
              <div className="flex items-center justify-between mb-4">
                <div className="h-6 w-6 bg-gray-200 rounded"></div>
                <div className="h-6 w-20 bg-gray-200 rounded-full"></div>
              </div>
              <div className="h-6 w-3/4 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 w-full bg-gray-200 rounded mb-4"></div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-16 bg-gray-200 rounded"></div>
                  <div className="h-4 w-8 bg-gray-200 rounded"></div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-4 w-20 bg-gray-200 rounded"></div>
                  <div className="h-4 w-8 bg-gray-200 rounded"></div>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <div className="h-4 w-24 bg-gray-200 rounded"></div>
                <div className="flex space-x-2">
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                  <div className="h-8 w-8 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* 实际数据内容 */
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <DualTemplateList
            templates={filteredTemplates}
            onView={(template) => setViewingTemplate(template)}
            onEdit={(template) => setEditingTemplate(template)}
            onDelete={(templateId) => handleDelete(templateId)}
            onClone={(template) => handleClone(template)}
            loading={false}
            hideFilters={true}
          />

          {/* 🆕 分页控制器 - 统一任务列表样式 */}
          {totalPages > 1 && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="flex-1 flex justify-between sm:hidden">
                {/* 移动端分页 */}
                <button
                  onClick={() => setPagination(prev => ({
                    ...prev,
                    offset: Math.max(0, prev.offset - prev.limit)
                  }))}
                  disabled={currentPage <= 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPagination(prev => ({
                    ...prev,
                    offset: prev.offset + prev.limit
                  }))}
                  disabled={currentPage >= totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>

              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                {/* 桌面端分页信息 */}
                <div>
                  <p className="text-sm text-gray-700">
                    显示第 <span className="font-medium">{pagination.offset + 1}</span> 到{' '}
                    <span className="font-medium">{Math.min(pagination.offset + pageSize, pagination.total)}</span> 项，
                    共 <span className="font-medium">{pagination.total}</span> 个模板
                  </p>
                </div>

                {/* 桌面端分页控件 */}
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="分页">
                    {/* 上一页按钮 */}
                    <button
                      onClick={() => setPagination(prev => ({
                        ...prev,
                        offset: Math.max(0, prev.offset - prev.limit)
                      }))}
                      disabled={currentPage <= 1}
                      className={`relative inline-flex items-center px-2 py-2 rounded-l-md border text-sm font-medium ${
                        currentPage <= 1
                          ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <span className="sr-only">上一页</span>
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>

                    {/* 页码按钮 */}
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 7) {
                        // 总页数少于等于7页，显示所有页
                        pageNum = i + 1;
                      } else {
                        // 总页数大于7页，智能显示
                        if (currentPage <= 4) {
                          // 当前页在前面
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 3) {
                          // 当前页在后面
                          pageNum = totalPages - 6 + i;
                        } else {
                          // 当前页在中间
                          pageNum = currentPage - 3 + i;
                        }
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPagination(prev => ({
                            ...prev,
                            offset: (pageNum - 1) * prev.limit
                          }))}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === pageNum
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    {/* 下一页按钮 */}
                    <button
                      onClick={() => setPagination(prev => ({
                        ...prev,
                        offset: prev.offset + prev.limit
                      }))}
                      disabled={currentPage >= totalPages}
                      className={`relative inline-flex items-center px-2 py-2 rounded-r-md border text-sm font-medium ${
                        currentPage >= totalPages
                          ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <span className="sr-only">下一页</span>
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 创建/编辑模板模态框 */}
      {(showCreateForm || editingTemplate) && builderResources && (
        <DualTemplateBuilder
          resources={builderResources}
          initialData={editingTemplate}
          onSave={handleSave}
          onCancel={() => {
            setShowCreateForm(false);
            setEditingTemplate(null);
          }}
          loading={saving}
        />
      )}

      {/* 查看详情模态框 */}
      {viewingTemplate && (
        <TemplateDetailModal
          template={viewingTemplate}
          onClose={() => setViewingTemplate(null)}
        />
      )}
    </div>
  );
}

