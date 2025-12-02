'use client';

import { useState, useEffect, useCallback } from 'react';
import EvaluationResultsMatrix from './EvaluationResultsMatrix';

interface StandardizedMatrixWrapperProps {
  taskId: string;
  models?: Array<{  // 模型定价信息
    id: string;
    name: string;
    input_cost_per_1k_tokens?: number;
    output_cost_per_1k_tokens?: number;
    cost_currency?: 'USD' | 'CNY';
  }>;
}

export default function StandardizedMatrixWrapper({ taskId, models }: StandardizedMatrixWrapperProps) {
  const [subtasks, setSubtasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskConfig, setTaskConfig] = useState<any>(null);
  const [expectedModels, setExpectedModels] = useState<string[]>([]);
  const [expectedDimensions, setExpectedDimensions] = useState<string[]>([]);

  async function fetchTaskConfiguration(task: any) {
    try {
      // 获取任务详细配置，包括模型名称和维度名称
      const response = await fetch(`/api/tasks/${taskId}`);
      if (!response.ok) return;
      
      const data = await response.json();
      const taskInfo = data.task;
      
      if (taskInfo?.model_ids && taskInfo.model_ids.length > 0) {
        // 获取模型名称
        const modelsResponse = await fetch('/api/models');
        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json();
          const modelNames = taskInfo.model_ids.map((id: string) => {
            const model = modelsData.models?.find((m: any) => m.id === id);
            return model?.name || `Model ${id}`;
          });
          setExpectedModels(modelNames);
        }
      }
      
      if (taskInfo?.template_id) {
        // 获取模板的维度信息
        const templateResponse = await fetch(`/api/templates/${taskInfo.template_id}`);
        if (templateResponse.ok) {
          const templateData = await templateResponse.json();
          const dimensionNames = templateData.template?.dimensions?.map((d: any) => d.name) || [];
          setExpectedDimensions(dimensionNames);
        }
      }
    } catch (err) {
      console.warn('获取任务配置失败:', err);
    }
  }

  // 🔄 实时更新函数（供外部调用）
  const refreshTaskData = useCallback(async () => {
    try {
      // 获取子任务数据（包含多次运行的结构化信息）
      const response = await fetch(`/api/tasks/${taskId}/subtasks`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setSubtasks(data.subtasks || []);
      setTaskConfig(data.task || null);
      setError(null);
      
      // 如果子任务为空但任务配置存在，获取额外的配置信息
      if ((data.subtasks || []).length === 0 && data.task) {
        await fetchTaskConfiguration(data.task);
      }
    } catch (err) {
      console.error('刷新任务数据失败:', err);
      setError(err instanceof Error ? err.message : '获取数据失败');
    }
  }, [taskId]);

  useEffect(() => {
    async function fetchTaskData() {
      try {
        // 初次加载时显示loading，后续更新时不显示
        if (subtasks.length === 0) {
          setLoading(true);
        }
        
        // 获取子任务数据（包含多次运行的结构化信息）
        const response = await fetch(`/api/tasks/${taskId}/subtasks`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        setSubtasks(data.subtasks || []);
        setTaskConfig(data.task || null);
        setError(null);
        
        // 如果子任务为空但任务配置存在，获取额外的配置信息
        if ((data.subtasks || []).length === 0 && data.task) {
          await fetchTaskConfiguration(data.task);
        }
      } catch (err) {
        console.error('获取任务数据失败:', err);
        setError(err instanceof Error ? err.message : '获取数据失败');
      } finally {
        setLoading(false);
      }
    }

    if (taskId) {
      // 仅在初次加载时获取数据
      fetchTaskData();
    }
  }, [taskId]);

  // 🎯 智能更新机制 - 基于任务状态变化
  useEffect(() => {
    if (!taskId || !taskConfig) return;

    // 检查任务是否仍在运行中
    const isTaskRunning = taskConfig.status === 'running' || taskConfig.status === 'pending';
    const hasRunningSub = subtasks.some(sub => sub.status === 'running' || sub.status === 'pending');

    if (isTaskRunning || hasRunningSub) {
      // 📡 仅在任务运行期间使用轻量级的状态检查
      const checkStatusChange = async () => {
        try {
          const response = await fetch(`/api/tasks/${taskId}`);
          if (response.ok) {
            const data = await response.json();
            const currentTask = data.task;
            
            // 检查任务状态或进度是否发生变化
            if (currentTask.status !== taskConfig.status || 
                currentTask.progress?.completed !== taskConfig.progress?.completed) {
              refreshTaskData();
            }
          }
        } catch (err) {
          // 静默处理状态检查失败，避免干扰用户体验
        }
      };

      // 仅在任务活跃时进行智能检查（间隔更长，减少请求频率）
      const statusChecker = setInterval(checkStatusChange, 10000); // 10秒检查一次状态变化
      
      return () => clearInterval(statusChecker);
    }
  }, [taskId, taskConfig, subtasks, refreshTaskData]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border shadow-sm p-6">
        <div className="text-center text-red-600">
          <p className="text-lg font-medium">数据加载失败</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <EvaluationResultsMatrix 
      subTasks={subtasks} 
      expectedModels={expectedModels}
      expectedDimensions={expectedDimensions}
      models={models}
      taskId={taskId}
    />
  );
}