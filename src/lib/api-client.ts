/**
 * API客户端服务
 * 封装所有后端API调用
 */

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export interface TaskListResponse {
  tasks: Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
    started_at?: string;
    finished_at?: string;
    progress: {
      total: number;
      completed: number;
      failed: number;
    };
    template_id: string;
    model_ids: string[];
    test_case_ids: string[];
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TaskDetail {
  id: string;
  name: string;
  description?: string;
  status: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
  template_id: string;
  model_ids: string[];
  test_case_ids: string[];
  config: {
    concurrent_limit: number;
    timeout: number;
    retry_count: number;
    max_tokens?: number;  // 添加最大token配置支持
    // 🆕 多次运行配置
    run_count?: number; // 运行次数，默认为1
    human_evaluation_mode?: 'independent' | 'shared'; // 人工评分模式
  };
}

export interface CreateTaskRequest {
  name: string;
  description?: string;
  system_prompt?: string;
  template_id: string;
  model_ids: string[];
  test_case_ids: string[];
  priority?: number;
  config?: {
    concurrent_limit?: number;
    timeout?: number;
    retry_count?: number;
    max_tokens?: number;  // 修复：添加最大token配置支持
    // 🆕 多次运行配置
    run_count?: number; // 运行次数，默认为1
    human_evaluation_mode?: 'independent' | 'shared'; // 人工评分模式
  };
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  role?: string;
  status?: string; // 兼容性：字段可选
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  dimensions_count: number;
  evaluators_count: number;
  status?: string; // 兼容性：字段可选
}

export interface TestCaseSet {
  id: string;
  name: string;
  description?: string;
  test_cases_count: number;
  category?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ApiProvider {
  id: string;
  name: string;
  display_name: string;
  base_url: string;
  api_key_env_var?: string;
  headers?: Record<string, string>;
  auth_type?: string;
  request_template?: Record<string, any>;
  response_mapping?: Record<string, any>;
  rate_limit_rpm?: number;
  timeout_ms?: number;
  status?: string;
  is_builtin?: boolean;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateProviderRequest {
  name: string;
  display_name: string;
  base_url: string;
  api_key_env_var?: string;
  headers?: Record<string, string>;
  auth_type?: string;
  request_template?: Record<string, any>;
  response_mapping?: Record<string, any>;
  rate_limit_rpm?: number;
  timeout_ms?: number;
  description?: string;
}

export interface UpdateProviderRequest {
  display_name?: string;
  base_url?: string;
  api_key_env_var?: string;
  headers?: Record<string, string>;
  auth_type?: string;
  request_template?: Record<string, any>;
  response_mapping?: Record<string, any>;
  rate_limit_rpm?: number;
  timeout_ms?: number;
  status?: string;
  description?: string;
}

export interface SystemConfig {
  // 任务处理器配置
  script_check_interval: number;
  script_concurrent_limit: number;
  script_retry_delay: number;
  
  // 任务默认配置
  task_default_timeout: number;
  task_default_retry_count: number;
  task_default_concurrent_limit: number;
  
  // 系统性能配置
  max_queue_size: number;
  cleanup_interval: number;
  log_retention_days: number;
}

export interface SystemConfigResponse {
  config: SystemConfig;
  source: {
    database: boolean;
    environment: boolean;
    defaults: boolean;
  };
  timestamp: string;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    // 在浏览器环境中使用相对路径，在Node.js环境中使用完整URL
    if (typeof window !== 'undefined') {
      // 浏览器环境
      this.baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
    } else {
      // Node.js环境 (测试环境)
      this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          error: data.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return { data };
    } catch (error) {
      console.error('API request failed:', error);
      return {
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // 任务相关API
  async getTasks(params: PaginationParams = {}): Promise<ApiResponse<TaskListResponse>> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.search) searchParams.set('search', params.search);
    if (params.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return this.request<TaskListResponse>(`/api/tasks${query ? `?${query}` : ''}`);
  }

  async getTask(id: string): Promise<ApiResponse<{ task: TaskDetail }>> {
    return this.request<{ task: TaskDetail }>(`/api/tasks/${id}`);
  }

  async createTask(task: CreateTaskRequest): Promise<ApiResponse<{ task: TaskDetail; message: string }>> {
    return this.request<{ task: TaskDetail; message: string }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async controlTask(id: string, action: 'pause' | 'resume' | 'cancel'): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/tasks/${id}/control`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  async deleteTask(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/tasks/${id}`, {
      method: 'DELETE',
    });
  }

  // 模型相关API
  async getModels(limit: number = 100): Promise<ApiResponse<{ models: Model[] }>> {
    return this.request<{ models: Model[] }>(`/api/models?limit=${limit}`);
  }

  // 模板相关API
  async getTemplates(): Promise<ApiResponse<{ templates: Template[] }>> {
    return this.request<{ templates: Template[] }>('/api/templates');
  }

  // 测试用例相关API
  async getTestCaseSets(): Promise<ApiResponse<{ test_case_sets: TestCaseSet[] }>> {
    // 使用专门的test-case-sets端点，该端点已经处理了数据转换
    return this.request<{ test_case_sets: TestCaseSet[] }>('/api/test-case-sets');
  }

  // 系统指标API
  async getSystemMetrics(): Promise<ApiResponse<any>> {
    return this.request('/api/tasks/metrics');
  }

  // 任务统计API
  async getTaskStats(): Promise<ApiResponse<any>> {
    return this.request('/api/tasks/stats');
  }

  // 提供商管理API
  async getProviders(includeBuiltin = true): Promise<ApiResponse<{ providers: ApiProvider[]; total: number }>> {
    const params = new URLSearchParams();
    if (!includeBuiltin) {
      params.set('include_builtin', 'false');
    }
    
    const url = `/api/providers${params.toString() ? `?${params.toString()}` : ''}`;
    return this.request<{ providers: ApiProvider[]; total: number }>(url);
  }

  async getProvider(id: string): Promise<ApiResponse<{ provider: ApiProvider }>> {
    return this.request<{ provider: ApiProvider }>(`/api/providers/${id}`);
  }

  async createProvider(data: CreateProviderRequest): Promise<ApiResponse<{ provider: ApiProvider; message: string }>> {
    return this.request<{ provider: ApiProvider; message: string }>('/api/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProvider(id: string, data: UpdateProviderRequest): Promise<ApiResponse<{ provider: ApiProvider; message: string }>> {
    return this.request<{ provider: ApiProvider; message: string }>(`/api/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteProvider(id: string): Promise<ApiResponse<{ message: string }>> {
    return this.request<{ message: string }>(`/api/providers/${id}`, {
      method: 'DELETE',
    });
  }

  async testProvider(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/providers/${id}/test`, {
      method: 'POST',
    });
  }

  async bulkUpdateProviders(ids: string[], status: string): Promise<ApiResponse<{ providers: ApiProvider[]; message: string }>> {
    return this.request<{ providers: ApiProvider[]; message: string }>('/api/providers', {
      method: 'PUT',
      body: JSON.stringify({ ids, status }),
    });
  }

  // LLM配置管理API
  async getLLMConfig(): Promise<ApiResponse<any>> {
    return this.request('/api/llm-config');
  }

  async getLLMProviders(): Promise<ApiResponse<any>> {
    return this.request('/api/llm-config?action=providers');
  }

  async getLLMModels(providerId?: string): Promise<ApiResponse<any>> {
    const params = providerId ? `?action=models&provider_id=${providerId}` : '?action=models';
    return this.request(`/api/llm-config${params}`);
  }

  async getLLMStats(): Promise<ApiResponse<any>> {
    return this.request('/api/llm-config?action=stats');
  }

  async getDefaultLLMModel(): Promise<ApiResponse<any>> {
    return this.request('/api/llm-config?action=default');
  }

  async validateLLMModel(modelId: string): Promise<ApiResponse<any>> {
    return this.request(`/api/llm-config?action=validate&model_id=${modelId}`);
  }

  async refreshLLMConfig(): Promise<ApiResponse<any>> {
    return this.request('/api/llm-config', {
      method: 'POST',
      body: JSON.stringify({ action: 'refresh' }),
    });
  }

  async testLLMModel(modelId: string, testInput?: string): Promise<ApiResponse<any>> {
    return this.request('/api/llm-config', {
      method: 'POST',
      body: JSON.stringify({
        action: 'test',
        model_id: modelId,
        test_input: testInput
      }),
    });
  }

  // 系统配置管理方法
  async getSystemConfig(): Promise<ApiResponse<SystemConfigResponse>> {
    return this.request('/api/system/config', {
      method: 'GET',
    });
  }

  async updateSystemConfig(config: Partial<SystemConfig>): Promise<ApiResponse<any>> {
    return this.request('/api/system/config', {
      method: 'PUT',
      body: JSON.stringify({ config }),
    });
  }

  async resetSystemConfig(): Promise<ApiResponse<any>> {
    return this.request('/api/system/config', {
      method: 'POST',
      body: JSON.stringify({ action: 'reset' }),
    });
  }

  // 处理器管理方法
  async getProcessorConfig(): Promise<ApiResponse<any>> {
    return this.request('/api/processor?action=config', {
      method: 'GET',
    });
  }

  async getProcessorStatus(): Promise<ApiResponse<any>> {
    return this.request('/api/processor?action=status', {
      method: 'GET',
    });
  }

  async restartProcessor(): Promise<ApiResponse<any>> {
    return this.request('/api/processor', {
      method: 'POST',
      body: JSON.stringify({ action: 'restart' }),
    });
  }
}

export const apiClient = new ApiClient();