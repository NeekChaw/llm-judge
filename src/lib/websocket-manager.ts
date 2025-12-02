/**
 * WebSocket 实时通信管理器
 * 用于任务状态的实时推送和客户端通信
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { TaskEvent, TaskEventType } from '@/types/task';
import { taskScheduler } from './task-scheduler';

/**
 * WebSocket连接管理器
 */
export class WebSocketManager {
  private io?: SocketIOServer;
  private connectedClients: Set<string> = new Set();

  /**
   * 初始化WebSocket服务器
   */
  initialize(httpServer: HTTPServer): void {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });

    this.setupEventHandlers();
    this.subscribeToTaskEvents();
    
    console.log('🔌 WebSocket server initialized');
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      const clientId = socket.id;
      this.connectedClients.add(clientId);
      
      console.log(`📱 Client connected: ${clientId} (${this.connectedClients.size} total)`);

      // 发送当前系统状态
      this.sendSystemStatus(socket.id);

      // 处理客户端订阅任务更新
      socket.on('subscribe-task', (taskId: string) => {
        socket.join(`task-${taskId}`);
        console.log(`👀 Client ${clientId} subscribed to task ${taskId}`);
        
        // 发送当前任务状态
        this.sendTaskStatus(taskId, socket.id);
      });

      // 处理客户端取消订阅
      socket.on('unsubscribe-task', (taskId: string) => {
        socket.leave(`task-${taskId}`);
        console.log(`👋 Client ${clientId} unsubscribed from task ${taskId}`);
      });

      // 处理任务控制操作
      socket.on('task-control', async (data: { taskId: string; action: string }) => {
        try {
          let result;
          switch (data.action) {
            case 'pause':
              result = await taskScheduler.pauseTask(data.taskId);
              break;
            case 'resume':
              result = await taskScheduler.resumeTask(data.taskId);
              break;
            case 'cancel':
              result = await taskScheduler.cancelTask(data.taskId);
              break;
            default:
              result = { success: false, message: 'Invalid action' };
          }
          
          socket.emit('task-control-result', {
            taskId: data.taskId,
            action: data.action,
            ...result
          });
        } catch (error) {
          socket.emit('task-control-result', {
            taskId: data.taskId,
            action: data.action,
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // 处理系统指标请求
      socket.on('request-metrics', async () => {
        try {
          const metrics = await taskScheduler.getSystemMetrics();
          socket.emit('system-metrics', metrics);
        } catch (error) {
          socket.emit('error', { message: 'Failed to get system metrics' });
        }
      });

      // 处理断开连接
      socket.on('disconnect', () => {
        this.connectedClients.delete(clientId);
        console.log(`📱 Client disconnected: ${clientId} (${this.connectedClients.size} remaining)`);
      });
    });
  }

  /**
   * 订阅任务事件
   */
  private subscribeToTaskEvents(): void {
    taskScheduler.addEventListener((event: TaskEvent) => {
      this.broadcastTaskEvent(event);
    });
  }

  /**
   * 广播任务事件
   */
  private broadcastTaskEvent(event: TaskEvent): void {
    if (!this.io) return;

    // 发送给订阅了特定任务的客户端
    this.io.to(`task-${event.task_id}`).emit('task-event', event);

    // 根据事件类型发送给不同的频道
    switch (event.type) {
      case TaskEventType.CREATED:
        this.io.emit('task-created', {
          task_id: event.task_id,
          timestamp: event.timestamp,
          data: event.data
        });
        break;
      
      case TaskEventType.STARTED:
        this.io.emit('task-started', {
          task_id: event.task_id,
          timestamp: event.timestamp,
          data: event.data
        });
        break;
      
      case TaskEventType.PROGRESS:
        this.io.to(`task-${event.task_id}`).emit('task-progress', {
          task_id: event.task_id,
          timestamp: event.timestamp,
          progress: event.data
        });
        break;
      
      case TaskEventType.COMPLETED:
        this.io.emit('task-completed', {
          task_id: event.task_id,
          timestamp: event.timestamp,
          data: event.data
        });
        break;
      
      case TaskEventType.FAILED:
        this.io.emit('task-failed', {
          task_id: event.task_id,
          timestamp: event.timestamp,
          error: event.data
        });
        break;
      
      case TaskEventType.CANCELLED:
        this.io.emit('task-cancelled', {
          task_id: event.task_id,
          timestamp: event.timestamp,
          data: event.data
        });
        break;
    }
  }

  /**
   * 发送系统状态
   */
  private async sendSystemStatus(clientId?: string): Promise<void> {
    try {
      const metrics = await taskScheduler.getSystemMetrics();
      const activeTasks = await taskScheduler.getAllActiveTasksProgress();
      
      const systemStatus = {
        metrics,
        active_tasks: activeTasks,
        timestamp: new Date().toISOString()
      };

      if (clientId && this.io) {
        this.io.to(clientId).emit('system-status', systemStatus);
      } else if (this.io) {
        this.io.emit('system-status', systemStatus);
      }
    } catch (error) {
      console.error('Failed to send system status:', error);
    }
  }

  /**
   * 发送任务状态
   */
  private async sendTaskStatus(taskId: string, clientId?: string): Promise<void> {
    try {
      const progress = await taskScheduler.getTaskProgress(taskId);
      
      if (progress) {
        const taskStatus = {
          task_id: taskId,
          progress,
          timestamp: new Date().toISOString()
        };

        if (clientId && this.io) {
          this.io.to(clientId).emit('task-status', taskStatus);
        } else if (this.io) {
          this.io.to(`task-${taskId}`).emit('task-status', taskStatus);
        }
      }
    } catch (error) {
      console.error(`Failed to send task status for ${taskId}:`, error);
    }
  }

  /**
   * 广播系统指标更新
   */
  async broadcastSystemMetrics(): Promise<void> {
    try {
      const metrics = await taskScheduler.getSystemMetrics();
      if (this.io) {
        this.io.emit('system-metrics-update', {
          metrics,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to broadcast system metrics:', error);
    }
  }

  /**
   * 获取连接的客户端数量
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * 关闭WebSocket服务器
   */
  close(): void {
    if (this.io) {
      this.io.close();
      this.connectedClients.clear();
      console.log('🔌 WebSocket server closed');
    }
  }
}

// 导出单例实例
export const webSocketManager = new WebSocketManager();