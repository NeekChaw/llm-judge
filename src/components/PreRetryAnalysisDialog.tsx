'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, AlertCircle, RefreshCw, SkipForward, Settings } from 'lucide-react';

interface PreRetryAnalysis {
  total_failed_subtasks: number;
  all_vendors_failed_count: number;
  timeout_failed_count: number;
  other_failed_count: number;
  all_vendors_failed_details: Array<{
    subtask_id: string;
    model_logical_name: string;
    model_display_name: string;
    failed_vendors: Array<{
      vendor_name: string;
      failure_reason: string;
      failure_time: Date;
      is_timeout: boolean;
    }>;
    vendor_count: number;
    all_vendors_exhausted: boolean;
  }>;
  recommendation: "proceed" | "user_choice" | "skip_problematic";
  analysis_summary: {
    safe_to_retry: number;
    needs_user_choice: number;
    skip_recommended: number;
  };
}

interface RetryOptions {
  include_all_vendors_failed: boolean;
  reset_vendor_failure_history: boolean;
  use_fresh_start_strategy: boolean;
  exclude_subtask_ids?: string[];
  // 🆕 enable_thinking参数控制
  disable_enable_thinking?: boolean;
}

interface SelectedGroup {
  key: string;
  model_name: string;
  dimension_name: string;
  failed_count: number;
  can_retry_count: number;
  subtasks: Array<{ id: string; model_name: string; dimension_name: string; }>;
}

interface PreRetryAnalysisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  selectedGroup: SelectedGroup | null; // 🆕 当前选中的组合
  onStartRetry: (options: RetryOptions) => void;
}

