/**
 * E2B与评测系统集成模块
 * 将代码执行功能集成到现有的评测流程中
 */

import { codeExecutor, CodeEvaluationRequest, CodeEvaluationResult } from './code-executor';
import { logger } from '@/lib/monitoring';
import { supabase } from '@/lib/supabase';

export interface CodeEvaluationDimension {
  id: string;
  name: string;
  description: string;
  language: 'python' | 'javascript' | 'typescript' | 'bash';
  testCases: Array<{
    name: string;
    input?: any;
    expectedOutput?: any;
    timeout?: number;
  }>;
  setupCode?: string;
  teardownCode?: string;
  weight: number; // 权重，用于计算总分
}

export interface CodeEvaluationTask {
  taskId: string;
  subtaskId: string;
  modelResponse: string;
  dimensions: CodeEvaluationDimension[];
  context?: {
    userId?: string;
    metadata?: Record<string, any>;
  };
}

export interface CodeEvaluationTaskResult {
  taskId: string;
  subtaskId: string;
  overallScore: number;
  dimensionResults: Array<{
    dimension: CodeEvaluationDimension;
    result: CodeEvaluationResult;
    score: number;
    weight: number;
  }>;
  totalExecutionTime: number;
  feedback: string;
  success: boolean;
}

/**
 * 代码评测集成器
 */
