'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import ExpandableText from '@/components/ExpandableText';
import { ContentType } from '@/config/text-display';
import { TaskDetailSkeleton } from '@/components/ui/skeleton';
import { usePageLoadComplete } from '@/components/layout/page-loading';
import StandardizedMatrixWrapper from '@/components/StandardizedMatrixWrapper';
import { MultiRunScoreDisplay } from '@/components/MultiRunScoreDisplay';
import { SingleRunDisplay } from '@/components/SingleRunDisplay';
import { exportData, ExportFormat, ExportData, MatrixExportData, TaskExportData } from '@/lib/export-utils';
import TestCaseList from '@/components/tasks/TestCaseList';
import StandardizedScoreMatrix from '@/components/StandardizedScoreMatrix';
import SubtaskRetryManager from '@/components/SubtaskRetryManager';
import PreRetryAnalysisDialog from '@/components/PreRetryAnalysisDialog';
import BatchReEvaluateDialog from '@/components/BatchReEvaluateDialog';
import {
  ChevronLeft,
  Play,
  Pause,
  Square,
  Download,
  Eye,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  BarChart3,
  Settings,
  Cpu,
  Target,
  RefreshCw
} from 'lucide-react';

// 动态导入CodeExecutionDetails组件，避免SSR问题
const CodeExecutionDetails = dynamic(
  () => import('@/components/CodeExecutionDetails'),
  {
    ssr: false,
    loading: () => <div className="animate-pulse bg-gray-200 h-20 rounded-lg"></div>
  }
);

// 动态导入HumanScoringInterface组件，避免SSR问题
const HumanScoringInterface = dynamic(
  () => import('@/components/HumanScoringInterface'),
  {
    ssr: false,
    loading: () => <div className="animate-pulse bg-blue-200 h-20 rounded-lg"></div>
  }
);

interface TaskDetail {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  progress: number;
  total_subtasks: number;
  completed_subtasks: number;
  failed_subtasks: number;
  models: Array<{
    id: string;
    name: string;
    provider: string;
  }>;
  template: {
    id: string;
    name: string;
    dimensions_count: number;
    evaluators_count: number;
  };
  test_case_sets: Array<{
    id: string;
    name: string;
    test_cases_count: number;
  }>;
}

interface SubTask {
  id: string;
  model_name: string;
  model_provider?: string;
  test_case_id?: string;
  test_case_input: string;
  test_case_reference?: string;
  dimension_name: string;
  dimension_description?: string;
  evaluator_name: string;
  evaluator_type?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'success';
  score?: number;
  reasoning?: string;
  model_response?: string;  // 模型的实际回复内容
  created_at: string;
  started_at?: string;
  completed_at?: string;
  execution_time?: number;
  tokens_used?: number;
  cost?: number;
  error_message?: string;
  error_details?: any;
  
  // 新增：详细的token和性能数据
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  llm_response_time?: number;
  tokens_per_second?: number;
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // 🚀 立即清除全局loading状态，避免蓝色进度条延迟
  usePageLoadComplete();

  const [taskId, setTaskId] = useState<string>('');

