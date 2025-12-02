'use client';

import { BarChart3, PieChart, Download, Filter, Calendar, FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { useState } from 'react'

interface Report {
  id: string;
  name: string;
  type: 'performance' | 'distribution' | 'temporal';
  status: 'completed' | 'generating' | 'failed';
  createdAt: string;
  size?: string;
  description: string;
}

export default function ReportsView() {
  const [reports] = useState<Report[]>([
    {
      id: '1',
      name: '模型性能对比报告',
      type: 'performance',
      status: 'completed',
      createdAt: '2025-08-04 10:30',
      size: '2.4MB',
      description: '各模型在不同维度上的性能对比分析'
    },
    {
      id: '2',
      name: '评分分布分析报告',
      type: 'distribution',
      status: 'completed',
      createdAt: '2025-08-04 09:15',
      size: '1.8MB',
      description: '评分分布和趋势统计分析'
    },
    {
      id: '3',
      name: '周度性能趋势报告',
      type: 'temporal',
      status: 'generating',
      createdAt: '2025-08-04 08:45',
      description: '基于时间序列的性能变化分析'
    },
    {
      id: '4',
      name: '模板效果分析报告',
      type: 'performance',
      status: 'failed',
      createdAt: '2025-08-03 16:20',
      description: '模板使用效果和优化建议'
    }
  ]);

  const [selectedFormat, setSelectedFormat] = useState('excel');
  const [autoGenerate, setAutoGenerate] = useState('manual');

  const getStatusIcon = (status: Report['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'generating':
        return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusText = (status: Report['status']) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'generating':
        return '生成中';
      case 'failed':
        return '失败';
    }
  };

  const getStatusColor = (status: Report['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'generating':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
    }
  };

  const getTypeIcon = (type: Report['type']) => {
    switch (type) {
      case 'performance':
        return <BarChart3 className="h-8 w-8 text-blue-500" />;
      case 'distribution':
        return <PieChart className="h-8 w-8 text-green-500" />;
      case 'temporal':
        return <Calendar className="h-8 w-8 text-purple-500" />;
    }
  };

  const getTypeLabel = (type: Report['type']) => {
    switch (type) {
      case 'performance':
        return '性能报告';
      case 'distribution':
        return '分布报告';
      case 'temporal':
        return '时间报告';
    }
  };

  const handleGenerateReport = (type: Report['type']) => {
    console.log(`生成${getTypeLabel(type)}`);
    // 这里可以调用API生成报告
  };

  const handleDownloadReport = (report: Report) => {
    if (report.status === 'completed') {
      console.log(`下载报告: ${report.name}`);
      // 这里可以调用API下载报告
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">报告管理</h3>
          <p className="text-gray-600">生成和管理评测报告，导出分析结果</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            <Filter className="mr-2 h-4 w-4" />
            筛选器
          </button>
          <button 
            onClick={() => handleGenerateReport('performance')}
            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <FileText className="mr-2 h-4 w-4" />
            生成报告
          </button>
        </div>
      </div>

      {/* 报告类型选择 */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div 
          className="bg-white overflow-hidden shadow rounded-lg cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleGenerateReport('performance')}
        >
          <div className="p-6">
            <div className="flex items-center">
              <BarChart3 className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">性能报告</h3>
                <p className="text-sm text-gray-500 mt-1">模型在各维度上的性能对比分析</p>
              </div>
            </div>
            <div className="mt-4">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                自动生成
              </span>
            </div>
          </div>
        </div>

        <div 
          className="bg-white overflow-hidden shadow rounded-lg cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleGenerateReport('distribution')}
        >
          <div className="p-6">
            <div className="flex items-center">
              <PieChart className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">分布报告</h3>
                <p className="text-sm text-gray-500 mt-1">评分分布和趋势分析</p>
              </div>
            </div>
            <div className="mt-4">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                可定制
              </span>
            </div>
          </div>
        </div>

        <div 
          className="bg-white overflow-hidden shadow rounded-lg cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => handleGenerateReport('temporal')}
        >
          <div className="p-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-purple-500" />
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">时间报告</h3>
                <p className="text-sm text-gray-500 mt-1">基于时间序列的性能变化报告</p>
              </div>
            </div>
            <div className="mt-4">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                周期性
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 报告历史 */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">报告历史</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            最近生成的评测报告和分析文档
          </p>
        </div>
        <ul className="divide-y divide-gray-200">
          {reports.map((report) => (
            <li key={report.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {getTypeIcon(report.type)}
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-900">{report.name}</p>
                    <p className="text-sm text-gray-500">{report.description}</p>
                    <div className="flex items-center mt-1 space-x-4">
                      <span className="text-xs text-gray-400">
                        生成时间: {report.createdAt}
                      </span>
                      {report.size && (
                        <span className="text-xs text-gray-400">
                          大小: {report.size}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center">
                    {getStatusIcon(report.status)}
                    <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                      {getStatusText(report.status)}
                    </span>
                  </div>
                  <button 
                    onClick={() => handleDownloadReport(report)}
                    disabled={report.status !== 'completed'}
                    className={`inline-flex items-center p-2 border border-transparent rounded ${
                      report.status === 'completed' 
                        ? 'text-gray-400 hover:text-gray-600 cursor-pointer' 
                        : 'text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 报告配置 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">报告设置</h3>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">默认报告格式</label>
            <select 
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="pdf">PDF</option>
              <option value="excel">Excel</option>
              <option value="html">HTML</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">自动生成频率</label>
            <select 
              value={autoGenerate}
              onChange={(e) => setAutoGenerate(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              <option value="manual">手动</option>
              <option value="daily">每日</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex flex-col sm:flex-row sm:justify-end gap-3">
          <button className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            重置
          </button>
          <button className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 transition-colors">
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}