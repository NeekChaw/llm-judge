/**
 * 通用数据导出工具库
 * 支持Excel、CSV、JSON多种格式导出
 */

import * as XLSX from 'xlsx';

// 导出格式类型
export type ExportFormat = 'excel' | 'csv' | 'json';

// 导出数据的通用接口
export interface ExportData {
  title: string;
  data: any[];
  metadata?: {
    generatedAt?: string;
    source?: string;
    [key: string]: any;
  };
}

// 矩阵数据接口（用于任务汇总）
export interface MatrixExportData extends ExportData {
  matrixData?: {
    rowHeaders: string[];
    columnHeaders: string[];
    values: (number | string | null)[][];
    taskInfo?: {
      name: string;
      description?: string;
      totalModels: number;
      totalDimensions: number;
    };
  };
}

// 任务导出数据接口（专门用于LLM评测任务）
export interface TaskExportData extends MatrixExportData {
  // 任务基础信息（用于概览Sheet）
  taskOverview?: {
    id: string;
    name: string;
    description: string;
    status: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
    totalSubtasks: number;
    completedSubtasks: number;
    failedSubtasks: number;
    template: string;
    models: string[];
    dimensions: string[];
  };
  
  // 性能统计数据（用于性能Sheet）  
  performanceStats?: Array<{
    模型名称: string;
    平均执行时间ms: number;
    总Token使用: number;
    平均费用USD: number;
    成功率: string;
    tokens每秒: number;
  }>;
}

/**
 * 将数据导出为Excel格式
 */
