/**
 * E2B统一架构集成模块
 * 确保E2B代码执行功能完全集成到现有评测系统中
 */

import { codeExecutor } from './code-executor';
import { logger } from '@/lib/monitoring';
import { ConfigurableScorer, EvaluationResult as ScorerEvaluationResult } from './configurable-scorer';
import { CodeScoringRules, DEFAULT_SCORING_RULES } from './scoring-rules';
import { supabase } from '@/lib/supabase';

// 使用现有的数据库类型定义
interface EvaluationResult {
  id: number;
  task_id: string;
  test_case_id: string;
  model_id: string;
  dimension_id: string;
  evaluator_id: string;
  model_response: any;
  score: number;
  justification: string;
  status: 'success' | 'failed';
  created_at: string;
}

interface CodeEvaluatorConfig {
  language: 'python' | 'javascript' | 'typescript' | 'bash';
  timeout?: number;
  testCases?: Array<{
    name: string;
    description?: string;
    input?: any;
    expectedOutput?: any;
  }>;
  setupCode?: string;
  teardownCode?: string;
}

/**
 * CODE类型评分器处理器
 * 实现与现有评分器相同的接口，确保完全统一
 */
export class CodeEvaluatorProcessor {
  private scorer: ConfigurableScorer;

  constructor(scoringRules?: CodeScoringRules) {
    this.scorer = new ConfigurableScorer(scoringRules || DEFAULT_SCORING_RULES);
  }

  /**
   * 更新评分规则
   */
  updateScoringRules(rules: CodeScoringRules): void {
    this.scorer.updateRules(rules);
  }

  /**
   * 获取当前评分规则
   */
  getScoringRules(): CodeScoringRules {
    return this.scorer.getRules();
  }

