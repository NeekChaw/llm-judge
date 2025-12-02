'use client';

import { useState } from 'react';
import { Eye, Edit, Trash2, Copy, Play, Layers, Target, Users, FileText, Activity } from 'lucide-react';
import type { Template, UnifiedTemplate, CustomTemplate } from '@/lib/template-types';

interface DualTemplateListProps {
  templates: Template[];
  onView?: (template: Template) => void;
  onEdit?: (template: Template) => void;
  onDelete?: (templateId: string) => void;
  onClone?: (template: Template) => void;
  onUse?: (template: Template) => void;
  loading?: boolean;
  hideFilters?: boolean;
}

export default function DualTemplateList({
  templates,
  onView,
  onEdit,
  onDelete,
  onClone,
  onUse,
  loading = false,
  hideFilters = false
}: DualTemplateListProps) {
  const [filter, setFilter] = useState<'all' | 'unified' | 'custom'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft' | 'inactive'>('all');

  // 过滤模板 - 当hideFilters为true时，直接使用传入的templates
  const filteredTemplates = hideFilters ? templates : templates.filter(template => {
    if (filter !== 'all' && template.template_type !== filter) return false;
    if (statusFilter !== 'all' && template.status !== statusFilter) return false;
    return true;
  });

  // 获取模板类型图标
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'unified':
        return <Layers className="w-4 h-4" />;
      case 'custom':
        return <Target className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  // 获取状态样式
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // 获取状态文本
  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '活跃';
      case 'draft':
        return '草稿';
      case 'inactive':
        return '非活跃';
      default:
        return status;
    }
  };

  // 获取模板类型文本
  const getTypeText = (type: string) => {
    switch (type) {
      case 'unified':
        return '统一模板';
      case 'custom':
        return '自定义模板';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, index) => (
          <div key={index} className="border rounded-lg p-6 animate-pulse">
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-2">
                <div className="h-5 bg-gray-200 rounded w-48"></div>
                <div className="h-4 bg-gray-200 rounded w-64"></div>
              </div>
              <div className="h-6 bg-gray-200 rounded w-20"></div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={hideFilters ? "space-y-0" : "space-y-6"}>
      {/* 过滤器 - 仅在不隐藏时显示 */}
      {!hideFilters && (
        <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-2 text-sm rounded-md transition-colors ${
              filter === 'all'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            全部类型
          </button>
          <button
            onClick={() => setFilter('unified')}
            className={`px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-1 ${
              filter === 'unified'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            统一模板
          </button>
          <button
            onClick={() => setFilter('custom')}
            className={`px-3 py-2 text-sm rounded-md transition-colors flex items-center gap-1 ${
              filter === 'custom'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Target className="w-4 h-4" />
            自定义模板
          </button>
        </div>
        
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">所有状态</option>
            <option value="active">活跃</option>
            <option value="draft">草稿</option>
            <option value="inactive">非活跃</option>
          </select>
        </div>
        </div>
      )}

      {/* 模板列表 */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <div className="text-gray-500 mb-2">
            {templates.length === 0 ? '暂无模板' : '没有符合条件的模板'}
          </div>
          <div className="text-sm text-gray-400">
            {templates.length === 0 ? '创建第一个模板开始使用' : '尝试调整过滤条件'}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="border rounded-lg p-6 bg-white hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(template.template_type)}
                      <h3 className="text-lg font-medium text-gray-900">{template.name}</h3>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusStyle(template.status)}`}>
                        {getStatusText(template.status)}
                      </span>
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        {getTypeText(template.template_type)}
                      </span>
                    </div>
                  </div>
                  
                  {template.description && (
                    <p className="text-gray-600 text-sm mb-3">{template.description}</p>
                  )}
                </div>
                
                <div className="flex items-center gap-1 ml-4">
                  {onView && (
                    <button
                      onClick={() => onView(template)}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                      title="查看详情"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  {onEdit && (
                    <button
                      onClick={() => onEdit(template)}
                      className="p-2 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50"
                      title="编辑"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                  {onClone && (
                    <button
                      onClick={() => onClone(template)}
                      className="p-2 text-gray-400 hover:text-green-600 rounded-md hover:bg-green-50"
                      title="克隆"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                  {onUse && template.status === 'active' && (
                    <button
                      onClick={() => onUse(template)}
                      className="p-2 text-gray-400 hover:text-purple-600 rounded-md hover:bg-purple-50"
                      title="使用模板"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(template.id)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* 模板详情信息 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">维度数:</span>
                  <span className="font-medium">{template.dimensions_count}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">评分器数:</span>
                  <span className="font-medium">{template.evaluators_count}</span>
                </div>
                
                {template.template_type === 'custom' && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500">题目数:</span>
                    <span className="font-medium">{(template as CustomTemplate).total_test_cases}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">创建时间:</span>
                  <span className="font-medium">
                    {new Date(template.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* 自定义模板额外信息 */}
              {template.template_type === 'custom' && (template as CustomTemplate).custom_mappings && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-2">自定义配置预览:</div>
                  <div className="flex flex-wrap gap-2">
                    {(template as CustomTemplate).custom_mappings.slice(0, 3).map((mapping, index) => (
                      <div key={index} className="bg-gray-100 px-2 py-1 rounded text-xs">
                        维度{index + 1}: {mapping.test_case_ids?.length || 0}题
                        {mapping.system_prompt && <span className="text-blue-600 ml-1">+角色</span>}
                      </div>
                    ))}
                    {(template as CustomTemplate).custom_mappings.length > 3 && (
                      <div className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-500">
                        +{(template as CustomTemplate).custom_mappings.length - 3}个
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}