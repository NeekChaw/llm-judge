/**
 * 附件列表组件
 * 用于显示和管理多个媒体附件
 */

'use client';

import { useState, useCallback } from 'react';
import {
  Grid,
  List,
  Search,
  Filter,
  Download,
  Trash2,
  RefreshCw,
  Plus
} from 'lucide-react';
import MediaPreview from './MediaPreview';
import type { ContentAttachment, MediaAsset } from '@/types/multimodal';

interface AttachmentListProps {
  attachments: ContentAttachment[];
  mediaAssets?: MediaAsset[];
  onRemove?: (index: number) => void;
  onDownload?: (attachment: ContentAttachment, index: number) => void;
  onAdd?: () => void;
  onRefresh?: () => void;
  className?: string;
  showControls?: boolean;
  allowBatchOperations?: boolean;
  gridView?: boolean;
}

export default function AttachmentList({
  attachments,
  mediaAssets = [],
  onRemove,
  onDownload,
  onAdd,
  onRefresh,
  className = '',
  showControls = true,
  allowBatchOperations = false,
  gridView = true
}: AttachmentListProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(gridView ? 'grid' : 'list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'audio' | 'video' | 'document'>('all');
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  // 获取对应的媒体资产
  const getMediaAsset = useCallback((attachment: ContentAttachment): MediaAsset | undefined => {
    if (!attachment.media_id) return undefined;
    return mediaAssets.find(asset => asset.id === attachment.media_id);
  }, [mediaAssets]);

  // 过滤附件
  const filteredAttachments = attachments.filter(attachment => {
    // 类型过滤
    if (filterType !== 'all' && attachment.type !== filterType) {
      return false;
    }

    // 搜索过滤
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const mediaAsset = getMediaAsset(attachment);
      return (
        attachment.description?.toLowerCase().includes(searchLower) ||
        mediaAsset?.original_name?.toLowerCase().includes(searchLower) ||
        mediaAsset?.file_name?.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  const handleSelectItem = (index: number) => {
    if (!allowBatchOperations) return;

    setSelectedItems(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else {
        return [...prev, index];
      }
    });
  };

  const handleSelectAll = () => {
    if (!allowBatchOperations) return;

    if (selectedItems.length === filteredAttachments.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredAttachments.map((_, index) => index));
    }
  };

  const handleBatchRemove = () => {
    if (!onRemove || !allowBatchOperations) return;

    // 从高到低删除，避免索引错乱
    const sortedIndices = selectedItems.sort((a, b) => b - a);
    sortedIndices.forEach(index => {
      onRemove(index);
    });
    setSelectedItems([]);
  };

  const getTypeCount = (type: string) => {
    if (type === 'all') return attachments.length;
    return attachments.filter(attachment => attachment.type === type).length;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 工具栏 */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-medium text-gray-900">
            附件列表 ({filteredAttachments.length})
          </h3>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="刷新"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* 搜索 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索附件..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* 类型过滤 */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部 ({getTypeCount('all')})</option>
            <option value="image">图像 ({getTypeCount('image')})</option>
            <option value="audio">音频 ({getTypeCount('audio')})</option>
            <option value="video">视频 ({getTypeCount('video')})</option>
            <option value="document">文档 ({getTypeCount('document')})</option>
          </select>

          {/* 视图切换 */}
          <div className="flex border border-gray-300 rounded-md">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${
                viewMode === 'grid'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
              title="网格视图"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${
                viewMode === 'list'
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
              title="列表视图"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* 添加按钮 */}
          {onAdd && (
            <button
              onClick={onAdd}
              className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm flex items-center space-x-1"
            >
              <Plus className="h-4 w-4" />
              <span>添加</span>
            </button>
          )}
        </div>
      </div>

      {/* 批量操作栏 */}
      {allowBatchOperations && selectedItems.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md p-3">
          <div className="text-sm text-blue-700">
            已选择 {selectedItems.length} 个项目
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleBatchRemove}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center space-x-1"
            >
              <Trash2 className="h-3 w-3" />
              <span>删除</span>
            </button>
            <button
              onClick={() => setSelectedItems([])}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* 批量选择控制 */}
      {allowBatchOperations && filteredAttachments.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedItems.length === filteredAttachments.length && filteredAttachments.length > 0}
              onChange={handleSelectAll}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>全选</span>
          </label>
        </div>
      )}

      {/* 附件列表 */}
      {filteredAttachments.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {searchQuery || filterType !== 'all' ? '没有找到匹配的附件' : '暂无附件'}
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
              : 'space-y-3'
          }
        >
          {filteredAttachments.map((attachment, index) => {
            const originalIndex = attachments.findIndex(att => att === attachment);
            const mediaAsset = getMediaAsset(attachment);

            return (
              <div key={originalIndex} className="relative">
                {/* 批量选择复选框 */}
                {allowBatchOperations && (
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(originalIndex)}
                      onChange={() => handleSelectItem(originalIndex)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                )}

                <MediaPreview
                  attachment={attachment}
                  mediaAsset={mediaAsset}
                  onRemove={onRemove ? () => onRemove(originalIndex) : undefined}
                  onDownload={onDownload ? () => onDownload(attachment, originalIndex) : undefined}
                  showControls={showControls}
                  className={viewMode === 'list' ? 'flex items-center space-x-4 p-3 border rounded-lg' : ''}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}