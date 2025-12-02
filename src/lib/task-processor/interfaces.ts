/**
 * 任务处理器统一接口定义
 */

export interface TaskConfig {
  template_id: string;
  model_ids: string[];
  test_case_ids: string[];
  concurrent_limit?: number;
  timeout?: number;
  retry_count?: number;
}

export interface TaskData {
  id: string;
  name: string;
  description?: string;
  config: TaskConfig;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface SubTaskData {
  id: string;
  task_id: string;
  test_case_id: string;
  model_id: string;
  dimension_id: string;
  evaluator_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  score?: number;
  justification?: string;
  model_response?: string;
  execution_time?: number;
  error_message?: string;
}

export interface ProcessingResult {
  success: boolean;
  task_id: string;
  subtasks_created?: number;
  subtasks_processed?: number;
  error?: string;
  execution_time?: number;
}

export interface ProcessorStatus {
  mode: 'redis' | 'script';
  status: 'running' | 'stopped' | 'error';
  active_tasks: number;
  pending_subtasks: number;
  processed_today: number;
  last_activity: string;
  health_check: {
    redis_connected?: boolean;
    database_connected: boolean;
    llm_api_available: boolean;
  };
}

/**
 * 任务处理器统一接口
 */
export interface ITaskProcessor {
  readonly mode: 'redis' | 'script';

  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;

  processTask(taskData: TaskData): Promise<ProcessingResult>;
  processSubTask(subTaskData: SubTaskData): Promise<ProcessingResult>;

  getStatus(): Promise<ProcessorStatus>;
  healthCheck(): Promise<boolean>;

  pauseTask(taskId: string): Promise<boolean>;
  resumeTask(taskId: string): Promise<boolean>;
  cancelTask(taskId: string): Promise<boolean>;

  getTaskProgress(taskId: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    progress_percentage: number;
  }>;

  cleanup(): Promise<void>;
}

/**
 * 处理器配置
 */
export interface ProcessorConfig {
  mode: 'redis' | 'script';
  redis?: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  script?: {
    check_interval: number;
    concurrent_limit: number;
    retry_delay: number;
  };
  llm?: {
    api_key: string;
    base_url?: string;
    timeout?: number;
  };
  database?: {
    url: string;
    key: string;
  };
}

/**
 * 处理器工厂接口
 */
export interface ITaskProcessorFactory {
  createProcessor(config: ProcessorConfig): Promise<ITaskProcessor>;
  getAvailableModes(): Promise<string[]>;
  detectBestMode(config: ProcessorConfig): Promise<'redis' | 'script'>;
}
