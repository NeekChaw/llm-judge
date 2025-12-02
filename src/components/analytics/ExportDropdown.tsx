/**
 * 通用数据导出下拉组件
 * 支持Excel、CSV、JSON多种格式
 */

'use client';

import React, { useState, useCallback } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, FileCode } from 'lucide-react';
import { 
  exportData, 
  ExportFormat, 
  ExportData, 
  MatrixExportData,
  getFormatDisplayName,
  getFormatIcon 
} from '@/lib/export-utils';

interface ExportDropdownProps {
  data: ExportData | MatrixExportData;
  filename?: string;
  formats?: ExportFormat[];
  defaultFormat?: ExportFormat;
  disabled?: boolean;
  className?: string;
  onExportStart?: (format: ExportFormat) => void;
  onExportComplete?: (format: ExportFormat) => void;
  onExportError?: (format: ExportFormat, error: Error) => void;
}

export function ExportDropdown({
  data,
  filename,
  formats = ['excel', 'csv', 'json'],
  defaultFormat = 'excel',
  disabled = false,
  className = '',
  onExportStart,
  onExportComplete,
  onExportError
}: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  // 格式图标映射
  const formatIcons = {
    excel: FileSpreadsheet,
    csv: FileText,
    json: FileCode
  };

  // 处理导出
  const handleExport = useCallback(async (format: ExportFormat) => {
    if (disabled || exporting) return;

    try {
      setExporting(format);
      setIsOpen(false);
      
      onExportStart?.(format);

      // 验证数据
      if (!data.data || data.data.length === 0) {
        throw new Error('没有数据可导出');
      }

      // 执行导出
      exportData(data, format, filename);
      
      onExportComplete?.(format);
      
      // 显示成功提示
      if (typeof window !== 'undefined') {
        // 可以在这里添加toast通知
        console.log(`✅ ${getFormatDisplayName(format)}导出成功`);
      }
      
    } catch (error) {
      console.error('导出失败:', error);
      onExportError?.(format, error as Error);
      
      // 显示错误提示
      alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setExporting(null);
    }
  }, [data, filename, disabled, exporting, onExportStart, onExportComplete, onExportError]);

  // 快速导出（默认格式）
  const handleQuickExport = useCallback(() => {
    handleExport(defaultFormat);
  }, [defaultFormat, handleExport]);

  // 获取导出按钮文本
  const getExportButtonText = () => {
    if (exporting) {
      return `导出中... (${getFormatDisplayName(exporting)})`;
    }
    return '导出';
  };

  // 获取格式描述
  const getFormatDescription = (format: ExportFormat) => {
    const descriptions = {
      excel: '适合数据分析和制作图表',
      csv: '轻量级，适合程序处理',
      json: '开发者友好，API集成'
    };
    return descriptions[format];
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {/* 主导出按钮 */}
      <div className="flex">
        <button
          onClick={handleQuickExport}
          disabled={disabled || !!exporting}
          className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-l-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4 mr-1" />
          {getExportButtonText()}
        </button>
        
        {/* 下拉按钮 */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled || !!exporting}
          className="inline-flex items-center px-2 py-1.5 border border-l-0 border-gray-300 rounded-r-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
          <div className="py-1">
            {/* 导出格式选项 */}
            <div className="px-4 py-2 text-sm text-gray-500 border-b">选择导出格式</div>
            
            {formats.map((format) => {
              const Icon = formatIcons[format];
              const isExporting = exporting === format;
              
              return (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  disabled={disabled || !!exporting}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                    format === defaultFormat ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <Icon className="h-5 w-5 text-gray-500 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          {getFormatIcon(format)} {getFormatDisplayName(format)}
                        </span>
                        {format === defaultFormat && (
                          <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">推荐</span>
                        )}
                        {isExporting && (
                          <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded">导出中...</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {getFormatDescription(format)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            
            {/* 数据统计 */}
            <div className="px-4 py-2 text-xs text-gray-500 border-t bg-gray-50">
              数据条数: {data.data.length} | 更新时间: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}
      
      {/* 点击外部关闭 */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

// 简化版导出按钮（只有一个格式）
interface SimpleExportButtonProps {
  data: ExportData | MatrixExportData;
  format?: ExportFormat;
  filename?: string;
  disabled?: boolean;
  className?: string;
}

export function SimpleExportButton({
  data,
  format = 'excel',
  filename,
  disabled = false,
  className = ''
}: SimpleExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (disabled || exporting) return;

    try {
      setExporting(true);
      
      if (!data.data || data.data.length === 0) {
        throw new Error('没有数据可导出');
      }

      exportData(data, format, filename);
      console.log(`✅ ${getFormatDisplayName(format)}导出成功`);
      
    } catch (error) {
      console.error('导出失败:', error);
      alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setExporting(false);
    }
  }, [data, format, filename, disabled, exporting]);

  const Icon = format === 'excel' ? FileSpreadsheet : format === 'csv' ? FileText : FileCode;

  return (
    <button
      onClick={handleExport}
      disabled={disabled || exporting}
      className={`inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <Icon className="h-4 w-4 mr-1" />
      {exporting ? '导出中...' : `导出${getFormatDisplayName(format)}`}
    </button>
  );
}