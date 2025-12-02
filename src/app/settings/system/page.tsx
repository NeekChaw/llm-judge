'use client';

import SystemActions from './SystemActions'
import SystemConfigManager from './SystemConfigManager'
import SystemStatusCards from '@/components/shared/SystemStatusCards'
import { useSystemInfo } from '@/hooks/useSystemStatus'

export default function SystemSettingsPage() {
  const { systemInfo, systemStatus } = useSystemInfo()

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">运行时配置</h1>
        <p className="text-gray-600">管理系统运行时配置和环境参数</p>
      </div>

      {/* 使用共享的系统状态卡片 */}
      <SystemStatusCards
        systemInfo={systemInfo}
        systemStatus={systemStatus}
      />

      {/* 系统配置管理 */}
      <SystemConfigManager />

      {/* 操作区域 */}
      <SystemActions />
    </div>
  )
}