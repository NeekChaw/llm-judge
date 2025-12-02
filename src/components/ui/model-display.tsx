/**
 * 模型显示组件 - 多厂商架构UI适配
 * 
 * 支持逻辑名称显示和厂商信息展示
 * 向后兼容现有系统
 */

import { Model } from '@/types/database';
import { getDisplayName, getApiModelName, extractVendorName, groupModelsByLogicalName, ExtendedModel } from '@/lib/model-utils';
import { Badge } from '@/components/ui/badge';

interface ModelDisplayProps {
  model: Model;
  showVendor?: boolean;
  showTags?: boolean;
  showStatus?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface ModelCardProps extends ModelDisplayProps {
  selected?: boolean;
  onClick?: () => void;
  showConfig?: boolean;
  useModelDefaults?: boolean;
  providerCount?: number;
  providers?: string[];
}

/**
 * 基础模型显示组件
 */
export function ModelDisplay({ 
  model, 
  showVendor = false, 
  showTags = false, 
  showStatus = false,
  size = 'md',
  className = '' 
}: ModelDisplayProps) {
  const displayName = getDisplayName(model);
  const vendorName = model.vendor_name || extractVendorName(model.name);
  
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg font-medium'
  };
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={sizeClasses[size]}>
        {displayName}
      </span>
      
      {showVendor && vendorName !== 'Unknown' && (
        <Badge variant="outline" className="text-xs">
          {vendorName}
        </Badge>
      )}
      
      {showStatus && model.status && model.status !== 'active' && (
        <Badge variant={model.status === 'inactive' ? 'destructive' : 'secondary'} className="text-xs">
          {model.status}
        </Badge>
      )}
      
