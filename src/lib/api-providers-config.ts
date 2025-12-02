/**
 * API Providers 默认配置
 *
 * 定义所有支持的 LLM API 提供商的默认配置
 * 用于统一 API 管理界面的初始化和标准化配置
 */

export interface ProviderConfig {
  /** 内部标识符 (唯一, 对应环境变量前缀) */
  name: string;

  /** 显示名称 (中文) */
  display_name: string;

  /** API 基础 URL */
  base_url: string;

  /** 认证类型 */
  auth_type: 'bearer' | 'custom';

  /** 默认模型 (可选) */
  default_model?: string;

  /** 环境变量键名 */
  env_key_name: string;

  /** 是否支持流式响应 */
  supports_streaming?: boolean;

  /** 支持的功能特性 */
  features?: {
    text?: boolean;      // 文本生成
    chat?: boolean;      // 对话
    vision?: boolean;    // 视觉理解
    embedding?: boolean; // 文本嵌入
  };

  /** 描述信息 */
  description?: string;

  /** 官方网站 */
  website?: string;

  /** 是否为国内提供商 */
  is_chinese?: boolean;
}

/**
 * 默认提供商配置列表
 */
export const DEFAULT_PROVIDER_CONFIGS: ProviderConfig[] = [
  // ========== 国际主流提供商 ==========
  {
    name: 'openai',
    display_name: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    auth_type: 'bearer',
    default_model: 'gpt-4o',
    env_key_name: 'OPENAI_API_KEY',
    supports_streaming: true,
    features: {
      text: true,
      chat: true,
      vision: true,
      embedding: true
    },
    description: 'OpenAI 官方 API，支持 GPT-4、GPT-4 Vision、GPT-3.5 等模型',
    website: 'https://platform.openai.com',
    is_chinese: false
  },
  {
    name: 'anthropic',
    display_name: 'Anthropic (Claude)',
    base_url: 'https://api.anthropic.com/v1',
    auth_type: 'custom',
    default_model: 'claude-3-5-sonnet-20241022',
    env_key_name: 'ANTHROPIC_API_KEY',
    supports_streaming: true,
    features: {
      text: true,
      chat: true,
      vision: true,
      embedding: false
    },
    description: 'Anthropic Claude 系列模型，包括 Claude 3.5 Sonnet、Claude 3 Opus 等',
    website: 'https://www.anthropic.com',
    is_chinese: false
  },
  {
    name: 'openrouter',
    display_name: 'OpenRouter',
    base_url: 'https://openrouter.ai/api/v1',
    auth_type: 'bearer',
    env_key_name: 'OPENROUTER_API_KEY',
    supports_streaming: true,
    features: {
      text: true,
      chat: true,
      vision: true,
      embedding: false
    },
    description: 'OpenRouter 统一 API 网关，支持多种主流模型',
    website: 'https://openrouter.ai',
    is_chinese: false
  },

  // ========== 中国主流提供商 ==========
  {
    name: 'siliconflow',
    display_name: 'SiliconFlow (硅基流动)',
    base_url: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
    auth_type: 'bearer',
    default_model: 'deepseek-ai/DeepSeek-V3',
    env_key_name: 'SILICONFLOW_API_KEY',
    supports_streaming: true,
    features: {
      text: true,
      chat: true,
      vision: true,
      embedding: true
    },
    description: 'SiliconFlow 提供 DeepSeek、Qwen、GLM 等国产模型 API',
    website: 'https://siliconflow.cn',
    is_chinese: true
  },
  {
    name: 'volcengine',
    display_name: '火山引擎 (豆包)',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    auth_type: 'bearer',
    env_key_name: 'VOLCENGINE_API_KEY',
    supports_streaming: true,
    features: {
      text: true,
      chat: true,
      vision: false,
      embedding: false
    },
    description: '字节跳动火山引擎 豆包大模型 API',
    website: 'https://www.volcengine.com/product/doubao',
    is_chinese: true
  },
  {
    name: 'zhipu',
    display_name: '智谱 AI (GLM)',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    auth_type: 'bearer',
    default_model: 'glm-4-plus',
    env_key_name: 'ZHIPU_API_KEY',
    supports_streaming: true,
    features: {
      text: true,
      chat: true,
      vision: true,
      embedding: true
    },
    description: '智谱 AI ChatGLM 系列模型 API',
    website: 'https://open.bigmodel.cn',
    is_chinese: true
  },
  {
    name: 'ali',
    display_name: '阿里云 (通义千问)',
    base_url: 'https://dashscope.aliyuncs.com/api/v1',
    auth_type: 'bearer',
    default_model: 'qwen-plus',
    env_key_name: 'ALI_API_KEY',
    supports_streaming: true,
    features: {
      text: true,
      chat: true,
      vision: true,
      embedding: true
    },
    description: '阿里云通义千问大模型 API',
    website: 'https://dashscope.aliyun.com',
    is_chinese: true
  },
  {
    name: 'moonshot',
    display_name: 'Moonshot (月之暗面)',
    base_url: 'https://api.moonshot.cn/v1',
    auth_type: 'bearer',
    default_model: 'moonshot-v1-8k',
    env_key_name: 'MOONSHOT_API_KEY',
    supports_streaming: true,
    features: {
      text: true,
      chat: true,
      vision: false,
      embedding: false
    },
    description: 'Moonshot (Kimi) 大模型 API，支持超长上下文',
    website: 'https://www.moonshot.cn',
    is_chinese: true
  },
  {
    name: 'dmx',
    display_name: 'DMX',
    base_url: 'https://api.dmx.ai/v1',
    auth_type: 'bearer',
    env_key_name: 'DMX_API_KEY',
    supports_streaming: true,
    features: {
      text: true,
      chat: true,
      vision: false,
      embedding: false
    },
    description: 'DMX 大模型 API',
    website: 'https://dmx.ai',
    is_chinese: true
  }
];

/**
 * 根据 name 查找提供商配置
 */
export function getProviderConfig(name: string): ProviderConfig | undefined {
  return DEFAULT_PROVIDER_CONFIGS.find(p => p.name === name);
}

/**
 * 获取所有国内提供商
 */
export function getChineseProviders(): ProviderConfig[] {
  return DEFAULT_PROVIDER_CONFIGS.filter(p => p.is_chinese);
}

/**
 * 获取所有国际提供商
 */
export function getInternationalProviders(): ProviderConfig[] {
  return DEFAULT_PROVIDER_CONFIGS.filter(p => !p.is_chinese);
}

/**
 * 检查环境变量中是否配置了指定提供商
 */
export function isProviderConfigured(providerName: string): boolean {
  const config = getProviderConfig(providerName);
  if (!config) return false;

  const envKey = process.env[config.env_key_name];
  return !!(envKey && envKey.trim().length > 0);
}

/**
 * 获取所有已配置的提供商列表
 */
export function getConfiguredProviders(): ProviderConfig[] {
  return DEFAULT_PROVIDER_CONFIGS.filter(p => isProviderConfigured(p.name));
}

/**
 * 获取所有未配置的提供商列表
 */
export function getUnconfiguredProviders(): ProviderConfig[] {
  return DEFAULT_PROVIDER_CONFIGS.filter(p => !isProviderConfigured(p.name));
}
