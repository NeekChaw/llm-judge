'use client';

import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface SystemMetrics {
  timestamp: string;
  cpu_usage: number;
  memory_usage: number;
  active_tasks: number;
  queue_stats: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
}

interface TaskProgress {
  task_id: string;
  status: string;
  progress: number;
  completed_subtasks: number;
  total_subtasks: number;
  updated_at: string;
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [taskUpdates, setTaskUpdates] = useState<TaskProgress[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // 创建WebSocket连接
    const socket = io('http://localhost:3002', {
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket连接成功');
      setConnected(true);
      
      // 订阅系统指标
      socket.emit('subscribe', { type: 'system_metrics' });
      
      // 订阅任务进度更新
      socket.emit('subscribe', { type: 'task_progress' });
    });

    socket.on('disconnect', () => {
      console.log('WebSocket连接断开');
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket连接错误:', error);
      setConnected(false);
    });

    // 接收系统指标更新
    socket.on('system_metrics', (data: SystemMetrics) => {
      setMetrics(data);
    });

    // 接收任务进度更新
    socket.on('task_progress', (data: TaskProgress) => {
      setTaskUpdates(prev => {
        const existingIndex = prev.findIndex(update => update.task_id === data.task_id);
        if (existingIndex >= 0) {
          const newUpdates = [...prev];
          newUpdates[existingIndex] = data;
          return newUpdates;
        } else {
          return [...prev, data];
        }
      });
    });

    // 清理函数
    return () => {
      socket.disconnect();
    };
  }, []);

  const subscribeToTask = (taskId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('subscribe', { 
        type: 'task_progress', 
        task_id: taskId 
      });
    }
  };

  const unsubscribeFromTask = (taskId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('unsubscribe', { 
        type: 'task_progress', 
        task_id: taskId 
      });
    }
  };

  return {
    connected,
    metrics,
    taskUpdates,
    subscribeToTask,
    unsubscribeFromTask,
  };
}