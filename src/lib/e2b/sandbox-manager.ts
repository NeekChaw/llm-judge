/**
 * E2B沙盒管理器
 * 负责创建、管理和销毁E2B代码执行沙盒
 */

import { Sandbox } from '@e2b/code-interpreter';
import { logger } from '@/lib/monitoring';

export interface SandboxConfig {
  timeoutMs?: number;
  metadata?: Record<string, any>;
  envVars?: Record<string, string>;
}

export interface CodeExecutionRequest {
  code: string;
  language?: 'python' | 'javascript' | 'typescript' | 'bash';
  files?: Array<{
    name: string;
    content: string;
  }>;
  timeout?: number;
}

export interface CodeExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  executionTime: number;
  memoryUsage?: number;
  exitCode?: number;
  files?: Array<{
    name: string;
    content: string;
  }>;
  error?: string;
  // 🔧 添加沙盒信息字段
  sessionId?: string;
  sandboxId?: string;
}

export interface SandboxSession {
  id: string;
  sandbox: Sandbox;
  createdAt: Date;
  lastUsed: Date;
  executionCount: number;
}

/**
 * E2B沙盒管理器类
 */
export class E2BSandboxManager {
  private sessions: Map<string, SandboxSession> = new Map();
  private readonly defaultTimeout: number;
  private readonly maxConcurrentSandboxes: number;
  private readonly sessionCleanupInterval: NodeJS.Timeout;

  constructor() {
    this.defaultTimeout = parseInt(process.env.E2B_TIMEOUT_MS || '300000'); // 5分钟
    this.maxConcurrentSandboxes = parseInt(process.env.E2B_MAX_CONCURRENT_SANDBOXES || '10');
    
    // 定期清理过期会话
    this.sessionCleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // 每分钟检查一次

    logger.info('E2B沙盒管理器初始化完成', {
      defaultTimeout: this.defaultTimeout,
      maxConcurrentSandboxes: this.maxConcurrentSandboxes
    });
  }

