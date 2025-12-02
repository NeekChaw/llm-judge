'use client';

import { Activity, ExternalLink } from 'lucide-react';

export default function SystemActions() {
  const handleHealthCheck = () => {
    window.open('/api/system/health', '_blank');
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <Activity className="h-5 w-5 mr-2 text-blue-600" />
            系统诊断
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            检查系统各项服务的健康状态和连接情况
          </p>
        </div>

        <button
          onClick={handleHealthCheck}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
        >
          <Activity className="h-4 w-4 mr-2" />
          检查系统健康
          <ExternalLink className="h-3 w-3 ml-2" />
        </button>
      </div>
    </div>
  );
}