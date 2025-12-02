/**
 * 多模态内容编辑器
 * 集成文本编辑和媒体附件管理
 */

'use client';

import { useState, useCallback } from 'react';
import {
  Type,
  Image,
  Video,
  Mic,
  Paperclip,
  Eye,
  Code,
  Save,
  RefreshCw
} from 'lucide-react';
import ImageUploader from './ImageUploader';
import AttachmentList from './AttachmentList';
import type { ContentAttachment } from '@/types/multimodal';

interface MultimodalEditorProps {
  value?: {
    text: string;
    attachments: ContentAttachment[];
  };
  onChange?: (value: { text: string; attachments: ContentAttachment[] }) => void;
  placeholder?: string;
  textRows?: number;
  maxAttachments?: number;
  allowedTypes?: ('image' | 'audio' | 'video' | 'document')[];
  disabled?: boolean;
  className?: string;
  showPreview?: boolean;
}

export default function MultimodalEditor({
  value = { text: '', attachments: [] },
  onChange,
  placeholder = '输入内容...',
  textRows = 4,
  maxAttachments = 10,
  allowedTypes = ['image', 'audio', 'video', 'document'],
  disabled = false,
  className = '',
  showPreview = true
}: MultimodalEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [isUploading, setIsUploading] = useState(false);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.({
      ...value,
      text: e.target.value
    });
  }, [value, onChange]);

  const handleAttachmentsChange = useCallback((attachments: ContentAttachment[]) => {
    onChange?.({
      ...value,
      attachments
    });
  }, [value, onChange]);

  const handleRemoveAttachment = useCallback((index: number) => {
    const newAttachments = value.attachments.filter((_, i) => i !== index);
    handleAttachmentsChange(newAttachments);
  }, [value.attachments, handleAttachmentsChange]);

  const handleDownloadAttachment = useCallback((attachment: ContentAttachment) => {
    if (attachment.url) {
      const link = document.createElement('a');
      link.href = attachment.url;
      link.download = attachment.description || 'attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, []);

  const getAttachmentsByType = (type: ContentAttachment['type']) => {
    return value.attachments.filter(att => att.type === type);
  };

  const getContentSummary = () => {
    const textLength = value.text.length;
    const attachmentCount = value.attachments.length;
    const imageCount = getAttachmentsByType('image').length;
    const audioCount = getAttachmentsByType('audio').length;
    const videoCount = getAttachmentsByType('video').length;

    return {
      textLength,
      attachmentCount,
      imageCount,
      audioCount,
      videoCount,
      hasContent: textLength > 0 || attachmentCount > 0
    };
  };

  const summary = getContentSummary();

  const renderPreview = () => {
    return (
      <div className="space-y-4">
        {/* 文本内容 */}
        {value.text && (
          <div className="prose max-w-none">
            <div className="whitespace-pre-wrap text-gray-900 bg-gray-50 p-4 rounded-lg border">
              {value.text}
            </div>
          </div>
        )}

        {/* 附件预览 */}
        {value.attachments.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              附件 ({value.attachments.length})
            </h4>
            <AttachmentList
              attachments={value.attachments}
              onRemove={handleRemoveAttachment}
              onDownload={handleDownloadAttachment}
              showControls={false}
              gridView={true}
            />
          </div>
        )}

        {/* 空状态 */}
        {!summary.hasContent && (
          <div className="text-center py-12 text-gray-500">
            暂无内容
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`border border-gray-300 rounded-lg overflow-hidden ${className}`}>
      {/* 工具栏 */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* 标签页切换 */}
            {showPreview && (
              <div className="flex border border-gray-300 rounded">
                <button
                  onClick={() => setActiveTab('edit')}
                  className={`px-3 py-1 text-sm flex items-center space-x-1 ${
                    activeTab === 'edit'
                      ? 'bg-white text-gray-900 border-r border-gray-300'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Code className="h-3 w-3" />
                  <span>编辑</span>
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-3 py-1 text-sm flex items-center space-x-1 ${
                    activeTab === 'preview'
                      ? 'bg-white text-gray-900'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Eye className="h-3 w-3" />
                  <span>预览</span>
                </button>
              </div>
            )}

            {/* 内容统计 */}
            <div className="flex items-center space-x-3 text-xs text-gray-500">
              {summary.textLength > 0 && (
                <span className="flex items-center space-x-1">
                  <Type className="h-3 w-3" />
                  <span>{summary.textLength}字</span>
                </span>
              )}
              {summary.imageCount > 0 && (
                <span className="flex items-center space-x-1">
                  <Image className="h-3 w-3" />
                  <span>{summary.imageCount}</span>
                </span>
              )}
              {summary.audioCount > 0 && (
                <span className="flex items-center space-x-1">
                  <Mic className="h-3 w-3" />
                  <span>{summary.audioCount}</span>
                </span>
              )}
              {summary.videoCount > 0 && (
                <span className="flex items-center space-x-1">
                  <Video className="h-3 w-3" />
                  <span>{summary.videoCount}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isUploading && (
              <div className="flex items-center space-x-2 text-sm text-blue-600">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>上传中...</span>
              </div>
            )}

            <span className="text-xs text-gray-400">
              {value.attachments.length}/{maxAttachments} 附件
            </span>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-4">
        {activeTab === 'edit' ? (
          <div className="space-y-4">
            {/* 文本编辑器 */}
            <div>
              <label htmlFor="content-text" className="block text-sm font-medium text-gray-700 mb-2">
                文本内容
              </label>
              <textarea
                id="content-text"
                value={value.text}
                onChange={handleTextChange}
                placeholder={placeholder}
                rows={textRows}
                disabled={disabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
              />
            </div>

            {/* 附件上传 */}
            {allowedTypes.includes('image') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  图像附件
                </label>
                <ImageUploader
                  value={value.attachments}
                  onChange={handleAttachmentsChange}
                  maxFiles={maxAttachments}
                  disabled={disabled}
                />
              </div>
            )}

            {/* 已有附件列表 */}
            {value.attachments.length > 0 && (
              <div>
                <AttachmentList
                  attachments={value.attachments}
                  onRemove={handleRemoveAttachment}
                  onDownload={handleDownloadAttachment}
                  allowBatchOperations={true}
                  gridView={false}
                />
              </div>
            )}
          </div>
        ) : (
          renderPreview()
        )}
      </div>
    </div>
  );
}