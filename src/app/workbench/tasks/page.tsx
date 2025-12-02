'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Play, Clock, CheckCircle, XCircle, PlusCircle, Activity, RefreshCw, Search, ChevronLeft, ChevronRight, DollarSign, BarChart3, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useUserPreferences } from '@/lib/user-preferences';
import { formatCost } from '@/lib/cost-calculator';
import { TaskListSkeleton, StatCardSkeleton, PageHeaderSkeleton } from '@/components/ui/skeleton';
import { usePageLoadComplete } from '@/components/layout/page-loading';

interface TaskStats {
  total: number;
  running: number;
  completed: number;
  failed: number;
  pending: number;
}

interface Task {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  started_at?: string;
  finished_at?: string;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  config?: {
    run_count?: number;
    [key: string]: any;
  };
  cost_summary?: {
    total_cost_usd: number;
    total_cost_cny: number;
    has_cost_data: boolean;
    model_count: number;
  };
}

export default function TasksPage() {
  // 🚀 立即清除全局loading状态，避免蓝色进度条延迟
  usePageLoadComplete();

  const router = useRouter();
  const searchParams = useSearchParams();
  const { currency } = useUserPreferences();

  // 从URL参数获取初始页码
  const initialPage = parseInt(searchParams.get('page') || '1', 10);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats>({
    total: 0,
    running: 0,
    completed: 0,
    failed: 0,
    pending: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 🎯 智能缓存系统
  const [cache, setCache] = useState<Map<string, { data: any; timestamp: number; page: number }>>(new Map());
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const cacheTimeout = 5 * 60 * 1000; // 5分钟缓存过期
  const autoRefreshInterval = useRef<NodeJS.Timeout>();

  /*
  📋 缓存失效策略:
  1. ⏰ 时间过期: 5分钟后自动过期
  2. 🔄 手动刷新: 用户点击刷新按钮
  3. 👁️ 页面可见: 页面重新可见且超过1分钟未刷新
  4. 🎯 窗口焦点: 窗口重新获得焦点且超过1分钟未刷新
  5. ⚡ 自动检查: 每30秒检查一次，超过2分钟自动失效
  6. 🗑️ 用户清空: 用户手动清空缓存按钮
  7. ➕ 新建任务: 创建新任务后自动失效(未来功能)
  */
  const [error, setError] = useState<string | null>(null);

  // Basic pagination state - 从URL参数初始化
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTasks, setTotalTasks] = useState(0);
  const pageSize = 10;

  // 🆕 任务选择状态（用于聚合分析和批量操作）
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'aggregation' | 'delete'>('aggregation');
  const [isDeleting, setIsDeleting] = useState(false);

  // 更新URL参数的函数
  const updateURLParams = (page: number) => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    router.push(`/workbench/tasks?${params.toString()}`, { scroll: false });
  };

  // 处理页面变化
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    updateURLParams(newPage);
    // 不强制刷新，让缓存系统决定是否需要重新获取
    loadTasks(newPage, false);
  };

  const loadTasks = async (page = currentPage, forceRefresh = false) => {
    try {
      setError(null);

      // 生成缓存键
      const cacheKey = `tasks-page-${page}-limit-${pageSize}`;
      const now = Date.now();

      // 检查缓存
      if (!forceRefresh) {
        const cachedData = cache.get(cacheKey);
        if (cachedData && (now - cachedData.timestamp) < cacheTimeout) {
          // 使用缓存数据
          setTasks(cachedData.data.tasks);
          setCurrentPage(cachedData.data.pagination.page);
          setTotalPages(cachedData.data.pagination.totalPages);
          setTotalTasks(cachedData.data.pagination.total);
          if (cachedData.data.stats) {
            setStats(cachedData.data.stats);
          }
          setLoading(false);
          return;
        }
      }

      setLoading(true);

      const response = await apiClient.getTasks({
        page,
        limit: pageSize,
      });
      
      if (response.error) {
        setError(response.error);
        return;
      }

      if (response.data) {
        const tasksData = response.data.tasks.map(task => ({
          id: task.id,
          name: task.name,
          status: task.status as Task['status'],
          created_at: task.created_at,
          started_at: task.started_at,
          finished_at: task.finished_at,
          progress: task.progress,
          config: task.config
        }));

        setTasks(tasksData);

        if (response.data.pagination) {
          setCurrentPage(response.data.pagination.page);
          setTotalPages(response.data.pagination.totalPages);
          setTotalTasks(response.data.pagination.total);
        }

        if (response.data.stats) {
          setStats(response.data.stats);
        }
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
      setError('Failed to load tasks, please retry');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 缓存失效逻辑
  const invalidateCache = (reason?: string) => {
    setCache(new Map());
    setLastRefresh(Date.now());
  };

  // 手动刷新
  const handleRefresh = () => {
    setRefreshing(true);
    invalidateCache('手动刷新');
    loadTasks(currentPage, true);
  };

  // 自动刷新逻辑
  useEffect(() => {
    // 清理旧的定时器
    if (autoRefreshInterval.current) {
      clearInterval(autoRefreshInterval.current);
    }

    // 设置新的自动刷新定时器 - 每30秒检查一次
    autoRefreshInterval.current = setInterval(() => {
      const now = Date.now();
      // 如果距离上次刷新超过2分钟，则失效缓存
      if (now - lastRefresh > 2 * 60 * 1000) {
        invalidateCache('超过2分钟未更新');
      }
    }, 30000); // 30秒检查一次

    return () => {
      if (autoRefreshInterval.current) {
        clearInterval(autoRefreshInterval.current);
      }
    };
  }, [lastRefresh]);

  // 🎯 页面可见性检测 - 当页面重新可见时检查缓存
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const now = Date.now();
        // 如果页面重新可见且距离上次刷新超过1分钟，则刷新
        if (now - lastRefresh > 60000) {
          invalidateCache('页面重新可见');
          loadTasks(currentPage, true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [lastRefresh, currentPage]);

  // 🎯 窗口焦点检测
  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      // 如果窗口重新获得焦点且距离上次刷新超过1分钟，则刷新
      if (now - lastRefresh > 60000) {
        invalidateCache('窗口重新获得焦点');
        loadTasks(currentPage, true);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [lastRefresh, currentPage]);

  useEffect(() => {
    loadTasks();
  }, [currentPage]); // 🔧 依赖currentPage，页面变化时重新加载


  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Activity className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
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
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getProgressPercentage = (task: Task) => {
    if (task.progress.total === 0) return 0;
    return Math.round((task.progress.completed / task.progress.total) * 100);
  };

  // 🆕 任务选择相关函数
  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const selectAllTasks = () => {
    if (selectionMode === 'aggregation') {
      // 聚合分析模式：只选择已完成的任务
      const completedTasks = tasks.filter(task => task.status === 'completed');
      setSelectedTasks(completedTasks.map(task => task.id));
    } else if (selectionMode === 'delete') {
      // 删除模式：选择可删除的任务（已完成、失败或取消）
      const deletableTasks = tasks.filter(task =>
        ['completed', 'failed', 'cancelled'].includes(task.status)
      );
      setSelectedTasks(deletableTasks.map(task => task.id));
    }
  };

  const clearSelection = () => {
    setSelectedTasks([]);
  };

  const createAggregation = () => {
    if (selectedTasks.length < 2) {
      alert('请至少选择2个已完成的任务进行聚合分析');
      return;
    }

    // 生成聚合分析配置
    const selectedTasksData = tasks.filter(task => selectedTasks.includes(task.id));
    const aggregationId = `agg_${Date.now()}`;
    const aggregationConfig = {
      id: aggregationId,
      name: `聚合分析_${new Date().toLocaleDateString()}`,
      type: 'vertical', // 默认纵向聚合
      taskIds: selectedTasks,
      taskNames: selectedTasksData.map(task => task.name),
      createdAt: new Date().toISOString(),
      modelCount: 0, // 将通过API获取
      dimensionCount: 0 // 将通过API获取
    };

    // 保存到localStorage
    const saved = localStorage.getItem('aggregation_analyses') || '[]';
    const analyses = JSON.parse(saved);
    analyses.push(aggregationConfig);
    localStorage.setItem('aggregation_analyses', JSON.stringify(analyses));

    // 跳转到聚合分析详情页
    window.location.href = `/workbench/aggregation/${aggregationId}`;
  };

  const batchDeleteTasks = async () => {
    if (selectedTasks.length === 0) {
      alert('请选择要删除的任务');
      return;
    }

    const selectedTasksData = tasks.filter(task => selectedTasks.includes(task.id));
    const confirmMessage = `确定要删除以下 ${selectedTasks.length} 个任务吗？\n\n${selectedTasksData.map(task => `• ${task.name}`).join('\n')}\n\n此操作不可撤销！`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/tasks/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_ids: selectedTasks
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.details) {
          // 处理部分任务无法删除的情况
          const nonDeletableList = result.details.non_deletable_tasks
            .map(task => `• ${task.name} (${task.reason})`)
            .join('\n');
          alert(`删除失败：\n\n${result.error}\n\n无法删除的任务：\n${nonDeletableList}`);
        } else {
          alert(`删除失败：${result.error}`);
        }
        return;
      }

      // 删除成功
      alert(`成功删除 ${result.deleted_count} 个任务`);

      // 清空选择
      setSelectedTasks([]);
      setIsSelectionMode(false);

      // 重新加载任务列表
      await loadTasks();

    } catch (error) {
      console.error('批量删除失败:', error);
      alert('删除失败，请重试');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <TaskListSkeleton />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        {/* 🆕 选择模式控制 */}
        <div className="flex items-center space-x-4">
          {!isSelectionMode ? (
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectionMode('aggregation');
                  setIsSelectionMode(true);
                }}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                创建聚合分析
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectionMode('delete');
                  setIsSelectionMode(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                批量删除
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-600">
                已选择 {selectedTasks.length} 个任务
                {selectionMode === 'aggregation' && ' (聚合分析)'}
                {selectionMode === 'delete' && ' (批量删除)'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllTasks}
              >
                {selectionMode === 'aggregation' ? '全选已完成' : '全选可删除'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSelection}
              >
                清空
              </Button>

              {selectionMode === 'aggregation' && (
                <Button
                  size="sm"
                  onClick={createAggregation}
                  disabled={selectedTasks.length < 2}
                >
                  <BarChart3 className="mr-2 h-4 w-4" />
                  创建聚合
                </Button>
              )}

              {selectionMode === 'delete' && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={batchDeleteTasks}
                  disabled={selectedTasks.length === 0 || isDeleting}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isDeleting ? '删除中...' : `删除 ${selectedTasks.length} 个任务`}
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedTasks([]);
                }}
              >
                取消
              </Button>
            </div>
          )}
        </div>

        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '刷新中...' : '刷新'}
          </Button>
          <Link href="/workbench/aggregation">
            <Button variant="outline">
              <BarChart3 className="mr-2 h-4 w-4" />
              查看聚合分析
            </Button>
          </Link>
          <Link href="/workbench/tasks/new">
            <Button>
              <PlusCircle className="mr-2 h-4 w-4" />
              新建评测任务
            </Button>
          </Link>
        </div>
      </div>


      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <XCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">加载失败</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
              <div className="mt-4">
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  重试
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Play className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    总任务数
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.total}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    等待中
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.pending}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Activity className="h-6 w-6 text-blue-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    运行中
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.running}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    已完成
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.completed}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    失败
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.failed}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {totalTasks > 0 ? `任务列表 (${totalTasks} 个)` : '任务列表'}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                {totalPages > 1 
                  ? `第 ${currentPage} 页，共 ${totalPages} 页 · 每页显示 ${pageSize} 个任务`
                  : '最新创建和运行的评测任务'
                }
              </p>
            </div>
          </div>
        </div>

        <ul className="divide-y divide-gray-200">
          {tasks.map((task) => (
            <li key={task.id} className="relative">
              {/* 🆕 根据选择模式显示不同内容 */}
              {isSelectionMode ? (
                <div className={`px-4 py-4 sm:px-6 cursor-pointer hover:bg-gray-50 ${
                  (selectionMode === 'aggregation' && task.status !== 'completed') ||
                  (selectionMode === 'delete' && !['completed', 'failed', 'cancelled'].includes(task.status))
                    ? 'opacity-50' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {/* 🆕 选择框 */}
                      <input
                        type="checkbox"
                        checked={selectedTasks.includes(task.id)}
                        onChange={() => toggleTaskSelection(task.id)}
                        disabled={
                          (selectionMode === 'aggregation' && task.status !== 'completed') ||
                          (selectionMode === 'delete' && !['completed', 'failed', 'cancelled'].includes(task.status))
                        }
                        className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      {getStatusIcon(task.status)}
                      <p className="ml-2 text-sm font-medium text-gray-900 truncate">
                        {task.name}
                      </p>
                      {selectionMode === 'aggregation' && task.status !== 'completed' && (
                        <span className="ml-2 text-xs text-gray-400">(仅已完成任务可用于聚合)</span>
                      )}
                      {selectionMode === 'delete' && !['completed', 'failed', 'cancelled'].includes(task.status) && (
                        <span className="ml-2 text-xs text-gray-400">(仅已完成、失败或取消的任务可删除)</span>
                      )}
                    </div>
                    <div className="ml-2 flex-shrink-0 flex items-center space-x-2">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(task.status)}`}>
                        {getStatusText(task.status)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 sm:flex sm:justify-between">
                    <div className="sm:flex">
                      <p className="flex items-center text-sm text-gray-500">
                        创建时间: {new Date(task.created_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                      {task.status === 'completed' && task.finished_at && (
                        <span>完成时间: {new Date(task.finished_at).toLocaleString('zh-CN')}</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  href={`/workbench/tasks/${task.id}?page=${currentPage}`}
                  className="block hover:bg-gray-50"
                >
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {getStatusIcon(task.status)}
                        <p className="ml-2 text-sm font-medium text-gray-900 truncate">
                          {task.name}
                        </p>
                      </div>
                      <div className="ml-2 flex-shrink-0 flex items-center space-x-2">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(task.status)}`}>
                          {getStatusText(task.status)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-500">
                          创建时间: {new Date(task.created_at).toLocaleString('zh-CN')}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0">
                        {task.status === 'running' && task.progress.total > 0 && (
                          <div className="flex items-center">
                            <span className="mr-2">进度: {task.progress.completed}/{task.progress.total}</span>
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                style={{ width: `${getProgressPercentage(task)}%` }}
                              ></div>
                            </div>
                            <span className="ml-2 text-xs">{getProgressPercentage(task)}%</span>
                          </div>
                        )}
                        {task.status === 'completed' && task.finished_at && (
                          <span>完成时间: {new Date(task.finished_at).toLocaleString('zh-CN')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )}
            </li>
          ))}
        </ul>
        
        {tasks.length === 0 && !error && (
          <div className="text-center py-12">
            <Play className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">暂无任务</h3>
            <p className="mt-1 text-sm text-gray-500">
              开始创建您的第一个评测任务
            </p>
            <div className="mt-6">
              <Link href="/workbench/tasks/new">
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  新建评测任务
                </Button>
              </Link>
            </div>
          </div>
        )}
        
        {/* 🆕 分页控制器 */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              {/* 移动端分页 */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                下一页
              </Button>
            </div>
            
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              {/* 桌面端分页信息 */}
              <div>
                <p className="text-sm text-gray-700">
                  显示第 <span className="font-medium">{((currentPage - 1) * pageSize) + 1}</span> 到{' '}
                  <span className="font-medium">{Math.min(currentPage * pageSize, totalTasks)}</span> 项，
                  共 <span className="font-medium">{totalTasks}</span> 个任务
                </p>
              </div>
              
              {/* 桌面端分页控件 */}
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="分页">
                  {/* 上一页按钮 */}
                  <button
                    onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    className={`relative inline-flex items-center px-2 py-2 rounded-l-md border text-sm font-medium ${
                      currentPage <= 1
                        ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span className="sr-only">上一页</span>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  
                  {/* 页码按钮 */}
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 7) {
                      // 总页数少于等于7页，显示所有页
                      pageNum = i + 1;
                    } else {
                      // 总页数大于7页，智能显示
                      if (currentPage <= 4) {
                        // 当前页在前面
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 3) {
                        // 当前页在后面
                        pageNum = totalPages - 6 + i;
                      } else {
                        // 当前页在中间
                        pageNum = currentPage - 3 + i;
                      }
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  {/* 下一页按钮 */}
                  <button
                    onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className={`relative inline-flex items-center px-2 py-2 rounded-r-md border text-sm font-medium ${
                      currentPage >= totalPages
                        ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span className="sr-only">下一页</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}