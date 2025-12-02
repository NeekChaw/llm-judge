'use client';

import { useState } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { TestCaseImportResult } from '@/types/test-case';

// 正确的CSV解析函数，支持多行字段和引号转义，保留引号内字段的空白字符
function parseCSV(text: string): any[] {
  const result: any[] = [];
  let currentRow: { value: string, wasQuoted: boolean }[] = [];
  let currentField = '';
  let inQuotes = false;
  let wasQuoted = false;
  let i = 0;
  
  // 移除BOM标记
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.substring(1);
  }
  
  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (!inQuotes) {
      if (char === '"') {
        inQuotes = true;
        wasQuoted = true;
      } else if (char === ',') {
        // 只对非引号字段应用trim()
        currentRow.push({ 
          value: wasQuoted ? currentField : currentField.trim(), 
          wasQuoted 
        });
        currentField = '';
        wasQuoted = false;
      } else if (char === '\n' || char === '\r') {
        // 只对非引号字段应用trim()
        currentRow.push({ 
          value: wasQuoted ? currentField : currentField.trim(), 
          wasQuoted 
        });
        if (currentRow.length > 0 && currentRow.some(field => field.value !== '')) {
          result.push([...currentRow]);
        }
        currentRow = [];
        currentField = '';
        wasQuoted = false;
        // 跳过 \r\n 中的 \n
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentField += char;
      }
    } else {
      // 在引号内
      if (char === '"') {
        if (nextChar === '"') {
          // 转义的引号
          currentField += '"';
          i++; // 跳过下一个引号
        } else {
          // 结束引号
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    }
    
    i++;
  }
  
  // 处理最后一个字段
  if (currentField || currentRow.length > 0) {
    currentRow.push({ 
      value: wasQuoted ? currentField : currentField.trim(), 
      wasQuoted 
    });
    if (currentRow.length > 0 && currentRow.some(field => field.value !== '')) {
      result.push(currentRow);
    }
  }
  
  if (result.length === 0) {
    return [];
  }
  
  // 第一行作为标题，标题总是需要trim
  const headers = result[0].map(h => h.value.toLowerCase().trim());
  const dataRows = result.slice(1);
  
  return dataRows.map(row => {
    const item: any = {};
    headers.forEach((header, index) => {
      const fieldData = row[index];
      const value = fieldData ? fieldData.value : '';
      
      if (header === 'tags' && value) {
        // 对于标签字段，分割后对每个标签trim（标签通常不需要保留空白）
        item[header] = value.split(';').filter(Boolean).map(tag => tag.trim());
      } else if (header === 'max_score' && value) {
        // 对于max_score字段，转换为数字
        const numValue = parseFloat(value.toString().trim());
        item[header] = !isNaN(numValue) && numValue > 0 ? numValue : undefined;
      } else {
        // 对于input和reference_answer等内容字段，保持原始值
        item[header] = value;
      }
    });
    return item;
  });
}

