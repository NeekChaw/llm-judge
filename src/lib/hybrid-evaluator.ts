/**
 * 混合评估器 - Phase 2 混合评估系统核心集成模块
 * 集成代码执行结果到PROMPT评分器变量系统
 */

import { codeExtractor, CodeExtractionResult } from './code-extractor';
import { e2bClient } from './e2b-client';
import { 
  CodeExecutionConfig, 
  ExtractedCode, 
  CodeExecutionResult, 
  HybridEvaluationVariables,
  PromptEvaluatorConfig 
} from '@/types/evaluator';

export interface HybridEvaluationContext {
  model_response: string;
  test_case_input: string;
  dimension_name: string;
  task_id: string;
  subtask_id: string;
}

export interface HybridEvaluationResult {
  success: boolean;
  variables: HybridEvaluationVariables;
  extraction_info?: {
    strategy_used: string;
    confidence: number;
    fallback_used?: boolean;
  };
  execution_info?: {
    execution_time_ms: number;
    memory_used?: number;
    exit_code?: number;
  };
  error_details?: {
    stage: 'extraction' | 'execution' | 'variable_creation';
    message: string;
    original_error?: any;
  };
}

/**
 * 混合评估器主类 - 协调代码提取和执行
 */
export class HybridEvaluator {
  
  /**
   * 执行混合评估 - 从模型响应中提取并执行代码，生成评估变量
   */
  async executeHybridEvaluation(
    context: HybridEvaluationContext,
    codeConfig: CodeExecutionConfig
  ): Promise<HybridEvaluationResult> {
    const startTime = Date.now();
    
    try {
      // 🔧 确保代码配置完整，提供默认值
      const safeCodeConfig: CodeExecutionConfig = {
        ...codeConfig,
        extract_code_strategy: codeConfig.extract_code_strategy || { type: 'auto' },
        language: codeConfig.language || 'python',
        timeout_ms: codeConfig.timeout_ms || 30000,
        fallback_on_error: codeConfig.fallback_on_error ?? true
      };

      // 步骤1: 从模型响应中提取代码
      console.log(`🔍 开始代码提取 (${safeCodeConfig.extract_code_strategy.type}策略)`);
      
      const extractionResult = await this.extractCodeFromResponse(
        context.model_response,
        safeCodeConfig
      );

      if (!extractionResult.success || !extractionResult.extracted_code) {
        return {
          success: false,
          variables: this.createEmptyVariables(context),
          error_details: {
            stage: 'extraction',
            message: extractionResult.error || '代码提取失败',
            original_error: extractionResult
          }
        };
      }

      // 步骤2: 执行提取的代码
      console.log(`⚡ 开始代码执行 (${extractionResult.extracted_code.language})`);
      
      const executionResult = await this.executeExtractedCode(
        extractionResult.extracted_code,
        safeCodeConfig,
        context
      );

      // 步骤3: 生成混合评估变量
      console.log(`📊 生成混合评估变量`);
      
      const variables = this.createHybridVariables(
        context,
        extractionResult.extracted_code,
        executionResult,
        extractionResult
      );

      const totalTime = Date.now() - startTime;

      return {
        success: true,
        variables,
        extraction_info: {
          strategy_used: extractionResult.extracted_code.extraction_method,
          confidence: extractionResult.extracted_code.confidence,
          fallback_used: extractionResult.fallback_attempted
        },
        execution_info: {
          execution_time_ms: executionResult.execution_time || totalTime,
          memory_used: executionResult.memory_usage,
          exit_code: executionResult.exit_code
        }
      };

    } catch (error: any) {
      console.error('混合评估执行失败:', error);
      
      return {
        success: false,
        variables: this.createEmptyVariables(context),
        error_details: {
          stage: 'execution',
          message: error.message || '混合评估执行异常',
          original_error: error
        }
      };
    }
  }

  /**
   * 从模型响应中提取代码
   */
  private async extractCodeFromResponse(
    modelResponse: string,
    codeConfig: CodeExecutionConfig
  ): Promise<CodeExtractionResult> {
    console.log(`🔍 尝试提取${codeConfig.language}代码...`);
    
    // 首先尝试按配置的语言提取
    let result = await codeExtractor.extractCode(
      modelResponse,
      codeConfig.extract_code_strategy,
      codeConfig.language as any,
      false // 暂时关闭fallback，我们要自己处理
    );
    
    // 同时进行自动语言检测，用于比较
    const autoResult = await codeExtractor.extractCode(
      modelResponse,
      { type: 'auto' },
      'auto' as any,
      codeConfig.fallback_on_error ?? true
    );
    
    // 智能选择最佳结果
    let finalResult = result;
    
    if (autoResult.success && autoResult.extracted_code) {
      const configuredConfidence = result.extracted_code?.confidence || 0;
      const autoConfidence = autoResult.extracted_code.confidence;
      
      console.log(`📊 提取结果对比:`);
      console.log(`   配置语言(${codeConfig.language}): ${result.success}, 置信度: ${configuredConfidence}%`);
      console.log(`   自动检测(${autoResult.extracted_code.language}): ${autoResult.success}, 置信度: ${autoConfidence}%`);
      
      // 如果自动检测的置信度明显更高，或者配置的语言提取失败，使用自动检测结果
      const shouldUseAutoResult = 
        !result.success || // 配置语言提取失败
        autoConfidence > configuredConfidence + 20 || // 自动检测置信度显著更高
        (autoResult.extracted_code.language !== codeConfig.language && autoConfidence > 80); // 检测到不同语言且高置信度
        
      if (shouldUseAutoResult) {
        console.log(`✅ 使用自动检测结果: ${autoResult.extracted_code.language} (置信度差异: ${autoConfidence - configuredConfidence}%)`);
        finalResult = autoResult;
      } else {
        console.log(`✅ 使用配置语言结果: ${codeConfig.language}`);
      }
    } else if (!result.success) {
      console.log(`⚠️ 配置语言和自动检测都失败`);
    }
    
    return finalResult;
  }

