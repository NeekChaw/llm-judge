/**
 * 评分器执行引擎
 * 实现四种评分器类型的具体执行逻辑
 */

import { 
  EvaluatorType, 
  EvaluatorConfig,
  PromptEvaluatorConfig,
  RegexEvaluatorConfig,
  CodeEvaluatorConfig,
  HumanEvaluatorConfig,
  HybridEvaluationVariables
} from '@/types/evaluator';
import { EvaluationSubTask } from '@/types/task';
import { llmClient } from './llm-client';
import { e2bClient } from './e2b-client';
import { HybridEvaluator, HybridEvaluationContext } from './hybrid-evaluator';
import { codeTemplateEngine } from './code-template-engine';
import { supabase } from './supabase';
import type { CodeEvaluationTemplate } from '@/types/code-templates';
import { CodeTemplateEngine } from './code-template-engine';
import { 
  resolveEvaluatorConfig, 
  validateRuntimeCompatibility,
  EvaluationExecutionContext
} from './evaluator-compatibility';
import { 
  compareOutputWithTolerance, 
  calculateToleranceScore, 
  generateToleranceReport,
  compareTestCaseResults
} from './output-tolerance';

export interface EvaluationResult {
  score: number;
  justification: string;
  model_response?: any;
  prompt_tokens?: number;
  completion_tokens?: number;
  execution_time: number;
  metadata?: Record<string, any>;
}

export interface EvaluationContext {
  test_case: {
    id: string;
    input: string;
    reference_answer?: string;
    reference_answer_multimodal?: {  // 🆕 Bug #6 修复: 多模态参考答案支持
      text: string;
      attachments: Array<{
        type: 'image' | 'audio' | 'video';
        url: string;
        description?: string;
        metadata?: Record<string, any>;
      }>;
    };
    max_score?: number;
    metadata?: Record<string, any>;
  };
  model_response: string; // 被评测模型的响应
  dimension: {
    id: string;
    name: string;
    description?: string;
  };
  evaluator: {
    id: string;
    name: string;
    type: EvaluatorType;
    config: EvaluatorConfig;
  };
  // 被评测模型的性能统计数据
  tested_model_stats?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    execution_time_ms: number;
    cost_usd: number;
    model_name: string;
    provider: string;
  };
}

/**
 * 评分器执行引擎
 */
// 类型守卫函数
function isPromptConfig(config: EvaluatorConfig): config is PromptEvaluatorConfig {
  return typeof config === 'object' && config !== null && (
    'system_prompt' in config || 
    'evaluation_prompt' in config || 
    'model_id' in config
  );
}

function isRegexConfig(config: EvaluatorConfig): config is RegexEvaluatorConfig {
  return typeof config === 'object' && config !== null && (
    'patterns' in config || 
    'pattern' in config ||
    'regex' in config
  );
}

function isCodeConfig(config: EvaluatorConfig): config is CodeEvaluatorConfig {
  // 对于CODE评分器，配置应该包含language或其他CODE相关属性
  return typeof config === 'object' && config !== null && (
    'language' in config || 
    'code' in config || 
    'template_id' in config ||
    'testCases' in config ||
    'use_template' in config ||
    'testCodeTemplate' in config
  );
}

function isHumanConfig(config: EvaluatorConfig): config is HumanEvaluatorConfig {
  return typeof config === 'object' && config !== null && (
    'guidelines' in config || 
    'criteria' in config ||
    'score_range' in config
  );
}

export class EvaluatorEngine {
  /**
   * 执行评分器
   */
  async executeEvaluator(
    context: EvaluationContext
  ): Promise<EvaluationResult> {
    const startTime = Date.now();
    
    try {
      let result: EvaluationResult;
      
      switch (context.evaluator.type) {
        case 'PROMPT':
          result = await this.executePromptEvaluator(context);
          break;
        case 'REGEX':
          result = await this.executeRegexEvaluator(context);
          break;
        case 'CODE':
          result = await this.executeCodeEvaluator(context);
          break;
        case 'HUMAN':
          result = await this.executeHumanEvaluator(context);
          break;
        default:
          throw new Error(`Unsupported evaluator type: ${context.evaluator.type}`);
      }
      
      // 设置执行时间
      result.execution_time = Date.now() - startTime;
      
      return result;
    } catch (error) {
      const execution_time = Date.now() - startTime;
      throw new Error(`Evaluator execution failed: ${error instanceof Error ? error.message : 'Unknown error'} (took ${execution_time}ms)`);
    }
  }

  /**
   * PROMPT类型评分器执行 - 支持混合评估
   */
  private async executePromptEvaluator(
    context: EvaluationContext
  ): Promise<EvaluationResult> {
    const config = context.evaluator.config;
    
    if (!isPromptConfig(config)) {
      throw new Error('Invalid config type for PROMPT evaluator');
    }
    
    if (!config.model_id || !config.evaluation_prompt) {
      throw new Error('PROMPT evaluator requires model_id and evaluation_prompt');
    }

    // 🆕 检查是否可以复用CODE测试用例数据
    const codeTestCase = await this.getTestCaseWithCodeConfig(context.test_case.id);
    let enhancedVariables: any = {};
    
    if (codeTestCase && codeTestCase.code_test_config) {
      console.log('🔗 PROMPT评分器复用CODE测试用例数据');
      enhancedVariables = {
        code_test_data: codeTestCase.code_test_config.test_data,
        execution_environment: codeTestCase.execution_environment,
        validation_rules: codeTestCase.validation_rules,
        test_case_type: 'code'
      };
    }

    // 🔄 检查是否需要混合评估（代码执行 + AI评分）
    const needsHybridEvaluation = HybridEvaluator.needsHybridEvaluation(config);
    
    let hybridVariables: HybridEvaluationVariables = {};
    let hybridMetadata: any = {};
    
    if (needsHybridEvaluation && config.code_execution?.enabled) {
      console.log('🔄 启用混合评估（代码执行 + AI评分）');
      console.log('   📋 混合评估将提取代码、执行代码并生成智能变量');
      
      // 检查是否使用了代码模板
      if (config.code_execution.use_template && config.code_execution.template_id) {
        console.log(`   🎯 混合评估将使用算法模板: ${config.code_execution.template_id}`);
      } else if (config.code_execution.code) {
        console.log('   🔧 混合评估将使用自定义执行代码');
      } else {
        console.log('   ⚡ 混合评估将使用默认智能执行环境');
      }
      
      // 执行混合评估：代码提取 -> 执行 -> 变量生成
      const hybridContext: HybridEvaluationContext = {
        model_response: context.model_response,
        test_case_input: context.test_case.input,
        dimension_name: context.dimension.name,
        task_id: context.test_case.id.split('_')[0] || 'unknown', // 从test_case.id推断task_id
        subtask_id: context.test_case.id
      };
      
      const hybridEvaluator = new HybridEvaluator();
      const hybridResult = await hybridEvaluator.executeHybridEvaluation(
        hybridContext,
        config.code_execution
      );
      
      if (hybridResult.success) {
        hybridVariables = hybridResult.variables;
        hybridMetadata = {
          hybrid_evaluation: {
            success: true,
            extraction_info: hybridResult.extraction_info,
            execution_info: hybridResult.execution_info,
            // 🆕 添加算法模板信息
            template_info: config.code_execution.use_template ? {
              template_id: config.code_execution.template_id,
              template_name: '算法模板', // 这里暂时用通用名称
              execution_mode: 'template'
            } : {
              execution_mode: config.code_execution.code ? 'custom_code' : 'intelligent'
            }
          }
        };
        console.log('✅ 混合评估成功，生成了', Object.keys(hybridVariables).length, '个变量');
        
        // 如果使用了模板，显示模板相关信息
        if (config.code_execution.use_template && config.code_execution.template_id) {
          console.log(`   🎯 算法模板执行完成: ${config.code_execution.template_id}`);
          console.log('   📊 可用变量包括: EXTRACTED_CODE, EXECUTION_SUCCESS, PERFORMANCE_LEVEL 等');
        }
      } else {
        console.warn('⚠️ 混合评估失败:', hybridResult.error_details?.message);
        hybridMetadata = {
          hybrid_evaluation: {
            success: false,
            error: hybridResult.error_details
          }
        };
        // 继续使用空的混合变量进行评估
      }
    }

    // 合并混合变量和增强变量
    const allVariables = { ...hybridVariables, ...enhancedVariables };
    
    // 构建评估提示词（包含混合变量和CODE测试用例变量替换）
    const evaluationPrompt = await this.buildEvaluationPrompt(
      config.evaluation_prompt,
      context,
      allVariables
    );

    // 处理system_prompt（可能也包含混合变量和CODE变量，允许为空）
    const systemPrompt = config.system_prompt ?
      await this.buildEvaluationPrompt(config.system_prompt, context, allVariables) :
      '';

    // 🚀 详细日志：发送给评分器的最终内容
    console.log('🚀 发送给评分器LLM的完整上下文:', {
      system_prompt_preview: systemPrompt || '(未设置系统提示)',
      system_prompt_length: systemPrompt.length,
      evaluation_prompt_preview: evaluationPrompt.substring(0, 300) + (evaluationPrompt.length > 300 ? '...' : ''),
      evaluation_prompt_length: evaluationPrompt.length,
      contains_template_variables: evaluationPrompt.includes('{{') || systemPrompt.includes('{{'),
      hybrid_evaluation_enabled: needsHybridEvaluation,
      hybrid_variables_count: Object.keys(hybridVariables).length,
      model_id: config.model_id,
      temperature: config.temperature || 0.7,
      max_tokens: config.max_tokens || 1000
    });

    // 如果仍有未替换变量，记录警告
    const combinedPrompts = systemPrompt + ' ' + evaluationPrompt;
    if (combinedPrompts.includes('{{')) {
      const unreplacedVars = combinedPrompts.match(/\{\{[^}]+\}\}/g) || [];
      console.warn('🚨 警告：发送给评分器的提示词仍包含未替换变量:', unreplacedVars);
    }

    // 🚨 DEBUG: 临时日志 - 检查评分器模型配置
    console.log(`🚨 DEBUG: 评分器原始模型ID: ${config.model_id}`);
    console.log(`🚨 DEBUG: 评分器配置:`, JSON.stringify(config, null, 2));

    // 🔧 临时修复：暂时跳过模型解析，直接使用原始ID
    let resolvedModelId = config.model_id;