// 安全的JSON解析函数
function parseSecureJSON(text: string): any[] {
  // 大小检查（文本长度）
  const MAX_TEXT_SIZE = 10 * 1024 * 1024; // 10MB文本
  if (text.length > MAX_TEXT_SIZE) {
    throw new Error('JSON文本内容过大');
  }

  // 基本格式检查
  if (!text.trim()) {
    throw new Error('JSON文件为空');
  }

  if (!text.trim().startsWith('[') || !text.trim().endsWith(']')) {
    throw new Error('JSON文件必须包含数组格式的数据');
  }

  // 安全解析JSON
  let parsed: any;
  try {
    // 使用reviver防止原型污染
    parsed = JSON.parse(text, (key, value) => {
      // 防止原型污染攻击
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      return value;
    });
  } catch (error) {
    throw new Error('JSON格式错误：' + (error instanceof Error ? error.message : '解析失败'));
  }

  if (!Array.isArray(parsed)) {
    throw new Error('JSON文件必须包含数组格式的测试用例数据');
  }

  // 验证和清理数据
  const MAX_FIELD_LENGTH = 50000; // 单个字段最大长度
  const cleanedData = parsed.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`第${index + 1}条记录不是有效的对象`);
    }

    // 验证和清理字段
    const cleaned: any = {};
    
    // input字段（必填）
    if (!item.input || typeof item.input !== 'string') {
      throw new Error(`第${index + 1}条记录缺少有效的input字段`);
    }
    if (item.input.length > MAX_FIELD_LENGTH) {
      throw new Error(`第${index + 1}条记录的input字段过长（超过${MAX_FIELD_LENGTH}字符）`);
    }
    cleaned.input = sanitizeString(item.input);

    // reference_answer字段（可选）
    if (item.reference_answer !== undefined) {
      if (typeof item.reference_answer !== 'string') {
        throw new Error(`第${index + 1}条记录的reference_answer字段必须是字符串`);
      }
      if (item.reference_answer.length > MAX_FIELD_LENGTH) {
        throw new Error(`第${index + 1}条记录的reference_answer字段过长（超过${MAX_FIELD_LENGTH}字符）`);
      }
      cleaned.reference_answer = sanitizeString(item.reference_answer);
    }

    // tags字段（可选数组）
    if (item.tags !== undefined) {
      if (!Array.isArray(item.tags)) {
        throw new Error(`第${index + 1}条记录的tags字段必须是数组`);
      }
      if (item.tags.length > 50) {
        throw new Error(`第${index + 1}条记录的标签数量过多（超过50个）`);
      }
      cleaned.tags = item.tags
        .filter((tag: any) => typeof tag === 'string' && tag.trim())
        .map((tag: string) => sanitizeString(tag.trim()))
        .slice(0, 50); // 限制标签数量
    }

    // category字段（可选）
    if (item.category !== undefined) {
      if (typeof item.category !== 'string') {
        throw new Error(`第${index + 1}条记录的category字段必须是字符串`);
      }
      if (item.category.length > 100) {
        throw new Error(`第${index + 1}条记录的category字段过长（超过100字符）`);
      }
      cleaned.category = sanitizeString(item.category);
    }

    return cleaned;
  });

  return cleanedData;
}

// 字符串清理函数，防止XSS攻击
function sanitizeString(str: string): string {
  if (!str) return '';
  
  // 移除潜在的XSS内容
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // 移除script标签
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // 移除iframe标签
    .replace(/javascript:/gi, '') // 移除javascript:协议
    .replace(/on\w+\s*=/gi, '') // 移除事件处理器
    .trim();
}

