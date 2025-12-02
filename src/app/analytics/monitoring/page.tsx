'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 监控页面重定向
 * 此页面已迁移到主分析台的实时监控标签页
 */
export default function MonitoringRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // 重定向到主分析台的监控标签页
    router.replace('/analytics?tab=monitoring');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-sm rounded-lg p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h2 className="text-lg font-medium text-gray-900 mb-2">正在跳转...</h2>
        <p className="text-gray-600">
          监控功能已迁移到统一分析台，正在为您自动跳转...
        </p>
      </div>
    </div>
  );
}