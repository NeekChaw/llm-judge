'use client';

import { Layout } from '@/components/layout/layout';
import { Button } from '@/components/ui/button';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useState, useEffect } from 'react';
import { 
  Activity, 
  Cpu, 
  HardDrive, 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  Play,
  Pause,
  Square
} from 'lucide-react';

interface ActiveTask {
  id: string;
  name: string;
  status: string;
  progress: number;
  completed_subtasks: number;
  total_subtasks: number;
  started_at: string;
}

export default function MonitoringDashboard() {
  const { connected, metrics, taskUpdates } = useWebSocket();
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // 模拟活跃任务数据
  useEffect(() => {
    const mockActiveTasks: ActiveTask[] = [
      {
        id: '1',
        name: 'GPT-4 vs Claude-3 对话能力评测',
        status: 'running',
        progress: 65,
        completed_subtasks: 65,
        total_subtasks: 100,
        started_at: '2025-01-28T10:30:00Z'
      },
      {
        id: '2',
        name: '多模型代码生成能力对比',
        status: 'running',
        progress: 25,
        completed_subtasks: 12,
        total_subtasks: 50,
        started_at: '2025-01-28T11:15:00Z'
      }
    ];

    setActiveTasks(mockActiveTasks);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // 这里会调用API刷新数据
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('刷新失败:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleTaskControl = async (taskId: string, action: 'pause' | 'resume' | 'cancel') => {
    try {
      console.log(`控制任务 ${taskId}: ${action}`);
      // 这里会调用任务控制API
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('任务控制失败:', error);
      alert('操作失败，请重试');
    }
  };

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

  const formatDuration = (startTime: string) => {
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffHours > 0) {
      return `${diffHours}小时${diffMins % 60}分钟`;
    }
    return `${diffMins}分钟`;
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* 页面头部 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">实时监控</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {connected ? (
                <>
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-600">已连接</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-600">连接断开</span>
                </>
              )}
            </div>
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </div>

        {/* 系统指标卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">CPU使用率</p>
                <p className="text-2xl font-bold text-gray-900">
                  {metrics?.cpu_usage ? `${metrics.cpu_usage.toFixed(1)}%` : '---'}
                </p>
              </div>
              <Cpu className="h-8 w-8 text-blue-500" />
            </div>
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${metrics?.cpu_usage || 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">内存使用率</p>
                <p className="text-2xl font-bold text-gray-900">
                  {metrics?.memory_usage ? `${metrics.memory_usage.toFixed(1)}%` : '---'}
                </p>
              </div>
              <HardDrive className="h-8 w-8 text-green-500" />
            </div>
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${metrics?.memory_usage || 0}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">活跃任务</p>
                <p className="text-2xl font-bold text-gray-900">
                  {metrics?.active_tasks || activeTasks.length}
                </p>
              </div>
              <Users className="h-8 w-8 text-purple-500" />
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {activeTasks.filter(task => task.status === 'running').length} 个正在运行
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">队列状态</p>
                <p className="text-2xl font-bold text-gray-900">
                  {metrics?.queue_stats?.waiting || 0}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
            <p className="mt-2 text-sm text-gray-500">
              等待中的子任务
            </p>
          </div>
        </div>

        {/* 队列详细状态 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">队列状态</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {metrics?.queue_stats?.waiting || 0}
                </div>
                <div className="text-sm text-gray-500">等待中</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {metrics?.queue_stats?.active || 0}
                </div>
                <div className="text-sm text-gray-500">执行中</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {metrics?.queue_stats?.completed || 0}
                </div>
                <div className="text-sm text-gray-500">已完成</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {metrics?.queue_stats?.failed || 0}
                </div>
                <div className="text-sm text-gray-500">失败</div>
              </div>
            </div>
          </div>
        </div>

        {/* 活跃任务列表 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">活跃任务</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {activeTasks.map((task) => (
              <div key={task.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(task.status)}
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">
                        {task.name}
                      </h3>
                      <p className="text-sm text-gray-500">
                        运行时间: {formatDuration(task.started_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {task.completed_subtasks}/{task.total_subtasks}
                      </div>
                      <div className="text-sm text-gray-500">{task.progress}%</div>
                    </div>
                    <div className="w-32">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {task.status === 'running' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTaskControl(task.id, 'pause')}
                          >
                            <Pause className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTaskControl(task.id, 'cancel')}
                          >
                            <Square className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {task.status === 'paused' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTaskControl(task.id, 'resume')}
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {activeTasks.length === 0 && (
              <div className="p-6 text-center text-gray-500">
                暂无活跃任务
              </div>
            )}
          </div>
        </div>

        {/* 实时日志 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">实时日志</h2>
          </div>
          <div className="p-6">
            <div className="bg-gray-900 rounded-lg p-4 text-sm text-gray-300 font-mono h-64 overflow-y-auto">
              <div className="space-y-1">
                <div>[{new Date().toLocaleTimeString()}] 系统正常运行</div>
                <div>[{new Date().toLocaleTimeString()}] CPU使用率: {metrics?.cpu_usage?.toFixed(1)}%</div>
                <div>[{new Date().toLocaleTimeString()}] 内存使用率: {metrics?.memory_usage?.toFixed(1)}%</div>
                <div>[{new Date().toLocaleTimeString()}] 活跃任务: {activeTasks.length}</div>
                {taskUpdates.slice(-5).map((update, index) => (
                  <div key={index} className="text-blue-400">
                    [{new Date(update.updated_at).toLocaleTimeString()}] 任务 {update.task_id} 进度更新: {update.progress}%
                  </div>
                ))}
                <div className="text-green-400">
                  [{new Date().toLocaleTimeString()}] WebSocket连接状态: {connected ? '已连接' : '断开'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}