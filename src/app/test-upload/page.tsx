'use client';

import React from 'react';
import { ImageUploadBox } from '@/components/ImageUploadBox';

export default function TestUploadPage() {
  const handleImageUploaded = (imageUrl: string, fileName: string) => {
    console.log('✅ 图片上传成功:', { imageUrl, fileName });
    alert(`✅ 上传成功！\n文件名: ${fileName}\nURL: ${imageUrl}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            🧪 图片上传测试页面
          </h1>

          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              这是一个专门用于测试图片上传功能的页面。请尝试上传JPG、PNG等格式的图片文件。
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
              <h2 className="font-semibold text-blue-800 mb-2">🔧 测试说明：</h2>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 支持 JPG、PNG、GIF 等图片格式</li>
                <li>• 文件大小限制：5MB</li>
                <li>• 上传成功后会显示文件URL</li>
                <li>• 查看浏览器控制台获取详细日志</li>
              </ul>
            </div>
          </div>

          <ImageUploadBox
            onImageUploaded={handleImageUploaded}
            className="mb-6"
          />

          <div className="bg-gray-50 rounded p-4">
            <h3 className="font-semibold text-gray-800 mb-2">🔍 调试信息：</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <div>当前时间: {new Date().toLocaleString()}</div>
              <div>环境: {process.env.NODE_ENV}</div>
              <div>上传API: /api/media/test-upload</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}