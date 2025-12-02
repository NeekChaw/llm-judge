'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ContentType, useTextDisplayConfig, getTextDisplayConfig } from '@/config/text-display';

interface ExpandableTextProps {
  text: string;
  contentType?: ContentType;
  maxLines?: number;
  maxHeight?: number; // 展开时的最大高度限制（像素）
  className?: string;
  style?: 'default' | 'input' | 'response' | 'reasoning' | 'reference';
}

export default function ExpandableText({ 
  text, 
  contentType,
  maxLines, 
  maxHeight,
  className = '',
  style 
}: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 使用全局配置或组件传入的参数
  const globalConfig = contentType ? getTextDisplayConfig(contentType) : null;
  
  const finalMaxLines = maxLines ?? globalConfig?.maxLines ?? 3;
  const finalMaxHeight = maxHeight ?? globalConfig?.maxHeight ?? 400;
  const finalStyle = style ?? globalConfig?.style ?? 'default';
  const estimatedLength = globalConfig?.estimatedLength ?? 300;
  
  // 估算是否需要截断（基于换行符和文本长度）
  const lines = text.split('\n');
  const isLongText = lines.length > finalMaxLines || text.length > estimatedLength;
  
  // 样式配置
  const styleConfig = {
    default: {
      container: 'bg-gray-50 rounded-lg p-4',
      text: 'text-sm text-gray-700'
    },
    input: {
      container: 'bg-gray-50 rounded-lg p-4',
      text: 'text-sm text-gray-700'
    },
    response: {
      container: 'bg-blue-50 border border-blue-200 rounded-lg p-4',
      text: 'text-sm text-gray-700'
    },
    reasoning: {
      container: 'bg-green-50 border border-green-200 rounded-lg p-4',
      text: 'text-sm text-gray-700'
    },
    reference: {
      container: 'bg-yellow-50 border border-yellow-200 rounded-lg p-4',
      text: 'text-sm text-gray-700'
    }
  };

  const currentStyle = styleConfig[finalStyle];
  
  return (
    <div className={`${currentStyle.container} ${className}`}>
      <div 
        className={`${currentStyle.text} whitespace-pre-wrap relative`}
        style={{
          display: !isExpanded && isLongText ? '-webkit-box' : 'block',
          WebkitLineClamp: !isExpanded && isLongText ? finalMaxLines : 'unset',
          WebkitBoxOrient: !isExpanded && isLongText ? 'vertical' : 'unset',
          overflow: !isExpanded && isLongText ? 'hidden' : (isExpanded ? 'auto' : 'visible'),
          textOverflow: !isExpanded && isLongText ? 'ellipsis' : 'unset',
          maxHeight: isExpanded && isLongText ? `${finalMaxHeight}px` : 'unset'
        }}
      >
        {text}
      </div>
      
      {isLongText && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 flex items-center text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              收起内容
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              展开全部 ({text.length} 字符, {lines.length} 行)
              {isLongText && text.length > 1000 && (
                <span className="ml-1 text-xs text-gray-500">- 将在滚动区域内显示</span>
              )}
            </>
          )}
        </button>
      )}
      
      {/* 字符统计（仅在展开时显示） */}
      {isExpanded && isLongText && (
        <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
          总计: {text.length} 字符, {lines.length} 行, {Math.ceil(text.length / 4)} 个token (估算)
        </div>
      )}
    </div>
  );
}