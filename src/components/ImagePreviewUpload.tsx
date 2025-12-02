/**
 * 图片预览上传组件 - 延迟上传模式
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Eye } from 'lucide-react';

interface PreviewImage {
  id: string;
  previewUrl: string;
  filename: string;
}

interface ImagePreviewUploadProps {
  onImagesReady: (attachments: Array<{ type: string; url: string; metadata: any }>) => void;
  initialAttachments?: Array<{ type: string; url: string; metadata: any }>;
  className?: string;
  // 🆕 实时更新当前的附件状态
  onAttachmentsChange?: (savedAttachments: Array<{ type: string; url: string; metadata: any }>) => void;
  // 🔧 接收外部的 hook 方法
  previewImages: PreviewImage[];
  uploading: boolean;
  addImagePreview: (file: File) => Promise<string>;
  removeImagePreview: (id: string) => void;
}

export function ImagePreviewUpload({
  onImagesReady,
  initialAttachments = [],
  className = '',
  onAttachmentsChange,
  previewImages,
  uploading,
  addImagePreview,
  removeImagePreview
}: ImagePreviewUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  // 🆕 管理已保存图片的状态（用于删除）
  const [savedAttachments, setSavedAttachments] = useState(initialAttachments);
  // 🔧 使用 ref 来避免无限循环
  const onAttachmentsChangeRef = useRef(onAttachmentsChange);
  const hasNotifiedInitial = useRef(false);

  // 🔧 保持 ref 最新
  useEffect(() => {
    onAttachmentsChangeRef.current = onAttachmentsChange;
  });

  // 🔧 只在组件首次挂载时通知父组件初始状态
  useEffect(() => {
    console.log('🐛 ImagePreviewUpload 初始化:', {
      hasCallback: !!onAttachmentsChangeRef.current,
      initialAttachmentsLength: initialAttachments.length,
      hasNotified: hasNotifiedInitial.current,
      initialAttachments: initialAttachments
    });

    if (!hasNotifiedInitial.current && onAttachmentsChangeRef.current && initialAttachments.length > 0) {
      console.log('🐛 首次调用 onAttachmentsChange，传递数据:', initialAttachments);
      onAttachmentsChangeRef.current(initialAttachments);
      hasNotifiedInitial.current = true;
    }
  }, [initialAttachments.length]); // 只依赖长度，避免引用变化导致的循环

  // 🔧 当initialAttachments变化时更新savedAttachments（但不通知父组件）
  useEffect(() => {
    console.log('🐛 更新 savedAttachments:', initialAttachments);
    setSavedAttachments(initialAttachments);
  }, [initialAttachments]);

  // 处理文件选择
  const handleFileSelect = async (file: File) => {
    try {
      await addImagePreview(file);
    } catch (error) {
      alert(error instanceof Error ? error.message : '添加图片失败');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // 清空input值，允许重复选择同一文件
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (imageFile) {
      handleFileSelect(imageFile);
    } else {
      alert('请拖拽图片文件');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  // 🆕 删除已保存的图片（同时删除存储空间的文件）
  const removeSavedAttachment = async (attachment: { url: string; media_id?: string; metadata?: any }) => {
    try {
      // 如果有 media_id，调用删除 API 删除存储空间的文件
      if (attachment.media_id) {
        console.log('🗑️ 正在删除存储空间的图片:', attachment.media_id);
        const response = await fetch(`/api/media/${attachment.media_id}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const error = await response.json();
          console.warn('⚠️ 删除存储文件失败:', error);
          // 继续执行，允许用户从列表中移除（但存储文件可能仍存在）
        } else {
          console.log('✅ 存储文件删除成功');
        }
      } else {
        console.warn('⚠️ 没有 media_id，无法删除存储文件');
      }

      // 从本地状态移除
      setSavedAttachments(prev => {
        const updated = prev.filter(att => att.url !== attachment.url);
        // 通知父组件状态变化
        onAttachmentsChange?.(updated);
        return updated;
      });
    } catch (error) {
      console.error('❌ 删除图片时出错:', error);
      alert('删除图片失败，请重试');
    }
  };

  // 获取所有图片（已保存的 + 预览的）
  const getAllImages = () => {
    const savedImages = savedAttachments.map(att => ({
      id: `saved_${att.url}`,
      type: 'saved' as const,
      url: att.url,
      media_id: att.media_id, // 🆕 包含 media_id
      filename: att.metadata?.filename || '已保存的图片',
      isUploaded: true,
      metadata: att.metadata // 🆕 包含完整 metadata
    }));

    const previewImagesFormatted = previewImages.map(img => ({
      id: img.id,
      type: 'preview' as const,
      url: img.previewUrl,
      filename: img.filename,
      isUploaded: false
    }));

    return [...savedImages, ...previewImagesFormatted];
  };

  const allImages = getAllImages();

  return (
    <div className={`space-y-4 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        上传图片（多模态测试）
        {previewImages.length > 0 && (
          <span className="ml-2 text-xs text-blue-600">
            {previewImages.length} 个图片待保存时上传
          </span>
        )}
      </label>

      {/* 拖拽上传区域 */}
      {!uploading && (
        <div
          className={`
            border-2 border-dashed rounded-lg p-4 text-center transition-colors
            ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}
            hover:border-gray-400 cursor-pointer
          `}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleFileInputChange}
            className="hidden"
            id="image-preview-upload"
          />

          <label
            htmlFor="image-preview-upload"
            className="cursor-pointer inline-flex flex-col items-center space-y-2"
          >
            <Upload className="w-8 h-8 text-gray-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-700">
                点击选择图片或拖拽到此处
              </p>
              <p className="text-xs text-gray-500">
                支持 JPG、PNG、GIF 格式，最大 5MB
              </p>
              <p className="text-xs text-blue-500">
                💡 图片将在保存测试用例时上传
              </p>
            </div>
          </label>
        </div>
      )}

      {/* 上传中状态 */}
      {uploading && (
        <div className="border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg p-4 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
          <p className="text-sm text-blue-700">正在上传图片...</p>
        </div>
      )}

      {/* 图片预览列表 */}
      {allImages.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700">
            图片列表 ({allImages.length} 个)
          </h4>
          <div className="space-y-2">
            {allImages.map((image) => (
              <div key={image.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-md">
                {/* 图片预览 */}
                <div className="flex-shrink-0">
                  <img
                    src={image.url}
                    alt={image.filename}
                    className="w-12 h-12 object-cover rounded border"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiNjY2MiIHZpZXdCb3g9IjAgMCAyNCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTkgMTJjMC0xLjY1IDEuMzUtMyAzLTNzMyAxLjM1IDMgMy0xLjM1IDMtMyAzLTMtMS4zNS0zLTN6bTMtMWMtLjU1IDAtMSAuNDUtMSAxczQuNDUgMSAxIDEgLjQ1IDEgMS0xeiIvPgo8cGF0aCBkPSJNMTcuMjUgN0w5IDdhLTIgMi0yIDAgMCAwLTIgMnY4YTIgMi0yIDAgMCAwIDIgMmg4YTIgMi0yIDAgMCAwIDItMlY5YTIgMi0yIDAgMCAwLTItMnptMCAxMEg5VjlIOXY4eiIvPgo8L3N2Zz4=';
                    }}
                  />
                </div>

                {/* 文件信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {image.filename}
                    </p>
                    {image.isUploaded ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        已上传
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                        待上传
                      </span>
                    )}
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center space-x-2">
                  {/* 查看大图 */}
                  <button
                    type="button"
                    onClick={() => {
                      const newWindow = window.open();
                      if (newWindow) {
                        newWindow.document.write(`<img src="${image.url}" style="max-width:100%; height:auto;" />`);
                        newWindow.document.title = image.filename;
                      }
                    }}
                    className="text-blue-500 hover:text-blue-700 p-1"
                    title="查看大图"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {/* 删除按钮 */}
                  <button
                    type="button"
                    onClick={() => {
                      if (image.type === 'preview') {
                        removeImagePreview(image.id);
                      } else {
                        // 🆕 删除已保存的图片（同时删除存储空间的文件）
                        if (confirm(`确定要删除图片 "${image.filename}" 吗？\n\n注意：这将同时删除存储空间中的文件。`)) {
                          removeSavedAttachment({
                            url: image.url,
                            media_id: image.media_id,
                            metadata: image.metadata
                          });
                        }
                      }
                    }}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="删除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {previewImages.length > 0 && (
            <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
              💡 <strong>{previewImages.length} 个新图片</strong>将在您点击"创建"或"更新"按钮时上传到服务器。点击"取消"不会产生存储费用。
            </div>
          )}
        </div>
      )}
    </div>
  );
}