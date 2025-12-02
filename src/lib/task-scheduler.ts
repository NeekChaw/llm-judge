/**
 * 任务调度和监控系统
 * 负责任务生命周期管理、实时监控和状态更新
 */

import { EvaluationTask, EvaluationSubTask, TaskStatus, TaskEventType, TaskEvent } from '@/types/task';
import { evaluationTaskQueue, evaluationSubTaskQueue } from './queue';

export interface TaskProgress {
  task_id: string;
  total_subtasks: number;
  completed_subtasks: number;
  failed_subtasks: number;
  progress_percentage: number;
  estimated_completion_time?: string;
  current_status: TaskStatus;
  last_updated: string;
}

export interface SystemMetrics {
  active_tasks: number;
  queued_tasks: number;
  completed_tasks_today: number;
  failed_tasks_today: number;
  average_execution_time: number;
  throughput_per_hour: number;
  system_load: {
    cpu_usage: number;
    memory_usage: number;
    queue_depth: number;
  };
}

/**
 * 任务调度和监控管理器
 */
export class TaskScheduler {
  private taskProgressMap: Map<string, TaskProgress> = new Map();
  private listeners: Set<(event: TaskEvent) => void> = new Set();
  private metricsHistory: SystemMetrics[] = [];

  /**
   * 启动任务调度器
   */
  async start(): Promise<void> {
    console.log('🚀 Starting Task Scheduler...');
    
    // 启动定期清理和监控
    this.startPeriodicCleanup();
    this.startMetricsCollection();
    
    console.log('✅ Task Scheduler started successfully');
  }

  /**
   * 停止任务调度器
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping Task Scheduler...');
    
    // 清理定时器
    this.stopPeriodicTasks();
    
    console.log('✅ Task Scheduler stopped successfully');
  }

  /**
   * 获取任务进度
   */
  async getTaskProgress(taskId: string): Promise<TaskProgress | null> {
    const cached = this.taskProgressMap.get(taskId);
    if (cached) {
      return cached;
    }

    // 从数据库或队列中重新计算进度
    return await this.calculateTaskProgress(taskId);
  }

  /**
   * 获取所有活跃任务的进度
   */
  async getAllActiveTasksProgress(): Promise<TaskProgress[]> {
    const activeTasks = Array.from(this.taskProgressMap.values())
      .filter(progress => 
        progress.current_status === TaskStatus.RUNNING || 
        progress.current_status === TaskStatus.PENDING
      );

    return activeTasks;
  }

  /**
   * 暂停任务
   */
  async pauseTask(taskId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`⏸️ Pausing task: ${taskId}`);
      
      // 暂停相关的子任务队列处理
      // TODO: 实际实现需要标记任务状态，停止新的子任务分配
      
      await this.updateTaskStatus(taskId, TaskStatus.PENDING);
      this.emitTaskEvent({
        type: TaskEventType.CANCELLED, // 使用CANCELLED表示暂停
        task_id: taskId,
        timestamp: new Date().toISOString(),
        data: { action: 'pause' }
      });

