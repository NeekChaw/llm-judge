// 硅基流动API客户端
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class SiliconFlowClient {
  private apiKey: string;
  private baseURL: string;

  constructor(skipValidation = false) {
    this.apiKey = process.env.SILICONFLOW_API_KEY!;
    this.baseURL = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';

    // Skip validation during build time or if explicitly requested
    if (!skipValidation && !this.apiKey) {
      throw new Error('SILICONFLOW_API_KEY environment variable is required');
    }
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SiliconFlow API error: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  // 常用的模型列表
  static readonly MODELS = {
    // 通用模型
    'gpt-3.5-turbo': 'gpt-3.5-turbo',
    'gpt-4': 'gpt-4',
    'claude-3-haiku': 'claude-3-haiku-20240307',
    'claude-3-sonnet': 'claude-3-sonnet-20240229',

    // 国产模型
    'qwen-plus': 'Qwen/Qwen2-7B-Instruct',
    'qwen-turbo': 'Qwen/Qwen2-1.5B-Instruct',
    'glm-4': 'THUDM/glm-4-9b-chat',
    'deepseek-chat': 'deepseek-ai/DeepSeek-V2-Chat',

    // 代码专用模型
    'deepseek-coder': 'deepseek-ai/DeepSeek-Coder-V2-Instruct',
    'codellama': 'codellama/CodeLlama-13b-Instruct-hf',
  } as const;
}

// 懒加载单例实例 - 只在首次使用时初始化，避免构建时错误
let _siliconFlowClient: SiliconFlowClient | null = null;

export const siliconFlowClient = new Proxy({} as SiliconFlowClient, {
  get(_target, prop) {
    // 延迟初始化：只在实际使用时创建实例
    if (!_siliconFlowClient) {
      _siliconFlowClient = new SiliconFlowClient();
    }
    return _siliconFlowClient[prop as keyof SiliconFlowClient];
  }
});