  /**
   * 执行提取的代码
   */
  private async executeExtractedCode(
    extractedCode: ExtractedCode,
    codeConfig: CodeExecutionConfig,
    context: HybridEvaluationContext
  ): Promise<CodeExecutionResult> {
    try {
      // 准备执行环境
      const executionContext = {
        code: extractedCode.code,
        language: extractedCode.language,
        timeout: codeConfig.timeout_ms || 30000,
        // 可以传递测试用例输入作为执行上下文
        input_data: context.test_case_input
      };

      // 调用E2B执行代码
      const result = await e2bClient.executeCode(executionContext);

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        execution_time: result.execution_time,
        memory_usage: result.memory_usage,
        exit_code: result.exit_code,
        language: extractedCode.language,
        // 增强结果信息
        extracted_code_confidence: extractedCode.confidence,
        extraction_method: extractedCode.extraction_method
      };

    } catch (error: any) {
      console.error('代码执行失败:', error);
      
      return {
        success: false,
        output: '',
        error: error.message || '代码执行异常',
        execution_time: 0,
        language: extractedCode.language,
        extracted_code_confidence: extractedCode.confidence,
        extraction_method: extractedCode.extraction_method
      };
    }
  }

  /**
   * 创建混合评估变量 - 供PROMPT评分器使用
   */
  private createHybridVariables(
    context: HybridEvaluationContext,
    extractedCode: ExtractedCode,
    executionResult: CodeExecutionResult,
    extractionResult: CodeExtractionResult
  ): HybridEvaluationVariables {
    // 基础变量
    const baseVariables = {
      // 原始内容变量
      MODEL_RESPONSE: context.model_response,
      TEST_INPUT: context.test_case_input,
      DIMENSION: context.dimension_name,
      
      // 代码提取相关变量
      EXTRACTED_CODE: extractedCode.code,
      CODE_LANGUAGE: extractedCode.language,
      EXTRACTION_METHOD: extractedCode.extraction_method,
      EXTRACTION_CONFIDENCE: extractedCode.confidence.toString(),
      
      // 代码执行相关变量
      EXECUTION_OUTPUT: executionResult.output || '',
      EXECUTION_SUCCESS: executionResult.success ? 'true' : 'false',
      EXECUTION_ERROR: executionResult.error || '',
      EXECUTION_TIME: (executionResult.execution_time || 0).toString(),
      
      // 性能指标变量
      MEMORY_USAGE: (executionResult.memory_usage || 0).toString(),
      EXIT_CODE: (executionResult.exit_code || 0).toString(),
    };

    // 条件变量 - 根据执行结果动态生成
    const conditionalVariables: Record<string, string> = {};

    // 成功/失败状态变量
    if (executionResult.success) {
      conditionalVariables.SUCCESS_MESSAGE = '代码执行成功';
      conditionalVariables.HAS_OUTPUT = executionResult.output ? 'true' : 'false';
      
      // 尝试解析输出为JSON（如果可能）
      try {
        const parsedOutput = JSON.parse(executionResult.output || '{}');
        conditionalVariables.OUTPUT_JSON = JSON.stringify(parsedOutput, null, 2);
        conditionalVariables.IS_VALID_JSON = 'true';
      } catch {
        conditionalVariables.OUTPUT_JSON = '';
        conditionalVariables.IS_VALID_JSON = 'false';
      }
    } else {
      conditionalVariables.FAILURE_MESSAGE = '代码执行失败';
      conditionalVariables.ERROR_TYPE = this.categorizeError(executionResult.error || '');
    }

    // 性能等级变量
    const executionTime = executionResult.execution_time || 0;
    if (executionTime < 1000) {
      conditionalVariables.PERFORMANCE_LEVEL = 'excellent';
    } else if (executionTime < 5000) {
      conditionalVariables.PERFORMANCE_LEVEL = 'good';
    } else if (executionTime < 15000) {
      conditionalVariables.PERFORMANCE_LEVEL = 'fair';
    } else {
      conditionalVariables.PERFORMANCE_LEVEL = 'poor';
    }

    // 代码质量指标
    conditionalVariables.CODE_LENGTH = extractedCode.code.length.toString();
    conditionalVariables.CODE_LINES = extractedCode.code.split('\n').length.toString();
    conditionalVariables.HAS_COMMENTS = /[#//]/.test(extractedCode.code) ? 'true' : 'false';
    conditionalVariables.HAS_FUNCTIONS = /\b(def|function|class)\b/.test(extractedCode.code) ? 'true' : 'false';

    // 提取质量指标
    if (extractedCode.confidence >= 90) {
      conditionalVariables.EXTRACTION_QUALITY = 'excellent';
    } else if (extractedCode.confidence >= 70) {
      conditionalVariables.EXTRACTION_QUALITY = 'good';
    } else if (extractedCode.confidence >= 50) {
      conditionalVariables.EXTRACTION_QUALITY = 'fair';
    } else {
      conditionalVariables.EXTRACTION_QUALITY = 'poor';
    }

    // 合并所有变量
    return {
      ...baseVariables,
      ...conditionalVariables,
      
      // 元数据
      HYBRID_EVALUATION_SUCCESS: 'true',
      EVALUATION_TIMESTAMP: new Date().toISOString(),
      TASK_ID: context.task_id,
      SUBTASK_ID: context.subtask_id
    };
  }

  /**
   * 创建空变量集 - 当提取或执行失败时使用
   */
  private createEmptyVariables(context: HybridEvaluationContext): HybridEvaluationVariables {
    return {
      // 基础变量
      MODEL_RESPONSE: context.model_response,
      TEST_INPUT: context.test_case_input,
      DIMENSION: context.dimension_name,
      
      // 失败状态变量
      EXTRACTED_CODE: '',
      CODE_LANGUAGE: '',
      EXTRACTION_METHOD: 'failed',
      EXTRACTION_CONFIDENCE: '0',
      
      EXECUTION_OUTPUT: '',
      EXECUTION_SUCCESS: 'false',
      EXECUTION_ERROR: '混合评估失败',
      EXECUTION_TIME: '0',
      
      MEMORY_USAGE: '0',
      EXIT_CODE: '-1',
      
      // 状态指标
      HYBRID_EVALUATION_SUCCESS: 'false',
      EVALUATION_TIMESTAMP: new Date().toISOString(),
      TASK_ID: context.task_id,
      SUBTASK_ID: context.subtask_id,
      
      FAILURE_MESSAGE: '无法提取或执行代码',
      ERROR_TYPE: 'hybrid_evaluation_failure',
      PERFORMANCE_LEVEL: 'failed',
      EXTRACTION_QUALITY: 'failed'
    };
  }

  /**
   * 错误分类
   */
  private categorizeError(errorMessage: string): string {
    const error = errorMessage.toLowerCase();
    
    if (error.includes('syntax')) {
      return 'syntax_error';
    } else if (error.includes('timeout')) {
      return 'timeout_error';
    } else if (error.includes('memory')) {
      return 'memory_error';
    } else if (error.includes('import') || error.includes('module')) {
      return 'import_error';
    } else if (error.includes('runtime') || error.includes('exception')) {
      return 'runtime_error';
    } else if (error.includes('permission') || error.includes('access')) {
      return 'permission_error';
    } else {
      return 'unknown_error';
    }
  }

  /**
   * 检查PROMPT评分器是否需要混合评估
   */
  static needsHybridEvaluation(config: PromptEvaluatorConfig): boolean {
    return !!(config.code_execution?.enabled &&
             ((config.system_prompt && config.system_prompt.includes('{{')) ||
              config.evaluation_prompt.includes('{{')));
  }

  /**
   * 从PROMPT模板中提取需要的变量名
   */
  static extractRequiredVariables(systemPrompt: string, evaluationPrompt: string): string[] {
    const combinedText = systemPrompt + ' ' + evaluationPrompt;
    const variablePattern = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;
    
    while ((match = variablePattern.exec(combinedText)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }
    
    return variables;
  }

  /**
   * 替换PROMPT模板中的变量
   */
  static replaceVariablesInPrompt(
    template: string, 
    variables: HybridEvaluationVariables
  ): string {
    let result = template;
    
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value);
    });
    
    // 清理未替换的占位符（可选）
    result = result.replace(/\{\{\w+\}\}/g, '[变量未定义]');
    
    return result;
  }
}

// 全局实例
export const hybridEvaluator = new HybridEvaluator();

// 便捷方法导出
export async function executeHybridEvaluation(
  context: HybridEvaluationContext,
  codeConfig: CodeExecutionConfig
): Promise<HybridEvaluationResult> {
  return await hybridEvaluator.executeHybridEvaluation(context, codeConfig);
}