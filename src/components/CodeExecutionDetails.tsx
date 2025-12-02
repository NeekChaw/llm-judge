'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Play,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  Cpu,
  Search,
  Filter,
  Copy,
  Download,
  Eye,
  EyeOff,
  Terminal,
  Bug,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface CodeExecutionDetailsProps {
  evaluationResultId: number;
  className?: string;
}

interface CodeExecutionData {
  evaluation_result: {
    id: number;
    score: number;
    justification: string;
    status: string;
    model_response: any;
    test_case_input: string;
    model_name: string;
    evaluator_name: string;
  };
  code_execution_details: {
    stdout: string;
    stderr: string;
    execution_time_ms: number;
    memory_usage_mb?: number;
    exit_code?: number;
    test_results?: {
      passed: number;
      total: number;
      syntax_correct: boolean;
      functional_correct: boolean;
      details?: Array<{
        name: string;
        passed: boolean;
        input: any;
        expected: any;
        actual: any;
        error?: string;
        execution_time: number;
      }>;
    };
    sandbox_id: string;
    files_created?: string[];
    debug_info?: {
      session_logs: string[];
      environment_vars: Record<string, string>;
      working_directory: string;
      python_version?: string;
      installed_packages?: string[];
    };
  } | null;
  system_variables: {
    test_case_input: string;
    model_response: string;
    code_execution_result: any;
  };
}

