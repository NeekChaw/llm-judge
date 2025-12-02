/**
 * E2B代码沙盒集成模块主入口
 * 导出所有E2B相关的功能和类型
 */

// 核心管理器和执行器
export { 
  sandboxManager,
  E2BSandboxManager,
  type SandboxConfig,
  type CodeExecutionRequest,
  type CodeExecutionResult,
  type SandboxSession
} from './sandbox-manager';

export {
  codeExecutor,
  CodeExecutor,
  type ExecutionContext,
  type CodeTestCase,
  type CodeEvaluationRequest,
  type CodeEvaluationResult
} from './code-executor';

// 评测集成
export {
  codeEvaluationIntegrator,
  CodeEvaluationIntegrator,
  type CodeEvaluationDimension,
  type CodeEvaluationTask,
  type CodeEvaluationTaskResult
} from './evaluation-integration';

// 任务处理器集成
export {
  hasCodeEvaluationDimensions,
  getTemplateCodeDimensions,
  executeCodeEvaluationSubTask,
  shouldExecuteCodeEvaluation,
  getCodeEvaluationStats,
  type CodeEvaluationSubTask
} from './task-processor-integration';

// 工具函数
export const E2BUtils = {
  /**
   * 检查E2B API密钥是否配置
   */
  isConfigured(): boolean {
    return !!process.env.E2B_API_KEY;
  },

  /**
   * 获取E2B配置信息
   */
  getConfig() {
    return {
      apiKey: process.env.E2B_API_KEY ? '***configured***' : 'not configured',
      timeout: parseInt(process.env.E2B_TIMEOUT_MS || '300000'),
      maxConcurrentSandboxes: parseInt(process.env.E2B_MAX_CONCURRENT_SANDBOXES || '10'),
      sessionCleanupInterval: parseInt(process.env.E2B_SESSION_CLEANUP_INTERVAL || '60000')
    };
  },

  /**
   * 验证代码语言类型
   */
  isValidLanguage(language: string): language is 'python' | 'javascript' | 'typescript' | 'bash' {
    return ['python', 'javascript', 'typescript', 'bash'].includes(language);
  },

  /**
   * 从文本中提取代码块
   */
  extractCodeBlocks(text: string): Array<{ language: string; code: string }> {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const matches = Array.from(text.matchAll(codeBlockRegex));
    
    return matches.map(match => ({
      language: match[1] || 'python',
      code: match[2].trim()
    }));
  },

  /**
   * 检查文本是否包含代码
   */
  containsCode(text: string): boolean {
    // 检查代码块标记
    if (text.includes('```')) {
      return true;
    }

    // 检查常见编程关键字
    const codeKeywords = [
      'def ', 'class ', 'import ', 'from ', 'function', 'const ', 'let ', 'var ',
      'if __name__', 'return ', 'print(', 'console.log', 'for ', 'while ', 'try:'
    ];

    return codeKeywords.some(keyword => text.includes(keyword));
  },

  /**
   * 格式化执行时间
   */
  formatExecutionTime(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(1);
      return `${minutes}m ${seconds}s`;
    }
  },

  /**
   * 格式化内存使用
   */
  formatMemoryUsage(mb: number): string {
    if (mb < 1024) {
      return `${mb.toFixed(1)}MB`;
    } else {
      return `${(mb / 1024).toFixed(1)}GB`;
    }
  }
};

// 常量定义
export const E2B_CONSTANTS = {
  // 支持的编程语言
  SUPPORTED_LANGUAGES: ['python', 'javascript', 'typescript', 'bash'] as const,
  
  // 默认配置
  DEFAULT_TIMEOUT: 300000, // 5分钟
  DEFAULT_MAX_CONCURRENT_SANDBOXES: 10,
  DEFAULT_SESSION_CLEANUP_INTERVAL: 60000, // 1分钟
  
  // 执行状态
  EXECUTION_STATUS: {
    SUCCESS: 'success',
    ERROR: 'error',
    TIMEOUT: 'timeout'
  } as const,
  
  // 任务状态
  TASK_STATUS: {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
  } as const
};

// 类型定义
export type SupportedLanguage = typeof E2B_CONSTANTS.SUPPORTED_LANGUAGES[number];
export type ExecutionStatus = typeof E2B_CONSTANTS.EXECUTION_STATUS[keyof typeof E2B_CONSTANTS.EXECUTION_STATUS];
export type TaskStatus = typeof E2B_CONSTANTS.TASK_STATUS[keyof typeof E2B_CONSTANTS.TASK_STATUS];

// 错误类定义
export class E2BError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'E2BError';
  }
}

export class E2BTimeoutError extends E2BError {
  constructor(timeout: number) {
    super(`代码执行超时 (${timeout}ms)`);
    this.name = 'E2BTimeoutError';
    this.code = 'TIMEOUT';
  }
}

export class E2BConfigurationError extends E2BError {
  constructor(message: string) {
    super(`E2B配置错误: ${message}`);
    this.name = 'E2BConfigurationError';
    this.code = 'CONFIGURATION_ERROR';
  }
}

// 初始化检查
if (typeof window === 'undefined') { // 只在服务器端运行
  if (!E2BUtils.isConfigured()) {
    console.warn('⚠️ E2B API密钥未配置，代码执行功能将不可用');
  } else {
    console.log('✅ E2B代码沙盒模块已加载');
  }
}