      return { success: true, message: '任务已暂停' };
    } catch (error) {
      return { 
        success: false, 
        message: `暂停任务失败: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * 恢复任务
   */
  async resumeTask(taskId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`▶️ Resuming task: ${taskId}`);
      
      // 恢复任务处理
      await this.updateTaskStatus(taskId, TaskStatus.RUNNING);
      this.emitTaskEvent({
        type: TaskEventType.STARTED,
        task_id: taskId,
        timestamp: new Date().toISOString(),
        data: { action: 'resume' }
      });

      return { success: true, message: '任务已恢复' };
    } catch (error) {
      return { 
        success: false, 
        message: `恢复任务失败: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`❌ Cancelling task: ${taskId}`);
      
      // 取消所有相关的子任务
      await this.cancelAllSubTasks(taskId);
      
      await this.updateTaskStatus(taskId, TaskStatus.CANCELLED);
      this.emitTaskEvent({
        type: TaskEventType.CANCELLED,
        task_id: taskId,
        timestamp: new Date().toISOString(),
        data: { action: 'cancel' }
      });

      return { success: true, message: '任务已取消' };
    } catch (error) {
      return { 
        success: false, 
        message: `取消任务失败: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * 获取系统性能指标
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const taskQueue = evaluationTaskQueue();
    const subtaskQueue = evaluationSubTaskQueue();

    // 获取队列统计
    const [taskWaiting, taskActive, subtaskWaiting, subtaskActive] = await Promise.all([
      taskQueue.getWaiting(),
      taskQueue.getActive(), 
      subtaskQueue.getWaiting(),
      subtaskQueue.getActive(),
    ]);

    // 计算系统指标
    const activeTasksCount = Array.from(this.taskProgressMap.values())
      .filter(p => p.current_status === TaskStatus.RUNNING).length;

    const metrics: SystemMetrics = {
      active_tasks: activeTasksCount,
      queued_tasks: taskWaiting.length + subtaskWaiting.length,
      completed_tasks_today: this.getCompletedTasksToday(),
      failed_tasks_today: this.getFailedTasksToday(),
      average_execution_time: this.calculateAverageExecutionTime(),
      throughput_per_hour: this.calculateThroughputPerHour(),
      system_load: {
        cpu_usage: await this.getCPUUsage(),
        memory_usage: await this.getMemoryUsage(),
        queue_depth: taskWaiting.length + subtaskWaiting.length,
      },
    };

    // 保存历史记录
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > 100) {
      this.metricsHistory.shift(); // 保持最近100条记录
    }

    return metrics;
  }

  /**
   * 获取系统性能历史
   */
  getMetricsHistory(): SystemMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * 注册事件监听器
   */
  addEventListener(listener: (event: TaskEvent) => void): void {
    this.listeners.add(listener);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: (event: TaskEvent) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * 更新任务进度
   */
  async updateTaskProgress(taskId: string, completed: number, failed: number): Promise<void> {
    const progress = await this.getTaskProgress(taskId);
    if (!progress) {
      return;
    }

    progress.completed_subtasks = completed;
    progress.failed_subtasks = failed;
    progress.progress_percentage = Math.round(
      ((completed + failed) / progress.total_subtasks) * 100
    );
    progress.last_updated = new Date().toISOString();

    // 估算完成时间
    if (completed > 0 && progress.progress_percentage < 100) {
      const avgTimePerTask = this.calculateAverageExecutionTime();
      const remainingTasks = progress.total_subtasks - completed - failed;
      const estimatedMinutes = (remainingTasks * avgTimePerTask) / 60000;
      const completionTime = new Date(Date.now() + estimatedMinutes * 60000);
      progress.estimated_completion_time = completionTime.toISOString();
    }

    this.taskProgressMap.set(taskId, progress);

    // 发送进度更新事件
    this.emitTaskEvent({
      type: TaskEventType.PROGRESS,
      task_id: taskId,
      timestamp: new Date().toISOString(),
      data: {
        completed,
        failed,
        progress_percentage: progress.progress_percentage,
        estimated_completion_time: progress.estimated_completion_time,
      }
    });
  }

  /**
   * 计算任务进度
   */
  private async calculateTaskProgress(taskId: string): Promise<TaskProgress> {
    // TODO: 从数据库查询实际进度
    // 这里使用模拟数据
    const mockProgress: TaskProgress = {
      task_id: taskId,
      total_subtasks: 12,
      completed_subtasks: 8,
      failed_subtasks: 1,
      progress_percentage: 75,
      current_status: TaskStatus.RUNNING,
      last_updated: new Date().toISOString(),
    };

    this.taskProgressMap.set(taskId, mockProgress);
    return mockProgress;
  }

  /**
   * 更新任务状态
   */
  private async updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    // TODO: 更新数据库
    const progress = this.taskProgressMap.get(taskId);
    if (progress) {
      progress.current_status = status;
      progress.last_updated = new Date().toISOString();
      this.taskProgressMap.set(taskId, progress);
    }

    console.log(`📝 Task ${taskId} status updated to: ${status}`);
  }

  /**
   * 取消所有子任务
   */
  private async cancelAllSubTasks(taskId: string): Promise<void> {
    // TODO: 实际实现需要从队列中移除或标记取消状态
    console.log(`🗑️ Cancelling all subtasks for task: ${taskId}`);
  }

  /**
   * 发送任务事件
   */
  private emitTaskEvent(event: TaskEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Event listener error:', error);
      }
    });
  }

  /**
   * 获取今日完成任务数
   */
  private getCompletedTasksToday(): number {
    // TODO: 从数据库查询
    return 15;
  }

  /**
   * 获取今日失败任务数
   */
  private getFailedTasksToday(): number {
    // TODO: 从数据库查询
    return 2;
  }

  /**
   * 计算平均执行时间
   */
  private calculateAverageExecutionTime(): number {
    // TODO: 从历史数据计算
    return 45000; // 45秒
  }

  /**
   * 计算每小时吞吐量
   */
  private calculateThroughputPerHour(): number {
    // TODO: 从历史数据计算
    return 8.5;
  }

  /**
   * 获取CPU使用率
   */
  private async getCPUUsage(): Promise<number> {
    // TODO: 实际实现应该获取系统CPU使用率
    return 35 + Math.random() * 30; // 35-65%
  }

  /**
   * 获取内存使用率
   */
  private async getMemoryUsage(): Promise<number> {
    // TODO: 实际实现应该获取系统内存使用率
    return 40 + Math.random() * 25; // 40-65%
  }

  /**
   * 启动定期清理
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      this.cleanupCompletedTasks();
    }, 300000); // 每5分钟清理一次
  }

  /**
   * 启动指标收集
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      this.getSystemMetrics().catch(error => {
        console.error('Metrics collection error:', error);
      });
    }, 60000); // 每分钟收集一次指标
  }

  /**
   * 停止定期任务
   */
  private stopPeriodicTasks(): void {
    // TODO: 清理具体的定时器引用
  }

  /**
   * 清理已完成的任务
   */
  private cleanupCompletedTasks(): void {
    const cutoffTime = Date.now() - 3600000; // 1小时前
    
    for (const [taskId, progress] of this.taskProgressMap.entries()) {
      if (
        (progress.current_status === TaskStatus.COMPLETED || 
         progress.current_status === TaskStatus.FAILED) &&
        new Date(progress.last_updated).getTime() < cutoffTime
      ) {
        this.taskProgressMap.delete(taskId);
        console.log(`🧹 Cleaned up completed task: ${taskId}`);
      }
    }
  }
}

// 导出单例实例
export const taskScheduler = new TaskScheduler();