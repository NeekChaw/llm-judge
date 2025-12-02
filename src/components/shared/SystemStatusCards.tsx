'use client';

import { Server, Database, Zap, Settings, CheckCircle, AlertTriangle } from 'lucide-react';
import { SystemInfo, SystemStatus } from '@/hooks/useSystemStatus';

interface SystemStatusCardsProps {
  systemInfo: SystemInfo;
  systemStatus: SystemStatus;
  variant?: 'full' | 'compact';
}

export default function SystemStatusCards({ 
  systemInfo, 
  systemStatus, 
  variant = 'full' 
}: SystemStatusCardsProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
      case 'configured':
        return <CheckCircle className="h-3 w-3 mr-1" />;
      case 'mock':
        return <AlertTriangle className="h-3 w-3 mr-1" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'configured':
        return 'bg-green-100 text-green-800';
      case 'mock':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return '已连接';
      case 'configured':
        return '已配置';
      case 'mock':
        return 'Mock模式';
      case 'not_configured':
        return '未配置';
      default:
        return status;
    }
  };

  if (variant === 'compact') {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 系统信息 */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center mb-3">
            <Server className="h-5 w-5 text-blue-600 mr-2" />
            <h4 className="text-base font-semibold text-gray-900">系统状态</h4>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">版本</span>
              <span className="font-medium">{systemInfo.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">环境</span>
              <span className="font-medium">{systemInfo.environment}</span>
            </div>
          </div>
        </div>

        {/* 服务状态 */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center mb-3">
            <Database className="h-5 w-5 text-green-600 mr-2" />
            <h4 className="text-base font-semibold text-gray-900">服务状态</h4>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">数据库</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(systemStatus.database.status)}`}>
                {getStatusIcon(systemStatus.database.status)}
                {getStatusText(systemStatus.database.status)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Redis</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(systemStatus.redis.status)}`}>
                {getStatusIcon(systemStatus.redis.status)}
                {getStatusText(systemStatus.redis.status)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-4">
      {/* 系统状态 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center mb-4">
          <Server className="h-6 w-6 text-blue-600 mr-2" />
          <h4 className="text-lg font-semibold text-gray-900">系统状态</h4>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">应用版本</span>
            <span className="font-medium">{systemInfo.version}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Node.js版本</span>
            <span className="font-medium">{systemInfo.nodeVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">运行环境</span>
            <span className="font-medium">{systemInfo.environment}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">启动时间</span>
            <span className="font-medium text-sm">{systemInfo.startTime}</span>
          </div>
        </div>
      </div>

      {/* 数据库配置 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center mb-4">
          <Database className="h-6 w-6 text-green-600 mr-2" />
          <h4 className="text-lg font-semibold text-gray-900">数据库配置</h4>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">数据库类型</span>
            <span className="font-medium">{systemStatus.database.type}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">连接状态</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(systemStatus.database.status)}`}>
              {getStatusIcon(systemStatus.database.status)}
              {getStatusText(systemStatus.database.status)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Redis状态</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(systemStatus.redis.status)}`}>
              {getStatusIcon(systemStatus.redis.status)}
              {getStatusText(systemStatus.redis.status)}
            </span>
          </div>
        </div>
      </div>

      {/* API配置 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center mb-4">
          <Zap className="h-6 w-6 text-purple-600 mr-2" />
          <h4 className="text-lg font-semibold text-gray-900">API配置</h4>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">硅基流动API</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(systemStatus.apis.siliconflow)}`}>
              {getStatusIcon(systemStatus.apis.siliconflow)}
              {getStatusText(systemStatus.apis.siliconflow)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">E2B代码沙箱</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(systemStatus.apis.e2b)}`}>
              {getStatusIcon(systemStatus.apis.e2b)}
              {getStatusText(systemStatus.apis.e2b)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">OpenAI API</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(systemStatus.apis.openai)}`}>
              {getStatusIcon(systemStatus.apis.openai)}
              {getStatusText(systemStatus.apis.openai)}
            </span>
          </div>
        </div>
      </div>

      {/* 性能监控 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center mb-4">
          <Settings className="h-6 w-6 text-orange-600 mr-2" />
          <h4 className="text-lg font-semibold text-gray-900">性能监控</h4>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">内存使用率</span>
            <span className="font-medium text-green-600">{systemStatus.performance.memory}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">CPU使用率</span>
            <span className="font-medium text-green-600">{systemStatus.performance.cpu}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">任务队列</span>
            <span className="font-medium text-blue-600">{systemStatus.performance.tasks}</span>
          </div>
        </div>
      </div>
    </div>
  );
}