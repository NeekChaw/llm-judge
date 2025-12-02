'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Clock, XCircle, RefreshCw, Shield } from 'lucide-react';
import { extractLogicalName } from '@/lib/model-utils';

interface PreFlightCheckProps {
  modelIds: string[];
  onCheckComplete: (result: PreFlightResult) => void;
  disabled?: boolean;
  // 新增：外部传入的检查状态
  externalChecking?: boolean;
  externalResult?: PreFlightResult | null;
  externalError?: string | null;
}

interface PreFlightResult {
  success: boolean;
  summary: {
    total_models: number;
    healthy_models: number;
    unhealthy_models: number;
    success_rate: number;
  };
  healthy_models: string[];
  unhealthy_models: string[];
  recommendations: string[];
  detailed_results?: HealthCheckResult[];
}

interface HealthCheckResult {
  success: boolean;
  model_id: string;
  model_name: string;
  provider: string;
  response_time: number;
  error?: string;
  test_score?: number;
}

export default function PreFlightCheck({
  modelIds,
  onCheckComplete,
  disabled,
  externalChecking,
  externalResult,
  externalError
}: PreFlightCheckProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<PreFlightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logicalModelCount, setLogicalModelCount] = useState<number>(0);

  // 优先使用外部状态
  const currentIsChecking = externalChecking !== undefined ? externalChecking : isChecking;
  const currentResult = externalResult !== undefined ? externalResult : result;
  const currentError = externalError !== undefined ? externalError : error;

  // 🔧 计算逻辑模型数量
  React.useEffect(() => {
    const calculateLogicalModelCount = async () => {
      if (modelIds.length === 0) {
        setLogicalModelCount(0);
        return;
      }

      try {
        // 获取模型信息来计算逻辑模型数量
        const response = await fetch('/api/models?include_inactive=true');
        if (!response.ok) {
          console.warn('获取模型信息失败，使用模型ID数量作为逻辑模型数量');
          setLogicalModelCount(modelIds.length);
          return;
        }

        const data = await response.json();
        const models = data.models || data.data || [];
        const selectedModels = models.filter((m: any) => modelIds.includes(m.id));

        console.log(`🔍 PreFlightCheck: 已选择 ${selectedModels.length} 个模型，共 ${modelIds.length} 个ID`);

        if (selectedModels.length === 0) {
          console.warn('未找到匹配的模型，使用模型ID数量');
          setLogicalModelCount(modelIds.length);
          return;
        }

        // 按逻辑模型分组
        const logicalGroups = new Set();
        selectedModels.forEach((model: any) => {
          const logicalName = model.logical_name || extractLogicalName(model.name);
          logicalGroups.add(logicalName);
          console.log(`📝 模型 ${model.name} 的逻辑名称: ${logicalName}`);
        });

        const logicalCount = logicalGroups.size;
        console.log(`📊 计算得到 ${logicalCount} 个逻辑模型组`);
        setLogicalModelCount(logicalCount);
      } catch (error) {
        console.error('计算逻辑模型数量失败:', error);
        setLogicalModelCount(modelIds.length); // 降级：使用物理实例数量
      }
    };

    calculateLogicalModelCount();
  }, [modelIds]);

  const performCheck = async () => {
    if (modelIds.length === 0) {
      setError('请先选择要检查的模型');
      return;
    }

    // 🔧 移除限制：后端会自动分批处理
    if (modelIds.length > 100) {
      setError(`选择的提供商数量过多（${logicalModelCount}个逻辑模型，${modelIds.length}个提供商），建议控制在100个提供商以内以确保合理的响应时间。`);
      return;
    }

    setIsChecking(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/tasks/pre-flight-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_ids: modelIds,
          timeout_ms: 30000,
          include_detailed_results: true
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '预检查失败');
      }

      // 设置结果，即使成功率为0也要显示详细信息
      setResult(data);
      onCheckComplete(data);
      
      // 如果成功率很低，设置警告但不设置错误
      if (data.summary.success_rate === 0) {
        console.warn('所有模型预检查都失败了，但仍然显示详细结果供用户参考');
      }

    } catch (err: any) {
      const errorMessage = err.message || '预检查执行失败';
      setError(errorMessage);
      console.error('预检查失败:', err);
    } finally {
      setIsChecking(false);
    }
  };

  const getStatusIcon = (success: boolean) => {
    if (success) {
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    } else {
      return <XCircle className="w-5 h-5 text-red-600" />;
    }
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSuccessRateBgColor = (rate: number) => {
    if (rate >= 90) return 'bg-green-50';
    if (rate >= 70) return 'bg-yellow-50';
    return 'bg-red-50';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
      {/* 标题和说明 */}
      <div className="flex items-start gap-3">
        <Shield className="w-6 h-6 text-blue-600 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">模型健康检查</h3>
          <p className="text-sm text-gray-600 mt-1">
            在创建任务前检查模型连通性，可显著降低任务失败率
          </p>
        </div>
      </div>

      {/* 检查按钮 */}
      <div className="flex items-center gap-4">
        <Button
          onClick={performCheck}
          disabled={disabled || currentIsChecking || modelIds.length === 0}
          className="flex items-center gap-2"
        >
          {currentIsChecking ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              检查中... ({logicalModelCount} 个逻辑模型, {modelIds.length} 个提供商)
            </>
          ) : (
            <>
              <Shield className="w-4 h-4" />
              开始健康检查
            </>
          )}
        </Button>

        {modelIds.length === 0 && (
          <span className="text-sm text-gray-500">请先选择要评测的模型</span>
        )}

        {modelIds.length > 100 && (
          <span className="text-sm text-orange-600">
            已选择 {logicalModelCount} 个逻辑模型（{modelIds.length} 个提供商），超出推荐限制（建议100个提供商以内）
          </span>
        )}

        {modelIds.length > 20 && modelIds.length <= 100 && (
          <span className="text-sm text-blue-600">
            已选择 {logicalModelCount} 个逻辑模型（{modelIds.length} 个提供商），将自动分批检查
          </span>
        )}

        {modelIds.length > 0 && modelIds.length <= 20 && (
          <span className="text-sm text-gray-600">
            已选择 {logicalModelCount} 个逻辑模型（{modelIds.length} 个提供商）
          </span>
        )}
      </div>

      {/* 错误信息 */}
      {currentError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-red-800">检查失败</h4>
            <p className="text-sm text-red-700 mt-1">{currentError}</p>
          </div>
        </div>
      )}

      {/* 检查结果 */}
      {currentResult && (
        <div className="space-y-4">
          {/* 总体结果 */}
          <div className={`p-4 rounded-lg border ${
            currentResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center gap-3">
              {getStatusIcon(currentResult.success)}
              <div>
                <h4 className={`font-medium ${
                  currentResult.success ? 'text-green-800' : 'text-red-800'
                }`}>
                  {currentResult.success ? '健康检查通过' : '发现模型连接问题'}
                </h4>
                <div className="text-sm text-gray-600 mt-1">
                  成功率: <span className={`font-medium ${getSuccessRateColor(currentResult.summary.success_rate)}`}>
                    {currentResult.summary.success_rate}%
                  </span>
                  {' '}({currentResult.summary.healthy_models}/{currentResult.summary.total_models} 个模型正常)
                </div>
              </div>
            </div>
          </div>

          {/* 详细结果统计 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{currentResult.summary.total_models}</div>
              <div className="text-sm text-gray-600">总模型数</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{currentResult.summary.healthy_models}</div>
              <div className="text-sm text-gray-600">健康模型</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{currentResult.summary.unhealthy_models}</div>
              <div className="text-sm text-gray-600">异常模型</div>
            </div>
          </div>

          {/* 建议 */}
          {currentResult.recommendations.length > 0 && (
            <div className="space-y-3">
              <h5 className="font-medium text-gray-900">💡 改进建议</h5>
              <div className="space-y-2">
                {currentResult.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2"></div>
                    <span className="text-gray-700">{recommendation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 🔧 修复：按逻辑模型组显示详细结果 */}
          {currentResult.logical_model_groups && currentResult.logical_model_groups.length > 0 ? (
            <div className="space-y-4">
              {/* 异常逻辑模型组（优先显示） */}
              {currentResult.logical_model_groups.filter(g => !g.is_healthy).length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <h5 className="font-medium text-red-800">
                      异常模型 ({currentResult.logical_model_groups.filter(g => !g.is_healthy).length} 个)
                    </h5>
                  </div>
                  <div className="space-y-2">
                    {currentResult.logical_model_groups.filter(g => !g.is_healthy).map((group, index) => (
                      <div key={index} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                            <div>
                              <div className="font-medium text-sm text-red-900">
                                {group.logical_name}
                              </div>
                              <div className="text-xs text-red-700">
                                {group.providers.join(', ')} ({group.provider_count}个提供商)
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-red-600">
                              所有提供商均失败
                            </div>
                          </div>
                        </div>
                        {group.best_provider && group.best_provider.error && (
                          <div className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded border">
                            <strong>代表性错误:</strong>
                            <div className="mt-1 font-mono text-xs max-h-20 overflow-y-auto">
                              {group.best_provider.error
                                .replace('健康检查失败: LLM API call failed: ', '')
                                .replace('健康检查失败: ', '')
                              }
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 健康逻辑模型组（可折叠） */}
              {currentResult.logical_model_groups.filter(g => g.is_healthy).length > 0 && (
                <details className="space-y-3">
                  <summary className="cursor-pointer flex items-center gap-2 font-medium text-green-800 hover:text-green-600">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    健康模型 ({currentResult.logical_model_groups.filter(g => g.is_healthy).length} 个)
                  </summary>
                  <div className="space-y-2 pl-4">
                    {currentResult.logical_model_groups.filter(g => g.is_healthy).map((group, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <div>
                            <div className="font-medium text-sm text-green-900">
                              {group.logical_name}
                            </div>
                            <div className="text-xs text-green-700">
                              {group.best_provider ? group.best_provider.provider : group.providers.join(', ')}
                              {group.provider_count > 1 && (
                                <span className="ml-1">({group.provider_count}个提供商)</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm font-medium text-green-600">
                          {group.best_provider ? group.best_provider.response_time : 'N/A'}ms
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : (
            /* 🔧 降级：如果没有逻辑模型组信息，显示原始详细结果 */
            currentResult.detailed_results && (
              <div className="space-y-4">
                {/* 异常模型 */}
                {currentResult.detailed_results.filter(r => !r.success).length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <h5 className="font-medium text-red-800">
                        异常模型 ({currentResult.detailed_results.filter(r => !r.success).length} 个)
                      </h5>
                    </div>
                    <div className="space-y-2">
                      {currentResult.detailed_results.filter(r => !r.success).map((detail, index) => (
                        <div key={index} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="font-medium text-sm text-red-900">
                            {detail.model_name || detail.model_id || 'Unknown'} ({detail.provider})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 健康模型 */}
                {currentResult.detailed_results.filter(r => r.success).length > 0 && (
                  <details className="space-y-3">
                    <summary className="cursor-pointer flex items-center gap-2 font-medium text-green-800 hover:text-green-600">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      健康模型 ({currentResult.detailed_results.filter(r => r.success).length} 个)
                    </summary>
                    <div className="space-y-2 pl-4">
                      {currentResult.detailed_results.filter(r => r.success).map((detail, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                          <div className="font-medium text-sm text-green-900">
                            {detail.model_name || detail.model_id || 'Unknown'} ({detail.provider})
                          </div>
                          <div className="text-sm font-medium text-green-600">
                            {detail.response_time}ms
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}