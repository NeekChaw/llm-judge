'use client';

/**
 * 导出功能组件
 * 支持导出为PDF、Excel等格式
 */

import React from 'react';
import { Download, FileText, Table } from 'lucide-react';

interface ExportData {
  title: string;
  data: any[];
  columns?: { key: string; title: string }[];
  metadata?: {
    generatedAt: string;
    source: string;
    filters?: Record<string, any>;
  };
}

export interface ExportButtonProps {
  data: ExportData;
  filename?: string;
  onExport?: (format: 'pdf' | 'excel' | 'csv') => void;
  disabled?: boolean;
}

export function ExportButton({ 
  data, 
  filename = 'analytics-export', 
  onExport,
  disabled = false 
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState<string | null>(null);

  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    if (disabled || isExporting) return;
    
    setIsExporting(format);
    
    try {
      if (onExport) {
        onExport(format);
      } else {
        // 默认导出逻辑
        await performExport(format, data, filename);
      }
    } catch (error) {
      console.error(`导出${format}失败:`, error);
    } finally {
      setIsExporting(null);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download className="h-4 w-4 mr-2" />
        导出
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
          <div className="py-1" role="menu">
            <button
              onClick={() => handleExport('csv')}
              disabled={isExporting === 'csv'}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              role="menuitem"
            >
              <Table className="h-4 w-4 mr-2" />
              {isExporting === 'csv' ? '导出中...' : '导出为 CSV'}
            </button>
            
            <button
              onClick={() => handleExport('excel')}
              disabled={isExporting === 'excel'}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              role="menuitem"
            >
              <FileText className="h-4 w-4 mr-2" />
              {isExporting === 'excel' ? '导出中...' : '导出为 Excel'}
            </button>
            
            <button
              onClick={() => handleExport('pdf')}
              disabled={isExporting === 'pdf'}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              role="menuitem"
            >
              <FileText className="h-4 w-4 mr-2" />
              {isExporting === 'pdf' ? '导出中...' : '导出为 PDF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 执行导出操作
 */
async function performExport(format: 'pdf' | 'excel' | 'csv', data: ExportData, filename: string) {
  switch (format) {
    case 'csv':
      exportToCSV(data, filename);
      break;
    case 'excel':
      console.log('Excel导出功能需要集成xlsx库');
      alert('Excel导出功能开发中...');
      break;
    case 'pdf':
      console.log('PDF导出功能需要集成jsPDF等库');
      alert('PDF导出功能开发中...');
      break;
  }
}

/**
 * 导出为CSV格式
 */
function exportToCSV(exportData: ExportData, filename: string) {
  const { data, columns, title, metadata } = exportData;
  
  if (!data || data.length === 0) {
    alert('没有数据可导出');
    return;
  }

  // 构建CSV内容
  let csvContent = '';
  
  // 添加标题和元数据
  csvContent += `"${title}"\n`;
  
  if (metadata) {
    csvContent += `"生成时间: ${metadata.generatedAt}"\n`;
    csvContent += `"数据源: ${metadata.source}"\n`;
    if (metadata.filters) {
      csvContent += `"筛选条件: ${JSON.stringify(metadata.filters)}"\n`;
    }
    csvContent += '\n';
  }
  
  // 确定列配置
  const cols = columns || Object.keys(data[0] || {}).map(key => ({ key, title: key }));
  
  // 添加表头
  csvContent += cols.map(col => `"${col.title}"`).join(',') + '\n';
  
  // 添加数据行
  data.forEach(row => {
    const values = cols.map(col => {
      const value = row[col.key];
      if (value === null || value === undefined) return '""';
      if (typeof value === 'number') return value.toString();
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvContent += values.join(',') + '\n';
  });
  
  // 创建并下载文件
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * 快速导出组件
 */
export interface QuickExportProps {
  data: any[];
  filename?: string;
  title?: string;
  className?: string;
}

export function QuickExport({ 
  data, 
  filename = 'data', 
  title = '数据导出',
  className = '' 
}: QuickExportProps) {
  const exportData: ExportData = {
    title,
    data,
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'AI Benchmark V2 Analytics'
    }
  };

  return (
    <div className={className}>
      <ExportButton data={exportData} filename={filename} />
    </div>
  );
}