export default function PreRetryAnalysisDialog({
  isOpen,
  onClose,
  taskId,
  selectedGroup,
  onStartRetry
}: PreRetryAnalysisDialogProps) {
  const [analysis, setAnalysis] = useState<PreRetryAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryMode, setRetryMode] = useState<'smart_skip' | 'fresh_start' | 'manual'>('smart_skip');
  
  // 🆕 推理模型和enable_thinking控制状态
  const [reasoningModels, setReasoningModels] = useState<Array<{ id: string; name: string; logical_name?: string; }>>([]);
  const [disableEnableThinking, setDisableEnableThinking] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);

  useEffect(() => {
    if (isOpen && taskId) {
      fetchAnalysis();
      fetchTaskModels();
    }
  }, [isOpen, taskId, selectedGroup]);

  // 🆕 获取任务中涉及的推理模型
  const fetchTaskModels = async () => {
    try {
      setLoadingModels(true);
      
      // 🔧 Debug: 检查taskId
      if (!taskId) {
        console.error('❌ fetchTaskModels: taskId is missing or empty');
        throw new Error('任务ID缺失');
      }
      
      // 构建查询参数 - 根据选中组合筛选
      let apiUrl = `/api/tasks/${taskId}/models`;
      if (selectedGroup) {
        const params = new URLSearchParams({
          model_name: selectedGroup.model_name,
          dimension_name: selectedGroup.dimension_name
        });
        apiUrl += `?${params.toString()}`;
      }
      
      console.log('🔍 fetchTaskModels: 请求URL:', apiUrl);
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ fetchTaskModels API错误:', response.status, errorText);
        throw new Error(`Failed to fetch task models: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      // 筛选出标签包含"推理"的模型
      const reasoning = (data.models || []).filter((model: any) => 
        (model.tags || []).includes('推理')
      );
      
      setReasoningModels(reasoning);
      
    } catch (err) {
      console.error('获取任务模型信息失败:', err);
      setReasoningModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const fetchAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 🆕 根据选中的组合构造查询参数
      let apiUrl = `/api/tasks/${taskId}/pre-retry-analysis`;
      if (selectedGroup) {
        const params = new URLSearchParams({
          model_name: selectedGroup.model_name,
          dimension_name: selectedGroup.dimension_name
        });
        apiUrl += `?${params.toString()}`;
      }
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch analysis');
      }
      
      const data = await response.json();
      setAnalysis(data);
      
      // 根据推荐策略设置默认选择
      if (data.recommendation === 'proceed') {
        setRetryMode('smart_skip');
      } else if (data.recommendation === 'user_choice') {
        setRetryMode('smart_skip'); // 默认推荐智能跳过
      } else {
        setRetryMode('fresh_start'); // 建议全新开始
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleStartRetry = () => {
    if (!analysis) return;

    const options: RetryOptions = {
      include_all_vendors_failed: retryMode === 'fresh_start',
      reset_vendor_failure_history: retryMode === 'fresh_start',
      use_fresh_start_strategy: retryMode === 'fresh_start',
      exclude_subtask_ids: retryMode === 'smart_skip' 
        ? analysis.all_vendors_failed_details.map(d => d.subtask_id)
        : undefined,
      // 🆕 传递enable_thinking参数控制选项
      disable_enable_thinking: disableEnableThinking
    };

    onStartRetry(options);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              {selectedGroup 
                ? `${selectedGroup.model_name} - ${selectedGroup.dimension_name} 重试预检查`
                : '重试预检查报告'
              }
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>

          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">📊 分析失败子任务...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800">分析失败: {error}</p>
            </div>
          )}

          {analysis && (
            <>
              {/* 分析摘要 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-800">安全重试</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{analysis.analysis_summary.safe_to_retry}</p>
                  <p className="text-sm text-green-600">超时或部分失败</p>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    <span className="font-medium text-amber-800">需用户确认</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-600">{analysis.analysis_summary.needs_user_choice}</p>
                  <p className="text-sm text-amber-600">全提供商失败</p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-800">总失败数</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-600">{analysis.total_failed_subtasks}</p>
                  <p className="text-sm text-gray-600">需要重试的子任务</p>
                </div>
              </div>

              {/* 全提供商失败详情 */}
              {analysis.all_vendors_failed_count > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <h3 className="font-bold text-red-800 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    🚨 全提供商失败详情 ({analysis.all_vendors_failed_count}个子任务)
                  </h3>
                  <div className="space-y-3">
                    {analysis.all_vendors_failed_details.map((detail, index) => (
                      <div key={index} className="bg-white rounded p-3 border border-red-200">
                        <div className="font-medium text-gray-900 mb-2">
                          • {detail.model_logical_name} ({detail.model_display_name})
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          {detail.failed_vendors.map((vendor, vIndex) => (
                            <div key={vIndex} className="text-gray-600">
                              <span className="font-medium text-red-600">{vendor.vendor_name}</span>: {vendor.failure_reason}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 用户选择 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-bold text-blue-800 mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  🤔 如何处理全提供商失败的子任务？
                </h3>
                
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="retry-mode"
                      value="smart_skip"
                      checked={retryMode === 'smart_skip'}
                      onChange={(e) => setRetryMode(e.target.value as any)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        <SkipForward className="w-4 h-4 text-blue-600" />
                        智能跳过 {analysis.recommendation === 'proceed' || analysis.recommendation === 'user_choice' ? '(推荐)' : ''}
                      </div>
                      <div className="text-sm text-gray-600">
                        只重试有希望成功的子任务，跳过全提供商失败的子任务
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="retry-mode"
                      value="fresh_start"
                      checked={retryMode === 'fresh_start'}
                      onChange={(e) => setRetryMode(e.target.value as any)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-green-600" />
                        全部重新尝试 {analysis.recommendation === 'skip_problematic' ? '(推荐)' : ''}
                      </div>
                      <div className="text-sm text-gray-600">
                        清除失败历史，从头开始所有提供商，包括之前失败的子任务
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 执行预期结果 */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <h4 className="font-medium text-gray-800 mb-2">📋 执行预期结果:</h4>
                {retryMode === 'smart_skip' && (
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• 重试 {analysis.analysis_summary.safe_to_retry} 个有希望成功的子任务</li>
                    <li>• 跳过 {analysis.analysis_summary.needs_user_choice} 个全提供商失败的子任务</li>
                    <li>• 保持现有提供商失败历史，避免无效重试</li>
                  </ul>
                )}
                {retryMode === 'fresh_start' && (
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• 重新尝试所有 {analysis.total_failed_subtasks} 个失败子任务</li>
                    <li>• 清除所有提供商的失败历史和熔断状态</li>
                    <li>• 从优先级策略重新开始，给每个提供商公平机会</li>
                  </ul>
                )}
              </div>

              {/* 🆕 推理模型enable_thinking参数控制 */}
              {reasoningModels.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                  <h3 className="font-bold text-amber-800 mb-4 flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    🧠 推理模型参数控制
                  </h3>
                  
                  <div className="space-y-4">
                    {/* 推理模型列表 */}
                    <div className="bg-white border border-amber-200 rounded p-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        任务中的推理模型 ({reasoningModels.length}个):
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {reasoningModels.map((model, index) => (
                          <span 
                            key={model.id}
                            className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full"
                          >
                            🧠 {model.logical_name || model.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    {/* enable_thinking控制选项 */}
                    <div className="space-y-3">
                      <h5 className="text-sm font-medium text-gray-700">
                        思维链参数控制 (enable_thinking):
                      </h5>
                      
                      <div className="space-y-2">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name="enable_thinking_control"
                            value="default"
                            checked={!disableEnableThinking}
                            onChange={() => setDisableEnableThinking(false)}
                            className="mt-1"
                          />
                          <div>
                            <div className="font-medium text-gray-900">
                              维持原样 (推荐)
                            </div>
                            <div className="text-sm text-gray-600">
                              使用推理模型的默认配置，保持最佳推理效果
                            </div>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name="enable_thinking_control"
                            value="disable"
                            checked={disableEnableThinking}
                            onChange={() => setDisableEnableThinking(true)}
                            className="mt-1"
                          />
                          <div>
                            <div className="font-medium text-gray-900">
                              临时关闭思维链
                            </div>
                            <div className="text-sm text-gray-600">
                              仅本次重试生效，用于解决提供商兼容性问题（支持enable_thinking和reasoning参数）
                            </div>
                            {disableEnableThinking && (
                              <div className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded border">
                                ⚠️ 注意：关闭思维链参数后，推理模型将不会产生思维链内容，可能影响推理质量
                                <br />
                                📌 支持的参数类型：DMX (enable_thinking)、OpenRouter (reasoning)、其他提供商
                                <br />
                                🔧 特殊情况：OpenRouter的某些强制推理模型（如MiniMax-M1、DeepSeek-R1等）无法完全禁用推理，系统会自动使用最小推理配置
                              </div>
                            )}
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-end space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleStartRetry}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  开始重试
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}