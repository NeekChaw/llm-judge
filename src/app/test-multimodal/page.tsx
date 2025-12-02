/**
 * 多模态组件测试页面
 */

'use client';

import { useState } from 'react';
import {
  ImageUploader,
  MediaPreview,
  AttachmentList,
  MultimodalEditor
} from '@/components/multimodal';
import type { ContentAttachment } from '@/types/multimodal';

export default function TestMultimodalPage() {
  const [editorValue, setEditorValue] = useState({
    text: '这是一个多模态内容编辑器的测试。您可以在此输入文本并上传图像等媒体文件。',
    attachments: [] as ContentAttachment[]
  });

  const [uploaderAttachments, setUploaderAttachments] = useState<ContentAttachment[]>([]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="space-y-8">
        {/* 页面标题 */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            多模态组件测试
          </h1>
          <p className="text-gray-600">
            测试多模态内容编辑和媒体文件管理功能
          </p>
        </div>

        {/* 多模态编辑器 */}
        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            多模态内容编辑器
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <MultimodalEditor
              value={editorValue}
              onChange={setEditorValue}
              placeholder="输入您的多模态内容..."
              textRows={6}
              maxAttachments={5}
              showPreview={true}
            />
          </div>
        </section>

        {/* 图像上传器 */}
        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            图像上传器
          </h2>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <ImageUploader
              value={uploaderAttachments}
              onChange={setUploaderAttachments}
              maxFiles={3}
              maxSize={5}
            />
          </div>
        </section>

        {/* 附件列表 */}
        {uploaderAttachments.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              附件列表组件
            </h2>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <AttachmentList
                attachments={uploaderAttachments}
                onRemove={(index) => {
                  const newAttachments = uploaderAttachments.filter((_, i) => i !== index);
                  setUploaderAttachments(newAttachments);
                }}
                onDownload={(attachment) => {
                  console.log('下载附件:', attachment);
                }}
                allowBatchOperations={true}
                gridView={true}
              />
            </div>
          </section>
        )}

        {/* 媒体预览示例 */}
        {uploaderAttachments.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              媒体预览组件
            </h2>
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {uploaderAttachments.slice(0, 3).map((attachment, index) => (
                  <MediaPreview
                    key={index}
                    attachment={attachment}
                    onRemove={() => {
                      const newAttachments = uploaderAttachments.filter((_, i) => i !== index);
                      setUploaderAttachments(newAttachments);
                    }}
                    onDownload={() => {
                      console.log('下载:', attachment);
                    }}
                    showControls={true}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 状态信息 */}
        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            状态信息
          </h2>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h3 className="font-medium text-gray-700 mb-2">编辑器内容</h3>
                <p className="text-gray-600">文本长度: {editorValue.text.length} 字符</p>
                <p className="text-gray-600">附件数量: {editorValue.attachments.length}</p>
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-2">上传器内容</h3>
                <p className="text-gray-600">附件数量: {uploaderAttachments.length}</p>
                <p className="text-gray-600">
                  图像文件: {uploaderAttachments.filter(att => att.type === 'image').length}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 说明信息 */}
        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            功能说明
          </h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <ul className="space-y-2 text-sm text-blue-800">
              <li>• <strong>多模态编辑器</strong>：集成文本编辑和媒体上传，支持预览模式</li>
              <li>• <strong>图像上传器</strong>：支持拖拽上传、文件类型验证、大小限制</li>
              <li>• <strong>附件列表</strong>：支持搜索、过滤、批量操作、网格/列表视图切换</li>
              <li>• <strong>媒体预览</strong>：支持图像、音频、视频预览和全屏查看</li>
              <li>• <strong>API 集成</strong>：使用测试API端点，支持完整的上传、列表、删除操作</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}