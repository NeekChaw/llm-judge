/**
 * 图片上传组件 - 优化版，使用真实文件上传
 */

import React, { useState } from 'react';
import { useImageUpload } from '@/hooks/useImageUpload';

interface ImageUploadBoxProps {
  onImageUploaded: (imageUrl: string, fileName: string) => void;
  className?: string;
}

export function ImageUploadBox({ onImageUploaded, className = '' }: ImageUploadBoxProps) {
  const { uploadState, uploadImage, resetUploadState } = useImageUpload();
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = async (file: File) => {
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    // 验证文件大小 (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('文件大小不能超过5MB');
      return;
    }

    const result = await uploadImage(file);

    if (result.success && result.url && result.fileName) {
      onImageUploaded(result.url, result.fileName);
      resetUploadState();
    } else {
      console.error('上传失败:', result.error);
      // 显示用户友好的错误信息
      if (result.error?.includes('mime type') && result.error?.includes('not supported')) {
        alert('❌ 不支持的文件格式\n请选择 JPG、PNG、GIF 等常见图片格式');
      } else if (result.error?.includes('size') || result.error?.includes('大小')) {
        alert('❌ 文件太大\n请选择小于 5MB 的图片文件');
      } else {
        alert(`❌ 上传失败\n${result.error || '未知错误，请稍后重试'}`);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
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

  return (
    <div className={`space-y-3 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        上传图片（多模态测试）
      </label>

      <div
        className={`
          border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}
          ${uploadState.uploading ? 'border-gray-200 bg-gray-50' : 'hover:border-gray-400'}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {uploadState.uploading ? (
          <div className="space-y-3">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">上传中...</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadState.progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500">{uploadState.progress}%</p>
            </div>
          </div>
        ) : (
          <>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              className="hidden"
              id="image-upload-optimized"
              disabled={uploadState.uploading}
            />

            <label
              htmlFor="image-upload-optimized"
              className="cursor-pointer inline-flex flex-col items-center space-y-2"
            >
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>

              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-700">
                  点击选择图片或拖拽到此处
                </p>
                <p className="text-xs text-gray-500">
                  支持 JPG、PNG、GIF 格式，最大 5MB
                </p>
              </div>
            </label>
          </>
        )}
      </div>

      {uploadState.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-400 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">上传失败</p>
              <p className="text-sm text-red-700 mt-1">{uploadState.error}</p>
            </div>
          </div>
          <button
            onClick={resetUploadState}
            className="mt-2 text-sm text-red-600 hover:text-red-500"
          >
            重试
          </button>
        </div>
      )}
    </div>
  );
}