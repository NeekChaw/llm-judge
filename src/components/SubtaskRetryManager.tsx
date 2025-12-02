'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import PreRetryAnalysisDialog from '@/components/PreRetryAnalysisDialog';
import {
  RefreshCw,
  AlertTriangle,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  Info,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface SubtaskRetryInfo {
  subtask_id: string;
  status: string;
  retry_count: number;
  max_retries: number;
  can_retry: boolean;
  error_message?: string;
  current_evaluator: {
    id: string;
    name: string;
    type: string;
  };
  last_attempt: {
    started_at?: string;
    finished_at?: string;
    score?: number;
    justification?: string;
  };
}

// 兼容原始evaluation_results和聚合数据两种格式
interface FailedSubtask {
  id: string;
  test_case_id?: string;
  model_id: string;
  dimension_id: string;
  evaluator_id?: string;
  status: string;
  retry_count?: number;
  error_message?: string;
  // 显示名称（来自原始数据或聚合数据）
  model_name?: string;
  dimension_name?: string;
  evaluator_name?: string;
  test_case_input?: string;
  // 原始数据特有的字段
  score?: number;
  justification?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  repetition_index?: number;
  run_index?: number;
}

interface SubtaskRetryManagerProps {
  taskId: string;
  failedSubtasks: FailedSubtask[];
  onRetryComplete?: () => void;
  className?: string;
  showBatchRetry?: boolean; // 🆕 控制是否显示"重试所有失败的子任务"按钮
}

interface EvaluatorOption {
  id: string;
  name: string;
  type: string;
}

// 聚合失败任务的接口定义
interface AggregatedFailedTask {
  key: string; // model_name + dimension_name 组成的唯一键
  model_name: string;
  dimension_name: string;
  failed_count: number;
  can_retry_count: number;
  subtasks: FailedSubtask[]; // 该组合下的所有失败记录
}

export default function SubtaskRetryManager({
  taskId,
  failedSubtasks,
  onRetryComplete,
  className = '',
  showBatchRetry = true // 🆕 默认显示批量重试按钮
}: SubtaskRetryManagerProps) {
  const [retryInfo, setRetryInfo] = useState<Record<string, SubtaskRetryInfo>>({});
  const [availableEvaluators, setAvailableEvaluators] = useState<EvaluatorOption[]>([]);
  const [selectedEvaluators, setSelectedEvaluators] = useState<Record<string, string>>({});
  const [retryReasons, setRetryReasons] = useState<Record<string, string>>({});
  const [retryingSubtasks, setRetryingSubtasks] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showPreRetryDialog, setShowPreRetryDialog] = useState(false); // 🆕 预检查对话框状态
  const [selectedGroupForRetry, setSelectedGroupForRetry] = useState<string | null>(null); // 🆕 当前选中要重试的组合
  const [loading, setLoading] = useState(false);
  
  // 🆕 聚合失败任务按模型-维度分组
  const [aggregatedTasks, setAggregatedTasks] = useState<AggregatedFailedTask[]>([]);
  
  // 🆕 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // 每页显示5个聚合组
  
  // 🆕 错误详情状态
  const [errorDetails, setErrorDetails] = useState<{
    isVisible: boolean;
    title: string;
    details: Array<{ subtaskId: string; error: string }>;
  }>({
    isVisible: false,
    title: '',
    details: []
  });


  // 聚合失败任务按模型-维度分组
  useEffect(() => {
    const aggregateFailedTasksAndLoadRetryInfo = async () => {
      if (failedSubtasks.length === 0) {
        console.log(`⚪ 没有失败子任务，跳过聚合`);
        setAggregatedTasks([]);
        return;
      }

      console.log(`🔄 开始聚合 ${failedSubtasks.length} 个失败子任务...`);
      const groupMap = new Map<string, FailedSubtask[]>();
      
      // 按model_name + dimension_name分组
      failedSubtasks.forEach(subtask => {
        const key = `${subtask.model_name}::${subtask.dimension_name}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(subtask);
      });
      
      // 转换为聚合结构
      const aggregated: AggregatedFailedTask[] = Array.from(groupMap.entries()).map(([key, subtasks]) => ({
        key,
        model_name: subtasks[0].model_name || '',
        dimension_name: subtasks[0].dimension_name || '',
        failed_count: subtasks.length,
        can_retry_count: 0, // 将在加载重试信息后更新
        subtasks
      }));
      
      console.log(`📊 聚合完成：${failedSubtasks.length} 条失败记录 → ${aggregated.length} 个模型-维度组合`);
      
      // 🔧 立即开始加载重试信息
      await loadRetryInfoForAggregatedTasks(aggregated);
    };
    
    aggregateFailedTasksAndLoadRetryInfo();
  }, [failedSubtasks, taskId]);

  // 加载可用的评分器列表
  useEffect(() => {
    const loadEvaluators = async () => {
      try {
        const response = await fetch('/api/evaluators');
        if (response.ok) {
          const data = await response.json();
          setAvailableEvaluators(data.evaluators || []);
        }
      } catch (error) {
        console.error('加载评分器列表失败:', error);
      }
    };
    loadEvaluators();
  }, []);

  // 🔧 提取重试信息加载为独立函数
  const loadRetryInfoForAggregatedTasks = async (aggregated: AggregatedFailedTask[]) => {
    if (aggregated.length === 0) {
      console.log(`⚪ 没有聚合任务，跳过重试信息加载`);
      return;
    }
    
    console.log(`🔄 开始加载 ${aggregated.length} 个组的重试信息...`);
    setLoading(true);
    const retryInfoMap: Record<string, SubtaskRetryInfo> = {};
    const updatedTasks: AggregatedFailedTask[] = [];

    try {
      // 按顺序处理每个组，保持顺序一致性
      for (const group of aggregated) {
        const representativeSubtask = group.subtasks[0];
        try {
          const response = await fetch(
            `/api/tasks/${taskId}/retry-subtask?subtask_id=${representativeSubtask.id}`
          );
          if (response.ok) {
            const data = await response.json();
            retryInfoMap[group.key] = data.data;
            
            // 创建新的组对象并正确更新can_retry_count
            const updatedGroup = {
              ...group,
              can_retry_count: data.data.can_retry ? group.failed_count : 0
            };
            updatedTasks.push(updatedGroup);
          } else {
            // API失败时保持原组但can_retry_count为0
            updatedTasks.push({ ...group, can_retry_count: 0 });
          }
        } catch (error) {
          console.error(`加载组 ${group.key} 重试信息失败:`, error);
          // 异常时保持原组但can_retry_count为0
          updatedTasks.push({ ...group, can_retry_count: 0 });
        }
      }

      setRetryInfo(retryInfoMap);
      setAggregatedTasks(updatedTasks);
      console.log(`✅ 重试信息加载完成，共 ${updatedTasks.reduce((sum, t) => sum + t.can_retry_count, 0)} 个可重试子任务`);
    } finally {
      setLoading(false);
    }
  };

  // 🆕 处理基于预检查结果的组级别智能重试
  const handleRetryGroupWithOptions = async (options: {
    include_all_vendors_failed: boolean;
    reset_vendor_failure_history: boolean;
    use_fresh_start_strategy: boolean;
    exclude_subtask_ids?: string[];
    // 🆕 enable_thinking参数控制
    disable_enable_thinking?: boolean;
  }) => {
    console.log(`🚀 开始重试操作`, {
      selectedGroup: selectedGroupForRetry,
      totalGroups: aggregatedTasks.length,
      options
    });

    // 关闭预检查对话框
    setShowPreRetryDialog(false);

    if (selectedGroupForRetry) {
      // 单个组合重试
      console.log(`🎯 单个组合重试: ${selectedGroupForRetry}`);
      await handleRetryGroup(selectedGroupForRetry, options.disable_enable_thinking);
      setSelectedGroupForRetry(null);
    } else {
      // 全局重试所有失败的子任务 - 遍历所有可重试的组合
      console.log(`🌍 全局重试：处理所有 ${aggregatedTasks.length} 个组合`);

      const retryableGroups = aggregatedTasks.filter(group => {
        const info = retryInfo[group.key];
        return info?.can_retry && group.can_retry_count > 0;
      });

      console.log(`📊 可重试组合: ${retryableGroups.length}/${aggregatedTasks.length}`);

      if (retryableGroups.length === 0) {
        console.log(`⚪ 没有可重试的组合`);
        return;
      }

      // 并行处理所有可重试的组合
      const retryPromises = retryableGroups.map(group =>
        handleRetryGroup(group.key, options.disable_enable_thinking)
      );

      try {
        await Promise.all(retryPromises);
        console.log(`✅ 全局重试完成: 处理了 ${retryableGroups.length} 个组合`);
      } catch (error) {
        console.error(`❌ 全局重试过程中出现错误:`, error);
      }
    }
  };


  // 🆕 处理组级别的重试（重试组内所有失败的子任务）
  const handleRetryGroup = async (groupKey: string, disableEnableThinking?: boolean) => {
    const group = aggregatedTasks.find(g => g.key === groupKey);
    if (!group) return;

    const selectedEvaluator = selectedEvaluators[groupKey];
    const reason = retryReasons[groupKey] || '批量重试模型-维度组合';

    setRetryingSubtasks(prev => new Set([...prev, groupKey]));

    try {
      // 🔧 修复: 智能重试 - 只重试真正失败的子任务，保留成功结果
      console.log(`🎯 智能组合重试: ${group.model_name}-${group.dimension_name}`);
      console.log(`📊 该组状态: 总数${group.subtasks.length}, 失败${group.failed_count}`);
      
      // 只重试状态为失败的子任务，跳过成功的
      const failedOnlySubtasks = group.subtasks.filter(subtask => 
        subtask.status === 'failed' || subtask.status === 'error'
      );
      
      console.log(`✅ 智能过滤: 跳过${group.subtasks.length - failedOnlySubtasks.length}个成功任务，仅重试${failedOnlySubtasks.length}个失败任务`);
      
      if (failedOnlySubtasks.length === 0) {
        console.log(`⚪ 该组没有真正的失败任务，跳过重试`);
        return;
      }
      
      const retryPromises = failedOnlySubtasks.map(subtask => {
        const requestPayload = {
          subtask_id: subtask.id,
          ...(selectedEvaluator && { evaluator_id: selectedEvaluator }),
          reason: `智能重试: ${reason} (${group.model_name}-${group.dimension_name}, 仅失败部分)`,
          // 🆕 传递enable_thinking控制参数
          ...(disableEnableThinking !== undefined && { disable_enable_thinking: disableEnableThinking })
        };
        
        console.log(`🚀 发起重试请求: /api/tasks/${taskId}/retry-subtask`, requestPayload);
        
        return fetch(`/api/tasks/${taskId}/retry-subtask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestPayload),
        });
      });

      console.log(`📊 等待 ${retryPromises.length} 个重试请求完成...`);
      const results = await Promise.allSettled(retryPromises);
      console.log(`📊 重试请求完成，处理结果...`);
      
      // 收集详细的成功和失败信息
      let successCount = 0;
      let failureCount = 0;
      const failureDetails: Array<{ subtaskId: string; error: string }> = [];
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const subtask = failedOnlySubtasks[i]; // 🔧 修复: 使用正确的子任务数组
        
        console.log(`📊 处理结果 ${i+1}/${results.length}: 子任务 ${subtask.id}`, {
          status: result.status,
          success: result.status === 'fulfilled' && result.value.ok
        });
        
        if (result.status === 'fulfilled' && result.value.ok) {
          successCount++;
          console.log(`✅ 子任务 ${subtask.id} 重试请求成功`);
        } else {
          failureCount++;
          
          // 收集具体的错误信息
          let errorMessage = '未知错误';
          
          if (result.status === 'rejected') {
            errorMessage = result.reason?.message || '网络请求失败';
            console.error(`❌ 子任务 ${subtask.id} 网络请求失败:`, result.reason);
          } else if (result.status === 'fulfilled' && !result.value.ok) {
            try {
              const errorData = await result.value.json();
              errorMessage = errorData.error || errorData.message || `HTTP ${result.value.status}`;
              
              // 如果有详细的错误信息，提取更多信息
              if (errorData.details) {
                errorMessage += ` - ${errorData.details.user_action || errorData.details.system_advice || ''}`;
              }
              console.error(`❌ 子任务 ${subtask.id} API错误 (${result.value.status}):`, errorData);
            } catch (e) {
              errorMessage = `HTTP ${result.value.status} ${result.value.statusText}`;
            }
          }
          
          failureDetails.push({
            subtaskId: subtask.id,
            error: errorMessage
          });
        }
      }

      if (successCount > 0) {
        // 如果有部分成功，显示成功信息和失败详情
        const skippedCount = group.subtasks.length - failedOnlySubtasks.length;
        let message = `🎯 智能重试完成: 成功重试 ${successCount} 个失败任务`;
        
        if (skippedCount > 0) {
          message += `，智能跳过 ${skippedCount} 个成功任务`;
        }
        
        if (failureCount > 0) {
          message += `\n\n⚠️ 仍失败的 ${failureCount} 个子任务详情：`;
          failureDetails.forEach((detail, index) => {
            message += `\n${index + 1}. 子任务 ${detail.subtaskId}: ${detail.error}`;
          });
        }
        
        // 如果有失败，显示错误详情
        if (failureCount > 0) {
          setErrorDetails({
            isVisible: true,
            title: `部分重试失败 - ${successCount} 成功, ${failureCount} 失败`,
            details: failureDetails
          });
        }
        
        // 更新重试信息
        setRetryInfo(prev => ({
          ...prev,
          [groupKey]: {
            ...prev[groupKey],
            retry_count: (prev[groupKey]?.retry_count || 0) + 1,
            can_retry: (prev[groupKey]?.retry_count || 0) < 2
          }
        }));

        onRetryComplete?.();
      } else {
        // 所有重试都失败了，显示详细的失败信息
        setErrorDetails({
          isVisible: true,
          title: `批量重试失败 - 所有 ${group.failed_count} 个子任务都失败了`,
          details: failureDetails
        });
        
        return; // 不抛出异常，而是显示错误详情
      }

      // 清空选择的评分器和原因
      setSelectedEvaluators(prev => {
        const newState = { ...prev };
        delete newState[groupKey];
        return newState;
      });
      setRetryReasons(prev => {
        const newState = { ...prev };
        delete newState[groupKey];
        return newState;
      });

    } catch (error: any) {
      console.error('批量重试失败:', error);
      
      // 显示网络错误或其他意外错误
      setErrorDetails({
        isVisible: true,
        title: `批量重试发生意外错误`,
        details: [{
          subtaskId: 'SYSTEM',
          error: error instanceof Error ? error.message : '未知系统错误'
        }]
      });
    } finally {
      setRetryingSubtasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(groupKey);
        return newSet;
      });
    }
  };

  // 🆕 切换组展开/收起状态
  const toggleGroupExpanded = (groupKey: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-orange-500" />;
      case 'running':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };

  // 🆕 分页逻辑
  const totalPages = Math.ceil(aggregatedTasks.length / itemsPerPage);
  const paginatedGroups = aggregatedTasks.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // 🆕 计算可重试总数
  const totalCanRetry = aggregatedTasks.reduce((sum, group) => sum + group.can_retry_count, 0);

  if (failedSubtasks.length === 0) {
    return (
      <div className={`bg-green-50 border border-green-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-2">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <span className="text-green-700 font-medium">所有子任务都已成功完成</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg ${className}`}>
      <div className="p-4 border-b border-red-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-semibold text-red-700">
              失败子任务 ({failedSubtasks.length})
            </h3>
          </div>
          <div className="text-sm text-red-600">
            可重试 {loading ? (
              <span className="inline-flex items-center">
                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                加载中...
              </span>
            ) : (
              `${totalCanRetry} 个`
            )}
          </div>
        </div>
        {showBatchRetry && (
          <div className="flex items-center justify-between mt-2">
            <p className="text-sm text-red-600">
              按模型-维度聚合为 {aggregatedTasks.length} 个组合，以下子任务执行失败，您可以选择重试或更换评分器后重试
            </p>
            <div className="flex items-center gap-4">
            {/* 🔧 还原：重试所有失败的子任务按钮 */}
            {failedSubtasks.length > 0 && (
              <Button
                onClick={() => setShowPreRetryDialog(true)}
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                重试所有失败的子任务 ({failedSubtasks.length}个)
              </Button>
            )}
            {aggregatedTasks.length > itemsPerPage && (
              <div className="text-xs text-gray-500">
                显示第 {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, aggregatedTasks.length)} 个组合
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* 🆕 分页控制 */}
      {totalPages > 1 && (
        <div className="p-4 border-b border-red-200 flex items-center justify-center space-x-4">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            ← 上一页
          </button>
          
          <div className="flex space-x-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-2 py-1 text-sm rounded ${
                  currentPage === page
                    ? 'bg-red-600 text-white'
                    : 'text-red-600 hover:text-red-800 hover:bg-red-100'
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 text-sm text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            下一页 →
          </button>
        </div>
      )}

      <div className="divide-y divide-red-200">
        {paginatedGroups.map((group) => {
          const info = retryInfo[group.key];
          const isExpanded = expandedGroups.has(group.key);
          const isRetrying = retryingSubtasks.has(group.key);
          const selectedEvaluator = selectedEvaluators[group.key];

          return (
            <div key={group.key} className="p-4">
              {/* 🆕 组基本信息 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => toggleGroupExpanded(group.key)}
                    className="p-1 hover:bg-red-100 rounded"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-red-600" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-red-600" />
                    )}
                  </button>
                  <XCircle className="w-4 h-4 text-red-500" />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-900">
                        {group.model_name} - {group.dimension_name}
                      </span>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                        {group.failed_count} 个失败
                      </span>
                      {info && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                          {info.retry_count || 0}/{info.max_retries} 次重试
                        </span>
                      )}
                    </div>
                    {showBatchRetry && (
                      <div className="text-sm text-gray-600">
                        <span>可重试: {group.can_retry_count} 个</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 🆕 批量重试按钮 */}
                {info?.can_retry && group.can_retry_count > 0 && (
                  <Button
                    onClick={() => {
                      // 🆕 显示预检查对话框，并记录当前组合
                      setSelectedGroupForRetry(group.key);
                      setShowPreRetryDialog(true);
                    }}
                    disabled={isRetrying || loading}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isRetrying ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                        {showBatchRetry ? '智能重试中...' : '重试中...'}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-1" />
                        {showBatchRetry ?
                          `智能重试 (${group.failed_count}个失败)` :
                          `重试 (${group.failed_count}个)`
                        }
                      </>
                    )}
                  </Button>
                )}

                {(!info?.can_retry || group.can_retry_count === 0) && (
                  <span className="text-xs text-red-500 font-medium">
                    已达重试上限
                  </span>
                )}
              </div>

              {/* 🆕 展开的详细信息 - 显示组内具体失败记录 */}
              {isExpanded && (
                <div className="mt-4 pl-8 space-y-4">
                  {/* 🆕 该组失败记录列表 */}
                  <div className="bg-white border border-gray-200 rounded p-4">
                    <h5 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                      <Info className="w-4 h-4 mr-1" />
                      失败记录详情 ({group.failed_count} 条)
                    </h5>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {group.subtasks.slice(0, 10).map((subtask, index) => (
                        <div key={subtask.id} className="p-3 bg-gray-50 rounded border-l-4 border-red-400">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                                #{index + 1}
                              </span>
                              <span className="text-sm font-medium">ID: {subtask.id}</span>
                              {subtask.run_index && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                  第{subtask.run_index}次运行
                                </span>
                              )}
                            </div>
                            {subtask.score !== undefined && (
                              <span className="text-xs text-gray-600">分数: {subtask.score}</span>
                            )}
                          </div>
                          
                          {/* 错误信息 */}
                          {subtask.error_message && (
                            <div className="mt-2 text-xs text-red-600">
                              <span className="font-medium">错误: </span>
                              <span className="line-clamp-2">{subtask.error_message}</span>
                            </div>
                          )}

                          {/* 测试用例预览 */}
                          {subtask.test_case_input && (
                            <div className="mt-2 text-xs text-gray-600">
                              <span className="font-medium">测试用例: </span>
                              <span className="line-clamp-1">{subtask.test_case_input.slice(0, 100)}...</span>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {group.subtasks.length > 10 && (
                        <div className="text-center text-sm text-gray-500 py-2">
                          还有 {group.subtasks.length - 10} 条记录未显示...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 🆕 批量重试配置 */}
                  {info?.can_retry && group.can_retry_count > 0 && (
                    <div className="bg-white border border-gray-200 rounded p-4 space-y-4">
                      <h5 className="text-sm font-medium text-gray-700 flex items-center">
                        <Settings className="w-4 h-4 mr-1" />
                        智能重试配置
                      </h5>
                      {showBatchRetry ? (
                        <div className="text-xs text-blue-600 bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                          💡 智能重试将只重新执行失败的 {group.failed_count} 个子任务，自动跳过已成功的结果，并使用多提供商故障转移技术
                        </div>
                      ) : (
                        <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                          💡 重试该组合下的失败子任务
                        </div>
                      )}

                      {/* 评分器选择 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-2">
                          {showBatchRetry ?
                            `选择评分器 (可选，将应用于所有 ${group.can_retry_count} 个失败记录)` :
                            '选择评分器 (可选)'
                          }
                        </label>
                        <select
                          value={selectedEvaluator || ''}
                          onChange={(e) => setSelectedEvaluators(prev => ({
                            ...prev,
                            [group.key]: e.target.value
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        >
                          <option value="">使用原评分器 ({info.current_evaluator.name})</option>
                          {availableEvaluators
                            .filter(e => e.id !== info.current_evaluator.id)
                            .map(evaluator => (
                              <option key={evaluator.id} value={evaluator.id}>
                                {evaluator.name} ({evaluator.type})
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* 重试原因 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-2">
                          重试原因 (可选)
                        </label>
                        <input
                          type="text"
                          value={retryReasons[group.key] || ''}
                          onChange={(e) => setRetryReasons(prev => ({
                            ...prev,
                            [group.key]: e.target.value
                          }))}
                          placeholder={showBatchRetry ? "输入批量重试原因..." : "输入重试原因..."}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 🆕 错误详情显示区域 */}
      {errorDetails.isVisible && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" 
             onClick={() => setErrorDetails({ isVisible: false, title: '', details: [] })}>
          <div className="bg-white rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-y-auto m-4" 
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-red-700 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2" />
                {errorDetails.title}
              </h3>
              <button
                onClick={() => setErrorDetails({ isVisible: false, title: '', details: [] })}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                以下是每个子任务的具体错误信息：
              </p>
              
              {errorDetails.details.map((detail, index) => (
                <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <span className="inline-flex items-center justify-center w-6 h-6 bg-red-100 text-red-800 text-xs font-medium rounded-full">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 mb-1">
                        {detail.subtaskId === 'SYSTEM' ? '系统错误' : `子任务 ID: ${detail.subtaskId}`}
                      </div>
                      <div className="text-sm text-red-600 break-all">
                        {detail.error}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setErrorDetails({ isVisible: false, title: '', details: [] })}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  // 复制错误信息到剪贴板
                  const errorText = errorDetails.details
                    .map((detail, index) => `${index + 1}. ${detail.subtaskId}: ${detail.error}`)
                    .join('\n');
                  navigator.clipboard.writeText(`${errorDetails.title}\n\n${errorText}`);
                  alert('错误信息已复制到剪贴板');
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                复制错误信息
              </button>
            </div>
          </div>
        </div>
      )}


      {/* 🆕 预检查对话框 */}
      <PreRetryAnalysisDialog
        isOpen={showPreRetryDialog}
        onClose={() => {
          setShowPreRetryDialog(false);
          setSelectedGroupForRetry(null);
        }}
        taskId={taskId}
        selectedGroup={selectedGroupForRetry ? aggregatedTasks.find(g => g.key === selectedGroupForRetry) : null}
        onStartRetry={handleRetryGroupWithOptions}
      />
    </div>
  );
}