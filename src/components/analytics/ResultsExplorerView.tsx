/**
 * 结果探索视图组件
 * 基于现有PivotTable组件，提供全局数据探索功能
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PivotTable, PivotColumn } from './PivotTable';
import { ExportDropdown } from './ExportDropdown';
import { ExportData } from '@/lib/export-utils';
import { Search, Filter, RefreshCw, Download, Calendar } from 'lucide-react';

interface FilterOptions {
  models: Array<{ id: string; name: string; provider: string }>;
  tasks: Array<{ id: string; name: string; description: string }>;
  dimensions: Array<{ id: string; name: string; description: string }>;
}

interface AdvancedFilters {
  search: string;
  modelIds: string[];
  taskIds: string[];
  dimensionIds: string[];
  scoreMin: number | null;
  scoreMax: number | null;
  dateFrom: string;
  dateTo: string;
  statusFilter: string[];
}

interface ExplorerData {
  result_id: string;
  task_name: string;
  model_name: string;
  model_provider: string;
  dimension_name: string;
  normalized_score: number;
  status: string;
  created_at: string;
}

interface ResultsExplorerViewProps {
  className?: string;
}

export function ResultsExplorerView({ className = '' }: ResultsExplorerViewProps) {
  const [data, setData] = useState<ExplorerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    models: [],
    tasks: [],
    dimensions: []
  });

  const [filters, setFilters] = useState<AdvancedFilters>({
    search: '',
    modelIds: [],
    taskIds: [],
    dimensionIds: [],
    scoreMin: null,
    scoreMax: null,
    dateFrom: '',
    dateTo: '',
    statusFilter: []
  });

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // 定义表格列配置
  const columns: PivotColumn[] = useMemo(() => [
    {
      key: 'task_name',
      title: '任务名称',
      dataType: 'string',
      sortable: true,
      filterable: true,
      width: 200
    },
    {
      key: 'model_name',
      title: '模型名称',
      dataType: 'string',
      sortable: true,
      filterable: true,
      width: 150
    },
    {
      key: 'model_provider',
      title: '模型提供商',
      dataType: 'string',
      sortable: true,
      filterable: true,
      width: 120
    },
    {
      key: 'dimension_name',
      title: '评估维度',
      dataType: 'string',
      sortable: true,
      filterable: true,
      width: 120
    },
    {
      key: 'normalized_score',
      title: '标准化得分',
      dataType: 'number',
      sortable: true,
      formatter: (value) => value ? value.toFixed(3) : '-',
      width: 120
    },
    {
      key: 'status',
      title: '状态',
      dataType: 'string',
      sortable: true,
      filterable: true,
      formatter: (value) => {
        const statusMap: Record<string, string> = {
          'completed': '已完成',
          'failed': '失败',
          'pending': '等待中',
          'running': '运行中'
        };
        return statusMap[value] || value;
      },
      width: 100
    },
    {
      key: 'created_at',
      title: '创建时间',
      dataType: 'date',
      sortable: true,
      formatter: (value) => new Date(value).toLocaleString('zh-CN'),
      width: 150
    }
  ], []);

  // 获取筛选选项
  const fetchFilterOptions = useCallback(async () => {
    try {
      const [modelsRes, tasksRes, dimensionsRes] = await Promise.all([
        fetch('/api/analytics/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'models' })
        }),
        fetch('/api/analytics/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'tasks' })
        }),
        fetch('/api/analytics/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'dimensions' })
        })
      ]);

      const [modelsData, tasksData, dimensionsData] = await Promise.all([
        modelsRes.json(),
        tasksRes.json(),
        dimensionsRes.json()
      ]);

      setFilterOptions({
        models: modelsData.models || [],
        tasks: tasksData.tasks || [],
        dimensions: dimensionsData.dimensions || []
      });
    } catch (error) {
      console.error('获取筛选选项失败:', error);
    }
  }, []);

  // 获取数据
  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.search && { search: filters.search }),
        ...(filters.modelIds.length && { model_ids: filters.modelIds.join(',') }),
        ...(filters.taskIds.length && { task_ids: filters.taskIds.join(',') }),
        ...(filters.dimensionIds.length && { dimension_ids: filters.dimensionIds.join(',') }),
        ...(filters.scoreMin !== null && { score_min: filters.scoreMin.toString() }),
        ...(filters.scoreMax !== null && { score_max: filters.scoreMax.toString() }),
        ...(filters.dateFrom && { date_from: filters.dateFrom }),
        ...(filters.dateTo && { date_to: filters.dateTo })
      });

      const response = await fetch(`/api/analytics/results?${queryParams}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setPagination(prev => ({
          ...prev,
          page: result.meta.current_page,
          total: result.meta.total_items,
          totalPages: result.meta.total_pages
        }));
      }
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);

  // 构造导出数据
  const exportData: ExportData = useMemo(() => {
    return {
      title: '评测结果数据导出',
      data: data,
      metadata: {
        exportedAt: new Date().toISOString(),
        totalRecords: pagination.total,
        currentPage: pagination.page,
        pageSize: pagination.limit,
        source: 'AI Benchmark V2 Analytics - 结果探索',
        filters: {
          search: filters.search,
          modelCount: filters.modelIds.length,
          taskCount: filters.taskIds.length,
          dimensionCount: filters.dimensionIds.length,
          scoreRange: filters.scoreMin !== null || filters.scoreMax !== null 
            ? `${filters.scoreMin || 'min'} - ${filters.scoreMax || 'max'}` 
            : 'all',
          dateRange: filters.dateFrom || filters.dateTo 
            ? `${filters.dateFrom || 'start'} to ${filters.dateTo || 'end'}` 
            : 'all'
        }
      }
    };
  }, [data, pagination, filters]);

  // 初始化
  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    fetchData(1);
  }, [filters]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 高级筛选器 */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">数据筛选</h3>
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Filter className="h-4 w-4 mr-1" />
            {showAdvancedFilters ? '隐藏高级筛选' : '显示高级筛选'}
          </button>
        </div>

        {/* 基础搜索 */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索任务名称、模型名称..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>

        {/* 高级筛选选项 */}
        {showAdvancedFilters && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* 模型筛选 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
                <select
                  multiple
                  value={filters.modelIds}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    modelIds: Array.from(e.target.selectedOptions, option => option.value)
                  }))}
                  className="w-full border border-gray-300 rounded-md text-sm"
                  size={4}
                >
                  {filterOptions.models.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>

              {/* 任务筛选 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">任务</label>
                <select
                  multiple
                  value={filters.taskIds}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    taskIds: Array.from(e.target.selectedOptions, option => option.value)
                  }))}
                  className="w-full border border-gray-300 rounded-md text-sm"
                  size={4}
                >
                  {filterOptions.tasks.map(task => (
                    <option key={task.id} value={task.id}>
                      {task.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 维度筛选 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">评估维度</label>
                <select
                  multiple
                  value={filters.dimensionIds}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    dimensionIds: Array.from(e.target.selectedOptions, option => option.value)
                  }))}
                  className="w-full border border-gray-300 rounded-md text-sm"
                  size={4}
                >
                  {filterOptions.dimensions.map(dimension => (
                    <option key={dimension.id} value={dimension.id}>
                      {dimension.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 分数范围 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最低分数</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={filters.scoreMin || ''}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    scoreMin: e.target.value ? parseFloat(e.target.value) : null
                  }))}
                  className="w-full border border-gray-300 rounded-md text-sm px-3 py-2"
                  placeholder="0.0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最高分数</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={filters.scoreMax || ''}
                  onChange={(e) => setFilters(prev => ({
                    ...prev,
                    scoreMax: e.target.value ? parseFloat(e.target.value) : null
                  }))}
                  className="w-full border border-gray-300 rounded-md text-sm px-3 py-2"
                  placeholder="100.0"
                />
              </div>

              {/* 日期范围 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md text-sm px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md text-sm px-3 py-2"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 数据表格 */}
      <div className="bg-white rounded-lg shadow-sm border min-h-[500px]">
        {/* 表格头部 */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">评测结果数据</h3>
              <p className="text-sm text-gray-500 mt-1">
                显示 {data.length} 条记录 {pagination.total !== data.length && `(共 ${pagination.total} 条)`}
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => fetchData(pagination.page)}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                刷新
              </button>
              
              <ExportDropdown
                data={exportData}
                filename={`evaluation_results_${new Date().toISOString().split('T')[0]}`}
                formats={['excel', 'csv', 'json']}
                defaultFormat="excel"
                disabled={loading || data.length === 0}
                onExportStart={(format) => console.log(`开始导出${format}格式`)}
                onExportComplete={(format) => console.log(`导出${format}格式完成`)}
                onExportError={(format, error) => console.error(`导出${format}格式失败:`, error)}
              />
            </div>
          </div>
        </div>

        {/* 表格内容 */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map(column => (
                  <th
                    key={column.key}
                    style={{ width: column.width }}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {column.title}
                  </th>
                ))}
              </tr>
            </thead>
            
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td 
                    colSpan={columns.length}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="ml-2">加载中...</span>
                    </div>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td 
                    colSpan={columns.length}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    暂无数据
                  </td>
                </tr>
              ) : (
                data.map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    {columns.map(column => (
                      <td 
                        key={column.key}
                        className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                      >
                        {column.formatter ? column.formatter(row[column.key]) : (row[column.key] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页控件 */}
      {pagination.totalPages > 1 && (
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              显示 {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} 条，
              共 {pagination.total} 条记录
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => fetchData(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                上一页
              </button>
              
              <span className="text-sm text-gray-700">
                第 {pagination.page} 页，共 {pagination.totalPages} 页
              </span>
              
              <button
                onClick={() => fetchData(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}