// CSV字段转义函数
function escapeCSVField(field: string): string {
  if (!field) return '""';
  
  // 如果字段包含逗号、换行符或引号，需要用引号包围
  if (field.includes(',') || field.includes('\n') || field.includes('\r') || field.includes('"')) {
    // 将引号转义为双引号
    const escaped = field.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  
  // 为了保持一致性，所有字段都用引号包围
  return `"${field}"`;
}

interface ImportExportModalProps {
  onClose: () => void;
  onImportSuccess: () => void;
}

export default function ImportExportModal({ onClose, onImportSuccess }: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<TestCaseImportResult | null>(null);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');

  // 处理文件导入
  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      // 文件大小检查
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('文件大小不能超过10MB');
      }

      const text = await file.text();
      let data: any[];

      if (file.name.endsWith('.json')) {
        data = parseSecureJSON(text);
      } else if (file.name.endsWith('.csv')) {
        // 增强的CSV解析，正确处理多行字段和引号转义
        data = parseCSV(text);
      } else {
        throw new Error('不支持的文件格式，请使用 JSON 或 CSV 文件');
      }

      if (!Array.isArray(data)) {
        throw new Error('文件格式错误，需要包含测试用例数组');
      }

      // 记录数量限制
      const MAX_RECORDS = 1000;
      if (data.length > MAX_RECORDS) {
        throw new Error(`单次最多只能导入${MAX_RECORDS}条记录，当前文件包含${data.length}条记录`);
      }

      // 发送导入请求
      const response = await fetch('/api/test-cases/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data,
          format: file.name.endsWith('.csv') ? 'csv' : 'json'
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        setImportResult(result.result);
        if (result.result.success || result.result.imported > 0) {
          onImportSuccess();
        }
      } else {
        throw new Error(result.error || '导入失败');
      }

    } catch (error) {
      alert(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  // 处理导出
  const handleExport = async () => {
    try {
      const response = await fetch(`/api/test-cases/export?format=${exportFormat}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '导出失败');
      }

      // 下载文件
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `test-cases-${new Date().toISOString().slice(0, 10)}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      alert(error instanceof Error ? error.message : '导出失败');
    }
  };

  // 下载示例文件
  const downloadSample = (format: 'json' | 'csv') => {
    const sampleData = [
      {
        input: "请编写一个Python函数，计算两个数字的最大公约数",
        reference_answer: "def gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return a",
        max_score: 100,
        tags: ["算法", "数学", "Python"],
        category: "编程基础",
        // 🆕 CODE类型配置示例
        code_test_config: {
          test_data: [
            { input: [12, 8], expected: 4, description: "基本测试" },
            { input: [17, 13], expected: 1, description: "互质测试" }
          ],
          execution_config: {
            timeout_ms: 30000,
            memory_limit_mb: 256,
            entry_point_strategy: "intelligent"
          }
        },
        execution_environment: "python",
        validation_rules: {
          strict_output_match: false,
          ignore_whitespace: true
        }
      },
      {
        input: "解释什么是快速排序算法",
        reference_answer: "快速排序是一种分治算法...",
        max_score: 80,
        tags: ["算法", "排序"],
        category: "算法原理"
        // 非CODE类型题目不需要code_test_config等字段
      }
    ];

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify(sampleData, null, 2);
      filename = 'test-cases-sample.json';
      mimeType = 'application/json';
    } else {
      const headers = ['input', 'reference_answer', 'max_score', 'tags', 'category'];
      const csvRows = sampleData.map(item => [
        escapeCSVField(item.input),
        escapeCSVField(item.reference_answer),
        escapeCSVField(String(item.max_score)),
        escapeCSVField(item.tags.join(';')),
        escapeCSVField(item.category)
      ]);
      content = '\uFEFF' + [headers.join(','), ...csvRows.map(row => row.join(','))].join('\n');
      filename = 'test-cases-sample.csv';
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold">批量导入/导出测试用例</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        {/* 标签页 */}
        <div className="flex border-b mb-6">
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'import'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            导入
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2 font-medium ${
              activeTab === 'export'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Download className="w-4 h-4 inline mr-2" />
            导出
          </button>
        </div>

        {/* 导入标签页内容 */}
        {activeTab === 'import' && (
          <div className="space-y-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">上传测试用例文件</h4>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <div className="mb-4">
                  <p className="text-gray-600 mb-2">支持 JSON 和 CSV 格式</p>
                  <input
                    type="file"
                    accept=".json,.csv"
                    onChange={handleFileImport}
                    disabled={importing}
                    className="hidden"
                    id="file-upload"
                    max={10 * 1024 * 1024} // 10MB限制
                  />
                  <label
                    htmlFor="file-upload"
                    className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                      importing
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                    }`}
                  >
                    {importing ? '导入中...' : '选择文件'}
                  </label>
                </div>
              </div>
            </div>

            {/* 导入结果 */}
            {importResult && (
              <div className={`p-4 rounded-md ${
                importResult.success ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'
              }`}>
                <div className="flex items-center mb-2">
                  {importResult.success ? (
                    <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-500 mr-2" />
                  )}
                  <h5 className="font-medium">
                    {importResult.success ? '导入完成' : '导入部分成功'}
                  </h5>
                </div>
                <div className="text-sm text-gray-600 mb-3">
                  <p>总计: {importResult.total} 条</p>
                  <p>成功: {importResult.imported} 条</p>
                  <p>失败: {importResult.failed} 条</p>
                </div>
                
                {importResult.errors.length > 0 && (
                  <div>
                    <h6 className="font-medium text-red-600 mb-2">错误详情:</h6>
                    <div className="max-h-40 overflow-y-auto">
                      {importResult.errors.map((error, index) => (
                        <div key={index} className="text-sm text-red-600 mb-1">
                          第 {error.row} 行: {error.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 文件格式说明 */}
            <div className="bg-gray-50 p-4 rounded-md">
              <h5 className="font-medium mb-3">文件格式说明</h5>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <h6 className="font-medium text-blue-800 mb-2">📏 文件限制</h6>
                  <ul className="text-blue-700 text-xs space-y-1">
                    <li>• 文件大小：最大 10MB</li>
                    <li>• 记录数量：最多 1000 条</li>
                    <li>• 字段长度：input/answer 最长 50000 字符</li>
                    <li>• 标签数量：每条记录最多 50 个标签</li>
                  </ul>
                </div>
                <div>
                  <strong>JSON 格式示例:</strong>
                  <pre className="mt-1 bg-white p-2 rounded text-xs overflow-x-auto">
{`[
  {
    "input": "测试问题",
    "reference_answer": "参考答案",
    "max_score": 100,
    "tags": ["标签1", "标签2"],
    "category": "分类",
    "code_test_config": {
      "test_data": [
        {"input": [1, 2], "expected": 3, "description": "测试"}
      ],
      "execution_config": {
        "timeout_ms": 30000,
        "memory_limit_mb": 256,
        "entry_point_strategy": "intelligent"
      }
    },
    "execution_environment": "python",
    "validation_rules": {
      "strict_output_match": false,
      "ignore_whitespace": true
    }
  }
]`}
                  </pre>
                </div>
                <div>
                  <strong>CSV 格式:</strong> 第一行为列标题 (input, reference_answer, max_score, tags, category)，数据行用逗号分隔，标签用分号分隔，max_score为数字
                  <div className="text-orange-600 text-xs mt-1">
                    ⚠️ 注意：CSV格式不支持复杂的CODE配置字段(code_test_config等)，如需导入CODE类型测试用例请使用JSON格式
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadSample('json')}
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    下载 JSON 示例
                  </button>
                  <button
                    onClick={() => downloadSample('csv')}
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    下载 CSV 示例
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 导出标签页内容 */}
        {activeTab === 'export' && (
          <div className="space-y-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">导出当前测试用例</h4>
              <p className="text-gray-600 mb-4">
                导出所有当前的测试用例数据，包括筛选条件下的结果
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择导出格式
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="json"
                        checked={exportFormat === 'json'}
                        onChange={(e) => setExportFormat(e.target.value as 'json')}
                        className="mr-2"
                      />
                      JSON 格式
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="csv"
                        checked={exportFormat === 'csv'}
                        onChange={(e) => setExportFormat(e.target.value as 'csv')}
                        className="mr-2"
                      />
                      CSV 格式
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleExport}
                  className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  导出测试用例
                </button>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-md">
              <h5 className="font-medium text-blue-900 mb-2">导出说明</h5>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 导出会包含当前列表中的所有测试用例</li>
                <li>• 如果设置了筛选条件，只导出符合条件的数据</li>
                <li>• JSON 格式包含完整的数据结构</li>
                <li>• CSV 格式便于在 Excel 中打开和编辑</li>
              </ul>
            </div>
          </div>
        )}

        {/* 关闭按钮 */}
        <div className="flex justify-end mt-6 pt-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}