export class CodeEvaluationIntegrator {
  /**
   * 执行完整的代码评测任务
   */
  async evaluateCodeTask(task: CodeEvaluationTask): Promise<CodeEvaluationTaskResult> {
    const startTime = Date.now();
    
    try {
      logger.info('开始代码评测任务', {
        taskId: task.taskId,
        subtaskId: task.subtaskId,
        dimensionsCount: task.dimensions.length,
        modelResponseLength: task.modelResponse.length
      });

      // 从模型响应中提取代码
      const extractedCode = this.extractCodeFromResponse(task.modelResponse);
      
      if (!extractedCode) {
        throw new Error('无法从模型响应中提取有效代码');
      }

      const dimensionResults = [];
      let totalWeightedScore = 0;
      let totalWeight = 0;

      // 逐个评估每个维度
      for (const dimension of task.dimensions) {
        try {
          logger.info('评估代码维度', {
            taskId: task.taskId,
            dimensionId: dimension.id,
            dimensionName: dimension.name,
            language: dimension.language
          });

          const evaluationRequest: CodeEvaluationRequest = {
            code: extractedCode.code,
            language: dimension.language,
            testCases: dimension.testCases,
            setupCode: dimension.setupCode,
            teardownCode: dimension.teardownCode,
            context: {
              taskId: task.taskId,
              subtaskId: task.subtaskId,
              userId: task.context?.userId,
              metadata: {
                dimensionId: dimension.id,
                dimensionName: dimension.name,
                ...task.context?.metadata
              }
            }
          };

          const result = await codeExecutor.executeAndEvaluate(evaluationRequest);
          
          // 应用维度权重
          const weightedScore = (result.score || 0) * dimension.weight;
          totalWeightedScore += weightedScore;
          totalWeight += dimension.weight;

          dimensionResults.push({
            dimension,
            result,
            score: result.score || 0,
            weight: dimension.weight
          });

          // 保存维度评测结果到数据库
          await this.saveCodeExecutionResult(task.subtaskId, dimension, result, extractedCode);

          logger.info('代码维度评估完成', {
            taskId: task.taskId,
            dimensionId: dimension.id,
            score: result.score,
            success: result.success,
            executionTime: result.metrics.totalExecutionTime
          });

        } catch (error) {
          logger.error('代码维度评估失败', error, {
            taskId: task.taskId,
            dimensionId: dimension.id,
            dimensionName: dimension.name
          });

          // 记录失败的维度
          dimensionResults.push({
            dimension,
            result: {
              success: false,
              executionResult: {
                success: false,
                stdout: '',
                stderr: error instanceof Error ? error.message : 'Unknown error',
                executionTime: 0,
                exitCode: 1,
                error: error instanceof Error ? error.message : 'Unknown error'
              },
              score: 0,
              feedback: `维度评估失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
              metrics: {
                totalExecutionTime: 0,
                testsPassed: 0,
                testsTotal: dimension.testCases.length
              }
            },
            score: 0,
            weight: dimension.weight
          });

          totalWeight += dimension.weight;
        }
      }

      // 计算总分
      const overallScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0;
      const totalExecutionTime = Date.now() - startTime;

      // 生成综合反馈
      const feedback = this.generateOverallFeedback(dimensionResults, extractedCode);

      const taskResult: CodeEvaluationTaskResult = {
        taskId: task.taskId,
        subtaskId: task.subtaskId,
        overallScore,
        dimensionResults,
        totalExecutionTime,
        feedback,
        success: dimensionResults.some(r => r.result.success)
      };

      logger.info('代码评测任务完成', {
        taskId: task.taskId,
        subtaskId: task.subtaskId,
        overallScore,
        totalExecutionTime,
        successfulDimensions: dimensionResults.filter(r => r.result.success).length,
        totalDimensions: dimensionResults.length
      });

      return taskResult;

    } catch (error) {
      const totalExecutionTime = Date.now() - startTime;
      
      logger.error('代码评测任务失败', error, {
        taskId: task.taskId,
        subtaskId: task.subtaskId,
        totalExecutionTime
      });

      return {
        taskId: task.taskId,
        subtaskId: task.subtaskId,
        overallScore: 0,
        dimensionResults: [],
        totalExecutionTime,
        feedback: `评测任务失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        success: false
      };
    }
  }

  /**
   * 从模型响应中提取代码
   */
  private extractCodeFromResponse(response: string): { code: string; language: string } | null {
    try {
      // 尝试匹配代码块
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
      const matches = Array.from(response.matchAll(codeBlockRegex));

      if (matches.length > 0) {
        const match = matches[0];
        const language = match[1] || 'python';
        const code = match[2].trim();
        
        return { code, language };
      }

      // 如果没有代码块，尝试提取Python代码（基于缩进）
      const lines = response.split('\n');
      const codeLines = [];
      let inCodeBlock = false;

      for (const line of lines) {
        // 检测是否是代码行（以空格或tab开头，或包含常见编程关键字）
        if (line.match(/^[\s]*(?:def|class|import|from|if|for|while|try|with|return)/)) {
          inCodeBlock = true;
        }
        
        if (inCodeBlock) {
          codeLines.push(line);
          
          // 如果遇到空行且下一行不是代码，结束代码块
          if (line.trim() === '' && !lines[lines.indexOf(line) + 1]?.match(/^[\s]/)) {
            break;
          }
        }
      }

      if (codeLines.length > 0) {
        return { code: codeLines.join('\n').trim(), language: 'python' };
      }

      return null;
    } catch (error) {
      logger.error('提取代码失败', error, { responseLength: response.length });
      return null;
    }
  }

  /**
   * 保存代码执行结果到数据库
   */
  private async saveCodeExecutionResult(
    subtaskId: string,
    dimension: CodeEvaluationDimension,
    result: CodeEvaluationResult,
    extractedCode: { code: string; language: string }
  ): Promise<void> {
    try {
      if (!supabase) {
        logger.warn('Supabase未配置，跳过保存代码执行结果', {
          subtaskId,
          dimensionId: dimension.id
        });
        return;
      }

      const { data: executionResult, error } = await supabase
        .from('code_execution_results')
        .insert({
          evaluation_result_id: subtaskId,
          sandbox_id: result.executionResult.sandboxId || 'e2b_session',
          code: extractedCode.code,
          language: extractedCode.language,
          execution_status: result.success ? 'success' : 'error',
          stdout: result.executionResult.stdout,
          stderr: result.executionResult.stderr,
          execution_time_ms: result.metrics.totalExecutionTime,
          memory_usage_mb: result.metrics.memoryUsage,
          exit_code: result.executionResult.exitCode || 0,
          files_created: result.executionResult.files || [],
          test_results: {
            passed: result.metrics.testsPassed || 0,
            total: result.metrics.testsTotal || 0,
            syntax_correct: result.success,
            functional_correct: result.metrics.testsPassed === result.metrics.testsTotal,
            details: result.testResults || []
          },
          metrics: {
            totalExecutionTime: result.metrics.totalExecutionTime,
            memoryUsage: result.metrics.memoryUsage,
            testsPassed: result.metrics.testsPassed,
            testsTotal: result.metrics.testsTotal
          },
          debug_info: {
            sessionLogs: [],
            environmentVars: {},
            workingDirectory: '/tmp',
            pythonVersion: null,
            installedPackages: []
          },
          working_directory: '/tmp',
          python_version: null,
          environment_vars: {},
          session_logs: [],
          installed_packages: []
        })
        .select('id')
        .single();

      if (error) {
        logger.error('保存代码执行结果失败', error, {
          subtaskId,
          dimensionId: dimension.id
        });
      } else {
        logger.info('代码执行结果已保存', {
          subtaskId,
          dimensionId: dimension.id,
          codeExecutionResultId: executionResult.id,
          success: result.success
        });

        // 更新evaluation_results表，建立关联
        const { error: linkError } = await supabase
          .from('evaluation_results')
          .update({
            code_execution_result_id: executionResult.id,
            execution_details: {
              hasCodeExecution: true,
              codeExecutionResultId: executionResult.id,
              executionTime: result.metrics.totalExecutionTime,
              testsPassed: result.metrics.testsPassed,
              testsTotal: result.metrics.testsTotal
            }
          })
          .eq('id', subtaskId);

        if (linkError) {
          logger.error('建立代码执行结果关联失败', linkError, {
            subtaskId,
            codeExecutionResultId: executionResult.id
          });
        } else {
          logger.info('代码执行结果关联已建立', {
            subtaskId,
            codeExecutionResultId: executionResult.id
          });
        }
      }
    } catch (error) {
      logger.error('保存代码执行结果异常', error, {
        subtaskId,
        dimensionId: dimension.id
      });
    }
  }

  /**
   * 生成综合反馈
   */
  private generateOverallFeedback(
    dimensionResults: Array<{
      dimension: CodeEvaluationDimension;
      result: CodeEvaluationResult;
      score: number;
      weight: number;
    }>,
    extractedCode: { code: string; language: string }
  ): string {
    const feedback: string[] = [];

    feedback.push(`🔍 代码分析结果 (${extractedCode.language})`);
    feedback.push(`📝 代码长度: ${extractedCode.code.length} 字符`);
    feedback.push('');

    const successfulDimensions = dimensionResults.filter(r => r.result.success);
    const failedDimensions = dimensionResults.filter(r => !r.result.success);

    feedback.push(`📊 评估维度: ${successfulDimensions.length}/${dimensionResults.length} 个维度通过`);
    feedback.push('');

    // 成功的维度
    if (successfulDimensions.length > 0) {
      feedback.push('✅ 通过的维度:');
      successfulDimensions.forEach(dr => {
        feedback.push(`  - ${dr.dimension.name}: ${dr.score}/100 分`);
        if (dr.result.metrics.testsTotal > 0) {
          feedback.push(`    测试用例: ${dr.result.metrics.testsPassed}/${dr.result.metrics.testsTotal} 通过`);
        }
      });
      feedback.push('');
    }

    // 失败的维度
    if (failedDimensions.length > 0) {
      feedback.push('❌ 未通过的维度:');
      failedDimensions.forEach(dr => {
        feedback.push(`  - ${dr.dimension.name}: ${dr.result.feedback}`);
      });
      feedback.push('');
    }

    // 性能分析
    const totalExecutionTime = dimensionResults.reduce((sum, dr) => sum + dr.result.metrics.totalExecutionTime, 0);
    feedback.push(`⏱️ 总执行时间: ${totalExecutionTime}ms`);

    // 建议
    if (failedDimensions.length > 0) {
      feedback.push('');
      feedback.push('💡 改进建议:');
      feedback.push('  - 检查代码语法和逻辑错误');
      feedback.push('  - 确保代码满足所有测试用例要求');
      feedback.push('  - 考虑代码的性能和可读性');
    }

    return feedback.join('\n');
  }
}

// 全局代码评测集成器实例
export const codeEvaluationIntegrator = new CodeEvaluationIntegrator();
