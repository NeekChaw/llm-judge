/**
 * 图像上传组件
 * 支持拖拽上传、预览、进度显示等功能
 */

'use client';

import { useState, useCallback } from 'react';
import { Upload, X, Eye, FileImage, AlertCircle } from 'lucide-react';
import type { ContentAttachment, MediaAsset } from '@/types/multimodal';

interface ImageUploaderProps {
  value?: ContentAttachment[];
  onChange?: (attachments: ContentAttachment[]) => void;
  maxFiles?: number;
  maxSize?: number; // in MB
  accept?: string;
  disabled?: boolean;
  className?: string;
}

export default function ImageUploader({
  value = [],
  onChange,
  maxFiles = 5,
  maxSize = 10,
  accept = 'image/*',
  disabled = false,
  className = ''
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(async (files: FileList) => {
    if (disabled || files.length === 0) return;

    // 检查文件数量限制
    if (value.length + files.length > maxFiles) {
      setError(`最多只能上传 ${maxFiles} 个文件`);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const newAttachments: ContentAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 检查文件大小
        if (file.size > maxSize * 1024 * 1024) {
          setError(`文件 ${file.name} 超过 ${maxSize}MB 限制`);
          continue;
        }

        // 检查文件类型
        if (!file.type.startsWith('image/')) {
          setError(`文件 ${file.name} 不是有效的图像文件`);
          continue;
        }

        // 上传文件
        const formData = new FormData();
        formData.append('file', file);
        formData.append('entity_type', 'test_case'); // 可以根据实际需要调整
        formData.append('relation_type', 'input');

        const response = await fetch('/api/media/upload-test', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '上传失败');
        }

        const { media_asset }: { media_asset: MediaAsset } = await response.json();

        // 创建预览URL
        const previewUrl = media_asset.public_url;

        newAttachments.push({
          type: 'image',
          url: previewUrl,
          media_id: media_asset.id,
          description: file.name,
          metadata: {
            mime_type: file.type,
            file_size: file.size,
            original_name: file.name,
            width: 0, // 可以通过 Image 对象获取
            height: 0
          }
        });
      }

      // 更新状态
      onChange?.([...value, ...newAttachments]);

    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }, [value, onChange, maxFiles, maxSize, disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    handleUpload(files);
  }, [handleUpload, disabled]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleUpload(files);
    }
    // 重置 input 值，允许上传相同文件
    e.target.value = '';
  }, [handleUpload]);

  const removeAttachment = useCallback((index: number) => {
    const newAttachments = value.filter((_, i) => i !== index);
    onChange?.(newAttachments);
  }, [value, onChange]);

  const previewAttachment = useCallback((attachment: ContentAttachment) => {
    if (attachment.url) {
      window.open(attachment.url, '_blank');
    }
  }, []);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 上传区域 */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive
            ? 'border-blue-400 bg-blue-50'
            : disabled
            ? 'border-gray-200 bg-gray-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
      >
        <input
          type="file"
          accept={accept}
          multiple
          onChange={handleFileSelect}
          disabled={disabled || uploading}
          className="hidden"
          id="image-upload"
        />

        <label
          htmlFor="image-upload"
          className={`cursor-pointer ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          <div className="flex flex-col items-center space-y-2">
            {uploading ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            ) : (
              <Upload className={`h-8 w-8 ${disabled ? 'text-gray-400' : 'text-gray-500'}`} />
            )}

            <div className="text-sm text-gray-600">
              {uploading ? (
                '上传中...'
              ) : (
                <>
                  <span className="font-medium text-blue-600">点击上传</span>
                  {!disabled && ' 或拖拽文件到此处'}
                </>
              )}
            </div>

            <div className="text-xs text-gray-400">
              支持 PNG, JPG, WebP, GIF 格式，最大 {maxSize}MB
              {maxFiles > 1 && `，最多 ${maxFiles} 个文件`}
            </div>
          </div>
        </label>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center space-x-2 text-red-600 text-sm bg-red-50 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 已上传文件列表 */}
      {value.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">
            已上传图像 ({value.length}/{maxFiles})
          </h4>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {value.map((attachment, index) => (
              <div
                key={index}
                className="relative group bg-gray-50 rounded-lg p-2 border"
              >
                {/* 预览图 */}
                {attachment.url && (
                  <div className="aspect-square w-full mb-2 overflow-hidden rounded-md bg-gray-100">
                    <img
                      src={attachment.url}
                      alt={attachment.description || `图像 ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* 文件信息 */}
                <div className="text-xs text-gray-600 truncate">
                  {attachment.description || attachment.metadata?.original_name || `图像 ${index + 1}`}
                </div>

                {attachment.metadata?.file_size && (
                  <div className="text-xs text-gray-400">
                    {(attachment.metadata.file_size / 1024).toFixed(1)} KB
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
                  <button
                    onClick={() => previewAttachment(attachment)}
                    className="p-1 bg-black/50 text-white rounded hover:bg-black/70"
                    title="预览"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeAttachment(index)}
                    className="p-1 bg-black/50 text-white rounded hover:bg-black/70"
                    title="删除"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}