export default function CodeExecutionDetails({
  evaluationResultId,
  className = ''
}: CodeExecutionDetailsProps) {
  const [data, setData] = useState<CodeExecutionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // 新增状态：搜索和过滤
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'stdout' | 'stderr' | 'tests' | 'files' | 'debug'>('overview');
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);

  // 辅助函数
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // 可以添加toast通知
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const downloadAsFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text;

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
  };

  const filterContent = (content: string, searchTerm: string) => {
    if (!searchTerm.trim()) return content;

    const lines = content.split('\n');
    const filteredLines = lines.filter(line =>
      line.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return filteredLines.join('\n');
  };

  const fetchDetails = async () => {
    setLoading(true);
    setError(null);

    try {
      // 使用新的数据库视图获取完整的执行详情
      const response = await fetch(`/api/evaluation-results/${evaluationResultId}/execution-details`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '获取详情失败');
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded && !data && !loading) {
      fetchDetails();
    }
  }, [expanded, evaluationResultId]);

  const formatExecutionTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatMemoryUsage = (mb?: number) => {
    if (!mb) return 'N/A';
    if (mb < 1) return `${(mb * 1024).toFixed(1)}KB`;
    return `${mb.toFixed(1)}MB`;
  };

  const getExecutionStatus = () => {
    if (!data?.code_execution_details) return null;

    const details = data.code_execution_details;
    const hasError = details.stderr && details.stderr.trim().length > 0;
    const exitCode = details.exit_code ?? 0;

    if (exitCode === 0 && !hasError) {
      return { status: 'success', label: '执行成功', icon: CheckCircle, color: 'text-green-600' };
    } else {
      return { status: 'failed', label: '执行失败', icon: XCircle, color: 'text-red-600' };
    }
  };

  const executionStatus = getExecutionStatus();

  return (
    <div className={`border border-gray-200 rounded-lg ${className}`}>
      {/* 头部 - 可点击展开/收起 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg"
      >
        <div className="flex items-center space-x-3">
          <Terminal className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-gray-900">代码执行详情</span>
          {executionStatus && (
            <Badge variant={executionStatus.status === 'success' ? 'default' : 'destructive'}>
              <executionStatus.icon className="h-3 w-3 mr-1" />
              {executionStatus.label}
            </Badge>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {data?.code_execution_details && (
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <div className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>{formatExecutionTime(data.code_execution_details.execution_time_ms)}</span>
              </div>
              {data.code_execution_details.memory_usage_mb && (
                <div className="flex items-center space-x-1">
                  <Cpu className="h-4 w-4" />
                  <span>{formatMemoryUsage(data.code_execution_details.memory_usage_mb)}</span>
                </div>
              )}
              {data.code_execution_details.test_results && (
                <div className="flex items-center space-x-1">
                  <CheckCircle className="h-4 w-4" />
                  <span>{data.code_execution_details.test_results.passed}/{data.code_execution_details.test_results.total}</span>
                </div>
              )}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              fetchDetails();
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          {expanded ? (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* 详情内容 */}
      {expanded && (
        <div className="border-t border-gray-200">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">加载中...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                <span className="text-red-800">{error}</span>
              </div>
            </div>
          )}

          {data && (
            <div className="p-4">
              {/* 搜索和工具栏 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="搜索输出内容..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchTerm('')}
                    disabled={!searchTerm}
                  >
                    清除
                  </Button>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowLineNumbers(!showLineNumbers)}
                  >
                    {showLineNumbers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    行号
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWrapLines(!wrapLines)}
                  >
                    换行
                  </Button>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="overview">概览</TabsTrigger>
                  <TabsTrigger value="stdout">标准输出</TabsTrigger>
                  <TabsTrigger value="stderr">错误输出</TabsTrigger>
                  <TabsTrigger value="tests">测试结果</TabsTrigger>
                  <TabsTrigger value="files">文件</TabsTrigger>
                  <TabsTrigger value="debug">调试信息</TabsTrigger>
                </TabsList>

                {/* 概览标签页 */}
                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center">
                          <Play className="h-4 w-4 mr-2 text-blue-600" />
                          执行状态
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {executionStatus && (
                          <div className="flex items-center">
                            <executionStatus.icon className={`h-4 w-4 ${executionStatus.color} mr-2`} />
                            <span className={`font-medium ${executionStatus.color}`}>
                              {executionStatus.label}
                            </span>
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          退出代码: {data.code_execution_details?.exit_code ?? 'N/A'}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center">
                          <Clock className="h-4 w-4 mr-2 text-green-600" />
                          执行时间
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-lg font-mono text-green-600">
                          {data.code_execution_details ?
                            formatExecutionTime(data.code_execution_details.execution_time_ms) :
                            'N/A'
                          }
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          毫秒: {data.code_execution_details?.execution_time_ms ?? 'N/A'}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center">
                          <Cpu className="h-4 w-4 mr-2 text-purple-600" />
                          内存使用
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-lg font-mono text-purple-600">
                          {formatMemoryUsage(data.code_execution_details?.memory_usage_mb)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          峰值内存使用量
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center">
                          <CheckCircle className="h-4 w-4 mr-2 text-orange-600" />
                          测试结果
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {data.code_execution_details?.test_results ? (
                          <div>
                            <div className="text-lg font-mono text-orange-600">
                              {data.code_execution_details.test_results.passed}/
                              {data.code_execution_details.test_results.total}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              通过率: {Math.round((data.code_execution_details.test_results.passed / data.code_execution_details.test_results.total) * 100)}%
                            </div>
                          </div>
                        ) : (
                          <div className="text-lg font-mono text-gray-400">N/A</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* 沙盒信息 */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center">
                        <Terminal className="h-4 w-4 mr-2" />
                        沙盒信息
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">沙盒ID:</span>
                          <span className="ml-2 font-mono text-gray-600">
                            {data.code_execution_details?.sandbox_id || 'N/A'}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-2 h-6 w-6 p-0"
                            onClick={() => copyToClipboard(data.code_execution_details?.sandbox_id || '')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">工作目录:</span>
                          <span className="ml-2 font-mono text-gray-600">
                            {data.code_execution_details?.debug_info?.working_directory || '/tmp'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* 标准输出标签页 */}
                <TabsContent value="stdout" className="space-y-4">
                  <OutputDisplay
                    title="标准输出 (stdout)"
                    content={data.code_execution_details?.stdout || ''}
                    searchTerm={searchTerm}
                    showLineNumbers={showLineNumbers}
                    wrapLines={wrapLines}
                    onCopy={copyToClipboard}
                    onDownload={downloadAsFile}
                    icon={Terminal}
                    emptyMessage="没有标准输出内容"
                  />
                </TabsContent>

                {/* 错误输出标签页 */}
                <TabsContent value="stderr" className="space-y-4">
                  <OutputDisplay
                    title="错误输出 (stderr)"
                    content={data.code_execution_details?.stderr || ''}
                    searchTerm={searchTerm}
                    showLineNumbers={showLineNumbers}
                    wrapLines={wrapLines}
                    onCopy={copyToClipboard}
                    onDownload={downloadAsFile}
                    icon={AlertTriangle}
                    emptyMessage="没有错误输出内容"
                    variant="error"
                  />
                </TabsContent>

                {/* 测试结果标签页 */}
                <TabsContent value="tests" className="space-y-4">
                  <TestResultsDisplay
                    testResults={data.code_execution_details?.test_results}
                    searchTerm={searchTerm}
                  />
                </TabsContent>

                {/* 文件标签页 */}
                <TabsContent value="files" className="space-y-4">
                  <FilesDisplay
                    files={data.code_execution_details?.files_created}
                    searchTerm={searchTerm}
                  />
                </TabsContent>

                {/* 调试信息标签页 */}
                <TabsContent value="debug" className="space-y-4">
                  <DebugInfoDisplay
                    debugInfo={data.code_execution_details?.debug_info}
                    searchTerm={searchTerm}
                    onCopy={copyToClipboard}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 输出显示组件
interface OutputDisplayProps {
  title: string;
  content: string;
  searchTerm: string;
  showLineNumbers: boolean;
  wrapLines: boolean;
  onCopy: (text: string) => void;
  onDownload: (content: string, filename: string) => void;
  icon: React.ComponentType<any>;
  emptyMessage: string;
  variant?: 'default' | 'error';
}

function OutputDisplay({
  title,
  content,
  searchTerm,
  showLineNumbers,
  wrapLines,
  onCopy,
  onDownload,
  icon: Icon,
  emptyMessage,
  variant = 'default'
}: OutputDisplayProps) {
  const filteredContent = searchTerm ? content.split('\n').filter(line =>
    line.toLowerCase().includes(searchTerm.toLowerCase())
  ).join('\n') : content;

  const lines = filteredContent.split('\n');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center">
            <Icon className={`h-4 w-4 mr-2 ${variant === 'error' ? 'text-red-600' : 'text-blue-600'}`} />
            {title}
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopy(content)}
              disabled={!content}
            >
              <Copy className="h-4 w-4 mr-1" />
              复制
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownload(content, `${title.toLowerCase().replace(/\s+/g, '_')}.txt`)}
              disabled={!content}
            >
              <Download className="h-4 w-4 mr-1" />
              下载
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {content ? (
          <div className={`rounded-lg p-4 ${variant === 'error' ? 'bg-red-950' : 'bg-gray-900'}`}>
            <pre className={`text-sm font-mono overflow-x-auto ${
              variant === 'error' ? 'text-red-400' : 'text-green-400'
            } ${wrapLines ? 'whitespace-pre-wrap' : 'whitespace-pre'}`}>
              {showLineNumbers ? (
                lines.map((line, index) => (
                  <div key={index} className="flex">
                    <span className="text-gray-500 mr-4 select-none w-8 text-right">
                      {index + 1}
                    </span>
                    <span dangerouslySetInnerHTML={{
                      __html: searchTerm ? line.replace(
                        new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                        '<mark class="bg-yellow-400 text-black">$1</mark>'
                      ) : line
                    }} />
                  </div>
                ))
              ) : (
                <span dangerouslySetInnerHTML={{
                  __html: searchTerm ? filteredContent.replace(
                    new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                    '<mark class="bg-yellow-400 text-black">$1</mark>'
                  ) : filteredContent
                }} />
              )}
            </pre>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{emptyMessage}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// 测试结果显示组件
interface TestResultsDisplayProps {
  testResults?: {
    passed: number;
    total: number;
    syntax_correct: boolean;
    functional_correct: boolean;
    details?: Array<{
      name: string;
      passed: boolean;
      input: any;
      expected: any;
      actual: any;
      error?: string;
      execution_time: number;
    }>;
  };
  searchTerm: string;
}

function TestResultsDisplay({ testResults, searchTerm }: TestResultsDisplayProps) {
  if (!testResults) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50 text-gray-400" />
          <p className="text-gray-500">没有测试结果数据</p>
        </CardContent>
      </Card>
    );
  }

  const passRate = testResults.total > 0 ? (testResults.passed / testResults.total) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* 测试概览 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center">
            <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
            测试概览
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{testResults.passed}</div>
              <div className="text-sm text-gray-500">通过</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{testResults.total - testResults.passed}</div>
              <div className="text-sm text-gray-500">失败</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{testResults.total}</div>
              <div className="text-sm text-gray-500">总计</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{passRate.toFixed(1)}%</div>
              <div className="text-sm text-gray-500">通过率</div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-700 w-20">语法:</span>
              <Badge variant={testResults.syntax_correct ? 'default' : 'destructive'}>
                {testResults.syntax_correct ? '正确' : '错误'}
              </Badge>
            </div>
            <div className="flex items-center">
              <span className="text-sm font-medium text-gray-700 w-20">功能:</span>
              <Badge variant={testResults.functional_correct ? 'default' : 'destructive'}>
                {testResults.functional_correct ? '正确' : '错误'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 详细测试结果 */}
      {testResults.details && testResults.details.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">详细测试结果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {testResults.details
                .filter(test => !searchTerm || test.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((test, index) => (
                <div key={index} className={`border rounded-lg p-4 ${
                  test.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium flex items-center">
                      {test.passed ? (
                        <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2 text-red-600" />
                      )}
                      {test.name}
                    </h4>
                    <Badge variant={test.passed ? 'default' : 'destructive'}>
                      {test.passed ? '通过' : '失败'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">输入:</span>
                      <pre className="mt-1 p-2 bg-white rounded border font-mono text-xs">
                        {JSON.stringify(test.input, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">期望:</span>
                      <pre className="mt-1 p-2 bg-white rounded border font-mono text-xs">
                        {JSON.stringify(test.expected, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">实际:</span>
                      <pre className="mt-1 p-2 bg-white rounded border font-mono text-xs">
                        {JSON.stringify(test.actual, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {test.error && (
                    <div className="mt-2">
                      <span className="font-medium text-red-700">错误:</span>
                      <pre className="mt-1 p-2 bg-red-100 rounded border font-mono text-xs text-red-800">
                        {test.error}
                      </pre>
                    </div>
                  )}

                  <div className="mt-2 text-xs text-gray-500">
                    执行时间: {test.execution_time}ms
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 文件显示组件
interface FilesDisplayProps {
  files?: string[];
  searchTerm: string;
}

function FilesDisplay({ files, searchTerm }: FilesDisplayProps) {
  const filteredFiles = files?.filter(file =>
    !searchTerm || file.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center">
          <FileText className="h-4 w-4 mr-2 text-blue-600" />
          生成的文件
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filteredFiles.length > 0 ? (
          <div className="space-y-2">
            {filteredFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                <span className="font-mono text-sm">{file}</span>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1" />
                  下载
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>没有生成文件</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// 调试信息显示组件
interface DebugInfoDisplayProps {
  debugInfo?: {
    session_logs: string[];
    environment_vars: Record<string, string>;
    working_directory: string;
    python_version?: string;
    installed_packages?: string[];
  };
  searchTerm: string;
  onCopy: (text: string) => void;
}

function DebugInfoDisplay({ debugInfo, searchTerm, onCopy }: DebugInfoDisplayProps) {
  if (!debugInfo) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <Bug className="h-8 w-8 mx-auto mb-2 opacity-50 text-gray-400" />
          <p className="text-gray-500">没有调试信息</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 环境信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center">
            <Bug className="h-4 w-4 mr-2 text-purple-600" />
            环境信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">工作目录:</span>
              <span className="ml-2 font-mono text-gray-600">{debugInfo.working_directory}</span>
            </div>
            {debugInfo.python_version && (
              <div>
                <span className="font-medium text-gray-700">Python版本:</span>
                <span className="ml-2 font-mono text-gray-600">{debugInfo.python_version}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 环境变量 */}
      {Object.keys(debugInfo.environment_vars).length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">环境变量</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCopy(JSON.stringify(debugInfo.environment_vars, null, 2))}
              >
                <Copy className="h-4 w-4 mr-1" />
                复制
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Object.entries(debugInfo.environment_vars)
                .filter(([key, value]) =>
                  !searchTerm ||
                  key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  value.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map(([key, value]) => (
                <div key={key} className="flex items-start p-2 bg-gray-50 rounded border">
                  <span className="font-mono text-sm font-medium text-blue-600 mr-2">{key}:</span>
                  <span className="font-mono text-sm text-gray-600 break-all">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 已安装包 */}
      {debugInfo.installed_packages && debugInfo.installed_packages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">已安装包</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {debugInfo.installed_packages
                .filter(pkg => !searchTerm || pkg.toLowerCase().includes(searchTerm.toLowerCase()))
                .map((pkg, index) => (
                <Badge key={index} variant="outline" className="font-mono text-xs">
                  {pkg}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 会话日志 */}
      {debugInfo.session_logs && debugInfo.session_logs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">会话日志</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCopy(debugInfo.session_logs.join('\n'))}
              >
                <Copy className="h-4 w-4 mr-1" />
                复制
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto">
              <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
                {debugInfo.session_logs
                  .filter(log => !searchTerm || log.toLowerCase().includes(searchTerm.toLowerCase()))
                  .join('\n')}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