    // 🆕 Bug #6 修复: 提取参考答案的附件（如果存在）
    const referenceAttachments = context.test_case.reference_answer_multimodal?.attachments || [];

    // 调用LLM API
    const llmRequest: any = {
      model_id: resolvedModelId,
      user_prompt: evaluationPrompt,
      temperature: config.temperature || 0.7,
      max_tokens: config.max_tokens, // 🔧 修复：移除硬编码默认值，支持无限制模式
    };

    // 只有当 system_prompt 不为空时才添加到请求中
    if (systemPrompt) {
      llmRequest.system_prompt = systemPrompt;
    }

    // 🆕 Bug #6 修复: 如果有附件，添加到请求中
    if (referenceAttachments.length > 0) {
      llmRequest.attachments = referenceAttachments;
      console.log(`🖼️ 评分器将收到 ${referenceAttachments.length} 个参考答案附件:`);
      referenceAttachments.forEach((att: any, i: number) => {
        console.log(`   ${i + 1}. [${att.type}] ${att.url}${att.description ? ` - ${att.description}` : ''}`);
      });
    }

    const llmResponse = await llmClient.callLLM(llmRequest);

    // 计算评分器模型的成本
    const evaluatorCost = await llmClient.estimateCost(
      resolvedModelId,
      llmResponse.prompt_tokens,
      llmResponse.completion_tokens
    );

    // 解析评分结果 - 使用题目级别的max_score
    const maxScore = context.test_case.max_score || 100; // 默认100分
    const score = this.parseScoreFromResponse(
      llmResponse.content,
      0,
      maxScore,
      1
    );

