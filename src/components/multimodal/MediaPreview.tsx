/**
 * 媒体预览组件
 * 支持图像、音频、视频和文档的预览
 */

'use client';

import { useState } from 'react';
import {
  Eye,
  Download,
  X,
  FileImage,
  FileAudio,
  FileVideo,
  FileText,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  ExternalLink
} from 'lucide-react';
import type { ContentAttachment, MediaAsset } from '@/types/multimodal';

interface MediaPreviewProps {
  attachment: ContentAttachment;
  mediaAsset?: MediaAsset;
  onRemove?: () => void;
  onDownload?: () => void;
  className?: string;
  showControls?: boolean;
}

export default function MediaPreview({
  attachment,
  mediaAsset,
  onRemove,
  onDownload,
  className = '',
  showControls = true
}: MediaPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);

  const getFileIcon = () => {
    switch (attachment.type) {
      case 'image':
        return <FileImage className="h-4 w-4" />;
      case 'audio':
        return <FileAudio className="h-4 w-4" />;
      case 'video':
        return <FileVideo className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getFileSize = () => {
    const size = attachment.metadata?.file_size || mediaAsset?.file_size;
    if (!size) return '';

    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handlePreview = () => {
    if (attachment.url) {
      if (attachment.type === 'image') {
        setShowFullscreen(true);
      } else {
        window.open(attachment.url, '_blank');
      }
    }
  };

  const renderPreview = () => {
    if (!attachment.url) {
      return (
        <div className="aspect-square w-full bg-gray-100 rounded-md flex items-center justify-center">
          {getFileIcon()}
          <span className="ml-2 text-sm text-gray-500">无预览</span>
        </div>
      );
    }

    switch (attachment.type) {
      case 'image':
        return (
          <div className="aspect-square w-full overflow-hidden rounded-md bg-gray-100">
            <img
              src={attachment.url}
              alt={attachment.description || '图像'}
              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
              onClick={handlePreview}
            />
          </div>
        );

      case 'video':
        return (
          <div className="aspect-video w-full bg-black rounded-md overflow-hidden">
            <video
              src={attachment.url}
              className="w-full h-full"
              controls
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            >
              您的浏览器不支持视频播放。
            </video>
          </div>
        );

      case 'audio':
        return (
          <div className="w-full bg-gray-50 rounded-md p-4 border">
            <div className="flex items-center space-x-3">
              <FileAudio className="h-8 w-8 text-blue-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {attachment.description || mediaAsset?.original_name || '音频文件'}
                </div>
                <audio
                  src={attachment.url}
                  className="w-full mt-2"
                  controls
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                >
                  您的浏览器不支持音频播放。
                </audio>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="w-full bg-gray-50 rounded-md p-4 border">
            <div className="flex items-center space-x-3">
              {getFileIcon()}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {attachment.description || mediaAsset?.original_name || '文档'}
                </div>
                <div className="text-xs text-gray-500">
                  {attachment.metadata?.mime_type || mediaAsset?.mime_type}
                </div>
              </div>
              <button
                onClick={handlePreview}
                className="p-2 text-gray-400 hover:text-gray-600"
                title="在新窗口中打开"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      <div className={`relative group ${className}`}>
        {renderPreview()}

        {/* 文件信息 */}
        <div className="mt-2 space-y-1">
          <div className="text-xs font-medium text-gray-700 truncate">
            {attachment.description || mediaAsset?.original_name || `文件`}
          </div>
          {getFileSize() && (
            <div className="text-xs text-gray-400">
              {getFileSize()}
            </div>
          )}
        </div>

        {/* 控制按钮 */}
        {showControls && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
            {attachment.type === 'image' && (
              <button
                onClick={handlePreview}
                className="p-1.5 bg-black/60 text-white rounded hover:bg-black/80 transition-colors"
                title="预览"
              >
                <Eye className="h-3 w-3" />
              </button>
            )}

            {onDownload && (
              <button
                onClick={onDownload}
                className="p-1.5 bg-black/60 text-white rounded hover:bg-black/80 transition-colors"
                title="下载"
              >
                <Download className="h-3 w-3" />
              </button>
            )}

            {onRemove && (
              <button
                onClick={onRemove}
                className="p-1.5 bg-red-500/80 text-white rounded hover:bg-red-600 transition-colors"
                title="删除"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* 全屏图像预览 */}
      {showFullscreen && attachment.type === 'image' && attachment.url && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
          <div className="relative max-w-screen-lg max-h-screen">
            <img
              src={attachment.url}
              alt={attachment.description || '图像'}
              className="max-w-full max-h-full object-contain"
            />
            <button
              onClick={() => setShowFullscreen(false)}
              className="absolute top-4 right-4 p-2 bg-black/60 text-white rounded-full hover:bg-black/80"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}