  /**
   * 创建新的沙盒会话
   */
  async createSession(config: SandboxConfig = {}): Promise<string> {
    try {
      // 检查并发限制
      if (this.sessions.size >= this.maxConcurrentSandboxes) {
        await this.cleanupOldestSession();
      }

      const timeoutMs = config.timeoutMs || this.defaultTimeout;
      
      logger.info('创建E2B沙盒', {
        timeoutMs,
        metadata: config.metadata,
        currentSessions: this.sessions.size
      });

      const sandbox = await Sandbox.create({
        timeoutMs,
        metadata: config.metadata
      });

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const session: SandboxSession = {
        id: sessionId,
        sandbox,
        createdAt: new Date(),
        lastUsed: new Date(),
        executionCount: 0
      };

      this.sessions.set(sessionId, session);

      logger.info('E2B沙盒创建成功', {
        sessionId,
        sandboxId: sandbox.sandboxId,
        timeoutMs
      });

      return sessionId;
    } catch (error) {
      logger.error('创建E2B沙盒失败', error, {
        config,
        currentSessions: this.sessions.size
      });
      throw new Error(`创建沙盒失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 执行代码
   */
  async executeCode(sessionId: string, request: CodeExecutionRequest): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`沙盒会话不存在: ${sessionId}`);
      }

      // 更新会话使用时间
      session.lastUsed = new Date();
      session.executionCount++;

      logger.info('开始执行代码', {
        sessionId,
        language: request.language || 'python',
        codeLength: request.code.length,
        filesCount: request.files?.length || 0
      });

      // 上传文件（如果有）
      if (request.files && request.files.length > 0) {
        for (const file of request.files) {
          await session.sandbox.files.write(file.name, file.content);
          logger.info('文件上传成功', {
            sessionId,
            fileName: file.name,
            fileSize: file.content.length
          });
        }
      }

      // 执行代码
      const execution = await session.sandbox.runCode(request.code, {
        onStdout: (data) => {
          logger.info('代码执行输出', {
            sessionId,
            stdout: data.line
          });
        },
        onStderr: (data) => {
          logger.warn('代码执行错误输出', {
            sessionId,
            stderr: data.line
          });
        }
      });

      const executionTime = Date.now() - startTime;

      // 获取执行后的文件列表
      const files: Array<{ name: string; content: string }> = [];
      try {
        const fileList = await session.sandbox.files.list('/tmp');
        for (const file of fileList) {
          if (file.type === 'file' && file.name.endsWith('.txt') || file.name.endsWith('.json') || file.name.endsWith('.csv')) {
            const content = await session.sandbox.files.read(file.path);
            files.push({
              name: file.name,
              content: content
            });
          }
        }
      } catch (error) {
        logger.warn('获取输出文件失败', error, { sessionId });
      }

      const result: CodeExecutionResult = {
        success: !execution.error,
        stdout: execution.logs.stdout.join('\n'),
        stderr: execution.logs.stderr.join('\n'),
        executionTime,
        exitCode: execution.error ? 1 : 0,
        files,
        error: execution.error?.name || undefined,
        // 🔧 添加沙盒信息到返回结果
        sessionId: sessionId,
        sandboxId: session.sandbox.id || sessionId
      };

      logger.info('代码执行完成', {
        sessionId,
        success: result.success,
        executionTime,
        stdoutLength: result.stdout.length,
        stderrLength: result.stderr.length,
        filesGenerated: files.length
      });

      // 如果有输出，记录输出内容
      if (result.stdout) {
        logger.info('代码执行输出', {
          sessionId,
          stdout: result.stdout.substring(0, 500) // 限制长度避免日志过长
        });
      }

      // 如果有错误，记录错误内容
      if (result.stderr) {
        logger.warn('代码执行错误', {
          sessionId,
          stderr: result.stderr.substring(0, 500)
        });
      }

      // 如果执行失败但没有错误信息，记录详细信息
      if (!result.success && !result.stderr) {
        logger.warn('代码执行失败但无错误信息', {
          sessionId,
          language,
          codeLength: code.length,
          executionTime,
          exitCode: result.exitCode
        });
      }

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      logger.error('代码执行失败', error, {
        sessionId,
        executionTime,
        request: {
          language: request.language,
          codeLength: request.code.length
        }
      });

      return {
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
        exitCode: 1,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 获取会话信息
   */
  getSessionInfo(sessionId: string): SandboxSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 销毁会话
   */
  async destroySession(sessionId: string): Promise<void> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        logger.warn('尝试销毁不存在的会话', { sessionId });
        return;
      }

      await session.sandbox.kill();
      this.sessions.delete(sessionId);

      logger.info('沙盒会话已销毁', {
        sessionId,
        executionCount: session.executionCount,
        duration: Date.now() - session.createdAt.getTime()
      });
    } catch (error) {
      logger.error('销毁沙盒会话失败', error, { sessionId });
      // 即使销毁失败，也要从本地记录中移除
      this.sessions.delete(sessionId);
    }
  }

  /**
   * 获取活跃会话统计
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());
    return {
      totalSessions: sessions.length,
      totalExecutions: sessions.reduce((sum, s) => sum + s.executionCount, 0),
      oldestSession: sessions.length > 0 ? Math.min(...sessions.map(s => s.createdAt.getTime())) : null,
      newestSession: sessions.length > 0 ? Math.max(...sessions.map(s => s.createdAt.getTime())) : null
    };
  }

  /**
   * 清理过期会话
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      // 超过30分钟未使用的会话视为过期
      if (now - session.lastUsed.getTime() > 30 * 60 * 1000) {
        expiredSessions.push(sessionId);
      }
    }

    if (expiredSessions.length > 0) {
      logger.info('清理过期沙盒会话', {
        expiredCount: expiredSessions.length,
        totalSessions: this.sessions.size
      });

      for (const sessionId of expiredSessions) {
        await this.destroySession(sessionId);
      }
    }
  }

  /**
   * 清理最旧的会话以释放资源
   */
  private async cleanupOldestSession(): Promise<void> {
    if (this.sessions.size === 0) return;

    let oldestSessionId: string | null = null;
    let oldestTime = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastUsed.getTime() < oldestTime) {
        oldestTime = session.lastUsed.getTime();
        oldestSessionId = sessionId;
      }
    }

    if (oldestSessionId) {
      logger.info('清理最旧的沙盒会话以释放资源', {
        sessionId: oldestSessionId,
        lastUsed: new Date(oldestTime).toISOString()
      });
      await this.destroySession(oldestSessionId);
    }
  }

  /**
   * 销毁所有会话
   */
  async destroyAll(): Promise<void> {
    logger.info('销毁所有沙盒会话', {
      totalSessions: this.sessions.size
    });

    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.destroySession(id)));

    clearInterval(this.sessionCleanupInterval);
  }
}

// 全局沙盒管理器实例
export const sandboxManager = new E2BSandboxManager();
