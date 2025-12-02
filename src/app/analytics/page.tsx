/**
 * 分析台主页面
 * 提供数据聚合查询、可视化图表、实时指标等功能
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Layout } from '@/components/layout/layout';
import { PivotTable, PivotColumn } from '@/components/analytics/PivotTable';
import { 
  TrendChart, 
  ModelComparisonChart, 
  DistributionPieChart, 
  ModelRadarChart, 
  MetricCard,
  ModelPerformanceHeatmap,
  TimeSeriesComparison,
  CorrelationScatter
} from '@/components/analytics/Charts';
import { ExportButton } from '@/components/analytics/ExportButton';
import { ExportDropdown } from '@/components/analytics/ExportDropdown';
import { ResultsExplorerView } from '@/components/analytics/ResultsExplorerView';
import MonitoringView from '@/components/analytics/MonitoringView';
import ReportsView from '@/components/analytics/ReportsView';
import QuestionsAnalysisView from '@/components/analytics/QuestionsAnalysisView';
import { BarChart3, PieChart, TrendingUp, Users, Target, Search, FileBarChart, Activity, FileText, Settings, CheckCircle } from 'lucide-react';

interface RealtimeMetrics {
  // 更新后的指标
  completed_tasks: number;
  templates_used: number;
  total_cost: number;
  participating_models: number;
  top_models: Array<{ name: string; avg_score: number; count: number }>;
  recent_trends: Array<{ time: string; score: number; count: number }>;
  // 新增业务价值指标
  quality_index: number; // 模型评估质量指数 (0-100)
  system_utilization: number; // 系统利用率 (0-100)
  cost_efficiency: number; // 成本效益比 (得分/成本)
  health_score: number; // 数据健康度 (0-100)
  trend_direction: 'up' | 'down' | 'stable'; // 总体趋势方向
}

interface AnalysisReport {
  results: Array<{
    dimensions: Record<string, any>;
    metrics: Record<string, number>;
  }>;
  total: number;
  execution_time: number;
  cached: boolean;
}

// 模板效果分析标签页
function TemplateEffectivenessTab() {
  const [templateData, setTemplateData] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemplateData = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('开始获取模板效果数据...');
        
        const response = await fetch('/api/analytics/reports/template_effectiveness');
        
        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('模板效果数据响应:', data);
        
        if (data.success) {
          setTemplateData(data.data);
          console.log('模板效果数据设置成功，结果数量:', data.data?.results?.length);
        } else {
          throw new Error(data.error || '获取数据失败');
        }
      } catch (error) {
        console.error('获取模板效果数据失败:', error);
        setError(error instanceof Error ? error.message : '获取数据失败');
        setTemplateData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTemplateData();
  }, []);

  const templateChartData = templateData?.results?.map(result => ({
    template: result.dimensions.template,
    dimension: result.dimensions.dimension,
    avg_score: result.metrics.avg_score,
    count: result.metrics.count
  })) || [];

  const hasTemplateData = templateChartData.length > 0 && 
    templateChartData.some(r => r.count > 0 || r.avg_score > 0);

  // 添加调试日志
  console.log('模板效果组件渲染:', {
    loading,
    error,
    templateDataExists: !!templateData,
    templateChartDataLength: templateChartData.length,
    hasTemplateData,
    resultsCount: templateData?.results?.length
  });

  if (loading) {
    return (
      <div className="space-y-6">
        {/* 加载状态 */}
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <div className="max-w-md mx-auto">
            {/* 🆕 上方旋转图标 */}
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto mb-3"></div>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">正在加载模板效果数据</h3>
            <p className="text-gray-500">
              正在分析模板使用情况和效果统计，请稍候...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex">
            <div className="text-red-800">
              <strong>错误：</strong> {error}
            </div>
          </div>
        </div>
      )}
      
      {hasTemplateData ? (
        <>
          {/* 模板-维度热力图 */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">模板-维度效果对比</h3>
            {loading ? (
              <div className="h-64 flex items-center justify-center">
                <div className="text-center">
                  {/* 🆕 上方小型旋转图标 */}
                  <div className="animate-spin rounded-full h-4 w-4 border border-blue-600 border-t-transparent mx-auto mb-2"></div>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templateChartData.slice(0, 6).map((item, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium text-gray-900">{item.template}</h4>
                      <span className="text-sm text-gray-500">{item.dimension}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-2xl font-bold text-blue-600">
                        {item.avg_score?.toFixed(2) || '0.00'}
                      </div>
                      <div className="text-sm text-gray-500">
                        {item.count} 次使用
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* 暂无数据提示 */
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <div className="max-w-md mx-auto">
            <Target className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">暂无模板效果数据</h3>
            <p className="text-gray-500 mb-6">
              当前系统中还没有足够的模板使用数据来生成效果分析。
              请先创建并使用一些评测模板，然后回到这里查看分析结果。
            </p>
            <div className="space-y-2 text-sm text-gray-400">
              <p>• 至少需要一个模板被使用在评测任务中</p>
              <p>• 模板需要包含有效的维度映射配置</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const [realtimeMetrics, setRealtimeMetrics] = useState<RealtimeMetrics | null>(null);
  const [modelComparison, setModelComparison] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'templates' | 'results' | 'questions' | 'monitoring' | 'reports'>('overview');
  const [modelViewMode, setModelViewMode] = useState<'ranking' | 'table'>('ranking');
  const [currency, setCurrency] = useState<'USD' | 'CNY'>('USD');

  // 汇率转换函数
  const USD_TO_CNY_RATE = 7.2; // USD to CNY 汇率
  const convertCurrency = (usdAmount: number) => {
    return currency === 'CNY' ? usdAmount * USD_TO_CNY_RATE : usdAmount;
  };

  const formatCurrency = (usdAmount: number) => {
    const amount = convertCurrency(usdAmount);
    const symbol = currency === 'CNY' ? '¥' : '$';
    return `${symbol}${amount.toFixed(2)}`;
  };

  // 处理URL参数中的tab切换
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && [
      'overview', 'templates', 'results', 'questions',
      'monitoring', 'reports'
    ].includes(tabParam)) {
      setSelectedTab(tabParam as any);
    }
  }, [searchParams]);

  // 获取实时指标
  const fetchRealtimeMetrics = async () => {
    try {
      const response = await fetch('/api/analytics/realtime');
      const data = await response.json();
      if (data.success) {
        setRealtimeMetrics(data.data);
      }
    } catch (error) {
      console.error('获取实时指标失败:', error);
    }
  };

  // 获取模型对比报告
  const fetchModelComparison = async () => {
    try {
      const response = await fetch('/api/analytics/reports/model_comparison');
      const data = await response.json();
      if (data.success) {
        setModelComparison(data.data);
      }
    } catch (error) {
      console.error('获取模型对比报告失败:', error);
    }
  };

  // 初始化数据加载
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([
        fetchRealtimeMetrics(),
        fetchModelComparison()
      ]);
      setLoading(false);
    };

    loadInitialData();

    // 设置实时指标自动刷新
    const interval = setInterval(fetchRealtimeMetrics, 30000); // 30秒刷新一次
    return () => clearInterval(interval);
  }, []); // 移除currency依赖


  // 定义模型对比表的列配置
  const modelComparisonColumns: PivotColumn[] = [
    {
      key: 'model',
      title: '模型名称',
      dataType: 'string',
      sortable: true,
      filterable: true,
      width: 200
    },
    {
      key: 'avg_score',
      title: '平均得分',
      dataType: 'number',
      sortable: true,
      formatter: (value) => value ? value.toFixed(2) : '-'
    },
    {
      key: 'count',
      title: '评测次数',
      dataType: 'number',
      sortable: true
    },
    {
      key: 'total_cost',
      title: '累计成本',
      dataType: 'currency',
      sortable: true,
      formatter: (value) => formatCurrency(value || 0)
    }
  ];

  // 转换模型对比数据格式，统一精度为2位小数
  const modelComparisonData = modelComparison?.results?.map(result => ({
    model: result.dimensions.model,
    avg_score: result.metrics.avg_score,
    count: result.metrics.count,
    total_cost: result.metrics.total_cost
  })) || [];

  // 检查是否有有效数据
  const hasValidData = modelComparisonData.length > 0 && 
    modelComparisonData.some(r => r.count > 0 || r.avg_score > 0);

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-48 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white p-6 rounded-lg shadow-sm">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">分析台</h1>
          <p className="text-gray-600 mt-1">评测数据分析和可视化展示</p>
        </div>

        {/* 货币切换按钮 */}
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">成本单位:</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setCurrency('USD')}
              className={`px-3 py-1 text-sm font-medium ${
                currency === 'USD'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              USD ($)
            </button>
            <button
              onClick={() => setCurrency('CNY')}
              className={`px-3 py-1 text-sm font-medium ${
                currency === 'CNY'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              CNY (¥)
            </button>
          </div>
        </div>
      </div>


      {/* 标签页导航 - 传统Tab样式 */}
      <div className="bg-white rounded-lg shadow-sm border mb-6">
        {/* 桌面端导航 - 横向Tab布局 */}
        <nav className="hidden lg:block">
          <div className="border-b border-gray-200">
            <div className="flex flex-wrap px-6">
              {[
                { key: 'overview', label: '概览仪表板' },
                { key: 'templates', label: '模板效果分析' },
                { key: 'results', label: '结果探索' },
                { key: 'questions', label: '考题分析' },
                { key: 'monitoring', label: '实时监控' },
                { key: 'reports', label: '报告管理' }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedTab(tab.key as any)}
                  className={`relative px-4 py-3 text-xs font-medium transition-colors duration-200 whitespace-nowrap ${
                    selectedTab === tab.key
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* 中等屏幕导航 - 2行Tab布局 */}
        <nav className="hidden md:block lg:hidden">
          <div className="border-b border-gray-200">
            <div className="grid grid-cols-4 px-4">
              {[
                { key: 'overview', label: '概览仪表板' },
                { key: 'templates', label: '模板效果' },
                { key: 'results', label: '结果探索' },
                { key: 'questions', label: '考题分析' },
                { key: 'monitoring', label: '实时监控' },
                { key: 'reports', label: '报告管理' }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedTab(tab.key as any)}
                  className={`relative px-2 py-3 text-xs font-medium transition-colors duration-200 text-center ${
                    selectedTab === tab.key
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300'
                  }`}
                >
                  <div className="truncate">{tab.label}</div>
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* 移动端导航 - 下拉选择器 */}
        <div className="md:hidden p-4">
          <select
            value={selectedTab}
            onChange={(e) => setSelectedTab(e.target.value as any)}
            className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
          >
            <option value="overview">概览仪表板</option>
            <option value="templates">模板效果分析</option>
            <option value="results">结果探索</option>
            <option value="questions">考题分析</option>
            <option value="monitoring">实时监控</option>
            <option value="reports">报告管理</option>
          </select>
        </div>
      </div>

      {/* 标签页内容 */}
      <div className="space-y-6">
        {selectedTab === 'overview' && (
          <div className="space-y-6">
            {/* 系统概览统计 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Target className="h-8 w-8 text-blue-600 mr-3" />
                  <div>
                    <p className="text-sm text-gray-600">已完成任务</p>
                    <p className="text-2xl font-bold text-gray-900">{realtimeMetrics?.completed_tasks || 0}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <BarChart3 className="h-8 w-8 text-green-600 mr-3" />
                  <div>
                    <p className="text-sm text-gray-600">使用模板数</p>
                    <p className="text-2xl font-bold text-gray-900">{realtimeMetrics?.templates_used || 0}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <TrendingUp className="h-8 w-8 text-purple-600 mr-3" />
                  <div>
                    <p className="text-sm text-gray-600">累计成本</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(realtimeMetrics?.total_cost || 0)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-orange-600 mr-3" />
                  <div>
                    <p className="text-sm text-gray-600">参与模型数</p>
                    <p className="text-2xl font-bold text-gray-900">{realtimeMetrics?.participating_models || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 快速导航和数据预览 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 分析功能快速访问 */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">分析功能</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <button
                    onClick={() => setSelectedTab('templates')}
                    className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-green-300 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <Target className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="font-medium text-gray-900 text-sm">模板效果</div>
                        <div className="text-xs text-gray-500">效果分析</div>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setSelectedTab('results')}
                    className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-indigo-300 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <Search className="h-5 w-5 text-indigo-600" />
                      <div>
                        <div className="font-medium text-gray-900 text-sm">结果探索</div>
                        <div className="text-xs text-gray-500">深度分析</div>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setSelectedTab('questions')}
                    className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-orange-300 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-orange-600" />
                      <div>
                        <div className="font-medium text-gray-900 text-sm">考题分析</div>
                        <div className="text-xs text-gray-500">正确率统计</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* 系统管理快速访问 */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">系统管理</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button 
                    onClick={() => setSelectedTab('monitoring')}
                    className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-orange-300 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <Activity className="h-5 w-5 text-orange-600" />
                      <div>
                        <div className="font-medium text-gray-900 text-sm">实时监控</div>
                        <div className="text-xs text-gray-500">{realtimeMetrics?.active_tasks || 0} 个活跃任务</div>
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={() => setSelectedTab('reports')}
                    className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-teal-300 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <FileText className="h-5 w-5 text-teal-600" />
                      <div>
                        <div className="font-medium text-gray-900 text-sm">报告管理</div>
                        <div className="text-xs text-gray-500">生成报告</div>
                      </div>
                    </div>
                  </button>
                  <a 
                    href="/settings/system"
                    className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-red-300 transition-colors text-left block"
                  >
                    <div className="flex items-center space-x-3">
                      <Settings className="h-5 w-5 text-red-600" />
                      <div>
                        <div className="font-medium text-gray-900 text-sm">系统配置</div>
                        <div className="text-xs text-gray-500">跳转到设置页</div>
                      </div>
                    </div>
                  </a>
                </div>
              </div>
            </div>

            {/* 提供商成本管理已简化为查看模式 */}

          </div>
        )}

        {selectedTab === 'templates' && (
          <TemplateEffectivenessTab />
        )}

        {selectedTab === 'results' && (
          <ResultsExplorerView />
        )}

        {selectedTab === 'questions' && (
          <QuestionsAnalysisView />
        )}

        {selectedTab === 'monitoring' && (
          <MonitoringView />
        )}

        {selectedTab === 'reports' && (
          <ReportsView />
        )}

      </div>
      </div>
    </Layout>
  );
}