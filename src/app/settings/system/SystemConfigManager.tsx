'use client';

import { useState, useEffect } from 'react';
import { Settings, RefreshCw, RotateCcw, Save, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

// 使用新的配置接口定义
interface SystemConfig {
  // 处理器配置（通用，支持script和middleware模式）
  processor_check_interval: number;
  processor_concurrent_limit: number;
  processor_retry_delay: number;
  processor_mode: 'script' | 'middleware';
  
  // 任务默认配置
  task_default_timeout: number;
  task_default_retry_count: number;
  task_default_concurrent_limit: number;
  
  // 系统性能配置
  system_max_queue_size: number;
  system_cleanup_interval: number;
  system_log_retention_days: number;
  
  // 中间件模式专用配置
  middleware_pool_size: number;
  middleware_keepalive_timeout: number;
  
  // 🆕 API请求配置
  api_request_timeout: number;         // API请求超时时间（毫秒）
  api_connect_timeout: number;         // 连接超时时间（毫秒）
  api_max_retries: number;             // API最大重试次数
  
  // 🆕 僵尸任务检测配置
  zombie_task_timeout_minutes: number; // 僵尸任务超时时间（分钟）
}

interface SystemConfigResponse {
  config: SystemConfig;
  source: {
    database: boolean;
    environment: boolean;
    defaults: boolean;
  };
  timestamp: string;
}

interface ConfigField {
  key: keyof SystemConfig;
  label: string;
  description: string;
  unit?: string;
  min: number;
  max: number;
  step?: number;
  category: 'processor' | 'task' | 'system' | 'middleware' | 'api' | 'zombie';
  type?: 'number' | 'select';
  options?: Array<{value: any, label: string}>;
}

const CONFIG_FIELDS: ConfigField[] = [
  // 处理器配置（通用）
  {
    key: 'processor_check_interval',
    label: '检查间隔',
    description: '处理器检查新任务的时间间隔',
    unit: 'ms',
    min: 1000,
    max: 300000,
    step: 1000,
    category: 'processor'
  },
  {
    key: 'processor_concurrent_limit',
    label: '全局并发限制',
    description: '处理器同时处理的最大任务数量',
    min: 1,
    max: 50,
    category: 'processor'
  },
  {
    key: 'processor_retry_delay',
    label: '重试延迟',
    description: '任务失败后重试前的等待时间',
    unit: 'ms',
    min: 1000,
    max: 60000,
    step: 1000,
    category: 'processor'
  },
  {
    key: 'processor_mode',
    label: '处理器模式',
    description: '选择使用脚本模式或中间件模式',
    type: 'select',
    min: 0,
    max: 1,
    category: 'processor',
    options: [
      { value: 'script', label: '脚本模式 (Script)' },
      { value: 'middleware', label: '中间件模式 (Middleware)' }
    ]
  },
  
  // 任务默认配置
  {
    key: 'task_default_timeout',
    label: '默认超时时间',
    description: '新建任务的默认超时时间',
    unit: '秒',
    min: 30,
    max: 3600,
    step: 30,
    category: 'task'
  },
  {
    key: 'task_default_retry_count',
    label: '默认重试次数',
    description: '新建任务的默认重试次数',
    min: 0,
    max: 10,
    category: 'task'
  },
  {
    key: 'task_default_concurrent_limit',
    label: '默认并发限制',
    description: '新建任务的默认子任务并发数量',
    min: 1,
    max: 20,
    category: 'task'
  },
  
  // 系统性能配置
  {
    key: 'system_max_queue_size',
    label: '最大队列大小',
    description: '任务队列的最大容量',
    min: 100,
    max: 10000,
    step: 100,
    category: 'system'
  },
  {
    key: 'system_cleanup_interval',
    label: '清理间隔',
    description: '系统自动清理过期数据的时间间隔',
    unit: 'ms',
    min: 300000,
    max: 86400000,
    step: 300000,
    category: 'system'
  },
  {
    key: 'system_log_retention_days',
    label: '日志保留天数',
    description: '系统日志的保留时间',
    unit: '天',
    min: 1,
    max: 365,
    category: 'system'
  },
  
  // 中间件模式专用配置
  {
    key: 'middleware_pool_size',
    label: '连接池大小',
    description: '中间件模式下的连接池大小',
    min: 1,
    max: 100,
    category: 'middleware'
  },
  {
    key: 'middleware_keepalive_timeout',
    label: '保活超时',
    description: '中间件模式下的连接保活超时时间',
    unit: 'ms',
    min: 5000,
    max: 300000,
    step: 1000,
    category: 'middleware'
  },
  
  // 🆕 API请求配置
  {
    key: 'api_request_timeout',
    label: 'API请求超时',
    description: 'LLM API请求的最大等待时间',
    unit: 'ms',
    min: 30000,  // 30秒
    max: 1800000, // 🔧 修改为30分钟，支持15分钟配置需求
    step: 5000,
    category: 'processor'
  },
  {
    key: 'api_connect_timeout',
    label: 'API连接超时',
    description: 'API连接建立的最大等待时间',
    unit: 'ms',
    min: 5000,   // 5秒
    max: 60000,  // 60秒
    step: 1000,
    category: 'processor'
  },
  {
    key: 'api_max_retries',
    label: 'API最大重试次数',
    description: 'API调用失败时的最大重试次数',
    min: 0,
    max: 5,
    category: 'processor'
  },
  
  // 🆕 僵尸任务检测配置
  {
    key: 'zombie_task_timeout_minutes',
    label: '僵尸任务超时时间',
    description: '子任务运行超过此时间将被视为僵尸任务并重置状态（建议设置为API超时的1.5倍以上）',
    unit: '分钟',
    min: 1,
    max: 60,
    step: 1,
    category: 'zombie'
  }
];

const CATEGORY_LABELS = {
  processor: '处理器配置',
  task: '任务默认配置',
  system: '系统性能配置',
  middleware: '中间件配置',
  api: 'API配置',
  zombie: '僵尸任务检测'
};

// 简化的API客户端方法
const apiClient = {
  async getSystemConfig(): Promise<{data?: SystemConfigResponse, error?: string}> {
    try {
      const response = await fetch('/api/system/config');
      if (!response.ok) {
        return { error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { data };
    } catch (error) {
      return { error: String(error) };
    }
  },

  async updateSystemConfig(config: Partial<SystemConfig>): Promise<{error?: string}> {
    try {
      const response = await fetch('/api/system/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        return { error: errorData.error || `HTTP ${response.status}` };
      }
      
      return {};
    } catch (error) {
      return { error: String(error) };
    }
  },

  async resetSystemConfig(): Promise<{error?: string}> {
    try {
      const response = await fetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        return { error: errorData.error || `HTTP ${response.status}` };
      }
      
      return {};
    } catch (error) {
      return { error: String(error) };
    }
  }
};

export default function SystemConfigManager() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalConfig, setOriginalConfig] = useState<SystemConfig | null>(null);
  // 🆕 折叠状态管理（默认只展开 processor 配置）
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['processor'])
  );

  // 加载配置
  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.getSystemConfig();
      if (response.error) {
        setError(response.error);
        return;
      }
      
      if (response.data) {
        setConfig(response.data.config);
        setOriginalConfig(response.data.config);
        setHasChanges(false);
      }
    } catch (err) {
      setError('加载系统配置失败');
      console.error('Load config error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // 处理配置值变更
  const handleConfigChange = (key: keyof SystemConfig, value: number | string) => {
    if (!config) return;
    
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    
    // 检查是否有变更
    if (originalConfig) {
      const hasChangesNow = Object.keys(newConfig).some(
        k => newConfig[k as keyof SystemConfig] !== originalConfig[k as keyof SystemConfig]
      );
      setHasChanges(hasChangesNow);
    }
    
    // 清除消息
    setError(null);
    setSuccess(null);
  };

  // 保存配置
  const handleSave = async () => {
    if (!config || !hasChanges) return;
    
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      const response = await apiClient.updateSystemConfig(config);
      if (response.error) {
        setError(response.error);
        return;
      }
      
      setSuccess('系统配置已保存成功');
      setOriginalConfig(config);
      setHasChanges(false);
      
      // 清除成功消息
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('保存配置失败');
      console.error('Save config error:', err);
    } finally {
      setSaving(false);
    }
  };

  // 重置配置
  const handleReset = async () => {
    if (!confirm('确定要重置所有配置到默认值吗？此操作不可撤销。')) {
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      const response = await apiClient.resetSystemConfig();
      if (response.error) {
        setError(response.error);
        return;
      }
      
      setSuccess('系统配置已重置为默认值');
      await loadConfig(); // 重新加载配置
      
      // 清除成功消息
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('重置配置失败');
      console.error('Reset config error:', err);
    } finally {
      setSaving(false);
    }
  };

  // 取消更改
  const handleCancel = () => {
    if (originalConfig) {
      setConfig(originalConfig);
      setHasChanges(false);
      setError(null);
      setSuccess(null);
    }
  };

  // 🆕 切换分类折叠状态
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // 格式化值显示
  const formatValue = (value: number, unit?: string) => {
    if (unit === 'ms') {
      if (value >= 60000) {
        return `${(value / 60000).toFixed(1)} 分钟`;
      } else if (value >= 1000) {
        return `${(value / 1000).toFixed(1)} 秒`;
      }
      return `${value} 毫秒`;
    }
    return unit ? `${value} ${unit}` : value.toString();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">加载系统配置中...</span>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-500">无法加载系统配置</p>
          <button
            onClick={loadConfig}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // 按类别分组配置字段
  const groupedFields = CONFIG_FIELDS.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, ConfigField[]>);

  return (
    <div className="space-y-6">
      {/* 标题和操作按钮 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Settings className="h-5 w-5 mr-2" />
              系统配置管理
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              管理处理器和系统运行时参数（支持Script和Middleware模式）
            </p>
          </div>

          <button
            onClick={loadConfig}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        {/* 状态消息 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center">
            <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
            <span className="text-green-700 text-sm">{success}</span>
          </div>
        )}

        {/* 配置表单 - 手风琴形式 */}
        <div className="space-y-3">
          {Object.entries(groupedFields).map(([category, fields]) => {
            const isExpanded = expandedCategories.has(category);
            const categoryLabel = CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS];

            return (
              <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* 分类头部 - 可点击折叠/展开 */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <h3 className="text-sm font-semibold text-gray-900">
                    {categoryLabel}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      ({fields.length} 项配置)
                    </span>
                  </h3>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </button>

                {/* 配置内容 - 可折叠 */}
                {isExpanded && (
                  <div className="p-4 bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {fields.map((field) => (
                        <div key={field.key} className="space-y-1.5">
                          <label className="block text-xs font-medium text-gray-700">
                            {field.label}
                            {field.unit && (
                              <span className="ml-1 text-gray-400">({field.unit})</span>
                            )}
                          </label>

                          {field.type === 'select' ? (
                            <select
                              value={String(config[field.key])}
                              onChange={(e) => handleConfigChange(field.key, e.target.value)}
                              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              {field.options?.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="number"
                              min={field.min}
                              max={field.max}
                              step={field.step || 1}
                              value={config[field.key]}
                              onChange={(e) => handleConfigChange(field.key, parseInt(e.target.value))}
                              placeholder={`${field.min}-${field.max}`}
                              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          )}

                          <p className="text-xs text-gray-500">{field.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 底部操作按钮 */}
        <div className="mt-6 flex justify-between items-center pt-6 border-t border-gray-200">
          {/* 左侧：危险操作 */}
          <button
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center px-3 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            重置为默认值
          </button>

          {/* 右侧：保存操作（仅在有更改时显示） */}
          {hasChanges && (
            <div className="flex space-x-3">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>

              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    保存配置
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}