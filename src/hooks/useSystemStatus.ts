'use client';

import { useState, useEffect } from 'react';

export interface SystemInfo {
  version: string;
  nodeVersion: string;
  environment: string;
  startTime: string;
}

export interface SystemStatus {
  database: {
    type: string;
    status: 'connected' | 'disconnected';
    connections?: number;
    latency?: number;
  };
  redis: {
    status: 'connected' | 'mock' | 'disconnected';
    memory?: string;
  };
  apis: {
    siliconflow: 'configured' | 'not_configured';
    e2b: 'configured' | 'not_configured';
    openai: 'configured' | 'not_configured';
  };
  performance: {
    memory: string;
    cpu: string;
    tasks: string;
  };
}

export interface SystemMetrics {
  uptime: string;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  tasks: {
    total: number;
    running: number;
    queued: number;
    completed: number;
    failed: number;
  };
  database: {
    status: 'connected' | 'disconnected';
    connections: number;
    latency: number;
  };
  redis: {
    status: 'connected' | 'mock' | 'disconnected';
    memory: string;
  };
}

// 获取基础系统信息（仅客户端安全）
function getSystemInfoSafe(): SystemInfo {
  if (typeof window === 'undefined') {
    // 服务端默认值
    return {
      version: 'v2.0.0',
      nodeVersion: 'v24.4.0',
      environment: 'development',
      startTime: new Date().toLocaleString('zh-CN')
    };
  }
  
  // 客户端值
  return {
    version: 'v2.0.0',
    nodeVersion: 'v24.4.0',
    environment: 'development',
    startTime: new Date().toLocaleString('zh-CN')
  };
}

// 获取系统状态信息（用于配置页面等）
function getSystemStatusSafe(): SystemStatus {
  return {
    database: {
      type: 'PostgreSQL (Supabase)',
      status: 'connected'
    },
    redis: {
      status: 'mock'
    },
    apis: {
      siliconflow: 'configured',
      e2b: 'configured',
      openai: 'not_configured'
    },
    performance: {
      memory: '正常',
      cpu: '正常',
      tasks: '运行中'
    }
  };
}

// 服务端兼容的导出函数
export function getSystemInfo(): SystemInfo {
  return getSystemInfoSafe();
}

export function getSystemStatus(): SystemStatus {
  return getSystemStatusSafe();
}

// Hook for system metrics (实时监控数据)
export function useSystemMetrics() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    uptime: '2小时 35分钟',
    memory: { used: 256, total: 512, percentage: 50 },
    cpu: { usage: 15 },
    tasks: { total: 127, running: 3, queued: 5, completed: 115, failed: 4 },
    database: { status: 'connected', connections: 12, latency: 35 },
    redis: { status: 'mock', memory: '2.1MB' }
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const refreshMetrics = async () => {
    setLoading(true);
    try {
      // TODO: 替换为真实的API调用
      // const response = await fetch('/api/system/metrics');
      // const data = await response.json();
      // setMetrics(data);
      
      // 模拟数据更新
      await new Promise(resolve => setTimeout(resolve, 1000));
      setLastUpdated(new Date());
    } catch (error) {
      console.error('获取系统指标失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 自动刷新间隔
    const interval = setInterval(() => {
      refreshMetrics();
    }, 30000); // 30秒刷新一次

    return () => clearInterval(interval);
  }, []);

  return {
    metrics,
    loading,
    lastUpdated,
    refreshMetrics
  };
}

// Hook for basic system info and status
export function useSystemInfo() {
  const [systemInfo] = useState(() => getSystemInfoSafe());
  const [systemStatus] = useState(() => getSystemStatusSafe());

  return {
    systemInfo,
    systemStatus
  };
}