    return {
      score,
      justification: llmResponse.content,
      model_response: llmResponse,
      prompt_tokens: llmResponse.prompt_tokens,
      completion_tokens: llmResponse.completion_tokens,
      execution_time: 0, // 将在外层设置
      metadata: {
        evaluator_model_stats: {
          prompt_tokens: llmResponse.prompt_tokens,
          completion_tokens: llmResponse.completion_tokens,
          total_tokens: llmResponse.total_tokens,
          execution_time_ms: llmResponse.response_time,
          cost_usd: evaluatorCost,
        },
        // 包含混合评估信息
        ...hybridMetadata,
        // 混合评估相关统计
        hybrid_variables_used: Object.keys(hybridVariables),
        hybrid_evaluation_enabled: needsHybridEvaluation
      }
    };
  }

  /**
   * REGEX类型评分器执行
   */
  private async executeRegexEvaluator(
    context: EvaluationContext
  ): Promise<EvaluationResult> {
    const config = context.evaluator.config;
    
    if (!isRegexConfig(config)) {
      throw new Error('Invalid config type for REGEX evaluator');
    }
    
    if (!config.patterns || !Array.isArray(config.patterns)) {
      throw new Error('REGEX evaluator requires patterns array');
    }

    const response = context.model_response;
    let totalMatches = 0;
    let matchDetails: Array<{ pattern: string; matches: number; examples: string[] }> = [];

    // 处理每个正则模式
    for (const patternConfig of config.patterns) {
      const flags = this.buildRegexFlags(
        config.case_sensitive !== false,
        patternConfig.flags
      );
      
      try {
        const regex = new RegExp(patternConfig.pattern, flags);
        const matches = response.match(new RegExp(patternConfig.pattern, flags + 'g'));
        const matchCount = matches ? matches.length : 0;
        
        totalMatches += matchCount * (patternConfig.weight || 1);
        
        matchDetails.push({
          pattern: patternConfig.pattern,
          matches: matchCount,
          examples: matches ? matches.slice(0, 3) : [], // 最多显示3个例子
        });
      } catch (error) {
        throw new Error(`Invalid regex pattern: ${patternConfig.pattern}`);
      }
    }

    // 计算分数
    const maxPossibleScore = config.patterns.reduce(
      (sum: number, p: any) => sum + ((p.expected_matches || 1) * (p.weight || 1)), 
      0
    );
    
    let score = config.default_score || 0;
    if (maxPossibleScore > 0) {
      score = Math.min(
        (totalMatches / maxPossibleScore) * 100,
        config.score_max || 100
      );
    }

    return {
      score: Math.round(score * 100) / 100, // 保留2位小数
      justification: `正则匹配结果: 总匹配数 ${totalMatches}/${maxPossibleScore}。详细: ${JSON.stringify(matchDetails, null, 2)}`,
      execution_time: 0,
      metadata: {
        total_matches: totalMatches,
        max_possible: maxPossibleScore,
        pattern_details: matchDetails,
      },
    };
  }

  /**
   * CODE类型评分器执行 - 支持新旧格式兼容
   */
  private async executeCodeEvaluator(
    context: EvaluationContext
  ): Promise<EvaluationResult> {
    const config = context.evaluator.config;
    
    if (!isCodeConfig(config)) {
      throw new Error('Invalid config type for CODE evaluator');
    }
    
    console.log(`🔧 开始执行CODE评分器: ${context.evaluator.name} (ID: ${context.evaluator.id})`);
    
    // 🆕 兼容性处理：自动解析新旧格式配置
    let executionContext: EvaluationExecutionContext;
    
    try {
      // 尝试获取关联的测试用例配置
      const testCase = await this.getTestCaseWithCodeConfig(context.test_case.id);
      
      // 使用兼容性处理器自动解析配置
      executionContext = resolveEvaluatorConfig(
        {
          id: context.evaluator.id,
          type: 'CODE', 
          config: config
        },
        testCase
      );
      
      console.log(`   ✅ 配置解析成功 (模式: ${testCase ? '新格式' : '旧格式兼容'})`);
      
      // 运行时兼容性验证
      const compatibility = await validateRuntimeCompatibility(executionContext);
      
      if (!compatibility.compatible) {
        throw new Error(`运行时配置不兼容: ${compatibility.errors.join(', ')}`);
      }
      
      console.log('   ✅ 运行时兼容性验证通过');
      
    } catch (error) {
      console.error('   ❌ 配置解析失败，回退到传统处理模式:', error);
      
      // 回退到传统处理：直接使用评分器配置
      if (!config.language) {
        throw new Error('CODE evaluator requires language');
      }
      
      // 构造传统执行上下文
      executionContext = {
        executionConfig: {
          timeout_ms: config.timeout_ms || 30000,
          memory_limit_mb: config.memory_limit || 256,
          entry_point_strategy: 'intelligent',
          language: config.language
        },
        testData: config.testCases || [],
        validationRules: {
          strict_output_match: false,
          ignore_whitespace: true
        },
        scoringStrategy: {
          method: 'weighted',
          weights: {
            correctness: 0.7,
            performance: 0.3
          }
        }
      };
      
      console.log('   🔄 使用传统兼容模式继续执行');
    }
    
    // 🆕 使用统一的执行上下文获取代码
    let codeToRun: string;
    
    if (config.use_template && config.template_id) {
      // 模板模式：根据template_id加载代码模板
      console.log(`🔧 CODE评分器使用代码模板模式`);
      console.log(`   📋 模板ID: ${config.template_id}`);
      console.log(`   🎯 这将为混合评估提供智能代码执行环境`);
      try {
        // 🆕 新架构：合并测试题级别的测试用例数据到模板配置
        let testCasesData = executionContext.testData.length > 0 
          ? executionContext.testData
          : (config.template_config?.test_cases || []);
        
        console.log(`🔍 EVALUATOR_DEBUG: 数据源分析:`);
        console.log(`   - 新框架数据(testData)数量: ${executionContext.testData.length}`);
        console.log(`   - 旧框架数据(template_config.test_cases)数量: ${config.template_config?.test_cases?.length || 0}`);
        console.log(`   - 使用数据源: ${executionContext.testData.length > 0 ? '新框架' : '旧框架'}`);
        console.log(`   - 选中的测试数据: ${JSON.stringify(testCasesData.slice(0, 2), null, 2)}`);
        
        // 🔧 确保模板兼容性：对测试用例数据进行格式标准化
        const normalizedTestCases = testCasesData.map((testCase, index) => {
          console.log(`🔧 EVALUATOR_DEBUG: 标准化测试用例 ${index + 1}:`);

          // 🏗️ 架构说明：CODE评分器的测试用例数据来源演进
          //
          // 【旧架构 (v1.0)】评分器级别测试用例：
          // - 测试用例绑定在评分器配置中：evaluator.config.test_cases = [{input, expected}]
          // - 每个评分器有自己的固定测试用例
          // - 问题：不够灵活，不同题目无法使用同一个评分器
          //
          // 【新架构 (v2.0)】题目级别测试用例：
          // - 测试用例绑定在题目中：test_cases.input 包含题目描述和示例
          // - 评分器作为通用工具：evaluator.config.test_cases = [] (空数组)
          // - 系统从题目描述中动态解析测试用例：extractExamplesFromDescription()
          // - 解析出的数据格式：[{input: {...}, expected: ..., description: "示例X"}]
          //
          // 📋 字段映射兼容性：
          // - 优先级：testCase.expected > testCase.expected_output > testCase.reference_answer
          // - 这样既兼容旧格式，也支持新的数据结构
          const expectedValue = testCase.expected !== undefined ? testCase.expected :
                                testCase.expected_output !== undefined ? testCase.expected_output :
                                testCase.reference_answer;

          console.log(`   - 原始input类型: ${Array.isArray(testCase.input) ? 'array' : typeof testCase.input}`);
          console.log(`   - 原始expected类型: ${Array.isArray(expectedValue) ? 'array' : typeof expectedValue}`);

          // 🏗️ 新架构核心：动态解析题目级别的测试用例
          //
          // 在新架构中，算法题的测试用例不是预先定义好的，而是隐藏在题目描述中：
          //
          // 示例格式：
          // ```
          // 编程题：给你两个字符串...
          //
          // 示例 1：
          // 输入：s1 = "internationalization", s2 = "i18n"
          // 输出：true
          //
          // 示例 2：
          // 输入：s1 = "l123e", s2 = "44"
          // 输出：true
          // ```
          //
          // 系统需要解析这些示例，转换为CODE模板期望的格式：
          // [{input: {s1: "internationalization", s2: "i18n"}, expected: true, description: "示例 1"}]
          let normalizedInput, normalizedExpected;

          if (typeof testCase.input === 'string' && testCase.input.includes('示例')) {
            // 这是新架构的题目描述型测试用例，需要动态解析
            console.log(`   - 检测到题目描述型测试用例，启动示例解析器`);

            // 从问题描述中提取示例数据
            const examples = this.extractExamplesFromDescription(testCase.input);
            if (examples.length > 0) {
              console.log(`   - 提取到 ${examples.length} 个示例`);
              return {
                input: examples,  // 直接使用提取的示例数组
                expected: examples,  // 暂时使用相同的数据，模板会处理评估
                description: testCase.description || '从问题描述提取的测试用例'
              };
            } else {
              // 提取失败，使用默认测试用例
              normalizedInput = [[2,2,2,3,4], [2,2,2,3,4,1,3]];
              normalizedExpected = [[1], [2]];
            }
          } else {
            // 🎯 保持原始格式：不强制转换为数组
            normalizedInput = testCase.input;
            normalizedExpected = expectedValue !== undefined ? expectedValue : null;
          }

          console.log(`   - 标准化后input类型: ${Array.isArray(normalizedInput) ? 'array' : typeof normalizedInput}`);
          console.log(`   - 标准化后expected类型: ${Array.isArray(normalizedExpected) ? 'array' : typeof normalizedExpected}`);

          return {
            input: normalizedInput,
            expected: normalizedExpected,
            description: testCase.description
          };
        });

        const templateConfig = {
          ...(config.template_config || {}),
          test_cases: normalizedTestCases,
          // 同时提供大写版本以兼容模板变量命名
          TEST_CASES: normalizedTestCases
        };
        
        console.log(`   📊 模板配置数据: ${templateConfig.test_cases.length} 个测试用例 (来源: ${executionContext.testData.length > 0 ? '测试题级别' : '模板配置'})`);
        console.log(`   🔧 标准化后的测试用例格式:`, templateConfig.test_cases.slice(0, 2).map(tc => ({
          input_type: Array.isArray(tc.input) ? 'array' : typeof tc.input,
          expected_type: Array.isArray(tc.expected) ? 'array' : typeof tc.expected,
          input_sample: tc.input,
          expected_sample: tc.expected
        })));
        
        const templateResult = await this.loadCodeTemplate(config.template_id, templateConfig, executionContext);
        codeToRun = templateResult.code;
        
        // 存储模板信息供后续使用
        (executionContext as any).templateInfo = templateResult.templateInfo;
      } catch (error) {
        // 不抛出异常，而是使用错误处理代码
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`❌ 代码模板加载失败: ${errorMessage}`);
        console.log(`   → 将使用错误处理代码，评估结果为0分`);

        codeToRun = `# 代码模板加载失败，无法执行评估
# 错误原因: ${errorMessage}
print("评估失败: ${errorMessage.replace(/"/g, '\\"')}")
print("SCORE: 0")
import sys
sys.exit(0)`;
      }
    } else if (config.code) {
      // 手动模式：使用config.code
      console.log('🔧 使用手动代码模式');
      codeToRun = config.code;
    } else if (config.testCodeTemplate) {
      // 旧版代码模板模式：使用config.testCodeTemplate
      console.log('🔧 使用旧版代码模板模式');
      codeToRun = config.testCodeTemplate;
    } else {
      throw new Error('CODE evaluator requires either code (manual mode), template_id (template mode), or testCodeTemplate (legacy mode)');
    }

    // 🆕 使用新的执行上下文准备执行环境
    const codeExecutionContext = {
      test_input: context.test_case.input,
      model_response: context.model_response,
      reference_answer: context.test_case.reference_answer,
      test_case_metadata: context.test_case.metadata,
      // 新增：来自兼容性处理的测试数据
      test_cases: executionContext.testData,
      validation_rules: executionContext.validationRules
    };

    // 构建要执行的代码 - 使用兼容性处理后的语言配置
    const codeToExecute = await this.buildExecutableCode(
      codeToRun,
      executionContext.executionConfig.language,
      codeExecutionContext,
      config.environment_vars || {}
    );

    // 🔍 调试：显示实际传递给E2B的代码
    console.log('🚀 即将传递给E2B执行的代码:');
    console.log('='.repeat(50));
    console.log(codeToExecute.substring(0, 500)); // 显示前500个字符
    if (codeToExecute.length > 500) {
      console.log(`... (总长度: ${codeToExecute.length} 字符)`);
    }
    console.log('='.repeat(50));
    
    try {
      // 🆕 使用兼容性处理后的配置执行代码
      console.log(`   🚀 执行环境: ${executionContext.executionConfig.language}`);
      console.log(`   ⏱️  超时设置: ${executionContext.executionConfig.timeout_ms}ms`);
      console.log(`   💾 内存限制: ${executionContext.executionConfig.memory_limit_mb}MB`);
      
      const result = await e2bClient.executeCode({
        language: executionContext.executionConfig.language,
        code: codeToExecute,
        timeout: executionContext.executionConfig.timeout_ms,
        environment: config.environment_vars || {},
      });

      // 解析执行结果
      let score = 0;
      let justification = '代码执行失败';
      let testCaseResults: any[] = []; // 🔧 将testCaseResults声明移到方法级别作用域

      if (result.success) {
        console.log(`🎯 开始算法正确性测试，共 ${executionContext.testData.length} 个测试用例`);
        
        // 🆕 智能输出分析和容错机制
        const output = result.output;
        let finalScore = 0;
        let toleranceReport = '';
        
        // 1. 优先检查是否有明确的SCORE标记
        const scoreMatch = output.match(/SCORE:\s*(\d+(?:\.\d+)?)/i);
        
        if (scoreMatch) {
          // 有明确分数标记，直接使用
          finalScore = parseFloat(scoreMatch[1]);
          justification = `代码执行成功，获得明确评分: ${finalScore}分\n\n${output}`;
          console.log(`✅ 检测到明确评分: ${finalScore}分`);
        } else if (executionContext.testData.length > 0) {
          // 2. 没有明确分数，但有测试用例数据，使用智能容错比较
          console.log(`🔍 未检测到明确评分，开始智能测试用例比较`);
          
          try {
            // 解析执行输出中的测试结果
            const testResults = this.parseTestCaseResults(output, executionContext.testData);
            
            if (testResults.length > 0) {
              // 使用容错机制比较结果
              const toleranceAnalysis = compareTestCaseResults(
                testResults.map((result, index) => ({
                  expected: executionContext.testData[index]?.expected,
                  actual: result.actual,
                  description: `测试用例 ${index + 1}`
                })),
                config.score_max || 100
              );
              
              finalScore = toleranceAnalysis.totalScore;
              toleranceReport = this.generateDetailedToleranceReport(toleranceAnalysis);
              testCaseResults = toleranceAnalysis.details;
              
              console.log(`📊 容错分析完成: ${toleranceAnalysis.passedTests}/${testResults.length} 个测试用例通过`);
              console.log(`🎯 最终得分: ${finalScore}分 (${toleranceAnalysis.toleranceApplied} 个用例应用了容错机制)`);
              
              justification = `智能评分完成:\n${toleranceReport}\n\n📋 执行输出:\n${output}`;
            } else {
              // 无法解析测试结果，使用传统逻辑
              finalScore = result.exit_code === 0 ? (config.default_score || 100) : 0;
              justification = `代码执行成功，但无法解析测试结果。默认评分: ${finalScore}分\n\n${output}`;
              console.log(`⚠️ 无法解析测试结果，使用默认评分: ${finalScore}分`);
            }
          } catch (error) {
            console.warn(`⚠️ 智能评分过程出错: ${error instanceof Error ? error.message : 'Unknown error'}`);
            finalScore = result.exit_code === 0 ? (config.default_score || 100) : 0;
            justification = `智能评分失败，回退到传统评分: ${finalScore}分\n\n${output}`;
          }
        } else {
          // 3. 既没有明确分数，也没有测试用例，使用传统逻辑
          finalScore = result.exit_code === 0 ? (config.default_score || 100) : 0;
          justification = `代码执行成功，传统评分模式: ${finalScore}分\n\n${output}`;
          console.log(`📝 传统评分模式: ${finalScore}分`);
        }
        
        score = finalScore;
      } else {
        // 🔧 检查是否是E2B限制导致的执行失败
        if (result.executionStatus === 'restricted') {
          console.log('🚫 E2B_RESTRICTION: 代码被E2B限制阻止执行');
          console.log(`   限制原因: ${result.error || '未知'}`);
          console.log(`   兼容性报告: ${result.compatibilityReport || '无'}`);
          console.log(`   建议: ${result.suggestions?.join(', ') || '无'}`);

          // 🔍 分析可能的原因
          if (result.stderr && result.stderr.includes('SyntaxError')) {
            console.log('🔧 RESTRICTION_ANALYSIS: 检测到语法错误可能导致的限制');
            console.log('   这可能是由于模型响应包含markdown代码块标记');
          }

          justification = `代码被安全策略阻止执行:\n\n${result.error || result.compatibilityReport || '使用了被禁用的功能'}\n\n建议：${result.suggestions?.join('\n• ') || '请重新设计算法以符合安全要求'}`;
          score = 0; // 明确设置为0分
        } else {
          // 🔧 增强错误分类和用户友好提示
          const errorMessage = result.error || '未知错误';
          let enhancedJustification = `代码执行失败: ${errorMessage}`;

          // 常见错误类型分析和建议
          if (errorMessage.includes("object of type 'int' has no len()")) {
            enhancedJustification += `\n\n🔍 错误分析：代码中对整数类型调用了len()函数`;
            enhancedJustification += `\n💡 可能原因：`;
            enhancedJustification += `\n   1. 函数参数处理错误，混淆了列表和列表元素`;
            enhancedJustification += `\n   2. 循环逻辑错误，对单个元素而非容器调用len()`;
            enhancedJustification += `\n   3. 变量类型判断错误`;
            enhancedJustification += `\n🛠️ 建议：检查代码中所有len()调用，确保操作的是列表、字符串等容器类型`;
          } else if (errorMessage.includes('TypeError')) {
            enhancedJustification += `\n\n🔍 错误分析：类型错误`;
            enhancedJustification += `\n💡 建议：检查变量类型和函数参数匹配`;
          } else if (errorMessage.includes('IndexError')) {
            enhancedJustification += `\n\n🔍 错误分析：索引越界`;
            enhancedJustification += `\n💡 建议：检查数组/列表边界条件`;
          } else if (errorMessage.includes('KeyError')) {
            enhancedJustification += `\n\n🔍 错误分析：字典键不存在`;
            enhancedJustification += `\n💡 建议：使用get()方法或先检查键是否存在`;
          } else if (errorMessage.includes('AttributeError')) {
            enhancedJustification += `\n\n🔍 错误分析：属性或方法不存在`;
            enhancedJustification += `\n💡 建议：检查对象类型和可用方法`;
          }

          justification = enhancedJustification;
        }
      }

      return {
        score: Math.max(0, Math.min(score, config.score_max || 100)),
        justification,
        execution_time: 0,
        metadata: {
          language: executionContext.executionConfig.language,
          exit_code: result.exit_code,
          stdout: result.stdout,
          stderr: result.stderr,
          execution_time_ms: result.execution_time,
          memory_usage: result.memory_usage,
          cpu_usage: result.cpu_usage,
          // 新增：兼容性处理信息
          compatibility_mode: executionContext.testData.length > 0 ? 'legacy_embedded' : 'modern_separated',
          test_cases_count: executionContext.testData.length,
          scoring_strategy: executionContext.scoringStrategy.method,
          // 新增：容错机制相关信息
          tolerance_applied: testCaseResults.length > 0,
          tolerance_details: testCaseResults
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // 🔍 详细错误分析日志
      console.log('❌ CODE_EVALUATOR_ERROR: 执行过程发生异常');
      console.log(`   错误类型: ${error.constructor.name}`);
      console.log(`   错误信息: ${errorMessage}`);
      console.log(`   错误栈: ${error instanceof Error ? error.stack?.substring(0, 500) : 'N/A'}`);

      // 🔧 特别处理testCaseResults未定义错误，这通常发生在E2B限制代码后AI评分阶段
      if (errorMessage.includes('testCaseResults is not defined')) {
        console.log('🔧 ERROR_ANALYSIS: 检测到testCaseResults未定义错误');
        console.log('   这通常是以下原因之一:');
        console.log('   1. 模型响应包含markdown代码块导致语法错误');
        console.log('   2. 代码模板生成失败，缺少变量定义');
        console.log('   3. E2B环境限制导致部分代码被屏蔽');
        console.log('   4. 模型生成的代码直接引用了未定义变量');
        return {
          score: 0,
          justification: `代码执行被安全策略阻止，无法生成有效结果。\n\n错误详情：代码中引用了未定义的变量（可能是动态生成的代码问题）。\n\n建议：重新设计算法，避免使用被禁用的功能如exec()、eval()等。`,
          execution_time: 0,
          metadata: {
            error_type: 'e2b_restriction_side_effect',
            error_message: errorMessage,
            compatibility_mode: executionContext.testData.length > 0 ? 'legacy_embedded' : 'modern_separated',
            suggested_action: 'redesign_algorithm_without_restricted_functions'
          }
        };
      }

      // 其他一般性错误
      return {
        score: 0,
        justification: `沙箱执行异常: ${errorMessage}`,
        execution_time: 0,
        metadata: {
          error_type: 'sandbox_execution_error',
          error_message: errorMessage,
          compatibility_mode: executionContext.testData.length > 0 ? 'legacy_embedded' : 'modern_separated'
        }
      };
    }
  }

  /**
   * 🆕 获取测试用例的代码配置（支持新格式）
   */
  private async getTestCaseWithCodeConfig(testCaseId: string): Promise<any | null> {
    try {
      // Using global supabase singleton

      const { data, error } = await supabase
        .from('test_cases')
        .select('id, code_test_config, execution_environment, validation_rules')
        .eq('id', testCaseId)
        .single();
      
      if (error || !data) {
        console.log(`   ℹ️  测试用例 ${testCaseId} 没有代码配置，使用评分器内置配置`);
        return null;
      }
      
      // 检查是否有代码执行相关配置
      if (!data.code_test_config && !data.execution_environment && !data.validation_rules) {
        console.log(`   ℹ️  测试用例 ${testCaseId} 缺少代码执行配置，使用评分器内置配置`);
        return null;
      }
      
      console.log(`   ✅ 找到测试用例代码配置 (环境: ${data.execution_environment || 'N/A'})`);
      return data;
      
    } catch (error) {
      console.warn(`   ⚠️  查询测试用例代码配置失败: ${error}, 回退到评分器内置配置`);
      return null;
    }
  }

  /**
   * HUMAN类型评分器执行
   */
  private async executeHumanEvaluator(
    context: EvaluationContext
  ): Promise<EvaluationResult> {
    const config = context.evaluator.config;
    
    if (!isHumanConfig(config)) {
      throw new Error('Invalid config type for HUMAN evaluator');
    }
    
    // 人工评分是异步过程，需要创建待处理的评分任务
    // 使用题目级别的max_score
    const maxScore = context.test_case.max_score || 100; // 默认100分
    const humanTaskId = await this.createHumanEvaluationTask({
      context,
      guidelines: config.guidelines || '请根据提供的信息进行评分',
      criteria: config.scoring_criteria || [],
      score_range: {
        min: 0,
        max: maxScore,
        step: 1,
      },
    });

    // 返回占位结果，实际分数将在人工评分完成后更新
    return {
      score: -1, // -1 表示待人工评分
      justification: `待人工评分 (任务ID: ${humanTaskId})`,
      execution_time: 0,
      metadata: {
        human_task_id: humanTaskId,
        status: 'pending_human_review',
        guidelines: config.guidelines,
        criteria: config.scoring_criteria,
      },
    };
  }

  /**
   * 构建评估提示词（支持变量替换 + 混合变量）
   */
  private async buildEvaluationPrompt(
    template: string,
    context: EvaluationContext,
    hybridVariables: HybridEvaluationVariables = {}
  ): Promise<string> {
    // 导入系统变量处理函数
    const { replaceSystemVariables, SystemVariables } = await import('./evaluator-variables');

    // 构建系统变量对象
    const variables: SystemVariables = {
      test_case_input: context.test_case.input,
      model_response: context.model_response,
      reference_answer: context.test_case.reference_answer,
      // 🆕 Bug #6 修复: 添加多模态参考答案附件
      reference_answer_attachments: context.test_case.reference_answer_multimodal?.attachments || [],
      dimension_name: context.dimension.name,
      dimension_description: context.dimension.description,
      test_case_metadata: context.test_case.metadata,
      evaluator_name: context.evaluator.name,

      // 🔧 修复：添加测试用例的最大分数变量
      max_score: context.test_case.max_score || 100,

      // 被评测模型的性能数据
      tested_model_prompt_tokens: context.tested_model_stats?.prompt_tokens,
      tested_model_completion_tokens: context.tested_model_stats?.completion_tokens,
      tested_model_total_tokens: context.tested_model_stats?.total_tokens,
      tested_model_execution_time_ms: context.tested_model_stats?.execution_time_ms,
      tested_model_cost_usd: context.tested_model_stats?.cost_usd,
      model_name: context.tested_model_stats?.model_name,
      model_provider: context.tested_model_stats?.provider,
    };

    // 🔧 详细日志：变量替换前的状态
    console.log('🔧 评分器模板变量替换开始:', {
      original_template_preview: template.substring(0, 150) + (template.length > 150 ? '...' : ''),
      template_variables_found: (template.match(/\{\{[^}]+\}\}/g) || []),
      system_variables_provided: Object.keys(variables).filter(k => variables[k as keyof SystemVariables] !== undefined),
      hybrid_variables_provided: Object.keys(hybridVariables),
      tested_model_stats_available: !!context.tested_model_stats,
      key_performance_data: {
        prompt_tokens: variables.tested_model_prompt_tokens,
        completion_tokens: variables.tested_model_completion_tokens,
        execution_time_ms: variables.tested_model_execution_time_ms,
        cost_usd: variables.tested_model_cost_usd
      }
    });

    // 第一步：使用系统变量替换函数
    let result = replaceSystemVariables(template, variables);

    // 第二步：替换混合评估变量（如果有的话）
    if (Object.keys(hybridVariables).length > 0) {
      console.log('🔄 开始替换混合评估变量...');
      
      // 使用HybridEvaluator的静态方法进行变量替换
      const { HybridEvaluator } = await import('./hybrid-evaluator');
      result = HybridEvaluator.replaceVariablesInPrompt(result, hybridVariables);
      
      console.log('✅ 混合变量替换完成，替换了', Object.keys(hybridVariables).length, '个变量');
    }

    // ✨ 详细日志：变量替换后的结果
    const remainingVariables = result.match(/\{\{[^}]+\}\}/g) || [];
    console.log('✨ 变量替换完成:', {
      replaced_template_preview: result.substring(0, 200) + (result.length > 200 ? '...' : ''),
      remaining_variables: remainingVariables,
      replacement_successful: remainingVariables.length === 0,
      original_length: template.length,
      result_length: result.length
    });

    if (remainingVariables.length > 0) {
      console.warn('⚠️ 发现未替换的变量:', remainingVariables);
    }

    return result;
  }

  /**
   * 从LLM响应中解析分数
   */
  private parseScoreFromResponse(
    response: string,
    minScore: number,
    maxScore: number,
    step: number
  ): number {
    // 🔍 详细日志：开始分数解析过程
    console.log('🔍 开始分数解析:', {
      response_preview: response.substring(0, 300),
      response_length: response.length,
      minScore,
      maxScore,
      step
    });

    // 🚨 首先检查是否包含无法评分的表述
    const cannotScorePatterns = [
      /无法.*?评分/i,
      /不能.*?评分/i,
      /无法.*?打分/i,
      /不能.*?打分/i,
      /无法.*?给分/i,
      /不能.*?给分/i,
      /缺失.*?无法.*?评分/i,
      /内容缺失/i,
      /回答.*?缺失/i,
      /无法根据.*?评分/i,
      /请提供.*?回答.*?内容/i,
      /无法进行.*?评分/i,
      /不足以.*?评分/i,
      /信息不足.*?评分/i
    ];

    const hasCannotScoreIndicator = cannotScorePatterns.some(pattern => 
      pattern.test(response)
    );

    if (hasCannotScoreIndicator) {
      console.log('🚨 检测到无法评分的表述，返回0分');
      return 0; // 返回0分
    }

    // 优化的分数匹配模式（按优先级排序）
    const patterns = [
      // 1. 明确的分数表述（优先级最高）
      { name: '综合评分', regex: /综合评分[：:]\s*(\d+(?:\.\d+)?)/i },
      { name: '最终分数', regex: /最终分数[：:]\s*(\d+(?:\.\d+)?)/i },
      { name: '总分', regex: /总分[：:]\s*(\d+(?:\.\d+)?)/i },
      
      // 2. 分数格式（x/100, x/10等）
      { name: '分数比例', regex: /(\d+(?:\.\d+)?)\s*\/\s*\d+/g }, // 改为global匹配
      { name: '百分比', regex: /(\d+(?:\.\d+)?)%/g },
      
      // 3. 通用评分表述
      { name: '评分', regex: /评分[：:]\s*(\d+(?:\.\d+)?)/i },
      { name: '分数', regex: /分数[：:]\s*(\d+(?:\.\d+)?)/i },
      { name: 'score', regex: /score[：:]\s*(\d+(?:\.\d+)?)/i },
      
      // 4. 末尾分数表述
      { name: '分数单位', regex: /(\d+(?:\.\d+)?)\s*分/g },
      
      // 5. 数字模式（最后备选）
      { name: '纯数字', regex: /(\d+(?:\.\d+)?)/g }
    ];

    const allMatches: { score: number; source: string; pattern: string }[] = [];

    // 尝试所有模式并收集匹配结果
    for (const { name, regex } of patterns) {
      let matches;
      
      if (regex.global) {
        // 对于全局匹配，收集所有结果
        matches = [...response.matchAll(regex)];
      } else {
        // 对于非全局匹配，只取第一个结果
        const match = response.match(regex);
        matches = match ? [match] : [];
      }

      for (const match of matches) {
        if (match) {
          const score = parseFloat(match[1]);
          if (!isNaN(score)) {
            allMatches.push({
              score,
              source: match[0], // 完整的匹配文本
              pattern: name
            });
          }
        }
      }
    }

    // 🔍 详细日志：所有匹配结果
    console.log('🔍 找到的所有分数匹配:', allMatches.map(m => ({
      score: m.score,
      source: m.source,
      pattern: m.pattern,
      in_range: m.score >= minScore && m.score <= maxScore
    })));

    // 筛选有效分数（在合理范围内）
    const validMatches = allMatches.filter(m => 
      m.score >= minScore && m.score <= maxScore
    );

    // 🔍 详细日志：有效匹配
    console.log('🔍 有效分数匹配:', validMatches);

    let finalScore: number;

    if (validMatches.length > 0) {
      // 优先选择明确的评分表述，其次选择最大的有效分数
      const priorityMatch = validMatches.find(m => 
        ['综合评分', '最终分数', '总分', '分数比例'].includes(m.pattern)
      );
      
      if (priorityMatch) {
        finalScore = priorityMatch.score;
        console.log('✅ 使用优先匹配:', priorityMatch);
      } else {
        // 如果没有优先匹配，选择最大的有效分数（通常是最终分数）
        finalScore = Math.max(...validMatches.map(m => m.score));
        const selectedMatch = validMatches.find(m => m.score === finalScore);
        console.log('✅ 使用最大有效分数:', selectedMatch);
      }
    } else if (allMatches.length > 0) {
      // 如果没有在范围内的分数，但有匹配，选择最接近范围的
      finalScore = allMatches.reduce((closest, current) => {
        const closestDistance = Math.min(
          Math.abs(closest.score - minScore),
          Math.abs(closest.score - maxScore)
        );
        const currentDistance = Math.min(
          Math.abs(current.score - minScore),
          Math.abs(current.score - maxScore)
        );
        return currentDistance < closestDistance ? current : closest;
      }).score;
      
      console.log('⚠️ 使用范围外但最接近的分数:', finalScore);
    } else {
      // 如果完全没有匹配，使用中位数
      finalScore = (minScore + maxScore) / 2;
      console.log('❌ 未找到任何分数匹配，使用中位数:', finalScore);
    }

    // 确保分数在有效范围内
    finalScore = Math.max(minScore, Math.min(maxScore, finalScore));
    
    // 应用步长约束
    if (step > 0) {
      finalScore = Math.round(finalScore / step) * step;
    }

    // 🎯 最终结果日志
    console.log('🎯 分数解析完成:', {
      original_response_snippet: response.substring(0, 200),
      all_matches_count: allMatches.length,
      valid_matches_count: validMatches.length,
      final_score: finalScore,
      applied_constraints: { minScore, maxScore, step }
    });

    return finalScore;
  }

  /**
   * 构建正则表达式标志
   */
  private buildRegexFlags(caseSensitive: boolean, additionalFlags?: string): string {
    let flags = '';
    
    if (!caseSensitive) {
      flags += 'i';
    }
    
    if (additionalFlags) {
      flags += additionalFlags;
    }
    
    return flags;
  }

  /**
   * 构建可执行代码
   */
  private async buildExecutableCode(
    code: string,
    language: string,
    context: any,
    env: Record<string, any>
  ): Promise<string> {
    // 🔧 从模型响应中提取纯代码（去除markdown等格式）
    let extractedCode = context.model_response || '';
    
    try {
      const { codeExtractor } = await import('@/lib/code-extractor');
      const extractionResult = await codeExtractor.extractCode(
        context.model_response || '',
        { type: 'auto' }, // 自动检测提取策略
        language as 'python' | 'javascript' | 'typescript',
        true // 启用fallback
      );
      
      if (extractionResult.success && extractionResult.extracted_code) {
        extractedCode = extractionResult.extracted_code.code;
        console.log(`✅ 代码提取成功: ${language}, 置信度: ${extractionResult.extracted_code.confidence}%`);
        console.log(`   提取方法: ${extractionResult.extracted_code.extraction_method}`);
        console.log(`   提取的代码长度: ${extractedCode.length} 字符`);
      } else {
        console.log(`⚠️  代码提取失败，使用原始响应: ${extractionResult.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.log(`❌ 代码提取异常，使用原始响应: ${error}`);
    }
    
    // 清理提取后代码中的Unicode字符
    const cleanedModelResponse = CodeTemplateEngine.cleanCodeString(extractedCode);
    console.log(`🧹 Unicode清理完成，清理后长度: ${cleanedModelResponse.length} 字符`);
    
    // 算法题描述格式解析器
    const parseAlgorithmDescription = (description: string): any => {
      // 算法题常见格式：s = "cbbd", nums = [1,2,0], lists = [[1,4,5],[1,3,4]]
      try {
        const result: any = {};
        
        // 处理多个变量赋值: s = "abc", nums = [1,2,3]
        const assignments = description.split(',');
        
        for (let assignment of assignments) {
          assignment = assignment.trim();
          
          // 匹配 variable = value 格式
          const match = assignment.match(/^(\w+)\s*=\s*(.+)$/);
          if (match) {
            const varName = match[1].trim();
            const varValue = match[2].trim();
            
            try {
              // 尝试解析为JSON
              result[varName] = JSON.parse(varValue);
            } catch {
              // 如果不是有效JSON，智能处理
              if (varValue.match(/^".*"$/)) {
                // 带引号的字符串，去掉引号
                result[varName] = varValue.replace(/^"(.*)"$/, '$1');
              } else if (varValue.match(/^\w+$/)) {
                // 单个标识符，可能是变量引用或字符串值
                // 为了安全，当作字符串处理
                result[varName] = varValue;
              } else {
                // 其他复杂表达式，保持原样
                result[varName] = varValue;
              }
            }
          }
        }
        
        // 返回解析结果
        const keys = Object.keys(result);
        if (keys.length === 1) {
          // 单变量时，既返回变量对象也保留直接访问
          // 这样既支持 get_param('a') 也支持直接使用值
          return { 
            [keys[0]]: result[keys[0]], 
            _value: result[keys[0]],  // 直接值访问
            _isSingleVar: true 
          };
        } else if (keys.length > 1) {
          return result;
        }
        
        // 如果没有匹配到变量格式，尝试直接解析
        return JSON.parse(description);
      } catch {
        // 如果都失败了，返回原字符串
        return description;
      }
    };

    // Python专用序列化函数：修复JavaScript/Python布尔值兼容性问题
    const pythonSerialize = (value: any): string => {
      if (value === null || value === undefined) {
        return value === null ? 'None' : 'None';  // Python的null是None
      }

      // 处理布尔值：JavaScript true/false -> Python True/False
      if (typeof value === 'boolean') {
        return value ? 'True' : 'False';
      }

      // 处理字符串中的JavaScript布尔字面量
      if (typeof value === 'string') {
        // 检查是否是JavaScript布尔字面量字符串
        if (value === 'true') {
          return 'True';
        }
        if (value === 'false') {
          return 'False';
        }

        // 检查是否是算法题描述格式: s = "cbbd" 或 nums = [1,2,0]
        if (value.includes('=')) {
          const parsed = parseAlgorithmDescription(value);

          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            // 多变量对象
            const keys = Object.keys(parsed);
            return pythonSerialize(parsed) + ` # 算法题格式，可通过 test_input['${keys[0]}'] 访问`;
          } else {
            // 单变量值
            return pythonSerialize(parsed) + ` # 从算法题描述解析`;
          }
        }

        // 普通字符串
        return JSON.stringify(value);
      }

      // 处理数组：递归处理每个元素
      if (Array.isArray(value)) {
        const serializedElements = value.map(item => pythonSerialize(item));
        return `[${serializedElements.join(', ')}]`;
      }

      // 处理对象：递归处理每个属性
      if (typeof value === 'object') {
        const serializedPairs = Object.entries(value).map(([key, val]) => {
          return `${JSON.stringify(key)}: ${pythonSerialize(val)}`;
        });
        return `{${serializedPairs.join(', ')}}`;
      }

      // 其他类型（数字等）直接使用JSON序列化
      return JSON.stringify(value);
    };

    // 智能序列化函数：处理不同类型的输入输出
    const smartSerialize = (value: any): string => {
      if (value === null || value === undefined) {
        return JSON.stringify(value);
      }

      // 如果是字符串，检查是否是算法题描述格式
      if (typeof value === 'string') {
        // 检查是否是算法题变量赋值格式: s = "cbbd" 或 nums = [1,2,0]
        if (value.includes('=')) {
          const parsed = parseAlgorithmDescription(value);

          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            // 多变量对象
            const keys = Object.keys(parsed);
            return JSON.stringify(parsed) + ` # 算法题格式，可通过 test_input['${keys[0]}'] 访问`;
          } else {
            // 单变量值
            return JSON.stringify(parsed) + ` # 从算法题描述解析`;
          }
        }
        return JSON.stringify(value);
      }

      // 如果是对象，检查是否有特殊的序列化需求
      if (typeof value === 'object' && !Array.isArray(value)) {
        // 算法题对象：{s: "ab", p: ".*"} => 可能需要解构
        const keys = Object.keys(value);
        if (keys.length <= 5 && keys.every(k => typeof k === 'string' && k.length <= 15)) {
          // 算法题参数对象，提供解构访问提示
          return JSON.stringify(value) + ` # 可通过 test_input['${keys[0]}'] 等访问`;
        }
      }

      return JSON.stringify(value);
    };
    
    // 为不同语言添加上下文变量
    let contextSetup = '';
    
    switch (language.toLowerCase()) {
      case 'python':
        contextSetup = `
import json
import os

# 🔧 兼容性修复：定义可能被引用的变量
testCaseResults = []
tolerance_details = []
tolerance_applied = False
test_results = []
evaluation_results = []
final_score = 0.0

# 测试上下文（Python兼容序列化）
test_input = ${pythonSerialize(context.test_input)}
model_response = ${JSON.stringify(cleanedModelResponse)}
reference_answer = ${pythonSerialize(context.reference_answer || '')}
test_case_metadata = ${pythonSerialize(context.test_case_metadata || {})}

# 🔧 模型代码安全插入（直接插入，避免exec()）
# === 开始：模型代码 ===
${this.normalizeCodeIndentation(cleanedModelResponse)}
# === 结束：模型代码 ===

# 简化的便捷函数
def get_input():
    """获取测试输入"""
    return test_input

def get_answer():
    """获取期望答案"""
    return reference_answer

# 环境变量
${Object.entries(env).map(([k, v]) => `os.environ['${k}'] = ${JSON.stringify(v)}`).join('\n')}

`;
        break;
      case 'javascript':
      case 'typescript':
        contextSetup = `
// 🔧 兼容性修复：定义可能被引用的变量
let testCaseResults = [];
let tolerance_details = [];
let tolerance_applied = false;
let test_results = [];
let evaluation_results = [];
let final_score = 0.0;

// 测试上下文（智能序列化）
const test_input = ${smartSerialize(context.test_input)};
const model_response = ${JSON.stringify(cleanedModelResponse)};
const reference_answer = ${smartSerialize(context.reference_answer || '')};
const test_case_metadata = ${JSON.stringify(context.test_case_metadata || {})};

// 🔧 模型代码安全插入（直接插入，避免eval()）
// === 开始：模型代码 ===
${this.normalizeCodeIndentation(cleanedModelResponse)}
// === 结束：模型代码 ===

// 简化的便捷函数
function getInput() {
    // 获取测试输入
    return test_input;
}

function getAnswer() {
    // 获取期望答案
    return reference_answer;
}

// 环境变量
${Object.entries(env).map(([k, v]) => `process.env['${k}'] = ${JSON.stringify(v)};`).join('\n')}

`;
        break;
      case 'java':
        contextSetup = `
// 测试上下文（Java格式）
import java.util.*;
import java.util.stream.Collectors;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

class TestContext {
    private static final Gson gson = new Gson();
    public static final String test_input_json = ${JSON.stringify(JSON.stringify(context.test_input))};
    public static final String model_response = ${JSON.stringify(cleanedModelResponse)};
    public static final String reference_answer_json = ${JSON.stringify(JSON.stringify(context.reference_answer || ''))};
    
    // 便捷访问方法
    public static Map<String, Object> getTestParams() {
        try {
            return gson.fromJson(test_input_json, new TypeToken<Map<String, Object>>(){}.getType());
        } catch (Exception e) {
            Map<String, Object> result = new HashMap<>();
            result.put("input", test_input_json);
            return result;
        }
    }
    
    public static Object getParam(String name) {
        Map<String, Object> params = getTestParams();
        return params.get(name);
    }
    
    public static String getParamAsString(String name) {
        Object value = getParam(name);
        return value != null ? value.toString().replace("\\"", "") : null;
    }
    
    public static List<Integer> getParamAsIntList(String name) {
        Object value = getParam(name);
        if (value instanceof List) {
            return ((List<?>) value).stream()
                .map(item -> ((Double) item).intValue())
                .collect(Collectors.toList());
        }
        return new ArrayList<>();
    }
    
    // 智能函数检测和测试系统
    public static void runSmartTest() {
        System.out.println("🚀 Java智能算法测试开始");
        
        // 显示输入数据信息
        System.out.println("📊 测试数据: " + test_input_json);
        System.out.println("📊 期望结果: " + reference_answer_json);
        
        // 尝试检测和调用主函数
        boolean testPassed = false;
        
        try {
            // 获取当前类的所有方法
            Method[] methods = Class.forName("Solution").getMethods();
            Method mainMethod = null;
            
            // 智能选择主方法
            // 1. 优先选择包含问题关键词的方法
            String[] problemKeywords = {"palindrome", "merge", "missing", "substring", "sort", "search", "find", "solve", "solution"};
            for (String keyword : problemKeywords) {
                for (Method method : methods) {
                    if (method.getName().toLowerCase().contains(keyword) && !method.getName().equals("getClass")) {
                        mainMethod = method;
                        break;
                    }
                }
                if (mainMethod != null) break;
            }
            
            // 2. 如果没找到，查找main方法
            if (mainMethod == null) {
                String[] priorityNames = {"main", "solution", "solve", "algorithm", "run", "execute"};
                for (String priority : priorityNames) {
                    for (Method method : methods) {
                        if (method.getName().toLowerCase().equals(priority)) {
                            mainMethod = method;
                            break;
                        }
                    }
                    if (mainMethod != null) break;
                }
            }
            
            // 3. 选择参数数量匹配的方法
            if (mainMethod == null) {
                Map<String, Object> params = getTestParams();
                int expectedParams = params.size() > 1 ? params.size() : 1;
                
                for (Method method : methods) {
                    if (method.getParameterCount() == expectedParams && 
                        !method.getName().equals("getClass") &&
                        !method.getName().startsWith("get") &&
                        !method.getName().contains("Test")) {
                        mainMethod = method;
                        break;
                    }
                }
            }
            
            if (mainMethod != null) {
                System.out.println("🎯 检测到主方法: " + mainMethod.getName());
                
                // 创建Solution实例并调用方法
                Object solutionInstance = Class.forName("Solution").newInstance();
                Object result = null;
                
                // 智能参数传递
                if (mainMethod.getParameterCount() == 1) {
                    String paramName = "s"; // 默认参数名，可根据需要调整
                    if (getParam(paramName) != null) {
                        result = mainMethod.invoke(solutionInstance, getParamAsString(paramName));
                    } else {
                        result = mainMethod.invoke(solutionInstance, test_input_json);
                    }
                } else if (mainMethod.getParameterCount() == 2) {
                    result = mainMethod.invoke(solutionInstance, 
                        getParamAsString("s"), 
                        getParam("words") != null ? getParamAsIntList("words") : getParamAsString("p"));
                } else {
                    result = mainMethod.invoke(solutionInstance);
                }
                
                System.out.println("📤 方法执行结果: " + result);
                
                // 结果比较
                String expected = reference_answer_json.replace("\\"", "");
                String actual = result.toString();
                
                if (actual.equals(expected)) {
                    testPassed = true;
                    System.out.println("✅ " + mainMethod.getName() + " 测试通过！");
                } else {
                    System.out.println("❌ " + mainMethod.getName() + " 测试失败");
                    System.out.println("   期望: " + expected);
                    System.out.println("   实际: " + actual);
                }
            } else {
                System.out.println("❌ 未检测到可执行的算法方法");
                System.out.println("💡 提示：请确保代码中包含Solution类和主要算法方法");
            }
        } catch (Exception e) {
            System.out.println("❌ 智能测试执行异常: " + e.getMessage());
        }
        
        // 输出最终分数
        System.out.println("SCORE: " + (testPassed ? "100" : "0"));
    }
}

`;
        break;
      case 'cpp':
      case 'c++':
        contextSetup = `
#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <sstream>
#include <algorithm>
#include <functional>
#include <typeinfo>

// 测试上下文（C++格式）
namespace TestContext {
    const std::string test_input_json = ${JSON.stringify(JSON.stringify(context.test_input))};
    const std::string model_response = ${JSON.stringify(cleanedModelResponse)};
    const std::string reference_answer_json = ${JSON.stringify(JSON.stringify(context.reference_answer || ''))};
    
    // 简单JSON解析（仅支持基本格式）
    std::string getStringParam(const std::string& name) {
        std::string pattern = "\\"" + name + "\\":\\"";
        size_t pos = test_input_json.find(pattern);
        if (pos != std::string::npos) {
            size_t start = pos + pattern.length();
            size_t end = test_input_json.find("\\"", start);
            if (end != std::string::npos) {
                return test_input_json.substr(start, end - start);
            }
        }
        return "";
    }
    
    std::vector<int> getIntArrayParam(const std::string& name) {
        std::string pattern = "\\"" + name + "\\":[";
        size_t pos = test_input_json.find(pattern);
        std::vector<int> result;
        if (pos != std::string::npos) {
            size_t start = pos + pattern.length();
            size_t end = test_input_json.find("]", start);
            if (end != std::string::npos) {
                std::string nums = test_input_json.substr(start, end - start);
                std::stringstream ss(nums);
                std::string num;
                while (std::getline(ss, num, ',')) {
                    result.push_back(std::stoi(num));
                }
            }
        }
        return result;
    }
    
    // 🔍 C++ 智能函数检测辅助系统
    template<typename T>
    void attemptFunctionCall(const std::string& funcName) {
        std::cout << "🎯 尝试调用函数: " << funcName << std::endl;
        std::cout << "📊 测试数据: " << test_input_json << std::endl;
        
        try {
            // 这里需要具体的函数实例，C++没有像Python/Java那样的动态反射
            // 但我们可以提供一个通用的测试框架指导
            
            std::string param1 = getStringParam("s");
            std::vector<int> param2 = getIntArrayParam("arr");
            
            std::cout << "📈 准备参数: " << std::endl;
            std::cout << "   字符串参数: " << param1 << std::endl;
            std::cout << "   数组参数大小: " << param2.size() << std::endl;
            
            // 输出提示信息
            std::cout << "💡 C++智能检测提示:" << std::endl;
            std::cout << "   1. 确保您的主算法函数在Solution类或全局作用域中" << std::endl;
            std::cout << "   2. 推荐函数名: solve(), solution(), algorithm(), main()" << std::endl;
            std::cout << "   3. 参数应该匹配测试输入的类型和数量" << std::endl;
            
        } catch (const std::exception& e) {
            std::cout << "❌ 函数调用失败: " << e.what() << std::endl;
        }
    }
    
    // 智能测试运行器
    void runSmartTest() {
        std::cout << "🚀 C++智能算法测试开始" << std::endl;
        attemptFunctionCall<void>("main_algorithm");
        
        // 由于C++的编译时特性，这里主要提供指导和测试框架
        // 用户需要手动调用其算法函数，但我们提供了数据访问接口
        std::cout << "📋 使用指南:" << std::endl;
        std::cout << "   1. 调用 TestContext::getStringParam(\\"参数名\\") 获取字符串参数" << std::endl;
        std::cout << "   2. 调用 TestContext::getIntArrayParam(\\"参数名\\") 获取整数数组参数" << std::endl;
        std::cout << "   3. 将结果输出到 std::cout，格式: RESULT: 您的结果" << std::endl;
        
        // 示例调用模式
        std::cout << "💻 示例调用模式:" << std::endl;
        std::cout << "   auto result = yourSolution(getStringParam(\\"s\\"));" << std::endl;
        std::cout << "   std::cout << \\"RESULT: \\" << result << std::endl;" << std::endl;
    }
}

`;
        break;
      case 'go':
        contextSetup = `
package main

import (
    "encoding/json"
    "fmt"
    "reflect"
    "strings"
    "runtime"
)

// 测试上下文（Go格式）
var testInputJSON = ${JSON.stringify(JSON.stringify(context.test_input))}
var modelResponse = ${JSON.stringify(cleanedModelResponse)}
var referenceAnswerJSON = ${JSON.stringify(JSON.stringify(context.reference_answer || ''))}

// 便捷访问函数
func getTestParams() map[string]interface{} {
    var result map[string]interface{}
    json.Unmarshal([]byte(testInputJSON), &result)
    return result
}

func getParam(name string) interface{} {
    params := getTestParams()
    return params[name]
}

func getStringParam(name string) string {
    if val := getParam(name); val != nil {
        return fmt.Sprintf("%v", val)
    }
    return ""
}

func getIntSliceParam(name string) []int {
    if val := getParam(name); val != nil {
        if reflect.TypeOf(val).Kind() == reflect.Slice {
            s := reflect.ValueOf(val)
            result := make([]int, s.Len())
            for i := 0; i < s.Len(); i++ {
                result[i] = int(s.Index(i).Interface().(float64))
            }
            return result
        }
    }
    return []int{}
}

// 🔍 Go 智能函数检测系统
func runSmartTest() {
    fmt.Println("🚀 Go智能算法测试开始")
    fmt.Printf("📊 测试数据: %s\\n", testInputJSON)
    fmt.Printf("📊 期望结果: %s\\n", referenceAnswerJSON)
    
    // Go的反射能力有限，但我们可以提供智能指导和测试框架
    params := getTestParams()
    
    fmt.Println("📈 解析的测试参数:")
    for key, value := range params {
        fmt.Printf("   %s: %v (类型: %T)\\n", key, value, value)
    }
    
    // 智能参数准备
    var stringParams []string
    var intSliceParams [][]int
    
    for key, value := range params {
        switch v := value.(type) {
        case string:
            stringParams = append(stringParams, v)
            fmt.Printf("🔤 检测到字符串参数: %s = \\"%s\\"\\n", key, v)
        case []interface{}:
            if len(v) > 0 {
                // 尝试转换为整数切片
                intSlice := make([]int, len(v))
                canConvert := true
                for i, item := range v {
                    if num, ok := item.(float64); ok {
                        intSlice[i] = int(num)
                    } else {
                        canConvert = false
                        break
                    }
                }
                if canConvert {
                    intSliceParams = append(intSliceParams, intSlice)
                    fmt.Printf("🔢 检测到整数数组参数: %s = %v\\n", key, intSlice)
                }
            }
        }
    }
    
    fmt.Println("🎯 智能函数调用提示:")
    
    // 提供不同的调用模式建议
    if len(stringParams) == 1 && len(intSliceParams) == 0 {
        fmt.Printf("💡 建议调用模式1: result := yourSolution(\\"%s\\")\\n", stringParams[0])
    } else if len(stringParams) == 0 && len(intSliceParams) == 1 {
        fmt.Printf("💡 建议调用模式2: result := yourSolution(%v)\\n", intSliceParams[0])
    } else if len(stringParams) == 1 && len(intSliceParams) == 1 {
        fmt.Printf("💡 建议调用模式3: result := yourSolution(\\"%s\\\", %v)\\n", stringParams[0], intSliceParams[0])
    } else {
        fmt.Println("💡 建议调用模式4: result := yourSolution() // 无参数调用")
    }
    
    // Go反射检测函数（有限支持）
    fmt.Println("🔍 Go函数检测指南:")
    fmt.Println("   1. 推荐函数名: solution(), solve(), algorithm(), process()")
    fmt.Println("   2. 确保您的函数是导出的（首字母大写）或者在main包中")
    fmt.Println("   3. 使用上述参数准备方式调用您的算法函数")
    
    // 提供通用测试模板
    fmt.Println("📋 Go测试模板:")
    fmt.Println("   func Solution(param string) string {")
    fmt.Println("       // 您的算法实现")
    fmt.Println("       return result")
    fmt.Println("   }")
    fmt.Println()
    fmt.Println("   // 调用示例:")
    fmt.Println("   result := Solution(getStringParam(\\"s\\"))")
    fmt.Println("   fmt.Printf(\\"RESULT: %v\\\\n\\", result)")
    
    // 尝试智能推断最可能的函数签名
    fmt.Println("🧠 智能推断的函数签名:")
    if len(params) == 1 {
        for key, value := range params {
            switch value.(type) {
            case string:
                fmt.Printf("   func YourSolution(%s string) YourReturnType\\n", key)
            case []interface{}:
                fmt.Printf("   func YourSolution(%s []int) YourReturnType\\n", key)
            default:
                fmt.Printf("   func YourSolution(%s interface{}) YourReturnType\\n", key)
            }
            break
        }
    } else if len(params) > 1 {
        fmt.Print("   func YourSolution(")
        paramStrs := make([]string, 0, len(params))
        for key, value := range params {
            switch value.(type) {
            case string:
                paramStrs = append(paramStrs, fmt.Sprintf("%s string", key))
            case []interface{}:
                paramStrs = append(paramStrs, fmt.Sprintf("%s []int", key))
            default:
                paramStrs = append(paramStrs, fmt.Sprintf("%s interface{}", key))
            }
        }
        fmt.Printf("%s) YourReturnType\\n", strings.Join(paramStrs, ", "))
    }
    
    // 运行时信息
    fmt.Printf("🏃 运行时信息: Go %s, GOOS: %s, GOARCH: %s\\n", 
        runtime.Version(), runtime.GOOS, runtime.GOARCH)
        
    fmt.Println("✅ Go智能检测完成，请按照上述提示调用您的算法函数")
}

`;
        break;
      default:
        contextSetup = `// Context variables for ${language}
// 测试输入（JSON格式）: ${JSON.stringify(context.test_input)}  
// 模型响应: ${JSON.stringify(cleanedModelResponse)}
// 期望输出: ${JSON.stringify(context.reference_answer || '')}
// 注意：请根据您的语言手动解析上述JSON格式的数据
`;
    }

    return contextSetup + '\n' + code;
  }

  /**
   * 标准化代码缩进，确保代码能正确插入到上下文中
   */
  private normalizeCodeIndentation(code: string): string {
    if (!code || typeof code !== 'string') {
      return '';
    }

    const lines = code.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim() !== '');

    if (nonEmptyLines.length === 0) {
      return code;
    }

    // 找到最小缩进级别
    let minIndent = Infinity;
    for (const line of nonEmptyLines) {
      const match = line.match(/^(\s*)/);
      if (match) {
        const indentLevel = match[1].length;
        minIndent = Math.min(minIndent, indentLevel);
      }
    }

    // 如果最小缩进大于0，去除多余的缩进
    if (minIndent > 0 && minIndent !== Infinity) {
      return lines.map(line => {
        if (line.trim() === '') {
          return line;
        }
        return line.substring(minIndent);
      }).join('\n');
    }

    return code;
  }

  /**
   * 加载代码模板并生成可执行代码
   */
  private async loadCodeTemplate(templateId: string, templateConfig: any = {}, context?: any): Promise<{ code: string; templateInfo: { name: string; description?: string; category?: string } }> {
    console.log(`🔧 开始加载代码模板: ${templateId}`);

    try {
      // 1. 从数据库获取模板
      // Using global supabase singleton

      // 首先检查code_evaluation_templates表
      const { data: template, error } = await supabase
        .from('code_evaluation_templates')
        .select('*')
        .eq('id', templateId)
        .eq('is_active', true)
        .single();

      if (error && error.code === 'PGRST116') {
        // 如果在code_evaluation_templates中找不到，检查templates表
        console.log(`📋 code_evaluation_templates中未找到模板 ${templateId}，检查templates表...`);

        const { data: unifiedTemplate, error: unifiedError } = await supabase
          .from('templates')
          .select('*')
          .eq('id', templateId)
          .eq('status', 'active')
          .single();

        if (unifiedError) {
          if (unifiedError.code === 'PGRST116') {
            throw new Error(`模板不存在: ${templateId} (在code_evaluation_templates和templates表中都未找到)`);
          }
          throw new Error(`获取unified模板失败: ${unifiedError.message}`);
        }

        // 如果找到unified模板但不是CODE类型，返回错误
        if (unifiedTemplate.template_type !== 'unified') {
          throw new Error(`模板 ${templateId} 不是CODE类型的评估模板 (type: ${unifiedTemplate.template_type})`);
        }

        // 为unified模板创建一个适合的提示消息
        console.log(`⚠️ 使用unified模板 "${unifiedTemplate.name}"，但缺少code_evaluation_templates条目`);
        const errorMessage = `模板 ${unifiedTemplate.name} (${templateId}) 缺少CODE类型评估配置`;

        // 返回错误处理代码
        const errorCode = `# 模板配置不完整，无法执行评估
# 模板名称: ${unifiedTemplate.name}
# 错误原因: ${errorMessage}
print("评估失败: ${errorMessage.replace(/"/g, '\\"')}")
print("SCORE: 0")
import sys
sys.exit(0)`;

        return {
          code: errorCode,
          templateInfo: {
            name: unifiedTemplate.name,
            description: `模板配置不完整: ${errorMessage}`,
            category: 'error'
          }
        };
      }

      if (error) {
        throw new Error(`获取代码模板失败: ${error.message}`);
      }

      if (!template) {
        throw new Error(`代码模板不存在: ${templateId}`);
      }

      console.log(`✅ 成功获取模板: ${template.name} (${template.category})`);
      console.log(`🎯 混合评估将使用算法模板: "${template.name}"`);
      console.log(`   📋 模板描述: ${template.description || '无描述'}`);
      console.log(`   🏷️ 模板分类: ${template.category}`);
      console.log(`   💬 编程语言: ${template.language}`);
      if (template.tags && template.tags.length > 0) {
        console.log(`   🏷️ 模板标签: ${template.tags.join(', ')}`);
      }

      // 2. 使用模板引擎生成代码
      const templateData: CodeEvaluationTemplate = {
        id: template.id,
        name: template.name,
        description: template.description,
        category: template.category,
        language: template.language,
        template_code: template.template_code,
        config_schema: template.config_schema || {},
        example_config: template.example_config || {},
        tags: template.tags || [],
        is_active: template.is_active,
        created_at: template.created_at,
        updated_at: template.updated_at
      };

      // 🔧 从执行上下文中提取模型代码用于直接插入
      const modelCode = context?.model_response || '';
      console.log(`🎯 传递模型代码到模板引擎，长度: ${modelCode.length} 字符`);

      const result = await codeTemplateEngine.generateCode(templateData, templateConfig, modelCode);

      if (result.validation_errors && result.validation_errors.length > 0) {
        console.warn('⚠️ 模板配置验证警告:', result.validation_errors);
      }

      if (!result.generated_code) {
        // 不抛出异常，而是返回错误说明的代码，让评估器给出0分
        const errorMessage = result.validation_errors?.join('; ') || '模板生成的代码为空';
        console.log(`❌ 模板生成失败: ${errorMessage}`);
        console.log(`   → 将返回错误提示代码，评估结果为0分`);
        
        // 返回一个包含错误信息的Python代码
        const errorCode = `# 模板生成失败，无法执行评估
# 错误原因: ${errorMessage}
print("评估失败: ${errorMessage.replace(/"/g, '\\"')}")
print("SCORE: 0")
import sys
sys.exit(0)`;
        
        return {
          code: errorCode,
          templateInfo: {
            name: template.name,
            description: `模板生成失败: ${errorMessage}`,
            category: template.category
          }
        };
      }

      console.log(`✅ 代码模板生成成功，代码长度: ${result.generated_code.length} 字符`);
      console.log(`📝 生成的代码预览:\n${result.generated_code.substring(0, 200)}${result.generated_code.length > 200 ? '...' : ''}`);

      // 🔍 验证关键变量定义
      console.log('🔍 TEMPLATE_VALIDATION: 验证生成代码中的关键变量');
      const criticalVars = [
        'testCaseResults = []',
        'test_results = []',
        'evaluation_results = []',
        'final_score = '
      ];

      criticalVars.forEach(varDef => {
        const hasVar = result.generated_code.includes(varDef);
        console.log(`   ${hasVar ? '✅' : '❌'} ${varDef}: ${hasVar ? '已定义' : '缺失'}`);
      });

      // 🔍 检查是否还包含markdown标记
      if (result.generated_code.includes('```')) {
        console.log('⚠️ TEMPLATE_VALIDATION: 生成的代码仍包含markdown标记');
        const markdownLines = result.generated_code.split('\n').filter(line => line.includes('```'));
        markdownLines.slice(0, 3).forEach((line, i) => {
          console.log(`   行${i + 1}: ${line.trim()}`);
        });
      } else {
        console.log('✅ TEMPLATE_VALIDATION: 没有发现markdown标记残留');
      }

      return {
        code: result.generated_code,
        templateInfo: {
          name: template.name,
          description: template.description,
          category: template.category
        }
      };

    } catch (error) {
      console.error('❌ 加载代码模板失败:', error);
      throw error;
    }
  }

  /**
   * 创建人工评分任务（模拟实现）
   */
  private async createHumanEvaluationTask(params: {
    context: EvaluationContext;
    guidelines: string;
    criteria: any[];
    score_range: { min: number; max: number; step: number };
  }): Promise<string> {
    // TODO: 实际实现应该创建数据库记录并发送通知
    // 这里返回模拟的任务ID
    const taskId = `human_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🧑 Created human evaluation task: ${taskId}`);
    console.log(`Guidelines: ${params.guidelines}`);
    
    return taskId;
  }

  /**
   * 🆕 获取测试用例的代码执行配置（新架构支持）
   * 这是连接新旧架构的关键方法
   */
  private async getTestCaseWithCodeConfig(testCaseId: string): Promise<any> {
    try {
      console.log(`🔍 查询测试用例代码配置: ${testCaseId}`);

      // Using global supabase singleton
      const { data: testCase, error } = await supabase
        .from('test_cases')
        .select('id, code_test_config, execution_environment, validation_rules, metadata')
        .eq('id', testCaseId)
        .single();

      if (error) {
        console.log(`   ⚠️  查询测试用例失败: ${error.message}`);
        return null; // 返回null表示使用旧格式兼容模式
      }

      // 检查是否有新的代码配置
      if (testCase.code_test_config) {
        console.log(`   ✅ 找到新格式代码配置`);
        return {
          id: testCase.id,
          code_test_config: testCase.code_test_config,
          execution_environment: testCase.execution_environment,
          validation_rules: testCase.validation_rules,
          metadata: testCase.metadata
        };
      } else {
        console.log(`   📝 测试用例无代码配置，使用兼容模式`);
        return null;
      }
    } catch (error) {
      console.error(`   ❌ 查询测试用例异常: ${error}`);
      return null; // 发生异常时回退到兼容模式
    }
  }

  /**
   * 🏗️ 新架构核心函数：从题目描述中提取测试用例
   *
   * 【功能说明】
   * 在新架构中，CODE评分器是通用工具，测试用例数据来源于题目级别。
   * 算法题的测试用例以"示例"形式嵌入在题目描述中，此函数负责解析提取。
   *
   * 【输入格式】题目描述字符串，包含：
   * ```
   * 编程题：[问题描述]
   *
   * 示例 1：
   * 输入：s1 = "internationalization", s2 = "i18n"
   * 输出：true
   * 解释：...
   *
   * 示例 2：
   * 输入：s1 = "l123e", s2 = "44"
   * 输出：true
   * 解释：...
   * ```
   *
   * 【输出格式】标准化的测试用例数组：
   * ```javascript
   * [
   *   {
   *     input: {s1: "internationalization", s2: "i18n"},
   *     expected: true,
   *     description: "示例 1"
   *   },
   *   {
   *     input: {s1: "l123e", s2: "44"},
   *     expected: true,
   *     description: "示例 2"
   *   }
   * ]
   * ```
   *
   * 【架构重要性】
   * - 这是新旧架构的桥梁：将题目级别数据转换为评分器期望格式
   * - 如果此函数失效，CODE评分器将无法获取测试用例，导致评分失败
   * - 如果返回空数组，会回退到硬编码的默认测试用例（不正确）
   */
  private extractExamplesFromDescription(description: string): any[] {
    console.log('🔍 从问题描述中提取示例...');

    const examples = [];

    try {
      // 🔧 修复：匹配新的示例格式：示例 X：\n输入：s1 = "...", s2 = "..."\n输出：true/false
      const exampleMatches = description.matchAll(/示例\s*(\d+)[：:]\s*\n([\s\S]*?)(?=示例\s*\d+[：:]|提示：|要求：|$)/g);

      for (const match of exampleMatches) {
        const exampleNum = match[1];
        const exampleContent = match[2];

        console.log(`   发现示例 ${exampleNum}`);

        // 从示例内容中提取输入和输出
        const inputMatch = exampleContent.match(/输入[：:]\s*(.+)/);
        const outputMatch = exampleContent.match(/输出[：:]\s*(.+)/);

        if (inputMatch && outputMatch) {
          const inputStr = inputMatch[1].trim();
          const outputStr = outputMatch[1].trim();

          console.log(`   解析输入: ${inputStr}`);
          console.log(`   解析输出: ${outputStr}`);

          try {
            let parsedInput, parsedOutput;

            // 解析输入：处理 s1 = "...", s2 = "..." 格式
            if (inputStr.includes('=')) {
              const vars = {};
              const assignments = inputStr.split(',').map(s => s.trim());

              for (const assignment of assignments) {
                const [varName, varValue] = assignment.split('=').map(s => s.trim());
                if (varValue.startsWith('"') && varValue.endsWith('"')) {
                  vars[varName] = varValue.slice(1, -1);
                } else {
                  try {
                    vars[varName] = JSON.parse(varValue);
                  } catch {
                    vars[varName] = varValue;
                  }
                }
              }
              parsedInput = vars;
            } else {
              // 直接解析JSON或保持原样
              try {
                parsedInput = JSON.parse(inputStr);
              } catch {
                parsedInput = inputStr;
              }
            }

            // 解析输出：处理 true/false 或其他值
            if (outputStr === 'true' || outputStr === 'false') {
              parsedOutput = outputStr === 'true';
            } else {
              try {
                parsedOutput = JSON.parse(outputStr);
              } catch {
                parsedOutput = outputStr;
              }
            }

            examples.push({
              input: parsedInput,
              expected: parsedOutput,
              description: `示例 ${exampleNum}`
            });

            console.log(`   ✅ 成功解析示例 ${exampleNum}`);

          } catch (parseError) {
            console.log(`   ❌ 解析示例 ${exampleNum} 失败: ${parseError}`);
          }
        }
      }

      console.log(`   总共提取到 ${examples.length} 个示例`);
      return examples;

    } catch (error) {
      console.log(`   提取过程出错: ${error}`);
      return [];
    }
  }

}

// 导出单例实例
export const evaluatorEngine = new EvaluatorEngine();