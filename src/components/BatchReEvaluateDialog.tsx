'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, X, ChevronDown, ChevronRight } from 'lucide-react';
import { groupModelsByLogicalName, ExtendedModel } from '@/lib/model-utils';

interface FailedSubtask {
  id: string;
  model_name?: string;
  dimension_name?: string;
  error_message?: string;
  test_case_input?: string;
}

interface BatchReEvaluateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  failedSubtasks: FailedSubtask[];
  taskId: string;
  onConfirm: (selectedModelId: string, reason: string, freshStart: boolean) => Promise<void>;
}

interface Model {
  id: string;
  name: string;
  logical_name?: string;
  provider: string;
  role: string;
  status: string;
}

export default function BatchReEvaluateDialog({
  isOpen,
  onClose,
  failedSubtasks,
  taskId,
  onConfirm
}: BatchReEvaluateDialogProps) {
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [reason, setReason] = useState<string>('批量重新评分失败的评测结果');
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [freshStart, setFreshStart] = useState(false); // 🆕 是否重新尝试所有提供商

  // 加载可用的评分器模型
  useEffect(() => {
    if (isOpen) {
      loadEvaluatorModels();
    }
  }, [isOpen]);

  const loadEvaluatorModels = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/models?limit=100');
      if (response.ok) {
        const { models } = await response.json();
        // 筛选出可用的评分器模型
        const evaluatorModels = models.filter((model: Model) =>
          model.status === 'active' &&
          (model.role === 'evaluator' || model.role === 'evaluatable' || !model.role)
        );

        // 🆕 按逻辑名称分组，只显示逻辑模型（不重复显示多个提供商）
        const groupedModels = groupModelsByLogicalName(evaluatorModels as ExtendedModel[]);

        // 为每个逻辑模型组选择一个代表模型（第一个）
        const uniqueModels = groupedModels.map(group => ({
          ...group.models[0],
          _providerCount: group.models.length,
          _providers: group.models.map(m => m.vendor_name || m.provider || 'Unknown')
        }));

        setAvailableModels(uniqueModels);
      }
    } catch (error) {
      console.error('加载评分器模型失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 按模型-维度分组失败的子任务
  const groupedSubtasks = React.useMemo(() => {
    const groups = new Map<string, FailedSubtask[]>();

    failedSubtasks.forEach(subtask => {
      const key = `${subtask.model_name || '未知模型'}-${subtask.dimension_name || '未知维度'}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(subtask);
    });

    return Array.from(groups.entries()).map(([key, subtasks]) => ({
      key,
      model_name: subtasks[0].model_name || '未知模型',
      dimension_name: subtasks[0].dimension_name || '未知维度',
      count: subtasks.length,
      subtasks
    }));
  }, [failedSubtasks]);

  const handleConfirm = async () => {
    if (!selectedModelId) {
      alert('请选择一个评分器模型');
      return;
    }

    try {
      setSubmitting(true);
      await onConfirm(selectedModelId, reason, freshStart);
      onClose();
    } catch (error) {
      console.error('批量重新评分失败:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedModel = availableModels.find(m => m.id === selectedModelId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">批量重新评分</h2>
              <p className="text-sm text-gray-600">对所有失败的评测结果重新评分</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* 失败统计 */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-medium text-red-900 mb-1">
                  发现 {failedSubtasks.length} 个失败的评测结果
                </h3>
                <p className="text-sm text-red-800 mb-3">
                  这些结果的被测模型已经生成了回答，但评分过程失败了。重新评分将保留原始模型回答，仅重新执行评分过程。
                </p>

                {/* 详情展开/折叠 */}
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-1 text-sm text-red-700 hover:text-red-900 font-medium"
                >
                  {showDetails ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  查看详细分组 ({groupedSubtasks.length} 个模型-维度组合)
                </button>

                {showDetails && (
                  <div className="mt-3 space-y-2">
                    {groupedSubtasks.map(group => (
                      <div key={group.key} className="bg-white rounded p-3 border border-red-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-900">{group.model_name}</span>
                            <span className="text-gray-500 mx-2">×</span>
                            <span className="font-medium text-gray-900">{group.dimension_name}</span>
                          </div>
                          <span className="text-sm bg-red-100 text-red-800 px-2 py-1 rounded">
                            {group.count} 个失败
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 评分器模型选择 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择评分器模型 <span className="text-red-500">*</span>
            </label>
            {loading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <RefreshCw className="w-4 h-4 animate-spin" />
                加载模型列表...
              </div>
            ) : (
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">请选择一个评分器模型...</option>
                {availableModels.map(model => {
                  const displayName = model.logical_name || model.name;
                  const providerCount = (model as any)._providerCount || 1;
                  const providers = (model as any)._providers || [model.provider];
                  const providerText = providerCount > 1
                    ? `${providerCount}个提供商`
                    : providers[0];

                  return (
                    <option key={model.id} value={model.logical_name || model.id}>
                      {displayName} ({providerText})
                    </option>
                  );
                })}
              </select>
            )}

            {selectedModel && (
              <div className="mt-2 text-sm text-gray-600">
                已选择: <span className="font-medium">{selectedModel.logical_name || selectedModel.name}</span>
                {(selectedModel as any)._providerCount > 1 ? (
                  <span className="text-gray-400 ml-1">
                    ({(selectedModel as any)._providerCount}个提供商: {(selectedModel as any)._providers.join(', ')})
                  </span>
                ) : (
                  <span className="text-gray-400 ml-1">({selectedModel.provider})</span>
                )}
              </div>
            )}
          </div>

          {/* 重试原因 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              重试原因 (可选)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="输入批量重新评分的原因..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
            />
          </div>

          {/* 🆕 提供商重试策略 */}
          <div className="mb-6">
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="freshStart"
                checked={freshStart}
                onChange={(e) => setFreshStart(e.target.checked)}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div className="flex-1">
                <label htmlFor="freshStart" className="text-sm font-medium text-gray-700 cursor-pointer">
                  重新尝试所有提供商（Fresh Start）
                </label>
                <p className="mt-1 text-xs text-gray-500">
                  勾选后，系统会忽略之前的失败记录，给所有提供商一个全新的机会。如果上次失败是临时网络问题，建议勾选此选项。
                </p>
              </div>
            </div>
          </div>

          {/* 操作说明 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">操作说明</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• 将使用选择的评分器模型对所有失败的评测结果重新评分</li>
              <li>• 被测模型的原始回答将被保留，不会重新生成</li>
              <li>• 如果评分器是逻辑模型且有多个提供商，系统会自动切换提供商</li>
              <li>• 勾选"重新尝试所有提供商"可以忽略之前的失败记录</li>
              <li>• 重新评分过程将并发执行，可能需要一些时间完成</li>
              <li>• 完成后可以在任务详情页面查看新的评分结果</li>
            </ul>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedModelId || submitting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {submitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                重新评分中... ({failedSubtasks.length}个)
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                开始重新评分 ({failedSubtasks.length}个)
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}