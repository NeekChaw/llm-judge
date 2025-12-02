'use client';

import { CheckCircle, AlertTriangle, Database } from 'lucide-react';
import SystemConfigManager from '@/app/settings/system/SystemConfigManager';
import SystemStatusCards from '@/components/shared/SystemStatusCards';
import { useSystemInfo } from '@/hooks/useSystemStatus';

export default function SystemConfigView() {
  const { systemInfo, systemStatus } = useSystemInfo();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">系统配置</h3>
        <p className="text-gray-600">管理系统运行时配置和环境参数</p>
      </div>

      {/* 系统状态概览 */}
      <SystemStatusCards 
        systemInfo={systemInfo} 
        systemStatus={systemStatus} 
      />

      {/* 系统配置管理 */}
      <SystemConfigManager />

      {/* 系统操作 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">系统操作</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            <CheckCircle className="mr-2 h-4 w-4" />
            检查系统健康
          </button>
          <button className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            <Database className="mr-2 h-4 w-4" />
            清理缓存
          </button>
          <button className="inline-flex items-center justify-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 transition-colors">
            <AlertTriangle className="mr-2 h-4 w-4" />
            重启服务
          </button>
        </div>
      </div>
    </div>
  );
}