      {showTags && model.tags && model.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {model.tags.map(tag => (
            <Badge 
              key={tag}
              variant={
                tag === '非推理' ? 'secondary' :
                tag === '推理' ? 'default' :
                tag === '多模态' ? 'outline' :
                'secondary'
              }
              className="text-xs"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 模型选择卡片组件
 */
export function ModelCard({ 
  model, 
  selected = false, 
  onClick,
  showConfig = false,
  useModelDefaults = true,
  showVendor = true,
  showTags = true,
  providerCount = 1,
  providers = [],
  className = ''
}: ModelCardProps) {
  const displayName = getDisplayName(model);
  const hasDefaults = model.default_max_tokens != null && model.default_temperature != null;
  
  return (
    <div
      className={`relative rounded-lg border p-4 cursor-pointer transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
      } ${className}`}
      onClick={onClick}
    >
      <div className="flex items-start">
        <input
          type="checkbox"
          checked={selected}
          onChange={onClick}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
        />
        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-900">
              {displayName}
            </h3>
          </div>
          
          {showVendor && (
            <p className="text-sm text-gray-500 mb-2">
              {providers.length > 0 ? providers.join(', ') : 'Unknown'}
              <span className="ml-2 text-xs">
                · {providerCount}个提供商
              </span>
            </p>
          )}
          
          {/* 显示标签 */}
          {showTags && model.tags && model.tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {model.tags.map(tag => (
                <Badge 
                  key={tag}
                  variant={
                    tag === '非推理' ? 'secondary' :
                    tag === '推理' ? 'default' :
                    tag === '多模态' ? 'outline' :
                    'secondary'
                  }
                  className="text-xs"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          
          {/* 显示默认配置状态 */}
          {showConfig && useModelDefaults && (
            <div className="mt-2">
              {hasDefaults ? (
                <div className="flex items-center gap-1 text-xs">
                  <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-green-600">已配置默认参数</span>
                  {model.default_thinking_budget && (
                    <span className="text-green-600 ml-1">
                      · 思考链: {model.default_thinking_budget}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs">
                  <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <span className="text-blue-600">使用系统默认值</span>
                </div>
              )}
            </div>
          )}
          
          {/* 模型性能指标（如果有的话） */}
          {model.success_rate != null && model.success_rate < 1.0 && (
            <div className="mt-2 text-xs text-gray-500">
              成功率: {(model.success_rate * 100).toFixed(1)}%
            </div>
          )}
          
          {/* 活跃状态显示 */}
          {model.status && model.status !== 'active' && (
            <div className="mt-2">
              <Badge variant="secondary" className="text-xs">
                {model.status === 'inactive' ? '非活跃' : model.status === 'maintenance' ? '维护中' : model.status}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 模型列表显示组件 - 按逻辑名称分组显示
 */
interface ModelListProps {
  models: Model[];
  selectedModels?: string[];
  onModelToggle?: (modelId: string) => void;
  tagFilter?: string;
  searchQuery?: string;
  showVendor?: boolean;
  showConfig?: boolean;
  useModelDefaults?: boolean;
  className?: string;
  // 分页相关
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
  };
  onPageChange?: (page: number) => void;
}

export function ModelList({
  models,
  selectedModels = [],
  onModelToggle,
  tagFilter = '',
  searchQuery = '',
  showVendor = true,
  showConfig = false,
  useModelDefaults = true,
  className = '',
  pagination,
  onPageChange
}: ModelListProps) {
  // 将模型转换为ExtendedModel类型并按逻辑名称分组
  const extendedModels = models as ExtendedModel[];
  const modelGroups = groupModelsByLogicalName(extendedModels);

  // 应用标签筛选和搜索筛选
  const filteredGroups = modelGroups.filter(group => {
    // 标签筛选
    if (tagFilter) {
      const hasMatchingTag = group.models.some(model => model.tags?.includes(tagFilter));
      if (!hasMatchingTag) return false;
    }

    // 搜索筛选
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      // 搜索逻辑名称
      const logicalNameMatch = group.logicalName.toLowerCase().includes(query);
      // 或者搜索组内任何一个模型的原始名称
      const modelNameMatch = group.models.some(model =>
        model.name.toLowerCase().includes(query) ||
        model.logical_name?.toLowerCase().includes(query) ||
        model.vendor_name?.toLowerCase().includes(query) ||
        model.provider?.toLowerCase().includes(query)
      );
      if (!logicalNameMatch && !modelNameMatch) return false;
    }

    return true;
  });

  // 应用分页
  const paginatedGroups = pagination
    ? filteredGroups.slice(
        (pagination.page - 1) * pagination.pageSize,
        pagination.page * pagination.pageSize
      )
    : filteredGroups;

  // 处理组选择：只调用一次onModelToggle，让父组件处理组选择逻辑
  const handleGroupToggle = (group: any) => {
    // 使用组中第一个模型的ID作为代表，父组件会处理整个组的选择逻辑
    const representativeModelId = group.models[0]?.id;
    if (representativeModelId && onModelToggle) {
      onModelToggle(representativeModelId);
    }
  };

  const totalPages = pagination ? Math.ceil(filteredGroups.length / pagination.pageSize) : 1;

  return (
    <div className={className}>
      {/* 无结果提示 */}
      {filteredGroups.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {searchQuery || tagFilter
              ? '没有找到匹配的模型，请尝试调整搜索条件'
              : '暂无可用模型'}
          </p>
        </div>
      )}

      {filteredGroups.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedGroups.map((group) => {
        // 选择组内第一个模型作为代表显示
        const representativeModel = group.models[0];
        const groupModelIds = group.models.map(m => m.id);
        const isGroupSelected = groupModelIds.every(id => selectedModels.includes(id));
        
        // 获取所有提供商名称并去重
        const providers = Array.from(new Set(
          group.models.map(model => {
            return model.provider || model.vendor_name || extractVendorName(model.name);
          }).filter(provider => provider !== 'Unknown')
        ));
        
        return (
          <ModelCard
            key={group.id}
            model={representativeModel}
            selected={isGroupSelected}
            onClick={() => handleGroupToggle(group)}
            showVendor={showVendor}
            showConfig={showConfig}
            useModelDefaults={useModelDefaults}
            providerCount={group.models.length}
            providers={providers}
          />
        );
            })}
          </div>

          {/* 分页控件 */}
          {pagination && totalPages > 1 && (
      <div className="flex items-center justify-center gap-4 mt-6">
        <button
          onClick={() => onPageChange && onPageChange(pagination.page - 1)}
          disabled={pagination.page === 1}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          上一页
        </button>

        <div className="flex items-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => onPageChange && onPageChange(pageNum)}
              className={`px-3 py-2 text-sm font-medium rounded-md ${
                pageNum === pagination.page
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {pageNum}
            </button>
          ))}
        </div>

        <button
          onClick={() => onPageChange && onPageChange(pagination.page + 1)}
          disabled={pagination.page === totalPages}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          下一页
        </button>
      </div>
    )}

          {/* 分页信息 */}
          {pagination && (
            <div className="flex items-center justify-center mt-4 text-sm text-gray-600">
              第 {(pagination.page - 1) * pagination.pageSize + 1} - {Math.min(pagination.page * pagination.pageSize, filteredGroups.length)} 项，
              共 {filteredGroups.length} 项
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 模型简洁显示组件 - 用于列表等场景
 */
interface ModelBriefProps {
  model: Model;
  className?: string;
}

export function ModelBrief({ model, className = '' }: ModelBriefProps) {
  const displayName = getDisplayName(model);
  const vendorName = model.vendor_name || extractVendorName(model.name);
  
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="font-medium">{displayName}</span>
      {vendorName !== 'Unknown' && (
        <Badge variant="outline" className="text-xs">
          {vendorName}
        </Badge>
      )}
      {model.status && model.status !== 'active' && (
        <div className={`w-2 h-2 rounded-full ${
          model.status === 'inactive' ? 'bg-red-400' :
          model.status === 'maintenance' ? 'bg-yellow-400' :
          'bg-green-400'
        }`} />
      )}
    </div>
  );
}

// 导出默认组件
export default ModelDisplay;