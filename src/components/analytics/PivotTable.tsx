/**
 * 数据透视表组件
 * 支持多维度数据展示、动态列配置、排序、筛选等功能
 */

'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, Filter, Download, RefreshCw } from 'lucide-react';
// import { ExportButton } from './ExportButton';

export interface PivotColumn {
  key: string;
  title: string;
  dataType: 'string' | 'number' | 'date' | 'percentage';
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
  formatter?: (value: any) => string;
  aggregator?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

export interface PivotData {
  [key: string]: any;
}

export interface PivotTableProps {
  data: PivotData[];
  columns: PivotColumn[];
  loading?: boolean;
  title?: string;
  onRefresh?: () => void;
  onExport?: () => void;
  className?: string;
}

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

interface FilterConfig {
  [key: string]: {
    type: 'text' | 'number' | 'select';
    value: any;
    options?: string[];
  };
}

export function PivotTable({
  data,
  columns,
  loading = false,
  title,
  onRefresh,
  onExport,
  className = ''
}: PivotTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [filters, setFilters] = useState<FilterConfig>({});
  const [showFilters, setShowFilters] = useState(false);

  // 应用筛选和排序
  const processedData = useMemo(() => {
    let filtered = [...data];

    // 应用筛选
    Object.entries(filters).forEach(([key, filter]) => {
      if (filter.value !== '' && filter.value !== null && filter.value !== undefined) {
        filtered = filtered.filter(item => {
          const itemValue = item[key];
          
          switch (filter.type) {
            case 'text':
              return String(itemValue).toLowerCase().includes(String(filter.value).toLowerCase());
            case 'number':
              return Number(itemValue) === Number(filter.value);
            case 'select':
              return itemValue === filter.value;
            default:
              return true;
          }
        });
      }
    });

    // 应用排序
    if (sortConfig) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }

        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        
        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [data, filters, sortConfig]);

  // 排序处理
  const handleSort = useCallback((columnKey: string) => {
    setSortConfig(prevSort => {
      if (prevSort?.key === columnKey) {
        return prevSort.direction === 'asc' 
          ? { key: columnKey, direction: 'desc' }
          : null;
      }
      return { key: columnKey, direction: 'asc' };
    });
  }, []);

  // 筛选处理
  const handleFilter = useCallback((columnKey: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [columnKey]: {
        ...prev[columnKey],
        value
      }
    }));
  }, []);

  // 格式化单元格值
  const formatCellValue = useCallback((value: any, column: PivotColumn) => {
    if (value === null || value === undefined) return '-';

    if (column.formatter) {
      return column.formatter(value);
    }

    switch (column.dataType) {
      case 'number':
        return typeof value === 'number' ? value.toFixed(2) : value;
      case 'percentage':
        return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : value;
      case 'date':
        return new Date(value).toLocaleDateString();
      default:
        return String(value);
    }
  }, []);

  // 获取列的唯一值（用于筛选）
  const getColumnUniqueValues = useCallback((columnKey: string) => {
    const values = data.map(item => item[columnKey])
      .filter(value => value !== null && value !== undefined);
    return [...new Set(values)].sort();
  }, [data]);

  // 初始化筛选配置
  const initializeFilters = useCallback(() => {
    const initialFilters: FilterConfig = {};
    
    columns.forEach(column => {
      if (column.filterable) {
        const uniqueValues = getColumnUniqueValues(column.key);
        
        initialFilters[column.key] = {
          type: column.dataType === 'number' ? 'number' : 
                uniqueValues.length <= 20 ? 'select' : 'text',
          value: '',
          options: uniqueValues.length <= 20 ? uniqueValues.map(String) : undefined
        };
      }
    });
    
    setFilters(initialFilters);
  }, [columns, getColumnUniqueValues]);

  // 初始化筛选
  React.useEffect(() => {
    initializeFilters();
  }, [initializeFilters]);

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded mb-4"></div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      {/* 头部 */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
            <p className="text-sm text-gray-500 mt-1">
              显示 {processedData.length} 条记录 {data.length !== processedData.length && `(共 ${data.length} 条)`}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Filter className="h-4 w-4 mr-1" />
              筛选
            </button>
            
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                刷新
              </button>
            )}
            
            {onExport && (
              <button
                onClick={onExport}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="h-4 w-4 mr-1" />
                导出
              </button>
            )}
          </div>
        </div>

        {/* 筛选行 */}
        {showFilters && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {columns.filter(col => col.filterable).map(column => (
              <div key={column.key} className="flex flex-col">
                <label className="text-xs font-medium text-gray-700 mb-1">
                  {column.title}
                </label>
                
                {filters[column.key]?.type === 'select' ? (
                  <select
                    value={filters[column.key]?.value || ''}
                    onChange={(e) => handleFilter(column.key, e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="">全部</option>
                    {filters[column.key]?.options?.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={filters[column.key]?.type === 'number' ? 'number' : 'text'}
                    value={filters[column.key]?.value || ''}
                    onChange={(e) => handleFilter(column.key, e.target.value)}
                    placeholder={`搜索${column.title}...`}
                    className="text-sm border border-gray-300 rounded px-2 py-1"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map(column => (
                <th
                  key={column.key}
                  style={{ width: column.width }}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider
                    ${column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}
                  `}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.title}</span>
                    {column.sortable && (
                      <div className="flex flex-col">
                        <ChevronUp 
                          className={`h-3 w-3 ${
                            sortConfig?.key === column.key && sortConfig.direction === 'asc'
                              ? 'text-blue-600' : 'text-gray-400'
                          }`}
                        />
                        <ChevronDown 
                          className={`h-3 w-3 -mt-1 ${
                            sortConfig?.key === column.key && sortConfig.direction === 'desc'
                              ? 'text-blue-600' : 'text-gray-400'
                          }`}
                        />
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody className="bg-white divide-y divide-gray-200">
            {processedData.length === 0 ? (
              <tr>
                <td 
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  暂无数据
                </td>
              </tr>
            ) : (
              processedData.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  {columns.map(column => (
                    <td 
                      key={column.key}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                    >
                      {formatCellValue(row[column.key], column)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}