  /**
   * 处理CODE类型的评分器
   * 这是与现有PROMPT、REGEX等评分器完全一致的接口
   */
  async processEvaluation(
    evaluatorConfig: CodeEvaluatorConfig,
    testCaseInput: string,
    modelResponse: string,
    context: {
      taskId: string;
      testCaseId: string;
      modelId: string;
      dimensionId: string;
      evaluatorId: string;
    }
  ): Promise<{
    score: number;
    justification: string;
    status: 'success' | 'failed';
    executionDetails?: any;
  }> {
    try {
      logger.info('开始CODE类型评分器处理', {
        evaluatorId: context.evaluatorId,
        language: evaluatorConfig.language,
        modelResponseLength: modelResponse.length
      });

      // 1. 从模型响应中提取代码
      const extractedCode = this.extractCodeFromResponse(modelResponse, evaluatorConfig.language);
      
      if (!extractedCode) {
        return {
          score: 0,
          justification: '未能从模型响应中提取有效代码',
          status: 'failed'
        };
      }

      // 2. 使用E2B执行代码评估
      const evaluationResult = await codeExecutor.executeAndEvaluate({
        code: extractedCode,
        language: evaluatorConfig.language,
        testCases: evaluatorConfig.testCases?.map(tc => ({
          name: tc.name,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          timeout: evaluatorConfig.timeout
        })),
        setupCode: evaluatorConfig.setupCode,
        teardownCode: evaluatorConfig.teardownCode,
        context: {
          taskId: context.taskId,
          subtaskId: `${context.taskId}_${context.testCaseId}`,
          metadata: {
            evaluatorId: context.evaluatorId,
            dimensionId: context.dimensionId,
            modelId: context.modelId
          }
        }
      });

      // 3. 实现可配置的多层次评分机制
      const scorerEvaluationResult: ScorerEvaluationResult = {
        success: evaluationResult.success,
        executionResult: {
          stdout: evaluationResult.executionResult.stdout,
          stderr: evaluationResult.executionResult.stderr,
          sessionId: evaluationResult.executionResult.sessionId,
          sandboxId: evaluationResult.executionResult.sandboxId
        },
        metrics: {
          testsPassed: evaluationResult.metrics.testsPassed || 0,
          testsTotal: evaluationResult.metrics.testsTotal || 0,
          totalExecutionTime: evaluationResult.metrics.totalExecutionTime || 0,
          memoryUsage: evaluationResult.metrics.memoryUsage
        }
      };

      const multilevelScore = this.scorer.calculateScore(scorerEvaluationResult);

      const result = {
        score: multilevelScore.finalScore,
        justification: multilevelScore.justification,
        status: evaluationResult.success ? 'success' as const : 'failed' as const,
        executionDetails: {
          executionTime: evaluationResult.metrics.totalExecutionTime,
          testsPassed: evaluationResult.metrics.testsPassed,
          testsTotal: evaluationResult.metrics.testsTotal,
          stdout: evaluationResult.executionResult.stdout,
          stderr: evaluationResult.executionResult.stderr,
          memoryUsage: evaluationResult.metrics.memoryUsage,
          executionStatus: evaluationResult.success ? 'success' as const : 'failed' as const,
          syntaxCorrect: multilevelScore.syntaxCorrect,
          functionalCorrect: multilevelScore.functionalCorrect,
          // 🔧 添加沙盒信息
          sessionId: evaluationResult.executionResult.sessionId,
          sandboxId: evaluationResult.executionResult.sandboxId,
          // 🔧 添加详细评分信息
          scoringBreakdown: multilevelScore.breakdown,
          appliedScoringRules: multilevelScore.appliedRules
        }
      };

      logger.info('CODE类型评分器处理完成', {
        evaluatorId: context.evaluatorId,
        score: result.score,
        success: result.status === 'success',
        executionTime: evaluationResult.metrics.totalExecutionTime
      });

      return result;

    } catch (error) {
      logger.error('CODE类型评分器处理失败', error, {
        evaluatorId: context.evaluatorId,
        context
      });

      return {
        score: 0,
        justification: `代码执行失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'failed'
      };
    }
  }

  /**
   * 保存评测结果到现有的evaluation_results表
   * 详细的执行信息保存到补充表中
   */
  async saveEvaluationResult(
    result: {
      score: number;
      justification: string;
      status: 'success' | 'failed';
      executionDetails?: any;
    },
    context: {
      taskId: string;
      testCaseId: string;
      modelId: string;
      dimensionId: string;
      evaluatorId: string;
    },
    modelResponse: string
  ): Promise<number | null> {
    try {
      if (!supabase) {
        logger.warn('Supabase未配置，无法保存评测结果');
        return null;
      }

      // 1. 保存主要结果到evaluation_results表（与其他评分器完全一致）
      const { data: evaluationResult, error: evaluationError } = await supabase
        .from('evaluation_results')
        .insert({
          task_id: context.taskId,
          test_case_id: context.testCaseId,
          model_id: context.modelId,
          dimension_id: context.dimensionId,
          evaluator_id: context.evaluatorId,
          model_response: modelResponse,
          score: result.score,
          justification: result.justification,
          status: result.status
        })
        .select('id')
        .single();

      if (evaluationError) {
        logger.error('保存评测结果失败', evaluationError, { context });
        return null;
      }

      const evaluationResultId = evaluationResult.id;

      // 2. 保存详细执行信息到code_execution_results表（仅CODE类型特有）
      if (result.executionDetails) {
        const { data: executionResult, error: detailsError } = await supabase
          .from('code_execution_results')
          .insert({
            evaluation_result_id: evaluationResultId,
            sandbox_id: result.executionDetails.sandboxId || 'e2b_session',
            code: result.executionDetails.code || '',
            language: result.executionDetails.language || 'python',
            execution_status: result.status === 'success' ? 'success' : 'error',
            stdout: result.executionDetails.stdout,
            stderr: result.executionDetails.stderr,
            execution_time_ms: result.executionDetails.executionTime,
            memory_usage_mb: result.executionDetails.memoryUsage,
            exit_code: result.executionDetails.exitCode || 0,
            files_created: result.executionDetails.filesCreated || [],
            test_results: {
              passed: result.executionDetails.testsPassed || 0,
              total: result.executionDetails.testsTotal || 0,
              syntax_correct: result.executionDetails.syntaxCorrect || false,
              functional_correct: result.executionDetails.functionalCorrect || false,
              details: result.executionDetails.testDetails || []
            },
            metrics: {
              totalExecutionTime: result.executionDetails.executionTime,
              memoryUsage: result.executionDetails.memoryUsage,
              testsPassed: result.executionDetails.testsPassed,
              testsTotal: result.executionDetails.testsTotal
            },
            debug_info: {
              sessionLogs: result.executionDetails.sessionLogs || [],
              environmentVars: result.executionDetails.environmentVars || {},
              workingDirectory: result.executionDetails.workingDirectory || '/tmp',
              pythonVersion: result.executionDetails.pythonVersion,
              installedPackages: result.executionDetails.installedPackages || []
            },
            working_directory: result.executionDetails.workingDirectory || '/tmp',
            python_version: result.executionDetails.pythonVersion,
            environment_vars: result.executionDetails.environmentVars || {},
            session_logs: result.executionDetails.sessionLogs || [],
            installed_packages: result.executionDetails.installedPackages || []
          })
          .select('id')
          .single();

        if (detailsError) {
          logger.error('保存代码执行详情失败', detailsError, {
            evaluationResultId,
            context
          });
        } else {
          logger.info('代码执行详情已保存', {
            evaluationResultId,
            codeExecutionResultId: executionResult.id,
            executionTime: result.executionDetails.executionTime
          });

          // 3. 更新evaluation_results表，建立关联
          const { error: linkError } = await supabase
            .from('evaluation_results')
            .update({
              code_execution_result_id: executionResult.id,
              execution_details: {
                hasCodeExecution: true,
                codeExecutionResultId: executionResult.id,
                executionTime: result.executionDetails.executionTime,
                testsPassed: result.executionDetails.testsPassed,
                testsTotal: result.executionDetails.testsTotal
              }
            })
            .eq('id', evaluationResultId);

          if (linkError) {
            logger.error('建立代码执行结果关联失败', linkError, {
              evaluationResultId,
              codeExecutionResultId: executionResult.id
            });
          } else {
            logger.info('代码执行结果关联已建立', {
              evaluationResultId,
              codeExecutionResultId: executionResult.id
            });
          }
        }
      }

      logger.info('评测结果已保存到统一表结构', {
        evaluationResultId,
        score: result.score,
        status: result.status
      });

      return evaluationResultId;

    } catch (error) {
      logger.error('保存评测结果异常', error, { context });
      return null;
    }
  }

  /**
   * 从模型响应中提取代码
   */
  private extractCodeFromResponse(response: string, language: string): string | null {
    try {
      // 1. 尝试匹配指定语言的代码块
      const languagePattern = new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\`\`\``, 'g');
      const languageMatch = response.match(languagePattern);

      if (languageMatch && languageMatch.length > 0) {
        const code = languageMatch[0].replace(/```\w*\n/, '').replace(/```$/, '').trim();
        logger.info('从指定语言代码块提取代码', { language, codeLength: code.length });
        return code;
      }

      // 2. 尝试匹配其他常见语言的代码块
      const commonLanguages = ['javascript', 'js', 'python', 'py', 'typescript', 'ts', 'bash', 'sh'];
      for (const lang of commonLanguages) {
        const pattern = new RegExp(`\`\`\`${lang}\\n([\\s\\S]*?)\`\`\``, 'g');
        const match = response.match(pattern);
        if (match && match.length > 0) {
          const code = match[0].replace(/```\w*\n/, '').replace(/```$/, '').trim();
          logger.info('从其他语言代码块提取代码', {
            requestedLanguage: language,
            foundLanguage: lang,
            codeLength: code.length
          });
          return code;
        }
      }

      // 3. 尝试匹配任意代码块
      const codeBlockPattern = /```(?:\w+)?\n([\s\S]*?)```/g;
      const codeBlocks = Array.from(response.matchAll(codeBlockPattern));

      if (codeBlocks.length > 0) {
        const code = codeBlocks[0][1].trim();
        logger.info('从通用代码块提取代码', { language, codeLength: code.length });
        return code;
      }

      // 4. 如果没有代码块，尝试基于语言特征提取
      if (language === 'python') {
        const pythonPattern = /(?:^|\n)((?:def |class |import |from |if __name__|#.*\n)[\s\S]*?)(?=\n\n|\n[A-Z]|\n$|$)/gm;
        const pythonMatch = response.match(pythonPattern);
        if (pythonMatch) {
          const code = pythonMatch[0].trim();
          logger.info('基于Python特征提取代码', { codeLength: code.length });
          return code;
        }
      }

      logger.warn('未能提取到代码', { responseLength: response.length, language });
      return null;
    } catch (error) {
      logger.error('提取代码失败', error, { responseLength: response.length, language });
      return null;
    }
  }

  /**
   * 获取CODE类型评分器的配置
   */
  async getCodeEvaluatorConfig(evaluatorId: string): Promise<CodeEvaluatorConfig | null> {
    try {
      if (!supabase) {
        logger.warn('Supabase未配置，无法获取评分器配置');
        return null;
      }

      const { data, error } = await supabase
        .from('evaluators')
        .select('config')
        .eq('id', evaluatorId)
        .eq('type', 'CODE')
        .single();

      if (error) {
        logger.error('获取CODE评分器配置失败', error, { evaluatorId });
        return null;
      }

      return data.config as CodeEvaluatorConfig;
    } catch (error) {
      logger.error('获取CODE评分器配置异常', error, { evaluatorId });
      return null;
    }
  }

  /**
   * 预览评分规则变更对历史任务的影响
   */
  async previewScoringRuleChanges(
    newRules: CodeScoringRules,
    taskId?: string,
    limit: number = 10
  ): Promise<{
    affectedResults: Array<{
      taskId: string;
      subtaskId: string;
      currentScore: number;
      previewScore: number;
      scoreDiff: number;
      significantChanges: string[];
    }>;
    summary: {
      totalAffected: number;
      averageScoreDiff: number;
      maxScoreDiff: number;
      minScoreDiff: number;
    };
  }> {
    // 这个方法将在后续实现，用于预览评分规则变更的影响
    // 需要从数据库获取历史执行结果，然后使用新规则重新计算评分
    return {
      affectedResults: [],
      summary: {
        totalAffected: 0,
        averageScoreDiff: 0,
        maxScoreDiff: 0,
        minScoreDiff: 0
      }
    };
  }
}

/**
 * 检查评分器是否为CODE类型
 */
export async function isCodeEvaluator(evaluatorId: string): Promise<boolean> {
  try {
    if (!supabase) {
      return false;
    }

    const { data, error } = await supabase
      .from('evaluators')
      .select('type')
      .eq('id', evaluatorId)
      .single();

    if (error) {
      logger.error('检查评分器类型失败', error, { evaluatorId });
      return false;
    }

    return data.type === 'CODE';
  } catch (error) {
    logger.error('检查评分器类型异常', error, { evaluatorId });
    return false;
  }
}

/**
 * 获取评测结果的代码执行详情
 */
export async function getCodeExecutionDetails(evaluationResultId: number) {
  try {
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from('code_execution_results')
      .select('*')
      .eq('evaluation_result_id', evaluationResultId)
      .single();

    if (error) {
      logger.error('获取代码执行详情失败', error, { evaluationResultId });
      return null;
    }

    return data;
  } catch (error) {
    logger.error('获取代码执行详情异常', error, { evaluationResultId });
    return null;
  }
}

// 导出统一的处理器实例
export const codeEvaluatorProcessor = new CodeEvaluatorProcessor();
