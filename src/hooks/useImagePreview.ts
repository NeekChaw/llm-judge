/**
 * 图片预览Hook - 用于本地预览，延迟上传
 */

import { useState } from 'react';

interface PreviewImage {
  id: string;
  file: File;
  previewUrl: string;
  filename: string;
  size: number;
}

interface UploadResult {
  success: boolean;
  url?: string;
  media_id?: string; // 🆕 添加 media_id 用于后续删除
  error?: string;
  filename?: string;
}

export function useImagePreview() {
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [uploading, setUploading] = useState(false);

  // 添加图片到预览列表
  const addImagePreview = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        reject(new Error('请选择图片文件'));
        return;
      }

      // 验证文件大小 (5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        reject(new Error('文件大小不能超过5MB'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const previewUrl = e.target?.result as string;
        const imageId = `preview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const previewImage: PreviewImage = {
          id: imageId,
          file,
          previewUrl,
          filename: file.name,
          size: file.size
        };

        setPreviewImages(prev => [...prev, previewImage]);
        resolve(imageId);
      };

      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };

      reader.readAsDataURL(file);
    });
  };

  // 删除预览图片
  const removeImagePreview = (imageId: string) => {
    setPreviewImages(prev => {
      const updated = prev.filter(img => img.id !== imageId);
      // 清理blob URL
      const removed = prev.find(img => img.id === imageId);
      if (removed && removed.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return updated;
    });
  };

  // 清空所有预览
  const clearPreviews = () => {
    // 清理所有blob URLs
    previewImages.forEach(img => {
      if (img.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(img.previewUrl);
      }
    });
    setPreviewImages([]);
  };

  // 上传所有预览图片
  const uploadAllImages = async (): Promise<UploadResult[]> => {
    if (previewImages.length === 0) {
      return [];
    }

    setUploading(true);
    const results: UploadResult[] = [];

    try {
      for (const previewImage of previewImages) {
        try {
          // 创建FormData
          const formData = new FormData();
          formData.append('file', previewImage.file);
          formData.append('entity_type', 'test_case');
          formData.append('relation_type', 'image');
          formData.append('description', `测试用例图片: ${previewImage.filename}`);

          // 上传图片
          const response = await fetch('/api/media/test-upload', {
            method: 'POST',
            body: formData
          });

          const result = await response.json();

          if (!response.ok || !result.success) {
            const errorMessage = result.error || result.message || `上传${previewImage.filename}失败`;
            results.push({
              success: false,
              error: errorMessage,
              filename: previewImage.filename
            });
            continue;
          }

          results.push({
            success: true,
            url: result.storage?.publicUrl,
            media_id: result.database?.id, // 🆕 保存 media_id
            filename: result.file?.originalName || previewImage.filename
          });

        } catch (error) {
          console.error(`上传${previewImage.filename}时出错:`, error);
          results.push({
            success: false,
            error: error instanceof Error ? error.message : '上传失败',
            filename: previewImage.filename
          });
        }
      }

      return results;

    } finally {
      setUploading(false);
    }
  };

  return {
    previewImages,
    uploading,
    addImagePreview,
    removeImagePreview,
    clearPreviews,
    uploadAllImages
  };
}