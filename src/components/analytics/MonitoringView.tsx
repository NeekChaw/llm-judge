'use client';

import { Activity, Server, Database, Cpu, MemoryStick, Clock, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { useSystemMetrics } from '@/hooks/useSystemStatus'

export default function MonitoringView() {
  const { metrics, loading, lastUpdated, refreshMetrics } = useSystemMetrics();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'mock':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-600';
      case 'mock':
        return 'text-yellow-600';
      default:
        return 'text-red-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">实时监控</h3>
          <p className="text-gray-600">系统运行状态和性能指标实时监控</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="text-sm text-gray-500 text-center sm:text-left">
            最后更新: {lastUpdated.toLocaleTimeString('zh-CN')}
          </span>
          <button 
            onClick={refreshMetrics}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 系统状态概览 */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Server className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    系统运行时间
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics.uptime}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Cpu className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    CPU使用率
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics.cpu.usage}%
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <MemoryStick className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    内存使用
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics.memory.used}MB / {metrics.memory.total}MB
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Activity className="h-6 w-6 text-purple-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    活跃任务
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {metrics.tasks.running}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 详细指标 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 任务队列状态 */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">任务队列状态</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              当前任务执行情况和队列状态
            </p>
          </div>
          <div className="border-t border-gray-200">
            <dl>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">总任务数</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{metrics.tasks.total}</dd>
              </div>
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">运行中</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{metrics.tasks.running}</dd>
              </div>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">队列中</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{metrics.tasks.queued}</dd>
              </div>
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">已完成</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{metrics.tasks.completed}</dd>
              </div>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">失败</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{metrics.tasks.failed}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* 服务状态 */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">服务状态</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              各项服务的连接和运行状态
            </p>
          </div>
          <div className="border-t border-gray-200">
            <dl>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">数据库</dt>
                <dd className="mt-1 text-sm sm:mt-0 sm:col-span-2">
                  <div className="flex items-center">
                    {getStatusIcon(metrics.database.status)}
                    <span className={`ml-2 ${getStatusColor(metrics.database.status)}`}>
                      {metrics.database.status === 'connected' ? '已连接' : '未连接'}
                    </span>
                  </div>
                </dd>
              </div>
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Redis</dt>
                <dd className="mt-1 text-sm sm:mt-0 sm:col-span-2">
                  <div className="flex items-center">
                    {getStatusIcon(metrics.redis.status)}
                    <span className={`ml-2 ${getStatusColor(metrics.redis.status)}`}>
                      {metrics.redis.status === 'connected' ? '已连接' : 
                       metrics.redis.status === 'mock' ? 'Mock模式' : '未连接'}
                    </span>
                  </div>
                </dd>
              </div>
              <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">数据库延迟</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{metrics.database.latency}ms</dd>
              </div>
              <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Redis内存</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{metrics.redis.memory}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* 性能图表区域 */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">性能趋势</h3>
        <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
          <div className="text-center">
            <Activity className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">性能图表</h3>
            <p className="mt-1 text-sm text-gray-500">
              实时性能监控图表（功能开发中）
            </p>
          </div>
        </div>
      </div>

      {/* 警报和通知 */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">系统警报</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            最近的系统警报和通知
          </p>
        </div>
        <ul className="divide-y divide-gray-200">
          <li className="px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Redis连接使用Mock模式</p>
                  <p className="text-sm text-gray-500">建议配置真实Redis连接以获得完整功能</p>
                </div>
              </div>
              <div className="flex items-center">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  警告
                </span>
              </div>
            </div>
          </li>
          <li className="px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">系统启动完成</p>
                  <p className="text-sm text-gray-500">所有核心服务已成功启动</p>
                </div>
              </div>
              <div className="flex items-center">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  正常
                </span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}