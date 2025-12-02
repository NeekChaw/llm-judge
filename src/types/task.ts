/**
 * 任务队列系统类型定义
 */

// 任务状态枚举
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  DELAYED = 'delayed'
}

// 任务优先级
export enum TaskPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 20
}

// 评测任务类型
export interface EvaluationTask {
  id: string;
  name: string;
  template_id: string;
  test_case_ids: string[];
  model_ids: string[];
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  config: {
    concurrent_limit?: number;
    timeout?: number;
    retry_count?: number;
    max_tokens?: number;  // 添加最大token配置
    // 🆕 多次运行配置
    run_count?: number; // 运行次数，默认为1
    human_evaluation_mode?: 'independent' | 'shared'; // 人工评分模式：独立评分 | 共享评分
  };
}

// 子任务（单个评分任务）
export interface EvaluationSubTask {
  id: string;
  parent_task_id: string;
  test_case_id: string;
  model_id: string;
  dimension_id: string;
  evaluator_id: string;
  status: TaskStatus;
  priority: TaskPriority;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  // 🆕 多次运行支持
  run_index?: number; // 运行轮次索引，从1开始，默认为1
  result?: {
    score: number;
    justification: string;
    model_response?: any;
    prompt_tokens?: number;
    completion_tokens?: number;
    execution_time?: number;
  };
  error?: {
    message: string;
    code: string;
    details?: any;
  };
}

// 任务创建请求
export interface CreateTaskRequest {
  name: string;
  description?: string;
  system_prompt?: string;
  template_id: string;
  test_case_ids: string[];
  model_ids: string[];
  priority?: TaskPriority;
  config?: {
    concurrent_limit?: number;
    timeout?: number;
    retry_count?: number;
    max_tokens?: number;  // 添加最大token配置
    // 🆕 多次运行配置
    run_count?: number; // 运行次数，默认为1
    human_evaluation_mode?: 'independent' | 'shared'; // 人工评分模式：独立评分 | 共享评分
  };
}

// 任务统计信息
export interface TaskStatistics {
  total_tasks: number;
  active_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  pending_tasks: number;
  queue_status: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  performance: {
    avg_execution_time: number;
    success_rate: number;
    tasks_per_minute: number;
  };
}

// 队列配置
export interface QueueConfig {
  name: string;
  defaultJobOptions: {
    removeOnComplete: number;
    removeOnFail: number;
    attempts: number;
    backoff: {
      type: 'exponential';
      delay: number;
    };
    delay?: number;
  };
  settings: {
    stalledInterval: number;
    maxStalledCount: number;
  };
}

// Worker配置
export interface WorkerConfig {
  concurrency: number;
  limiter?: {
    max: number;
    duration: number;
  };
  settings: {
    stalledInterval: number;
    maxStalledCount: number;
  };
}

// 任务进度更新
export interface TaskProgressUpdate {
  task_id: string;
  completed: number;
  failed: number;
  current_step?: string;
  estimated_completion?: string;
}

// 任务事件类型
export enum TaskEventType {
  CREATED = 'task.created',
  STARTED = 'task.started',
  PROGRESS = 'task.progress',
  COMPLETED = 'task.completed',
  FAILED = 'task.failed',
  CANCELLED = 'task.cancelled'
}

// 任务事件
export interface TaskEvent {
  type: TaskEventType;
  task_id: string;
  timestamp: string;
  data: any;
}

// 🆕 多次运行统计信息
export interface MultiRunStats {
  run_count: number;
  scores: number[];
  average: number;
  highest: number;
  lowest: number;
  standard_deviation: number;
  median: number;
}

// 🆕 多次运行子任务结果
export interface MultiRunSubTaskResult {
  task_id: string;
  model_id: string;
  dimension_id: string;
  evaluator_id: string;
  test_case_id: string;
  runs: EvaluationSubTask[];
  stats: MultiRunStats;
  model_name?: string;
  dimension_name?: string;
  evaluator_name?: string;
}

// 🆕 多次运行任务概览
export interface MultiRunTaskOverview {
  task_id: string;
  task_name: string;
  is_multi_run: boolean;
  run_count: number;
  dimensions: Array<{
    dimension_id: string;
    dimension_name: string;
    models: Array<{
      model_id: string;
      model_name: string;
      stats: MultiRunStats;
    }>;
  }>;
}