export function exportToExcel(data: ExportData | MatrixExportData | TaskExportData, filename?: string): void {
  // 确保在客户端环境中运行
  if (typeof window === 'undefined') {
    console.error('Excel导出只能在客户端环境中运行');
    return;
  }
  
  try {
    console.log('开始Excel导出，数据:', data);
    
    // 创建新的工作簿
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
  
  // 检查数据类型
  const isTaskData = (data as TaskExportData).taskOverview !== undefined;
  const isMatrixData = (data as MatrixExportData).matrixData !== undefined;
  
  if (isTaskData) {
    // 任务专用的多Sheet导出
    const taskData = data as TaskExportData;
    createTaskWorksheets(wb, taskData);
  } else if (isMatrixData) {
    const matrixData = data as MatrixExportData;
    createMatrixWorksheet(wb, matrixData);
    
    // 如果有详细数据，创建第二个工作表
    if (data.data && data.data.length > 0) {
      createDetailWorksheet(wb, data);
    }
  } else {
    // 标准数据表格
    createStandardWorksheet(wb, data);
  }
  
  // 添加元数据工作表
  createMetadataWorksheet(wb, data);
  
    // 生成文件名 - 智能处理扩展名
    const baseFilename = filename || `${data.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${new Date().toISOString().split('T')[0]}`;
    const finalFilename = baseFilename.endsWith('.xlsx') ? baseFilename : `${baseFilename}.xlsx`;
    
    console.log('准备导出文件:', finalFilename);
    
    // 导出文件
    XLSX.writeFile(wb, finalFilename);
    
    console.log('Excel导出成功');
  } catch (error) {
    console.error('Excel导出失败:', error);
    alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

/**
 * 创建任务专用的多个工作表 
 */
function createTaskWorksheets(wb: XLSX.WorkBook, data: TaskExportData): void {
  // Sheet 1: 任务概览
  if (data.taskOverview) {
    createTaskOverviewWorksheet(wb, data);
  }
  
  // Sheet 2: 详细结果
  if (data.data && data.data.length > 0) {
    createTaskDetailWorksheet(wb, data);
  }
  
  // Sheet 3: 得分矩阵
  if (data.matrixData) {
    createTaskMatrixWorksheet(wb, data);
  }
  
  // Sheet 4: 性能统计
  if (data.performanceStats && data.performanceStats.length > 0) {
    createPerformanceStatsWorksheet(wb, data);
  }
}

/**
 * 创建任务概览工作表
 */
function createTaskOverviewWorksheet(wb: XLSX.WorkBook, data: TaskExportData): void {
  const overview = data.taskOverview!;
  
  const overviewData = [
    ['任务概览报告'],
    [],
    ['基础信息'],
    ['任务名称', overview.name],
    ['任务ID', overview.id], 
    ['任务描述', overview.description || '无描述'],
    ['任务状态', overview.status],
    ['评测模板', overview.template],
    [],
    ['时间信息'],
    ['创建时间', new Date(overview.createdAt).toLocaleString('zh-CN')],
    ['开始时间', overview.startedAt ? new Date(overview.startedAt).toLocaleString('zh-CN') : '未开始'],
    ['完成时间', overview.completedAt ? new Date(overview.completedAt).toLocaleString('zh-CN') : '未完成'],
    [],
    ['执行统计'],
    ['总子任务数', overview.totalSubtasks],
    ['已完成', overview.completedSubtasks],
    ['失败数量', overview.failedSubtasks],
    ['成功率', `${((overview.completedSubtasks / overview.totalSubtasks) * 100).toFixed(1)}%`],
    [],
    ['参与模型 (' + overview.models.length + '个)'],
    ...overview.models.map(model => ['', model]),
    [],
    ['评测维度 (' + overview.dimensions.length + '个)'],
    ...overview.dimensions.map(dimension => ['', dimension]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(overviewData);
  
  // 设置列宽
  ws['!cols'] = [{ wch: 20 }, { wch: 30 }];
  
  XLSX.utils.book_append_sheet(wb, ws, '任务概览');
}

/**
 * 创建任务详细结果工作表
 */
function createTaskDetailWorksheet(wb: XLSX.WorkBook, data: TaskExportData): void {
  const ws = XLSX.utils.json_to_sheet(data.data);
  
  // 设置较宽的列宽以适应中文内容
  const colWidths = Object.keys(data.data[0] || {}).map(key => {
    // 根据字段类型设置不同宽度
    if (key.includes('输入') || key.includes('回复') || key.includes('推理')) {
      return { wch: 30 }; // 长文本字段
    } else if (key.includes('名称') || key.includes('维度')) {
      return { wch: 20 }; // 中等字段
    } else {
      return { wch: 15 }; // 普通字段
    }
  });
  ws['!cols'] = colWidths;
  
  XLSX.utils.book_append_sheet(wb, ws, '详细结果');
}

/**
 * 创建任务得分矩阵工作表
 */
function createTaskMatrixWorksheet(wb: XLSX.WorkBook, data: TaskExportData): void {
  if (!data.matrixData) return;
  
  const { rowHeaders, columnHeaders, values } = data.matrixData;
  
  // 创建矩阵数据
  const matrixSheet: any[][] = [];
  
  // 添加标题
  matrixSheet.push(['模型性能对比矩阵']);
  matrixSheet.push([`生成时间: ${new Date().toLocaleString('zh-CN')}`]);
  matrixSheet.push([]); // 空行
  
  // 创建表头
  const headerRow = ['模型 \\ 维度', ...columnHeaders, '平均得分'];
  matrixSheet.push(headerRow);
  
  // 添加数据行
  rowHeaders.forEach((rowHeader, rowIndex) => {
    const row = [rowHeader];
    let sum = 0;
    let count = 0;
    
    columnHeaders.forEach((_, colIndex) => {
      const value = values[rowIndex]?.[colIndex];
      if (value !== null && value !== undefined) {
        row.push(Number(value).toFixed(1));
        sum += Number(value);
        count++;
      } else {
        row.push('-');
      }
    });
    
    // 添加平均分
    const avg = count > 0 ? (sum / count).toFixed(1) : '-';
    row.push(avg);
    matrixSheet.push(row);
  });
  
  // 添加维度平均分行
  matrixSheet.push([]); // 空行
  const avgRow = ['维度平均分'];
  columnHeaders.forEach((_, colIndex) => {
    const colValues = values.map(row => row[colIndex])
                           .filter(val => val !== null && val !== undefined) as number[];
    const avg = colValues.length > 0 ? 
                (colValues.reduce((sum, val) => sum + val, 0) / colValues.length).toFixed(1) : '-';
    avgRow.push(avg);
  });
  
  // 总体平均分
  const allValues = values.flat().filter(val => val !== null && val !== undefined) as number[];
  const overallAvg = allValues.length > 0 ? 
                     (allValues.reduce((sum, val) => sum + val, 0) / allValues.length).toFixed(1) : '-';
  avgRow.push(overallAvg);
  matrixSheet.push(avgRow);

  const ws = XLSX.utils.aoa_to_sheet(matrixSheet);
  
  // 设置列宽
  const colWidths = [
    { wch: 20 }, // 模型名称列
    ...columnHeaders.map(() => ({ wch: 12 })), // 数据列
    { wch: 12 } // 平均分列
  ];
  ws['!cols'] = colWidths;
  
  XLSX.utils.book_append_sheet(wb, ws, '得分矩阵');
}

/**
 * 创建性能统计工作表
 */
function createPerformanceStatsWorksheet(wb: XLSX.WorkBook, data: TaskExportData): void {
  const ws = XLSX.utils.json_to_sheet(data.performanceStats!);
  
  // 设置列宽
  ws['!cols'] = [
    { wch: 20 }, // 模型名称
    { wch: 15 }, // 平均执行时间
    { wch: 15 }, // 总Token使用
    { wch: 15 }, // 平均费用
    { wch: 12 }, // 成功率
    { wch: 12 }  // tokens每秒
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, '性能统计');
}

/**
 * 创建矩阵格式的工作表
 */
function createMatrixWorksheet(wb: XLSX.WorkBook, data: MatrixExportData): void {
  if (!data.matrixData) return;
  
  const { rowHeaders, columnHeaders, values, taskInfo } = data.matrixData;
  
  // 创建矩阵数据
  const matrixSheet: any[][] = [];
  
  // 添加标题行
  if (taskInfo) {
    matrixSheet.push([`任务名称: ${taskInfo.name}`]);
    matrixSheet.push([`导出时间: ${new Date().toLocaleString('zh-CN')}`]);
    matrixSheet.push([`模型数量: ${taskInfo.totalModels}`, `维度数量: ${taskInfo.totalDimensions}`]);
    matrixSheet.push([]); // 空行
  }
  
  // 创建表头
  const headerRow = ['模型名称', ...columnHeaders];
  matrixSheet.push(headerRow);
  
  // 添加数据行
  rowHeaders.forEach((rowHeader, rowIndex) => {
    const row = [rowHeader];
    columnHeaders.forEach((_, colIndex) => {
      const value = values[rowIndex]?.[colIndex];
      row.push(value !== null && value !== undefined ? value : '-');
    });
    matrixSheet.push(row);
  });
  
  // 添加统计行
  if (values.length > 0) {
    matrixSheet.push([]); // 空行
    const statsRow = ['平均得分'];
    columnHeaders.forEach((_, colIndex) => {
      const colValues = values.map(row => row[colIndex]).filter(val => val !== null && val !== undefined) as number[];
      const avg = colValues.length > 0 ? colValues.reduce((sum, val) => sum + val, 0) / colValues.length : 0;
      statsRow.push(avg.toFixed(3));
    });
    matrixSheet.push(statsRow);
  }
  
  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(matrixSheet);
  
  // 设置列宽
  const colWidths = [
    { wch: 20 }, // 模型名称列
    ...columnHeaders.map(() => ({ wch: 15 })) // 数据列
  ];
  ws['!cols'] = colWidths;
  
  // 设置样式（基础样式）
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  
  // 添加到工作簿
  XLSX.utils.book_append_sheet(wb, ws, '矩阵对比');
}

/**
 * 创建详细数据工作表
 */
function createDetailWorksheet(wb: XLSX.WorkBook, data: ExportData): void {
  const ws = XLSX.utils.json_to_sheet(data.data);
  
  // 设置列宽
  const colWidths = Object.keys(data.data[0] || {}).map(() => ({ wch: 15 }));
  ws['!cols'] = colWidths;
  
  XLSX.utils.book_append_sheet(wb, ws, '详细数据');
}

/**
 * 创建标准数据工作表
 */
function createStandardWorksheet(wb: XLSX.WorkBook, data: ExportData): void {
  // 🔧 安全检查：确保data.data存在且为数组
  if (!data || !data.data || !Array.isArray(data.data)) {
    console.error('❌ createStandardWorksheet: 数据无效', {
      hasData: !!data,
      hasDataData: !!(data?.data),
      isArray: Array.isArray(data?.data),
      dataLength: data?.data?.length,
      data: data
    });
    
    // 创建空的工作表，避免崩溃
    const ws = XLSX.utils.json_to_sheet([{ '错误': '数据为空或格式不正确' }]);
    XLSX.utils.book_append_sheet(wb, ws, '数据');
    return;
  }
  
  const ws = XLSX.utils.json_to_sheet(data.data);
  
  // 自动调整列宽
  const colWidths = Object.keys(data.data[0] || {}).map(key => ({
    wch: Math.max(key.length, 10)
  }));
  ws['!cols'] = colWidths;
  
  XLSX.utils.book_append_sheet(wb, ws, '数据');
}

/**
 * 创建元数据工作表
 */
function createMetadataWorksheet(wb: XLSX.WorkBook, data: ExportData): void {
  // 🔧 安全检查：确保data.data存在且为数组
  if (!data || !data.data || !Array.isArray(data.data)) {
    console.error('❌ createMetadataWorksheet: 数据无效', {
      hasData: !!data,
      hasDataData: !!(data?.data),
      isArray: Array.isArray(data?.data),
      data: data
    });
    
    // 创建错误提示的元数据工作表
    const errorMetadata = [
      ['导出信息'],
      ['标题', data?.title || '未知'],
      ['导出时间', new Date().toLocaleString('zh-CN')],
      ['数据条数', '数据无效或为空'],
      ['来源', data?.metadata?.source || 'AI Benchmark V2'],
      [],
      ['说明'],
      ['导出失败：数据格式不正确或为空'],
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(errorMetadata);
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, '导出信息');
    return;
  }
  
  const metadata = [
    ['导出信息'],
    ['标题', data.title],
    ['导出时间', new Date().toLocaleString('zh-CN')],
    ['数据条数', data.data.length],
    ['来源', data.metadata?.source || 'AI Benchmark V2'],
    [],
    ['说明'],
    ['此文件由 AI Benchmark V2 自动生成'],
    ['更多信息请访问系统分析台'],
  ];
  
  // 添加额外的元数据
  if (data.metadata) {
    Object.entries(data.metadata).forEach(([key, value]) => {
      if (key !== 'source' && key !== 'generatedAt') {
        metadata.push([key, String(value)]);
      }
    });
  }
  
  const ws = XLSX.utils.aoa_to_sheet(metadata);
  ws['!cols'] = [{ wch: 15 }, { wch: 30 }];
  
  XLSX.utils.book_append_sheet(wb, ws, '导出信息');
}

/**
 * 将数据导出为CSV格式
 */
export function exportToCSV(data: ExportData, filename?: string): void {
  // 🔧 安全检查：确保data.data存在且为数组
  if (!data || !data.data || !Array.isArray(data.data)) {
    console.error('❌ exportToCSV: 数据无效', {
      hasData: !!data,
      hasDataData: !!(data?.data),
      isArray: Array.isArray(data?.data),
      data: data
    });
    alert('导出失败：数据无效或为空');
    return;
  }
  
  if (data.data.length === 0) {
    alert('没有数据可导出');
    return;
  }
  
  // 获取所有字段名
  const headers = Object.keys(data.data[0]);
  
  // 创建CSV内容
  const csvContent = [
    headers.join(','), // 表头
    ...data.data.map(row => 
      headers.map(header => {
        const value = row[header];
        // 处理包含逗号或引号的值
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? '';
      }).join(',')
    )
  ].join('\n');
  
  // 添加BOM以支持中文
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // 生成文件名 - 智能处理扩展名
  const baseFilename = filename || `${data.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${new Date().toISOString().split('T')[0]}`;
  const finalFilename = baseFilename.endsWith('.csv') ? baseFilename : `${baseFilename}.csv`;
  
  // 下载文件
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 将数据导出为JSON格式
 */
export function exportToJSON(data: ExportData, filename?: string): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  
  // 生成文件名 - 智能处理扩展名
  const baseFilename = filename || `${data.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${new Date().toISOString().split('T')[0]}`;
  const finalFilename = baseFilename.endsWith('.json') ? baseFilename : `${baseFilename}.json`;
  
  // 下载文件
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 通用导出函数
 */
export function exportData(
  data: ExportData | MatrixExportData, 
  format: ExportFormat, 
  filename?: string
): void {
  switch (format) {
    case 'excel':
      exportToExcel(data, filename);
      break;
    case 'csv':
      exportToCSV(data, filename);
      break;
    case 'json':
      exportToJSON(data, filename);
      break;
    default:
      console.error('Unsupported export format:', format);
  }
}

/**
 * 格式化文件大小显示
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 获取导出格式的友好名称
 */
export function getFormatDisplayName(format: ExportFormat): string {
  const names = {
    excel: 'Excel 表格',
    csv: 'CSV 文件', 
    json: 'JSON 数据'
  };
  return names[format];
}

/**
 * 获取导出格式的图标
 */
export function getFormatIcon(format: ExportFormat): string {
  const icons = {
    excel: '📊',
    csv: '📋',
    json: '🔧'
  };
  return icons[format];
}