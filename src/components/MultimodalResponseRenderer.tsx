/**
 * 多模态响应渲染组件 - 兼容性优先设计
 * 支持纯文本、Markdown图片、JSON格式和混合内容的智能渲染
 */

import React, { useState } from 'react';
import { Eye, EyeOff, Image as ImageIcon, FileText, AlertTriangle } from 'lucide-react';

interface ContentAttachment {
  type: 'image' | 'audio' | 'video' | 'file';
  url?: string;
  base64?: string;
  metadata?: {
    mime_type?: string;
    filename?: string;
    alt_text?: string;
  };
}

interface MultimodalResponse {
  content: string;
  attachments?: ContentAttachment[];
  modalities_used?: {
    input: string[];
    output: string[];
  };
}

interface MultimodalResponseRendererProps {
  response: string | MultimodalResponse;
  className?: string;
  maxImageHeight?: number;
  showImageControls?: boolean;
}

export function MultimodalResponseRenderer({
  response,
  className = '',
  maxImageHeight = 300,
  showImageControls = true
}: MultimodalResponseRendererProps) {
  const [showImages, setShowImages] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // 智能解析响应内容
  const parseResponse = (input: string | MultimodalResponse): {
    textContent: string;
    attachments: ContentAttachment[];
    isMultimodal: boolean;
  } => {
    // 情况1: 已经是结构化的多模态响应
    if (typeof input === 'object' && input.content !== undefined) {
      return {
        textContent: input.content || '',
        attachments: input.attachments || [],
        isMultimodal: true
      };
    }

    // 情况2: 纯字符串响应，尝试智能检测
    const stringInput = String(input);

    // 检测JSON格式的响应
    try {
      const parsed = JSON.parse(stringInput);
      if (parsed.content !== undefined || parsed.attachments !== undefined) {
        return {
          textContent: parsed.content || stringInput,
          attachments: parsed.attachments || [],
          isMultimodal: true
        };
      }
    } catch {
      // 不是JSON，继续其他检测
    }

    // 检测Markdown图片链接
    const markdownImages: ContentAttachment[] = [];
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = imageRegex.exec(stringInput)) !== null) {
      const [, altText, url] = match;
      markdownImages.push({
        type: 'image',
        url: url.trim(),
        metadata: {
          alt_text: altText || '图片',
          filename: url.split('/').pop() || 'image'
        }
      });
    }

    // 检测直接的图片URL（常见格式）
    const urlImageRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg))/gi;
    const urlMatches = stringInput.match(urlImageRegex) || [];

    urlMatches.forEach(url => {
      // 避免重复添加已经在Markdown中的图片
      const alreadyExists = markdownImages.some(img => img.url === url);
      if (!alreadyExists) {
        markdownImages.push({
          type: 'image',
          url: url.trim(),
          metadata: {
            alt_text: '图片',
            filename: url.split('/').pop() || 'image'
          }
        });
      }
    });

    return {
      textContent: stringInput,
      attachments: markdownImages,
      isMultimodal: markdownImages.length > 0
    };
  };

  const { textContent, attachments, isMultimodal } = parseResponse(response);

  const handleImageError = (imageUrl: string) => {
    setImageErrors(prev => new Set([...prev, imageUrl]));
  };

  const renderImage = (attachment: ContentAttachment, index: number) => {
    const imageUrl = attachment.url || (attachment.base64 ? `data:${attachment.metadata?.mime_type || 'image/jpeg'};base64,${attachment.base64}` : '');
    const altText = attachment.metadata?.alt_text || attachment.metadata?.filename || `图片 ${index + 1}`;
    const hasError = imageErrors.has(imageUrl);

    if (hasError) {
      return (
        <div
          key={index}
          className="border border-red-200 bg-red-50 rounded-lg p-4 flex items-center space-x-3 text-red-700"
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-medium">图片加载失败</div>
            <div className="text-sm opacity-75">
              {attachment.metadata?.filename || '未知文件'}
            </div>
            <div className="text-xs opacity-60 mt-1 break-all">
              {imageUrl.substring(0, 100)}{imageUrl.length > 100 ? '...' : ''}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={index} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
        <div className="p-2 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <ImageIcon className="w-4 h-4" />
            <span>{altText}</span>
          </div>
          {attachment.metadata?.filename && (
            <span className="text-xs text-gray-500">{attachment.metadata.filename}</span>
          )}
        </div>
        <div className="p-2">
          <img
            src={imageUrl}
            alt={altText}
            className="max-w-full h-auto rounded"
            style={{ maxHeight: `${maxImageHeight}px` }}
            onError={() => handleImageError(imageUrl)}
            loading="lazy"
          />
        </div>
      </div>
    );
  };

  const renderTextContent = () => {
    // 如果包含图片附件，从文本中移除Markdown图片语法以避免重复显示
    let displayText = textContent;
    if (attachments.length > 0) {
      displayText = textContent.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
      // 清理多余的空行
      displayText = displayText.replace(/\n{3,}/g, '\n\n').trim();
    }

    return (
      <div className="bg-green-50 border-l-4 border-green-400 p-3 rounded-r text-sm leading-relaxed">
        {displayText ? (
          <pre className="whitespace-pre-wrap">{displayText}</pre>
        ) : (
          <span className="text-gray-400 italic">暂无文本内容</span>
        )}
      </div>
    );
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 多模态指示器和控制 */}
      {isMultimodal && attachments.length > 0 && showImageControls && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center space-x-2 text-sm text-blue-700">
            <ImageIcon className="w-4 h-4" />
            <span>多模态响应 • {attachments.length} 张图片</span>
          </div>
          <button
            onClick={() => setShowImages(!showImages)}
            className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            {showImages ? (
              <>
                <EyeOff className="w-3 h-3" />
                <span>隐藏图片</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3" />
                <span>显示图片</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 文本内容 */}
      <div>
        <div className="flex items-center space-x-2 mb-2">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">文本内容</span>
        </div>
        {renderTextContent()}
      </div>

      {/* 图片附件 */}
      {isMultimodal && attachments.length > 0 && showImages && (
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <ImageIcon className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              图片内容 ({attachments.filter(a => a.type === 'image').length})
            </span>
          </div>
          <div className="space-y-3">
            {attachments
              .filter(attachment => attachment.type === 'image')
              .map((attachment, index) => renderImage(attachment, index))
            }
          </div>
        </div>
      )}

      {/* 兼容性提示 */}
      {!isMultimodal && (
        <div className="text-xs text-gray-500 mt-2">
          ✓ 纯文本响应 • 完全兼容现有显示逻辑
        </div>
      )}
    </div>
  );
}

export default MultimodalResponseRenderer;