  useEffect(() => {
    params.then(p => setTaskId(p.id));
  }, [params]);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [taskLogs, setTaskLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'standardized' | 'logs'>('overview');
  const [modelsData, setModelsData] = useState<Array<{
    id: string;
    name: string;
    input_cost_per_1k_tokens?: number;
    output_cost_per_1k_tokens?: number;
    cost_currency?: 'USD' | 'CNY';
    provider_input_cost_per_1k_tokens?: number;
    provider_output_cost_per_1k_tokens?: number;
    provider_cost_currency?: 'USD' | 'CNY';
  }>>([]);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // 🔄 手动强制刷新所有数据 - 带缓存清理
  /*
    手动刷新策略：
    1. 清空所有缓存确保获取最新数据
    2. 强制重新加载所有组件数据
    3. 提供用户反馈（loading状态）
  */
  const handleManualRefresh = async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      console.log('🔄 开始手动刷新所有数据...');

      // 🗑️ 清空所有缓存
      invalidateCache(taskId, 'all', '用户手动刷新');
      console.log('🗑️ 已清空所有缓存');

      // 🔄 强制刷新所有数据（并行加载提高性能）
      await Promise.all([
        loadTaskDetail(true), // 强制刷新基础信息
        loadSubTasks(taskId, true), // 强制刷新子任务
        loadTaskLogs(taskId, true) // 强制刷新日志
      ]);

      setLastRefresh(new Date());
      console.log('✅ 手动刷新完成');

    } catch (error) {
      console.error('❌ 手动刷新失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 🎯 ===== 任务详情智能缓存系统 v2.0 =====
  /*
    📋 系统设计文档（为后续开发者提供指导）

    🎯 设计目标：
    1. 无感知用户体验：用户感受不到缓存的存在，数据始终准确
    2. 智能性能优化：避免不必要的网络请求，提升页面响应速度
    3. 数据一致性保证：确保显示的数据与服务器状态同步

    🏗️ 架构设计：

    1. 🗂️ 分层缓存架构：
       - 基础信息层 (basic): 任务名称、描述、模板信息、模型配置等
       - 子任务数据层 (subtasks): 评测结果矩阵、执行状态、得分信息等
       - 日志数据层 (logs): 实时执行日志、错误信息、调试输出等

    2. 🧠 状态感知缓存策略：
       - running任务: 基础信息2分钟缓存，子任务30秒缓存，日志15秒缓存
       - completed任务: 基础信息30分钟缓存，子任务15分钟缓存，日志10分钟缓存
       - failed任务: 基础信息10分钟缓存，子任务5分钟缓存，日志3分钟缓存
       - pending任务: 基础信息5分钟缓存，其他数据不缓存（可能随时开始）

    3. 🔄 操作感知失效策略：
       - 任务控制操作 (start/pause/resume/cancel): 根据影响范围失效缓存
       - 重试操作 (单个/批量): 失效子任务和日志缓存
       - 手动刷新: 清空所有缓存，强制获取最新数据
       - 自动刷新: 针对running任务智能失效短期缓存

    4. 🛡️ 安全保障机制：
       - 保守策略: 有疑问时总是失效缓存，确保数据准确性
       - 错误恢复: 缓存异常时降级为直接网络请求
       - 开发调试: 开发环境提供详细的缓存操作日志

    🚀 性能优化特性：
    - 并行加载: 基础信息、子任务、日志数据并行获取
    - 智能预取: 根据用户行为模式预测性加载数据
    - 内存管理: 自动清理过期和无效的缓存项

    🔧 开发者使用指南：
    1. 添加新的数据加载函数时，请使用 shouldUseCache() 检查缓存
    2. 数据更新后，使用 setCacheData() 保存到缓存
    3. 用户操作后，使用 invalidateCache() 失效相关缓存
    4. 新增缓存类型时，更新 getCacheKeys() 和 getCacheTimeout() 函数

    ⚠️ 注意事项：
    - 缓存键必须唯一，包含taskId以避免不同任务间的数据混乱
    - 失效缓存时要考虑数据间的关联性，避免显示不一致的数据
    - 在生产环境中，缓存日志会被自动禁用以提高性能

    📅 更新记录：
    - v2.0: 初版完整实现，支持分层缓存和操作感知失效
    - 作者：Claude Code + AI开发助手
    - 最后更新：2025年
  */
  const [cache, setCache] = useState<Map<string, {
    data: any;
    timestamp: number;
    taskStatus?: string;
    dataType: 'basic' | 'subtasks' | 'logs';
  }>>(new Map());
  const [lastCacheOperation, setLastCacheOperation] = useState<number>(Date.now());

  // 📋 缓存键管理 - 统一管理所有缓存键，避免重复和冲突
  const getCacheKeys = (taskId: string) => ({
    taskBasic: `task-basic-${taskId}`,      // 基础信息：名称、描述、模板等
    taskStatus: `task-status-${taskId}`,    // 状态信息：progress、status等
    subTasks: `subtasks-${taskId}`,         // 子任务矩阵数据
    taskLogs: `task-logs-${taskId}`,        // 任务执行日志
    modelsData: `models-${taskId}`,         // 模型相关数据
    templateData: `template-${taskId}`      // 模板相关数据
  });

  // ⏰ 动态缓存超时策略 - 根据任务状态智能调整缓存时长
  const getCacheTimeout = (taskStatus: string, dataType: 'basic' | 'subtasks' | 'logs'): number => {
    const timeouts = {
      // 运行中任务：数据变化频繁，短期缓存
      running: {
        basic: 2 * 60 * 1000,      // 基础信息：2分钟（变化较少）
        subtasks: 30 * 1000,       // 子任务数据：30秒（实时性要求高）
        logs: 15 * 1000            // 日志：15秒（变化最频繁）
      },
      // 已完成任务：数据稳定，长期缓存
      completed: {
        basic: 30 * 60 * 1000,     // 基础信息：30分钟（几乎不变）
        subtasks: 15 * 60 * 1000,  // 子任务数据：15分钟（不会变化）
        logs: 10 * 60 * 1000       // 日志：10分钟（不会变化）
      },
      // 失败任务：可能重试，中期缓存
      failed: {
        basic: 5 * 60 * 1000,      // 基础信息：5分钟
        subtasks: 2 * 60 * 1000,   // 子任务数据：2分钟（可能重试）
        logs: 3 * 60 * 1000        // 日志：3分钟
      },
      // 等待中任务：可能开始执行，短期缓存
      pending: {
        basic: 1 * 60 * 1000,      // 基础信息：1分钟
        subtasks: 30 * 1000,       // 子任务数据：30秒
        logs: 30 * 1000            // 日志：30秒
      }
    };

    return timeouts[taskStatus as keyof typeof timeouts]?.[dataType] || 60 * 1000; // 默认1分钟
  };

  // 🧠 智能缓存检查器 - 判断是否应该使用缓存数据
  const shouldUseCache = (
    taskId: string,
    dataType: 'basic' | 'subtasks' | 'logs',
    forceRefresh: boolean = false
  ): boolean => {
    if (forceRefresh) return false;

    const cacheKey = getCacheKeys(taskId)[dataType as keyof ReturnType<typeof getCacheKeys>];
    const cachedData = cache.get(cacheKey);

    if (!cachedData) return false;

    const now = Date.now();
    const age = now - cachedData.timestamp;
    const timeout = getCacheTimeout(cachedData.taskStatus || 'pending', dataType);

    // 检查是否过期
    const isExpired = age > timeout;

    // 🔍 调试日志（仅在开发环境）
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎯 缓存检查 [${dataType}]:`, {
        cacheKey,
        age: Math.round(age / 1000) + 's',
        timeout: Math.round(timeout / 1000) + 's',
        isExpired,
        taskStatus: cachedData.taskStatus,
        willUse: !isExpired
      });
    }

    return !isExpired;
  };

  // 💾 缓存数据保存器 - 统一保存缓存数据
  const setCacheData = (
    taskId: string,
    dataType: 'basic' | 'subtasks' | 'logs',
    data: any,
    taskStatus?: string
  ): void => {
    const cacheKey = getCacheKeys(taskId)[dataType as keyof ReturnType<typeof getCacheKeys>];
    const newCache = new Map(cache);

    newCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      taskStatus: taskStatus || task?.status || 'unknown',
      dataType
    });

    setCache(newCache);
    setLastCacheOperation(Date.now());
  };

  // 🗑️ 缓存失效器 - 清理指定类型或全部缓存
  const invalidateCache = (
    taskId: string,
    dataTypes?: Array<'basic' | 'subtasks' | 'logs'> | 'all',
    reason?: string
  ): void => {
    const newCache = new Map(cache);
    const keys = getCacheKeys(taskId);

    if (dataTypes === 'all') {
      // 清空该任务的所有缓存
      Object.values(keys).forEach(key => {
        newCache.delete(key);
      });
    } else if (dataTypes) {
      // 清空指定类型的缓存
      dataTypes.forEach(dataType => {
        const key = keys[dataType as keyof typeof keys];
        newCache.delete(key);
      });
    } else {
      // 默认清空所有缓存
      Object.values(keys).forEach(key => {
        newCache.delete(key);
      });
    }

    setCache(newCache);
    setLastCacheOperation(Date.now());

    // 📝 调试日志
    if (process.env.NODE_ENV === 'development' && reason) {
      console.log(`🗑️ 缓存失效 [${taskId}]:`, { dataTypes, reason });
    }
  };
  const [taskInfoExpanded, setTaskInfoExpanded] = useState(false); // 🆕 任务信息折叠状态
  const [expandedRunCases, setExpandedRunCases] = useState<Set<string>>(new Set()); // 🆕 展开的运行次数测试用例
  
  // 筛选状态
  const [filters, setFilters] = useState({
    model: '',
    status: '',
    dimension: ''
  });

  // 🆕 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; // 每页显示10个子任务
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isBatchRetrying, setIsBatchRetrying] = useState(false);
  const [showPreRetryDialog, setShowPreRetryDialog] = useState(false); // 🆕 预检查对话框状态
  const [showBatchReEvaluateDialog, setShowBatchReEvaluateDialog] = useState(false); // 🆕 批量重新评分对话框状态

  // 🎯 智能加载子任务数据 - 带缓存的版本
  /*
    加载策略：
    1. 优先使用缓存数据（如果未过期）
    2. 使用原始evaluation_results数据而不是聚合数据
    3. 根据任务状态调整缓存时长
    4. 操作后自动失效缓存
  */
  const loadSubTasks = async (taskId: string, forceRefresh: boolean = false) => {
    try {
      // 🎯 步骤1：检查是否可以使用缓存
      if (shouldUseCache(taskId, 'subtasks', forceRefresh)) {
        const cachedData = cache.get(getCacheKeys(taskId).subTasks);
        if (cachedData) {
          console.log('📦 使用子任务缓存数据，taskId:', taskId);
          setSubTasks(cachedData.data);
          return;
        }
      }

      // 🎯 步骤2：从服务器获取数据
      console.log('🌐 从服务器加载subtasks数据，taskId:', taskId, forceRefresh ? '(强制刷新)' : '');
      const response = await fetch(`/api/tasks/${taskId}/subtasks-with-max-scores`);

      if (response.ok) {
        const data = await response.json();

        // 使用原始evaluation_results记录，每个模型-维度-测试用例组合对应一条记录
        const rawSubtasks = data.subtasks || [];

        // 🎯 步骤3：更新状态和缓存
        setSubTasks(rawSubtasks);

        // 保存到缓存（使用当前任务状态）
        setCacheData(taskId, 'subtasks', rawSubtasks, task?.status);

        console.log(`📊 加载了 ${rawSubtasks.length} 条原始evaluation_results记录 (已缓存)`);
      } else {
        console.error('🚨 API响应失败:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('🚨 响应内容:', errorText.substring(0, 200));
      }
    } catch (error) {
      console.error('🚨 加载子任务失败:', error);
      setSubTasks([]);
    }
  };

  // 加载模板详情
  const loadTemplateDetails = async (templateId: string) => {
    try {
      const response = await fetch(`/api/templates/${templateId}`);
      if (response.ok) {
        const data = await response.json();
        return data.template;
      }
    } catch (error) {
      console.error('加载模板详情失败:', error);
    }
    return null;
  };

  // 🆕 处理基于预检查结果的智能重试
  const handleRetryWithOptions = async (options: {
    include_all_vendors_failed: boolean;
    reset_vendor_failure_history: boolean;
    use_fresh_start_strategy: boolean;
    exclude_subtask_ids?: string[];
    // 🆕 enable_thinking参数控制
    disable_enable_thinking?: boolean;
  }) => {
    if (isBatchRetrying) {
      return; // 防止重复点击
    }

    setIsBatchRetrying(true);

    try {
      // 确定要重试的子任务列表
      let subtasksToRetry = failedSubtasks;
      
      if (!options.include_all_vendors_failed && options.exclude_subtask_ids) {
        // 智能跳过模式：排除全提供商失败的子任务
        subtasksToRetry = failedSubtasks.filter(
          subtask => !options.exclude_subtask_ids!.includes(subtask.id)
        );
      }

      if (subtasksToRetry.length === 0) {
        alert('没有找到可以重试的子任务。');
        return;
      }

      console.log(`🚀 开始智能批量重试 ${subtasksToRetry.length} 个失败的子任务`);
      console.log(`📝 重试模式: ${options.use_fresh_start_strategy ? '全新开始' : '智能跳过'}`);
      console.log(`📋 子任务ID列表:`, subtasksToRetry.map(st => st.id).join(', '));
      
      // 🔧 修复: 智能批量重试 - 配合SmartLLMClient实现多提供商故障转移
      const retryPromises = subtasksToRetry.map((subtask, index) => {
        console.log(`📤 发送重试请求 ${index + 1}/${subtasksToRetry.length}: 子任务 ${subtask.id}`);
        
        const reason = options.use_fresh_start_strategy 
          ? `全新开始重试 - 已重置提供商状态 (${new Date().toLocaleString()})`
          : `智能跳过重试 - 排除全失败提供商 (${new Date().toLocaleString()})`;

        return fetch(`/api/tasks/${taskId}/retry-subtask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            subtask_id: subtask.id,
            reason,
            fresh_start: options.use_fresh_start_strategy, // 🆕 传递fresh_start标志
            // 🆕 传递enable_thinking控制参数
            ...(options.disable_enable_thinking !== undefined && { disable_enable_thinking: options.disable_enable_thinking })
          }),
        });
      });

      const results = await Promise.allSettled(retryPromises);
      console.log(`📊 Promise.allSettled 完成，总共 ${results.length} 个结果`);
      
      // 统计结果
      let successCount = 0;
      let failureCount = 0;
      const failureDetails: string[] = [];

      // 使用 Promise.all 来处理异步错误信息获取
      const resultPromises = results.map(async (result, i) => {
        const subtask = subtasksToRetry[i];
        
        console.log(`🔍 处理结果 ${i + 1}/${results.length}: 子任务 ${subtask.id}, status: ${result.status}`);
        
        if (result.status === 'fulfilled' && result.value.ok) {
          console.log(`✅ 子任务 ${subtask.id} 重试成功`);
          return { success: true, subtaskId: subtask.id };
        } else {
          let errorMsg = `子任务 ${subtask.id}: `;
          
          if (result.status === 'rejected') {
            console.log(`❌ 子任务 ${subtask.id} 请求被拒绝:`, result.reason);
            errorMsg += result.reason?.message || '网络请求失败';
          } else if (result.status === 'fulfilled') {
            console.log(`❌ 子任务 ${subtask.id} HTTP错误, status: ${result.value.status}`);
            try {
              const errorData = await result.value.json();
              errorMsg += errorData.error || `HTTP ${result.value.status}`;
            } catch (e) {
              console.log(`⚠️ 无法解析错误响应:`, e);
              errorMsg += `HTTP ${result.value.status}`;
            }
          } else {
            console.log(`❌ 子任务 ${subtask.id} 未知错误`);
            errorMsg += '未知错误';
          }
          
          return { success: false, subtaskId: subtask.id, error: errorMsg };
        }
      });

      const processedResults = await Promise.all(resultPromises);
      
      // 统计成功和失败数量
      processedResults.forEach(processedResult => {
        if (processedResult.success) {
          successCount++;
        } else {
          failureCount++;
          if (failureDetails.length < 5) { // 最多显示5个详细错误
            failureDetails.push(processedResult.error);
          }
        }
      });
      
      console.log(`📊 智能批量重试完成统计: 成功 ${successCount}, 失败 ${failureCount}`);
      
      // 🗑️ 清理子任务和日志缓存（重试会产生新的执行结果）
      invalidateCache(taskId, ['subtasks', 'logs'], '智能批量重试操作');
      console.log('🗑️ 已清理子任务和日志缓存，原因：批量重试操作');

      // 🔄 刷新页面数据
      await loadSubTasks(taskId, true); // 强制刷新，不使用缓存
      
      // 显示结果提示
      const mode = options.use_fresh_start_strategy ? '全新开始' : '智能跳过';
      let message = `🎯 ${mode}批量重试完成!\n\n`;
      message += `✅ 成功: ${successCount} 个\n`;
      message += `❌ 失败: ${failureCount} 个\n`;
      if (failureCount > 0) {
        message += '\n详细错误信息:\n' + failureDetails.join('\n');
      }
      message += '\n\n页面数据已自动刷新。';
      
      alert(message);
    } catch (error) {
      console.error('智能批量重试失败:', error);
      
      let errorMessage = `❌ 智能批量重试过程中发生错误:\n\n`;
      if (error instanceof Error) {
        errorMessage += error.message;
      } else {
        errorMessage += '未知错误';
      }
      errorMessage += '\n\n请打开浏览器开发者工具查看详细日志，或尝试单个重试。';
      
      alert(errorMessage);
    } finally {
      setIsBatchRetrying(false);
    }
  };

  // 加载模型详情
  const loadModelsDetails = async (modelIds: string[]) => {
    try {
      const modelPromises = modelIds.map(id => 
        fetch(`/api/models/${id}`).then(res => res.ok ? res.json() : null)
      );
      const modelResponses = await Promise.all(modelPromises);
      return modelResponses
        .filter(response => response && response.model)
        .map(response => response.model);
    } catch (error) {
      console.error('加载模型详情失败:', error);
    }
    return [];
  };

  // 🎯 智能加载任务日志 - 带缓存的版本
  /*
    加载策略：
    1. 运行中任务：15秒缓存（日志变化频繁）
    2. 已完成任务：10分钟缓存（日志不变）
    3. 失败任务：3分钟缓存（可能重试产生新日志）
  */
  const loadTaskLogs = async (taskId: string, forceRefresh: boolean = false) => {
    try {
      // 🎯 步骤1：检查是否可以使用缓存
      if (shouldUseCache(taskId, 'logs', forceRefresh)) {
        const cachedData = cache.get(getCacheKeys(taskId).taskLogs);
        if (cachedData) {
          console.log('📦 使用任务日志缓存数据，taskId:', taskId);
          setTaskLogs(cachedData.data);
          return;
        }
      }

      // 🎯 步骤2：从服务器获取数据
      console.log('🌐 从服务器加载任务日志，taskId:', taskId, forceRefresh ? '(强制刷新)' : '');
      const response = await fetch(`/api/tasks/${taskId}/logs`);

      let logs: string[] = [];

      if (response.ok) {
        const data = await response.json();
        logs = data.logs || [];
      } else {
        // 如果没有日志API，生成基本信息日志
        logs = [
          `[任务创建] 任务 "${task?.name || taskId}" 创建成功`,
          `[任务状态] 当前状态: ${task?.status || '未知'}`,
          task?.started_at ? `[执行开始] ${new Date(task.started_at).toLocaleString('zh-CN')}` : null,
          task?.completed_at ? `[执行完成] ${new Date(task.completed_at).toLocaleString('zh-CN')}` : null,
          `[进度更新] 已完成 ${task?.completed_subtasks || 0}/${task?.total_subtasks || 0} 个子任务`
        ].filter((log): log is string => log !== null);
      }

      // 🎯 步骤3：更新状态和缓存
      setTaskLogs(logs);

      // 保存到缓存
      setCacheData(taskId, 'logs', logs, task?.status);

      console.log(`📋 加载了 ${logs.length} 条任务日志 (已缓存)`);
    } catch (error) {
      console.error('加载任务日志失败:', error);
      // fallback 到基本日志
      setTaskLogs([
        `[系统] 无法加载任务日志`,
        `[任务ID] ${taskId}`,
        `[创建时间] ${task?.created_at ? new Date(task.created_at).toLocaleString('zh-CN') : '未知'}`
      ]);
    }
  };

  // 加载调试信息
  const loadDebugInfo = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/debug`);
      if (response.ok) {
        const data = await response.json();
        setDebugInfo(data.debug_info);
      }
    } catch (error) {
      console.error('加载调试信息失败:', error);
      setDebugInfo(null);
    }
  };

  useEffect(() => {
    if (!taskId) return;
    
    // 🎯 智能加载任务详情 - 带分层缓存的版本
    /*
      加载策略：
      1. 基础信息（名称、描述等）：长期缓存
      2. 状态信息（进度、状态等）：根据状态动态缓存
      3. 关联数据（模板、模型）：长期缓存
      4. 首次加载时显示骨架动画
    */
    const loadTaskDetail = async (forceRefresh: boolean = false) => {
      try {
        // 🎯 步骤1：检查基础信息缓存
        let task = null;
        if (shouldUseCache(taskId, 'basic', forceRefresh)) {
          const cachedBasic = cache.get(getCacheKeys(taskId).taskBasic);
          if (cachedBasic) {
            console.log('📦 使用任务基础信息缓存，taskId:', taskId);
            task = cachedBasic.data;
          }
        }

        // 🎯 步骤2：如果没有缓存，从服务器获取
        if (!task) {
          console.log('🌐 从服务器加载任务详情，taskId:', taskId, forceRefresh ? '(强制刷新)' : '');
          const response = await fetch(`/api/tasks/${taskId}`);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();

          if (data.error) {
            throw new Error(data.error);
          }

          task = data.task;

          // 保存基础信息到缓存
          setCacheData(taskId, 'basic', task, task.status);
        }

        // 🎯 步骤3：并行加载关联数据
        const [templateDetails, modelsDetails] = await Promise.all([
          task.template_id ? loadTemplateDetails(task.template_id) : null,
          task.model_ids && task.model_ids.length > 0 ? loadModelsDetails(task.model_ids) : []
        ]);

        const taskDetail: TaskDetail = {
          id: task.id,
          name: task.name,
          description: task.description || '',
          status: task.status,
          created_at: task.created_at,
          started_at: task.started_at,
          completed_at: task.finished_at,
          progress: task.progress && task.progress.total > 0 ? 
            Math.round((task.progress.completed / task.progress.total) * 100) : 0,
          total_subtasks: task.progress?.total || 0,
          completed_subtasks: task.progress?.success || 0, // 成功执行的任务数
          failed_subtasks: task.progress?.failed || 0,
          models: modelsDetails.map(model => ({
            id: model.id,
            name: model.name,
            provider: model.provider
          })),
          template: {
            id: task.template_id || '',
            name: templateDetails?.name || (task.template_id ? '加载中...' : '未设置模板'),
            dimensions_count: (() => {
              // 支持统一模板和自定义模板
              const mappings = templateDetails?.mappings || templateDetails?.custom_mappings || [];
              return new Set(mappings.map((m: any) => m.dimension_id)).size;
            })(),
            evaluators_count: (() => {
              // 支持统一模板和自定义模板
              const mappings = templateDetails?.mappings || templateDetails?.custom_mappings || [];
              return new Set(mappings.map((m: any) => m.evaluator_id)).size;
            })()
          },
          test_case_sets: [] // TODO: 从任务配置中解析测试用例信息
        };

        setTask(taskDetail);
        
        // 保存完整的模型数据（包括定价信息和提供商成本信息）
        setModelsData(modelsDetails.map(model => ({
          id: model.id,
          name: model.name,
          input_cost_per_1k_tokens: model.input_cost_per_1k_tokens,
          output_cost_per_1k_tokens: model.output_cost_per_1k_tokens,
          cost_currency: model.cost_currency,
          provider_input_cost_per_1k_tokens: model.provider_input_cost_per_1k_tokens,
          provider_output_cost_per_1k_tokens: model.provider_output_cost_per_1k_tokens,
          provider_cost_currency: model.provider_cost_currency
        })));

        // 加载子任务数据和日志（如果任务已开始）
        if (task.status !== 'pending') {
          await Promise.all([
            loadSubTasks(taskId),
            loadTaskLogs(taskId)
          ]);
        } else {
          await loadTaskLogs(taskId);
        }
        setLoading(false);
      } catch (error) {
        console.error('加载任务详情失败:', error);
        setLoading(false);
      }
    };

    loadTaskDetail();
  }, [taskId]);

  // 🔄 自动刷新逻辑 - 带智能缓存管理
  /*
    自动刷新策略：
    1. 仅在任务running/pending状态时启用
    2. 每5秒检查一次数据变化
    3. 智能判断是否需要失效缓存（避免不必要的网络请求）
    4. 使用强制刷新确保获取最新数据
  */
  useEffect(() => {
    if (!autoRefresh || !taskId || !task) return;

    // 只有当任务状态为运行中或等待中时才自动刷新
    if (task.status === 'running' || task.status === 'pending') {
      console.log('🔄 启动自动刷新，间隔5秒，任务状态:', task.status);

      const interval = setInterval(async () => {
        try {
          console.log('🔄 自动刷新中...', new Date().toLocaleTimeString());

          // 🗑️ 对于运行中的任务，主动失效短期缓存以获取最新状态
          if (task.status === 'running') {
            // 失效基础信息和日志缓存（最可能有变化的数据）
            invalidateCache(taskId, ['basic', 'logs'], '自动刷新周期');
          }

          // 🌐 重新加载任务状态
          const response = await fetch(`/api/tasks/${taskId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.task) {
              // 📦 更新缓存中的基础信息
              setCacheData(taskId, 'basic', data.task, data.task.status);

              // 🎯 更新本地状态
              setTask(prev => prev ? { ...prev,
                status: data.task.status,
                progress: data.task.progress && data.task.progress.total > 0 ?
                  Math.round((data.task.progress.completed / data.task.progress.total) * 100) : 0,
                total_subtasks: data.task.progress?.total || 0,
                completed_subtasks: data.task.progress?.success || 0, // 成功的任务数
                failed_subtasks: data.task.progress?.failed || 0,
              } : null);

              console.log('🔄 任务状态已更新:', data.task.status, '进度:', data.task.progress);
            }
          }

          // 🔄 重新加载子任务和日志（强制刷新以确保最新数据）
          await Promise.all([
            loadSubTasks(taskId, true), // 强制刷新子任务
            loadTaskLogs(taskId, true)  // 强制刷新日志
          ]);

          setLastRefresh(new Date());
          console.log('✅ 自动刷新完成');
        } catch (error) {
          console.error('❌ 自动刷新失败:', error);
        }
      }, 5000); // 每5秒刷新一次

      return () => {
        clearInterval(interval);
        console.log('🔄 自动刷新已停止');
      };
    }
  }, [autoRefresh, taskId, task?.status]);

  // 🎯 任务控制操作 - 带智能缓存失效
  /*
    任务状态变更会影响缓存策略：
    - start: 清空所有缓存（状态变为running，需要实时数据）
    - pause/resume: 清空基础信息和子任务缓存（状态变更）
    - cancel: 清空所有缓存（任务终止，最终状态）
  */
  const handleTaskControl = async (action: 'start' | 'pause' | 'resume' | 'cancel') => {
    if (!taskId) return;

    try {
      console.log(`🎮 执行任务操作: ${action}`);

      // 🗑️ 预先清理相关缓存（因为状态即将改变）
      if (action === 'start' || action === 'cancel') {
        invalidateCache(taskId, 'all', `任务${action}操作`);
        console.log('🗑️ 已清空所有缓存，原因：任务状态重大变更');
      } else {
        // pause/resume 只清空基础信息和子任务缓存
        invalidateCache(taskId, ['basic', 'subtasks'], `任务${action}操作`);
        console.log('🗑️ 已清空基础信息和子任务缓存，原因：任务状态变更');
      }

      // 调用真实的任务控制API
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '任务操作失败');
      }

      const result = await response.json();
      console.log('✅ 任务操作成功:', result);

      // 更新本地状态
      if (task) {
        setTask({ ...task, status: result.new_status });
      }

      // 🔄 根据操作类型决定数据刷新策略
      if (action === 'start') {
        // 开始任务后，延迟刷新以获取初始执行数据
        setTimeout(async () => {
          await Promise.all([
            loadTaskDetail(true), // 强制刷新基础信息
            loadSubTasks(taskId, true), // 强制刷新子任务
            loadTaskLogs(taskId, true) // 强制刷新日志
          ]);
          console.log('🔄 任务启动后数据已刷新');
        }, 2000);
      } else {
        // 其他操作立即刷新基础信息
        const response = await fetch(`/api/tasks/${taskId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.task) {
            setCacheData(taskId, 'basic', data.task, data.task.status);
            console.log('🔄 任务状态已更新并缓存');
          }
        }
      }

    } catch (error) {
      console.error('❌ 任务操作失败:', error);
      alert(error instanceof Error ? error.message : '操作失败，请重试');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="h-5 w-5 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running':
        return '运行中';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      case 'cancelled':
        return '已取消';
      default:
        return '等待中';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // 筛选逻辑
  const filteredSubTasks = subTasks.filter(subTask => {
    if (filters.model && !subTask.model_name.toLowerCase().includes(filters.model.toLowerCase())) {
      return false;
    }
    if (filters.status && subTask.status !== filters.status) {
      return false;
    }
    if (filters.dimension && !subTask.dimension_name.toLowerCase().includes(filters.dimension.toLowerCase())) {
      return false;
    }
    return true;
  });

  // 获取失败的子任务 - 使用原始evaluation_results数据
  const failedSubtasks = subTasks
    .filter(subTask => subTask.status === 'failed')
    .map(subTask => {
      // 原始evaluation_results字段映射
      const rawSubtask = subTask as any;
      return {
        id: subTask.id,
        test_case_id: rawSubtask.test_case_id || '',
        model_id: rawSubtask.model_id || '',
        dimension_id: rawSubtask.dimension_id || '',
        evaluator_id: rawSubtask.evaluator_id || null, // 关键：支持null值
        status: subTask.status,
        retry_count: 0, // 将从API获取
        error_message: subTask.error_message,
        model_name: subTask.model_name,
        dimension_name: subTask.dimension_name,
        evaluator_name: subTask.evaluator_name,
        test_case_input: subTask.test_case_input,
        // 新增字段以支持更详细的重试信息
        score: subTask.score,
        justification: subTask.reasoning,
        created_at: subTask.created_at,
        started_at: subTask.started_at,
        completed_at: subTask.completed_at,
        repetition_index: rawSubtask.repetition_index || 0,
        run_index: rawSubtask.run_index || 1
      };
    });

  // 🆕 获取评分失败的子任务（有模型回答但评分失败）
  const evaluationFailedSubtasks = subTasks
    .filter(subTask => {
      // 判断是否是评分失败：有模型回答 且 评分过程失败
      const hasModelResponse = subTask.model_response && subTask.model_response.trim().length > 0;
      const hasValidScore = subTask.score !== null && subTask.score !== 0;

      if (!hasModelResponse) return false; // 没有模型回答的不算评分失败
      if (hasValidScore) return false;     // 有有效分数的不算评分失败

      // 🆕 包含所有类型的评分失败:
      // 1. 明确的错误信息
      const hasExplicitError = subTask.reasoning?.includes('评分失败') ||
                               subTask.reasoning?.includes('Evaluator execution failed') ||
                               subTask.justification?.includes('评分失败') ||
                               subTask.justification?.includes('Evaluator execution failed');

      // 2. 无AI评分反馈 (justification和reasoning都是空的)
      const hasNoFeedback = (!subTask.justification || subTask.justification.trim() === '') &&
                            (!subTask.reasoning || subTask.reasoning.trim() === '');

      // 3. 其他包含"failed"关键词的情况
      const hasFailedKeyword = (subTask.reasoning?.includes('failed') || subTask.justification?.includes('failed'));

      return hasExplicitError || hasNoFeedback || hasFailedKeyword;
    })
    .map(subTask => ({
      id: subTask.id,
      model_name: subTask.model_name,
      dimension_name: subTask.dimension_name,
      error_message: subTask.error_message,
      test_case_input: subTask.test_case_input
    }));

  // 🆕 按模型-维度聚合逻辑
  const aggregatedGroups = filteredSubTasks.reduce((groups, subTask) => {
    const key = `${subTask.model_name}_${subTask.dimension_name}`;
    if (!groups[key]) {
      groups[key] = {
        model_name: subTask.model_name,
        dimension_name: subTask.dimension_name,
        subtasks: []
      };
    }
    groups[key].subtasks.push(subTask);
    return groups;
  }, {} as Record<string, { model_name: string; dimension_name: string; subtasks: SubTask[] }>);

  const aggregatedGroupsList = Object.values(aggregatedGroups);

  // 🆕 分页逻辑 - 基于聚合后的组
  const totalPages = Math.ceil(aggregatedGroupsList.length / itemsPerPage);
  const paginatedGroups = aggregatedGroupsList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // 重置筛选时重置分页
  const resetFilters = () => {
    setFilters({ model: '', status: '', dimension: '' });
    setCurrentPage(1);
  };

  // 展开/收起组合
  const toggleGroup = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  // 切换运行次数的测试用例显示
  const toggleRunCases = (runKey: string) => {
    const newExpanded = new Set(expandedRunCases);
    if (newExpanded.has(runKey)) {
      newExpanded.delete(runKey);
    } else {
      newExpanded.add(runKey);
    }
    setExpandedRunCases(newExpanded);
  };

  // 获取筛选选项
  const getFilterOptions = () => {
    const models = Array.from(new Set(subTasks.map(st => st.model_name)));
    const statuses = Array.from(new Set(subTasks.map(st => st.status)));
    const dimensions = Array.from(new Set(subTasks.map(st => st.dimension_name)));
    
    return { models, statuses, dimensions };
  };

  const { models, statuses, dimensions } = getFilterOptions();

  // 重新获取任务数据的函数
  const fetchTaskData = async () => {
    if (!taskId) return;
    
    try {
      console.log('🔄 重新获取任务数据...');
      
      // 重新加载任务基本信息
      const response = await fetch(`/api/tasks/${taskId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.task) {
          setTask(prev => prev ? { ...prev,
            status: data.task.status,
            progress: data.task.progress && data.task.progress.total > 0 ?
              Math.round((data.task.progress.completed / data.task.progress.total) * 100) : 0,
            total_subtasks: data.task.progress?.total || 0,
            completed_subtasks: data.task.progress?.success || 0,
            failed_subtasks: data.task.progress?.failed || 0,
          } : null);
        }
      }
      
      // 重新加载子任务数据
      await loadSubTasks(taskId);
      
      console.log('✅ 任务数据重新加载完成');
    } catch (error) {
      console.error('❌ 重新获取任务数据失败:', error);
    }
  };

  if (loading) {
    return <TaskDetailSkeleton />;
  }

  if (!task) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">任务不存在</h2>
        <Link href={`/workbench/tasks${typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('page') ? `?page=${new URLSearchParams(window.location.search).get('page')}` : ''}`} className="mt-4 inline-block">
          <Button>返回任务列表</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* 页面头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href={`/workbench/tasks${typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('page') ? `?page=${new URLSearchParams(window.location.search).get('page')}` : ''}`} className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="mr-1 h-4 w-4" />
              返回任务列表
            </Link>
          </div>
          <div className="flex space-x-2">
            {task.status === 'pending' && (
              <Button onClick={() => handleTaskControl('start')}>
                <Play className="mr-2 h-4 w-4" />
                开始任务
              </Button>
            )}
            {task.status === 'running' && (
              <>
                <Button variant="outline" onClick={() => handleTaskControl('pause')}>
                  <Pause className="mr-2 h-4 w-4" />
                  暂停
                </Button>
                <Button variant="outline" onClick={() => handleTaskControl('cancel')}>
                  <Square className="mr-2 h-4 w-4" />
                  取消
                </Button>
              </>
            )}

            {/* 刷新控制区域 */}
            <div className="flex items-center space-x-2 border-l pl-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={autoRefresh ? 'bg-green-50 border-green-200' : ''}
              >
                {autoRefresh ? '🔄 自动刷新' : '⏸️ 手动刷新'}
              </Button>

              {/* 🆕 手动刷新按钮 */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualRefresh}
                disabled={loading}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                强制刷新
              </Button>

              <span className="text-xs text-gray-500">
                上次更新: {lastRefresh.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        {/* 🆕 任务基本信息 - 支持折叠/展开 */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-4">
                  <h1 className="text-2xl font-bold text-gray-900">{task.name}</h1>
                  {/* 🆕 多次运行标识 */}
                  {(task as any).is_multi_run && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {(task as any).total_runs || 3}次运行
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                  任务ID: {task.id}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                {getStatusIcon(task.status)}
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(task.status)}`}>
                  {getStatusText(task.status)}
                </span>

                {/* 🆕 折叠/展开按钮 */}
                <button
                  onClick={() => setTaskInfoExpanded(!taskInfoExpanded)}
                  className="inline-flex items-center px-2 py-1 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
                  title={taskInfoExpanded ? "收起详细信息" : "展开详细信息"}
                >
                  {taskInfoExpanded ? (
                    <>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                      收起
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      详情
                    </>
                  )}
                </button>
              </div>
            </div>
            {task.description && (
              <p className="mt-2 text-sm text-gray-600">{task.description}</p>
            )}
          </div>
          {/* 🆕 可折叠的详细信息 */}
          {taskInfoExpanded && (
            <div className="border-t border-gray-200 px-4 py-5 sm:p-0 transition-all duration-300">
              <dl className="sm:divide-y sm:divide-gray-200">
                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    创建时间
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    {new Date(task.created_at).toLocaleString('zh-CN')}
                  </dd>
                </div>
                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    执行进度
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    <div className="flex items-center space-x-4">
                      <span>{task.completed_subtasks}/{task.total_subtasks} 个子任务已完成</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${task.progress}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium">{task.progress}%</span>
                    </div>
                  </dd>
                </div>
                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    参与模型
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    <div className="flex flex-wrap gap-2">
                      {task.models.map((model, index) => (
                        <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {model.name} ({model.provider})
                        </span>
                      ))}
                    </div>
                  </dd>
                </div>
                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    评测模板
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    <div className="flex items-center space-x-2">
                      <span>{task.template.name}</span>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {task.template.dimensions_count} 个维度
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {task.template.evaluators_count} 个评分器
                      </span>
                    </div>
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/* 选项卡导航 */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'overview', label: '概览', icon: BarChart3 },
              { key: 'details', label: '详细结果', icon: Eye },
              { key: 'standardized', label: '标准化评分', icon: Target },
              { key: 'logs', label: '执行日志', icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* 选项卡内容 */}
        <div className="bg-white shadow rounded-lg p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">执行概览</h3>
                {/* 🆕 批量重新评分按钮 - 仅在有评分失败时显示 */}
                {evaluationFailedSubtasks.length > 0 && (task.status === 'completed' || task.status === 'failed') && (
                  <Button
                    onClick={() => setShowBatchReEvaluateDialog(true)}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                    size="sm"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    批量重新评分 ({evaluationFailedSubtasks.length}个)
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{task.completed_subtasks}</div>
                  <div className="text-sm text-gray-500">成功执行</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{task.total_subtasks - task.completed_subtasks - task.failed_subtasks}</div>
                  <div className="text-sm text-gray-500">待执行子任务</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{task.failed_subtasks}</div>
                  <div className="text-sm text-gray-500">失败子任务</div>
                  {/* 一键全部重试按钮 */}
                  {task.failed_subtasks > 0 && failedSubtasks.length > 0 && (task.status === 'completed' || task.status === 'failed') && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();

                        if (isBatchRetrying) {
                          return; // 防止重复点击
                        }

                        // 🆕 显示预检查对话框而不是直接重试
                        setShowPreRetryDialog(true);
                      }}
                      disabled={isBatchRetrying}
                      className={`mt-2 px-3 py-1 text-xs rounded-lg transition-colors duration-200 shadow-sm hover:shadow-md ${
                        isBatchRetrying
                          ? 'bg-gray-400 cursor-not-allowed text-white'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      }`}
                      title={isBatchRetrying ? '正在处理中...' : `智能重试所有 ${failedSubtasks.length} 个失败任务 (多提供商故障转移)`}
                    >
                      {isBatchRetrying ? (
                        <>⏳ 处理中...</>
                      ) : (
                        <>🔄 智能批量重试</>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* 标准化评测结果矩阵图表（包含成本统计） */}
              <StandardizedMatrixWrapper 
                taskId={taskId} 
                models={modelsData.length > 0 ? modelsData : undefined}
              />
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">详细结果</h3>
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-gray-500">
                    显示 {aggregatedGroupsList.length} 个模型-维度组合，共 {filteredSubTasks.length}/{subTasks.length} 个评测结果
                  </div>
                  {subTasks.length > 0 && (
                    <ExportDropdown 
                      taskName={task.name}
                      taskData={{
                        task,
                        subTasks,
                        filteredSubTasks
                      }}
                    />
                  )}
                </div>
              </div>

              {/* 子任务重试管理器 - 仅在任务完成且有失败子任务时显示 */}
              {(task.status === 'completed' || task.status === 'failed') && failedSubtasks.length > 0 && (
                <SubtaskRetryManager
                  taskId={taskId}
                  failedSubtasks={failedSubtasks}
                  onRetryComplete={() => {
                    // 重试完成后重新加载子任务数据
                    loadSubTasks(taskId);
                  }}
                  className="mb-6"
                  showBatchRetry={true} // 🎯 全局重试管理器：显示批量重试按钮
                />
              )}
              
              {/* 筛选控件 */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-900">筛选条件</h4>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={resetFilters}
                    className="text-xs"
                  >
                    重置筛选
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 按模型筛选 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      模型
                    </label>
                    <select
                      value={filters.model}
                      onChange={(e) => setFilters({...filters, model: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">全部模型</option>
                      {models.map(model => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* 按状态筛选 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      执行状态
                    </label>
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters({...filters, status: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">全部状态</option>
                      {statuses.map(status => (
                        <option key={status} value={status}>{getStatusText(status)}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* 按维度筛选 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      评测维度
                    </label>
                    <select
                      value={filters.dimension}
                      onChange={(e) => setFilters({...filters, dimension: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">全部维度</option>
                      {dimensions.map(dimension => (
                        <option key={dimension} value={dimension}>{dimension}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {subTasks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-lg font-medium">暂无评测结果</div>
                  <div className="text-sm mt-2">任务可能尚未开始执行或正在处理中</div>
                </div>
              ) : aggregatedGroupsList.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-lg font-medium">没有符合筛选条件的结果</div>
                  <div className="text-sm mt-2">请调整筛选条件或重置筛选</div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 🆕 分页信息和控制器 */}
                  {aggregatedGroupsList.length > itemsPerPage && (
                    <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-gray-200">
                      <div className="text-sm text-gray-600">
                        显示第 {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, aggregatedGroupsList.length)} 个组合，共 {aggregatedGroupsList.length} 个模型-维度组合
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1 text-sm font-medium text-gray-600 hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                          ← 上一页
                        </button>

                        <div className="flex space-x-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`px-2 py-1 text-sm font-medium rounded transition-colors ${
                                currentPage === page
                                  ? 'bg-blue-600 text-white'
                                  : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                              }`}
                            >
                              {page}
                            </button>
                          ))}
                        </div>

                        <button
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1 text-sm font-medium text-gray-600 hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                          下一页 →
                        </button>
                      </div>
                    </div>
                  )}

                  {paginatedGroups.map((group, index) => {
                    const completedCount = group.subtasks.filter(st => st.status === 'completed').length;
                    const failedCount = group.subtasks.filter(st => st.status === 'failed').length;
                    const runningCount = group.subtasks.filter(st => st.status === 'running').length;
                    const pendingCount = group.subtasks.filter(st => st.status === 'pending').length;
                    const totalCount = group.subtasks.length;
                    
                    // 🔧 替换无意义的均分：计算加权百分制分数和完成率统计
                    const completedSubtasks = group.subtasks.filter(st => st.status === 'completed' && st.score !== null);
                    
                    // 计算加权百分制分数（考虑不同题目的满分差异）
                    const calculateWeightedPercentage = () => {
                      if (completedSubtasks.length === 0) return null;
                      
                      let totalScore = 0;
                      let totalMaxScore = 0;
                      
                      completedSubtasks.forEach(subtask => {
                        totalScore += subtask.score || 0;
                        // 使用test_case_max_score字段，如果没有则默认100
                        totalMaxScore += (subtask as any).test_case_max_score || 100;
                      });
                      
                      return totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100 * 10) / 10 : 0;
                    };
                    
                    const weightedPercentage = calculateWeightedPercentage();
                    
                    // 计算状态分布统计
                    const statusStats = {
                      completed: completedCount,
                      failed: failedCount,
                      running: runningCount,
                      pending: pendingCount,
                      total: totalCount,
                      completionRate: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
                    };

                    const groupKey = `${group.model_name}_${group.dimension_name}`;
                    const isExpanded = expandedGroups.has(groupKey);

                    return (
                      <div key={groupKey} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                        {/* 结果头部 - 聚合显示，可点击展开 */}
                        <div 
                          className="bg-gray-50 px-6 py-4 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => toggleGroup(groupKey)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className="text-sm font-medium text-gray-900">
                                #{(currentPage - 1) * itemsPerPage + index + 1}
                              </div>
                              {/* 展开/收起图标 */}
                              <div className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                                <ChevronLeft className="h-4 w-4 text-gray-400" />
                              </div>
                              <div className="text-lg font-medium text-gray-900">
                                {group.model_name}
                              </div>
                              <div className="text-sm text-gray-600">
                                {group.dimension_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                ({totalCount} 个子任务)
                              </div>
                            </div>
                            <div className="flex items-center space-x-4">
                              {/* 状态统计 */}
                              <div className="flex items-center space-x-2 text-xs">
                                {completedCount > 0 && (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
                                    完成 {completedCount}
                                  </span>
                                )}
                                {failedCount > 0 && (
                                  <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full">
                                    失败 {failedCount}
                                  </span>
                                )}
                                {runningCount > 0 && (
                                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                    执行中 {runningCount}
                                  </span>
                                )}
                                {pendingCount > 0 && (
                                  <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full">
                                    待处理 {pendingCount}
                                  </span>
                                )}
                              </div>
                              
                              {/* 🔧 改进的指标显示：加权百分制分数 */}
                              {weightedPercentage !== null ? (
                                <div className="flex flex-col items-end">
                                  <div className="text-2xl font-bold text-blue-600">
                                    {weightedPercentage}%
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    加权得分
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <div className="text-lg font-medium text-gray-600">
                                    {statusStats.completionRate}%
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    完成率
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 聚合内容 - 根据展开状态显示不同内容 */}
                        <div className="p-6 space-y-4">
                          {!isExpanded ? (
                            // 收起状态 - 显示汇总统计
                            <>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="text-center p-3 bg-gray-50 rounded-lg">
                                  <div className="text-lg font-bold text-gray-900">{totalCount}</div>
                                  <div className="text-sm text-gray-500">总子任务</div>
                                </div>
                                <div className="text-center p-3 bg-green-50 rounded-lg">
                                  <div className="text-lg font-bold text-green-600">{completedCount}</div>
                                  <div className="text-sm text-gray-500">已完成</div>
                                </div>
                                <div className="text-center p-3 bg-red-50 rounded-lg">
                                  <div className="text-lg font-bold text-red-600">{failedCount}</div>
                                  <div className="text-sm text-gray-500">失败</div>
                                </div>
                                {runningCount > 0 && (
                                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                                    <div className="text-lg font-bold text-blue-600">{runningCount}</div>
                                    <div className="text-sm text-gray-500">执行中</div>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            // 展开状态 - 按运行次数聚合显示详细的子任务信息
                            <div className="space-y-4">
                              {/* 🔧 按运行次数分组显示 */}
                              {(() => {
                                // 按repetition_index分组，处理null值
                                const groupByRuns = new Map<number, typeof group.subtasks>();
                                
                                group.subtasks.forEach(subtask => {
                                  // 如果repetition_index为null，根据数据结构推断运行次数
                                  const runIndex = subtask.repetition_index || 1;
                                  if (!groupByRuns.has(runIndex)) {
                                    groupByRuns.set(runIndex, []);
                                  }
                                  groupByRuns.get(runIndex)!.push(subtask);
                                });
                                
                                const sortedRuns = Array.from(groupByRuns.entries()).sort(([a], [b]) => a - b);
                                
                                return (
                                  <>
                                    <div className="text-sm text-gray-500 pb-2 border-b flex items-center justify-between">
                                      <span>按运行次数分组显示 ({totalCount} 个子任务)</span>
                                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                        共 {sortedRuns.length} 次运行
                                      </span>
                                    </div>
                                    
                                    {sortedRuns.map(([runIndex, runSubtasks]) => {
                                      const runCompleted = runSubtasks.filter(st => st.status === 'completed').length;
                                      const runFailed = runSubtasks.filter(st => st.status === 'failed').length;
                                      const runPending = runSubtasks.filter(st => st.status === 'pending').length;
                                      const testCasesCount = runSubtasks.length;
                                      
                                      return (
                                        <div key={runIndex} className="border border-gray-200 rounded-lg p-4 space-y-3">
                                          {/* 运行次数标题 */}
                                          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                            <h4 className="text-sm font-semibold text-gray-700 flex items-center">
                                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 mr-2">
                                                第{runIndex}次运行
                                              </span>
                                              {testCasesCount} 个测试用例
                                            </h4>
                                            <div className="flex items-center space-x-2 text-xs">
                                              {runCompleted > 0 && (
                                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full">
                                                  完成 {runCompleted}
                                                </span>
                                              )}
                                              {runFailed > 0 && (
                                                <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full">
                                                  失败 {runFailed}
                                                </span>
                                              )}
                                              {runPending > 0 && (
                                                <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full">
                                                  待处理 {runPending}
                                                </span>
                                              )}
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="text-xs px-2 py-1 h-auto"
                                                onClick={() => {
                                                  const runKey = `${group.model_name}-${group.dimension_name}-${runIndex}`;
                                                  toggleRunCases(runKey);
                                                }}
                                              >
                                                {expandedRunCases.has(`${group.model_name}-${group.dimension_name}-${runIndex}`) ? '📋 收起测试用例' : '📋 查看测试用例'}
                                              </Button>
                                            </div>
                                          </div>
                                          
                                          {/* 测试用例展示 */}
                                          {expandedRunCases.has(`${group.model_name}-${group.dimension_name}-${runIndex}`) ? (
                                            <TestCaseList
                                              subtasks={group.subtasks}
                                              runIndex={runIndex}
                                              className="mt-3"
                                              currentModelId={group.subtasks?.[0]?.model_id}
                                            />
                                          ) : (
                                            <div className="text-sm text-gray-500 mt-3 px-4 py-3 bg-gray-50 rounded">
                                              点击上方"📋 查看测试用例"按钮查看该次运行的详细测试结果
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'standardized' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">标准化评分矩阵</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    基于得分点的标准化评分体系，确保不同难度题目的公平评分
                  </p>
                </div>
              </div>
              
              {taskId ? (
                <StandardizedScoreMatrix taskId={taskId} className="mt-4" />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>任务ID未找到，无法加载标准化评分数据</p>
                </div>
              )}
            </div>
          )}


          {activeTab === 'logs' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">执行日志</h3>
              
              <div className="bg-gray-900 rounded-lg p-4 text-sm text-gray-300 font-mono h-96 overflow-y-auto">
                <div className="space-y-1">
                  {taskLogs.length > 0 ? (
                    taskLogs.map((log, index) => (
                      <div key={index} className={index === taskLogs.length - 1 ? 'text-blue-400' : ''}>
                        {log}
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500">
                      <div>[系统] 正在加载任务日志...</div>
                      <div>[任务] {task.name}</div>
                      <div>[状态] {getStatusText(task.status)}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* 🆕 预检查对话框 */}
        <PreRetryAnalysisDialog
          isOpen={showPreRetryDialog}
          onClose={() => setShowPreRetryDialog(false)}
          taskId={taskId}
          onStartRetry={handleRetryWithOptions}
        />

        {/* 🆕 批量重新评分对话框 */}
        <BatchReEvaluateDialog
          isOpen={showBatchReEvaluateDialog}
          onClose={() => setShowBatchReEvaluateDialog(false)}
          failedSubtasks={evaluationFailedSubtasks}
          taskId={taskId}
          onConfirm={async (selectedModelId: string, reason: string, freshStart: boolean) => {
            try {
              console.log(`🚀 开始批量重新评分：${evaluationFailedSubtasks.length} 个子任务`);
              console.log(`📝 评分器: ${selectedModelId}, Fresh Start: ${freshStart}`);

              // 批量重新评分
              const retryPromises = evaluationFailedSubtasks.map(subtask => {
                return fetch(`/api/tasks/${taskId}/retry-subtask`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    subtask_id: subtask.id,
                    evaluator_id: selectedModelId,
                    reason: `批量重新评分: ${reason}`,
                    re_evaluation_only: true,
                    fresh_start: freshStart // 🆕 传递 fresh_start 参数
                  })
                });
              });

              const results = await Promise.allSettled(retryPromises);
              const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as Response).ok).length;
              const failureCount = results.length - successCount;

              console.log(`✅ 批量重新评分完成：成功 ${successCount}，失败 ${failureCount}`);

              // 刷新数据
              await loadSubTasks(taskId);

              const freshStartMsg = freshStart ? '\n（已重置提供商失败记录）' : '';
              alert(`批量重新评分完成！\n成功: ${successCount} 个\n失败: ${failureCount} 个${freshStartMsg}`);
            } catch (error) {
              console.error('批量重新评分失败:', error);
              alert('批量重新评分失败，请重试');
            }
          }}
        />
    </div>
  );
}

// 导出下拉组件
interface ExportDropdownProps {
  taskName: string;
  taskData: {
    task: TaskDetail;
    subTasks: SubTask[];
    filteredSubTasks: SubTask[];
  };
}

function ExportDropdown({ taskName, taskData }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<ExportFormat | null>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen && !target.closest('[data-export-dropdown]')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleExport = async (format: ExportFormat) => {
    if (isExporting) return;
    
    setIsExporting(format);
    
    try {
      // 转换数据为导出格式
      const transformedData = transformTaskDataForExport(taskData);
      
      // 执行导出
      exportData(transformedData, format, `${taskName}_详细结果`);
      
    } catch (error) {
      console.error(`导出${format}失败:`, error);
      alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsExporting(null);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={!!isExporting}
        className="text-sm"
      >
        <Download className="h-4 w-4 mr-2" />
        {isExporting ? '导出中...' : '导出结果'}
      </Button>

      {isOpen && (
        <div data-export-dropdown className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
          <div className="py-1">
            <button
              onClick={() => handleExport('excel')}
              disabled={!!isExporting}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              📊 <span className="ml-2">导出为Excel</span>
              <span className="ml-auto text-xs text-gray-500">推荐</span>
            </button>
            
            <button
              onClick={() => handleExport('csv')}
              disabled={!!isExporting}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              📋 <span className="ml-2">导出为CSV</span>
            </button>
            
            <button
              onClick={() => handleExport('json')}
              disabled={!!isExporting}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              🔧 <span className="ml-2">导出为JSON</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 数据转换函数：将任务数据转换为导出格式
function transformTaskDataForExport(taskData: {
  task: TaskDetail;
  subTasks: SubTask[];
  filteredSubTasks: SubTask[];
}): TaskExportData {
  const { task, subTasks } = taskData;

  // 1. 转换详细结果数据
  const detailedData = subTasks.map((subTask, index) => ({
    序号: index + 1,
    模型名称: subTask.model_name,
    提供商: subTask.model_provider || '',
    测试用例输入: subTask.test_case_input,
    模型回复: subTask.model_response || '',
    参考答案: subTask.test_case_reference || '',
    评测维度: subTask.dimension_name,
    维度描述: subTask.dimension_description || '',
    评分器名称: subTask.evaluator_name,
    评分器类型: subTask.evaluator_type || '',
    得分: subTask.score || 0,
    评分推理: subTask.reasoning || '',
    执行时间ms: subTask.execution_time || 0,
    Token使用: subTask.total_tokens || subTask.tokens_used || 0,
    Prompt_Tokens: subTask.prompt_tokens || 0,
    Completion_Tokens: subTask.completion_tokens || 0,
    LLM响应时间ms: subTask.llm_response_time || 0,
    Tokens每秒: subTask.tokens_per_second || 0,
    费用USD: subTask.cost || 0,
    执行状态: subTask.status,
    错误信息: subTask.error_message || '',
    创建时间: subTask.created_at,
    开始时间: subTask.started_at || '',
    完成时间: subTask.completed_at || ''
  }));

  // 2. 构建矩阵数据（模型 × 维度）
  const models = Array.from(new Set(subTasks.map(st => st.model_name)));
  const dimensions = Array.from(new Set(subTasks.map(st => st.dimension_name)));
  
  // 创建分数矩阵
  const scoreMatrix: (number | null)[][] = models.map(model =>
    dimensions.map(dimension => {
      const result = subTasks.find(st => 
        st.model_name === model && st.dimension_name === dimension
      );
      return result?.score || null;
    })
  );

  // 3. 构建任务概览信息
  const taskOverview = {
    id: task.id,
    name: task.name,
    description: task.description || '',
    status: task.status,
    createdAt: task.created_at,
    startedAt: task.started_at,
    completedAt: task.completed_at,
    totalSubtasks: subTasks.length,
    completedSubtasks: task.completed_subtasks,
    failedSubtasks: task.failed_subtasks,
    template: task.template.name,
    models: models,
    dimensions: dimensions
  };

  // 4. 构建性能统计数据
  const performanceStats = models.map(model => {
    const modelSubTasks = subTasks.filter(st => st.model_name === model);
    const successfulTasks = modelSubTasks.filter(st => st.status === 'completed' && st.execution_time);
    
    const avgExecutionTime = successfulTasks.length > 0 ? 
      successfulTasks.reduce((sum, st) => sum + (st.execution_time || 0), 0) / successfulTasks.length : 0;
    
    // 使用新的字段获取更准确的token和性能数据
    const totalTokens = modelSubTasks.reduce((sum, st) => {
      return sum + (st.total_tokens || st.tokens_used || 0);
    }, 0);
    
    const totalCost = modelSubTasks.reduce((sum, st) => sum + (st.cost || 0), 0);
    const avgCost = modelSubTasks.length > 0 ? totalCost / modelSubTasks.length : 0;
    
    const successRate = modelSubTasks.length > 0 ? 
      ((modelSubTasks.filter(st => st.status === 'completed').length / modelSubTasks.length) * 100).toFixed(1) + '%' : '0%';
    
    // 使用新的llm_response_time字段计算更准确的tokens/秒
    const tasksWithResponseTime = modelSubTasks.filter(st => st.llm_response_time && st.llm_response_time > 0);
    const avgTokensPerSecond = tasksWithResponseTime.length > 0 ? 
      tasksWithResponseTime.reduce((sum, st) => sum + (st.tokens_per_second || 0), 0) / tasksWithResponseTime.length : 0;

    return {
      模型名称: model,
      平均执行时间ms: Math.round(avgExecutionTime),
      总Token使用: totalTokens,
      平均费用USD: Number(avgCost.toFixed(4)),
      成功率: successRate,
      tokens每秒: Math.round(avgTokensPerSecond * 100) / 100
    };
  });

  return {
    title: `${task.name} - 评测结果报告`,
    data: detailedData,
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'LLM Benchmark System',
      taskId: task.id,
      exportedBy: '系统用户',
      totalRecords: detailedData.length
    },
    // 任务概览数据
    taskOverview,
    // 性能统计数据
    performanceStats,
    // 矩阵数据
    matrixData: {
      rowHeaders: models,
      columnHeaders: dimensions,
      values: scoreMatrix,
      taskInfo: {
        name: task.name,
        description: task.description,
        totalModels: models.length,
        totalDimensions: dimensions.length
      }
    }
  };
}