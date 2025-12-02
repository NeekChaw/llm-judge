/**
 * 评分器兼容性处理模块
 * 
 * 功能：
 * - 自动处理新旧数据格式兼容
 * - 运行时配置解析和合并
 * - 向后兼容性保证
 * - 🚀 性能优化：配置解析缓存
 */

// 🚀 配置解析缓存 - 避免重复处理相同的评分器配置
const configCache = new Map<string, EvaluationExecutionContext>();
const cacheExpiration = new Map<string, number>();
const CACHE_TTL = 60000; // 1分钟缓存

export interface LegacyCodeEvaluatorConfig {
  testCases?: Array<{
    input: any;
    expected: any;
    description?: string;
    strictMatch?: boolean;
    ignoreWhitespace?: boolean;
    validator?: string;
  }>;
  timeout?: number;
  memoryLimit?: number;
  language?: string;
  entryPointStrategy?: string;
  scoring_method?: string;
  scoring_weights?: {
    correctness: number;
    performance: number;
    style?: number;
  };
}

export interface ModernTestCaseConfig {
  code_test_config: {
    test_data: Array<{
      input: any;
      expected: any;
      description?: string;
    }>;
    execution_config: {
      timeout_ms: number;
      memory_limit_mb: number;
      entry_point_strategy: string;
    };
  };
  execution_environment: string;
  validation_rules: {
    strict_output_match: boolean;
    ignore_whitespace: boolean;
    custom_validator?: string;
  };
}

export interface EvaluationExecutionContext {
  executionConfig: {
    timeout_ms: number;
    memory_limit_mb: number;
    entry_point_strategy: string;
    language: string;
  };
  testData: Array<{
    input: any;
    expected: any;
    description?: string;
  }>;
  validationRules: {
    strict_output_match: boolean;
    ignore_whitespace: boolean;
    custom_validator?: string;
  };
  scoringStrategy: {
    method: string;
    weights: {
      correctness: number;
      performance: number;
      style?: number;
    };
  };
}

/**
 * 🚀 清理过期缓存
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, expiration] of cacheExpiration.entries()) {
    if (now > expiration) {
      configCache.delete(key);
      cacheExpiration.delete(key);
    }
  }
}

/**
 * 🚀 缓存结果并返回
 */
function cacheAndReturn(cacheKey: string, result: EvaluationExecutionContext): EvaluationExecutionContext {
  const now = Date.now();
  configCache.set(cacheKey, result);
  cacheExpiration.set(cacheKey, now + CACHE_TTL);
  return result;
}

/**
 * 运行时配置解析器 - 自动兼容新旧格式 + 性能优化缓存
 */
export function resolveEvaluatorConfig(
  evaluator: { id: string; type: string; config: any },
  testCase?: { id: string; code_test_config?: any; execution_environment?: string; validation_rules?: any }
): EvaluationExecutionContext {
  
  // 🚀 缓存键生成：基于评分器ID + 测试用例ID（如果存在）
  const cacheKey = `${evaluator.id}_${testCase?.id || 'no_testcase'}`;
  const now = Date.now();
  
  // 🚀 检查缓存是否命中且未过期
  if (configCache.has(cacheKey) && cacheExpiration.has(cacheKey)) {
    const expiration = cacheExpiration.get(cacheKey)!;
    if (now < expiration) {
      console.log(`⚡ 缓存命中: ${evaluator.id} (${evaluator.type})`);
      return configCache.get(cacheKey)!;
    }
  }
  
  console.log(`🔄 解析评分器配置: ${evaluator.id} (类型: ${evaluator.type})`);
  
  // 🚀 清理过期缓存（每次解析时进行轻量级清理）
  if (Math.random() < 0.1) { // 10%的概率进行清理
    cleanExpiredCache();
  }
  
  const config = evaluator.config || {};
  
  // 场景1: 兼容旧格式 - 评分器包含内置testCases（迁移前的格式）
  if (config.testCases && Array.isArray(config.testCases) && !testCase) {
    console.log(`   📦 使用旧格式兼容模式 (${config.testCases.length} 个内置测试用例)`);
    
    return cacheAndReturn(cacheKey, {
      executionConfig: {
        timeout_ms: config.timeout || 30000,
        memory_limit_mb: config.memoryLimit || 256,
        entry_point_strategy: config.entryPointStrategy || 'intelligent',
        language: config.language || 'python'
      },
      testData: config.testCases.map((tc: any) => {
        const input = tc.input || tc.data;
        const expected = tc.expected || tc.expectedOutput;

        // 🎯 智能格式处理：保持原始格式，不强制转换数组
        let normalizedInput = input;
        let normalizedExpected = expected;

        // 🔧 智能解析字符串格式的输入（如果是字符串，尝试JSON解析）
        if (typeof input === 'string' && input.trim()) {
          try {
            normalizedInput = JSON.parse(input);
          } catch {
            // 如果解析失败，保持原字符串
            normalizedInput = input;
          }
        }

        // 🔧 智能解析字符串格式的期望输出
        if (typeof expected === 'string' && expected.trim()) {
          try {
            normalizedExpected = JSON.parse(expected);
          } catch {
            // 如果解析失败，保持原字符串
            normalizedExpected = expected;
          }
        }

        return {
          input: normalizedInput,
          expected: normalizedExpected,
          description: tc.description
        };
      }),
      validationRules: {
        strict_output_match: config.testCases[0]?.strictMatch || false,
        ignore_whitespace: config.testCases[0]?.ignoreWhitespace !== false,
        custom_validator: config.testCases[0]?.validator
      },
      scoringStrategy: {
        method: config.scoring_method || 'weighted',
        weights: config.scoring_weights || {
          correctness: 0.7,
          performance: 0.3
        }
      }
    });
  }
  
  // 场景2: 新格式 - 评分器 + 独立测试用例（迁移后的格式）
  if (testCase && testCase.code_test_config) {
    console.log(`   🆕 使用新格式 (测试用例ID: ${testCase.id})`);

    // 🔧 修复超时配置优先级：评分器配置 > 模板配置 > 测试用例配置 > 默认值
    const baseTimeout = testCase.code_test_config.execution_config.timeout_ms || 30000;
    const evaluatorTimeout = config.timeout_ms; // 评分器设置的超时
    const templateTimeout = config.template_config?.timeout_per_test; // 模板设置的单个测试超时

    // 优先级：评分器 > 模板 > 测试用例 > 默认值
    const finalTimeout = evaluatorTimeout || templateTimeout || baseTimeout;

    console.log(`   ⏱️  超时配置解析: 评分器=${evaluatorTimeout}ms, 模板=${templateTimeout}ms, 测试用例=${baseTimeout}ms, 最终使用=${finalTimeout}ms`);

    return cacheAndReturn(cacheKey, {
      executionConfig: {
        ...testCase.code_test_config.execution_config,
        timeout_ms: finalTimeout, // 🎯 确保评分器的超时配置生效
        language: testCase.execution_environment || config.language || 'python'
      },
      testData: (testCase.code_test_config.test_data || []).map((tc: any) => {
        // 🔧 智能数据格式转换：处理字符串格式的测试数据
        let input = tc.input;
        let expected = tc.expected;

        // 🆕 兼容旧数据格式：处理 expectedOutput 字段映射
        if (expected === undefined && tc.expectedOutput !== undefined) {
          expected = tc.expectedOutput;
          console.log(`🔧 字段映射: expectedOutput -> expected (${expected})`);
        }

        // 🆕 兼容其他可能的字段名
        if (expected === undefined && tc.expected_output !== undefined) {
          expected = tc.expected_output;
          console.log(`🔧 字段映射: expected_output -> expected (${expected})`);
        }

        if (expected === undefined && tc.reference_answer !== undefined) {
          expected = tc.reference_answer;
          console.log(`🔧 字段映射: reference_answer -> expected (${expected})`);
        }
        
        // 智能解析input：支持数组、对象、字符串、数字、多参数元组等
        if (typeof input === 'string' && input.trim()) {
          const trimmed = input.trim();
          // 检测多参数元组格式：("a", "b") 或 ('a', 'b') 或 (1, 2)
          if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
            try {
              const tupleContent = trimmed.slice(1, -1).trim();
              if (tupleContent) {
                // 解析元组内容，支持字符串、数字等 - 使用智能上下文
                const context: ParseContext = {
                  evaluatorType: evaluator.type,
                  templateDescription: testCase?.input || '',
                  isLegacyCompatMode: false
                };
                const parsedTuple = parseMultipleParameters(tupleContent, context);
                if (parsedTuple) {
                  input = parsedTuple;
                  console.log(`🔧 解析input多参数元组: "${trimmed}" -> ${JSON.stringify(input)}`);
                }
              }
            } catch (e) {
              console.warn(`⚠️ 无法解析多参数元组: ${trimmed}`, e);
            }
          }
          // 检测JSON格式（数组或对象）
          else if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || 
              (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            try {
              input = JSON.parse(trimmed);
              console.log(`🔧 解析input JSON: ${input} -> ${JSON.stringify(input)}`);
            } catch (e) {
              console.warn(`⚠️ 无法解析input JSON: ${trimmed}`, e);
            }
          }
          // 检测数字格式
          else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            input = parseFloat(trimmed);
            console.log(`🔧 解析input数字: "${trimmed}" -> ${input}`);
          }
          // 检测布尔值
          else if (trimmed === 'true' || trimmed === 'false') {
            input = trimmed === 'true';
            console.log(`🔧 解析input布尔值: "${trimmed}" -> ${input}`);
          }
          // 其他情况保持字符串格式
        }
        
        // 智能解析expected：支持数组、对象、字符串、数字等
        if (typeof expected === 'string' && expected.trim()) {
          const trimmed = expected.trim();
          // 检测JSON格式（数组或对象）
          if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || 
              (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            try {
              expected = JSON.parse(trimmed);
              console.log(`🔧 解析expected JSON: ${expected} -> ${JSON.stringify(expected)}`);
            } catch (e) {
              console.warn(`⚠️ 无法解析expected JSON: ${trimmed}`, e);
            }
          }
          // 检测数字格式
          else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            expected = parseFloat(trimmed);
            console.log(`🔧 解析expected数字: "${trimmed}" -> ${expected}`);
          }
          // 检测布尔值
          else if (trimmed === 'true' || trimmed === 'false') {
            expected = trimmed === 'true';
            console.log(`🔧 解析expected布尔值: "${trimmed}" -> ${expected}`);
          }
          // 其他情况保持字符串格式
        }
        
        // 🎯 保持原始格式：不强制转换为数组，维持数据的原始结构
        const normalizedInput = input;
        const normalizedExpected = expected;
        
        return {
          input: normalizedInput,
          expected: normalizedExpected,
          description: tc.description
        };
      }),
      validationRules: testCase.validation_rules || {
        strict_output_match: false,
        ignore_whitespace: true
      },
      scoringStrategy: {
        method: config.scoring_method || 'weighted',
        weights: config.scoring_weights || {
          correctness: 0.7,
          performance: 0.3
        }
      }
    });
  }
  
  // 场景3: 混合格式处理（迁移过渡期）
  if (config.testCases && testCase && testCase.code_test_config) {
    console.log(`   🔀 检测到混合格式，优先使用新格式配置`);
    
    // 优先使用新格式，但如果新格式不完整，则用旧格式补充
    const newFormatConfig = resolveEvaluatorConfig(evaluator, testCase);
    const oldFormatConfig = resolveEvaluatorConfig(
      { ...evaluator, config: { ...config, testCases: undefined } }, 
      testCase
    );
    
    return {
      ...newFormatConfig,
      // 如果新格式缺少测试数据，使用旧格式的数据作为备份
      testData: newFormatConfig.testData.length > 0 
        ? newFormatConfig.testData 
        : oldFormatConfig.testData
    };
  }
  
  // 场景4: 传统testCodeTemplate模式（旧版本兼容）
  if (config.testCodeTemplate && config.language) {
    console.log(`   🔧 使用传统testCodeTemplate模式`);
    
    return cacheAndReturn(cacheKey, {
      executionConfig: {
        timeout_ms: config.timeout || 30000,
        memory_limit_mb: config.memoryLimit || 256,
        entry_point_strategy: 'intelligent',
        language: config.language
      },
      testData: [], // testCodeTemplate模式通常不需要预定义测试数据
      validationRules: {
        strict_output_match: false,
        ignore_whitespace: true
      },
      scoringStrategy: {
        method: config.scoring_method || 'weighted',
        weights: config.scoring_weights || {
          correctness: 0.7,
          performance: 0.3
        }
      }
    });
  }
  
  // 场景5: 错误处理 - 无法解析的配置
  throw new Error(`无法解析评分器配置: 评分器 ${evaluator.id} 缺少必要的配置信息`);
}

/**
 * 运行时兼容性验证
 */
export async function validateRuntimeCompatibility(
  executionContext: EvaluationExecutionContext
): Promise<{ compatible: boolean; errors: string[] }> {
  
  const errors: string[] = [];
  
  // 验证执行配置
  if (!executionContext.executionConfig.language) {
    errors.push('缺少执行语言配置');
  }
  
  if (executionContext.executionConfig.timeout_ms <= 0) {
    errors.push('超时时间配置无效');
  }
  
  if (executionContext.executionConfig.memory_limit_mb <= 0) {
    errors.push('内存限制配置无效');
  }
  
  // 验证测试数据
  if (!executionContext.testData || executionContext.testData.length === 0) {
    errors.push('缺少测试数据');
  }
  
  // 验证评分策略
  if (!executionContext.scoringStrategy.weights.correctness) {
    errors.push('缺少正确性评分权重');
  }
  
  const totalWeight = Object.values(executionContext.scoringStrategy.weights)
    .reduce((sum, weight) => sum + (weight || 0), 0);
  
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    errors.push(`评分权重总和应为1.0，当前为${totalWeight.toFixed(2)}`);
  }
  
  return {
    compatible: errors.length === 0,
    errors
  };
}

/**
 * 配置合并工具
 */
export function mergeConfigurations(
  evaluatorConfig: any, 
  testCaseConfig?: any
): EvaluationExecutionContext {
  
  // 构造临时的评分器和测试用例对象
  const evaluator = {
    id: 'temp-evaluator',
    type: 'CODE',
    config: evaluatorConfig
  };
  
  const testCase = testCaseConfig ? {
    id: 'temp-test-case',
    code_test_config: testCaseConfig
  } : undefined;
  
  return resolveEvaluatorConfig(evaluator, testCase);
}

/**
 * 兼容性检查工具
 */
export function checkBackwardCompatibility(
  originalConfig: LegacyCodeEvaluatorConfig,
  migratedConfig: { evaluator: any; testCases: ModernTestCaseConfig[] }
): { compatible: boolean; issues: string[] } {
  
  const issues: string[] = [];
  
  // 检查测试用例数量
  const originalTestCaseCount = originalConfig.testCases?.length || 0;
  const migratedTestCaseCount = migratedConfig.testCases.length;
  
  if (originalTestCaseCount !== migratedTestCaseCount) {
    issues.push(`测试用例数量不匹配: 原始${originalTestCaseCount}个，迁移后${migratedTestCaseCount}个`);
  }
  
  // 检查执行配置保持一致
  const originalTimeout = originalConfig.timeout || 30000;
  const migratedTimeout = migratedConfig.testCases[0]?.code_test_config.execution_config.timeout_ms;
  
  if (originalTimeout !== migratedTimeout) {
    issues.push(`超时配置不匹配: 原始${originalTimeout}ms，迁移后${migratedTimeout}ms`);
  }
  
  // 检查评分权重保持一致
  const originalWeights = originalConfig.scoring_weights;
  const migratedWeights = migratedConfig.evaluator.config.scoring_weights;
  
  if (originalWeights && migratedWeights) {
    if (originalWeights.correctness !== migratedWeights.correctness) {
      issues.push(`正确性权重不匹配: 原始${originalWeights.correctness}，迁移后${migratedWeights.correctness}`);
    }
  }
  
  return {
    compatible: issues.length === 0,
    issues
  };
}

/**
 * 智能参数解析结果接口
 */
interface ParsedParameters {
  // 核心数据（总是存在）
  values: any[];
  length: number;
  
  // 常用访问器（按需生成）
  first?: any;
  second?: any;
  
  // 算法特定命名（字符串算法场景）
  s1?: any;
  s2?: any;
  
  // 通用参数命名（兼容现有代码）
  param1?: any;
  param2?: any;
  
  // 数组式访问
  [index: number]: any;
}

/**
 * 解析上下文接口
 */
interface ParseContext {
  evaluatorType?: string;
  templateDescription?: string;
  isLegacyCompatMode?: boolean;
}

/**
 * 解析多参数元组格式，例如：("a", "b") -> 智能格式化对象
 * 优化版本：根据上下文提供最合适的参数命名，减少数据冗余
 */
function parseMultipleParameters(tupleContent: string, context?: ParseContext): any {
  try {
    // 1. 基础解析逻辑（保持不变，确保兼容性）
    const params = parseBasicParameters(tupleContent);
    if (!params || params.length === 0) {
      return null;
    }
    
    // 2. 单参数特殊处理（保持现有行为）
    if (params.length === 1) {
      return params[0];
    }
    
    // 3. 创建智能参数对象
    const result: ParsedParameters = {
      values: params,
      length: params.length
    };
    
    // 4. 添加数组式访问支持
    params.forEach((param, index) => {
      result[index] = param;
    });
    
    // 5. 智能添加语义化属性
    addSemanticProperties(result, params, context);
    
    return result;
    
  } catch (error) {
    console.warn('解析多参数失败:', error);
    return null;
  }
}

/**
 * 基础参数解析逻辑（保持原有逻辑不变）
 */
function parseBasicParameters(tupleContent: string): any[] {
  const params: any[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  
  for (let i = 0; i < tupleContent.length; i++) {
    const char = tupleContent[i];
    const nextChar = tupleContent[i + 1];
    
    if (!inQuotes) {
      if (char === '"' || char === "'") {
        inQuotes = true;
        quoteChar = char;
      } else if (char === ',' && current.trim()) {
        params.push(parseParameter(current.trim()));
        current = '';
      } else if (char !== ' ' || current.length > 0) {
        current += char;
      }
    } else {
      if (char === quoteChar) {
        if (nextChar === quoteChar) {
          current += char;
          i++; // 跳过下一个引号
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    }
  }
  
  if (current.trim()) {
    params.push(parseParameter(current.trim()));
  }
  
  return params;
}

/**
 * 智能添加语义化属性
 */
function addSemanticProperties(
  result: ParsedParameters, 
  params: any[], 
  context?: ParseContext
) {
  const paramCount = params.length;
  
  // 总是添加常用访问器
  if (paramCount >= 1) result.first = params[0];
  if (paramCount >= 2) result.second = params[1];
  
  // 检测算法类型并添加相应的语义化属性
  const isStringAlgorithm = isStringAlgorithmContext(context);
  const isMathAlgorithm = isMathAlgorithmContext(context);
  
  if (isStringAlgorithm) {
    // 字符串算法场景：优先使用 s1, s2
    if (paramCount >= 1) result.s1 = params[0];
    if (paramCount >= 2) result.s2 = params[1];
    console.log(`🎯 检测到字符串算法场景，使用 s1/s2 命名`);
  } else if (isMathAlgorithm) {
    // 数学算法场景：使用 x, y, n 等
    if (paramCount >= 1) result.x = params[0];
    if (paramCount >= 2) result.y = params[1];
    if (paramCount >= 3) result.n = params[2];
    console.log(`🎯 检测到数学算法场景，使用 x/y/n 命名`);
  }
  
  // 为了向后兼容，总是提供 param1/param2 和传统的 s1/s2
  if (paramCount >= 1) result.param1 = params[0];
  if (paramCount >= 2) result.param2 = params[1];
  
  // 如果没有特定的s1/s2，使用通用值（保持向后兼容）
  if (!result.s1 && paramCount >= 1) result.s1 = params[0];
  if (!result.s2 && paramCount >= 2) result.s2 = params[1];
  
  // 兼容模式：提供完全向后兼容的属性集合
  if (context?.isLegacyCompatMode) {
    // 保留所有旧的冗余属性
    for (let i = 0; i < paramCount && i < 10; i++) {
      result[`s${i + 1}`] = params[i];
    }
  }
  
  // 扩展支持更多参数
  for (let i = 2; i < paramCount && i < 10; i++) {
    result[`param${i + 1}`] = params[i];
  }
}

/**
 * 检测是否为字符串算法上下文
 */
function isStringAlgorithmContext(context?: ParseContext): boolean {
  if (!context) return false;
  
  const indicators = [
    context.templateDescription?.toLowerCase().includes('string'),
    context.templateDescription?.toLowerCase().includes('字符串'),
    context.templateDescription?.toLowerCase().includes('s1'),
    context.templateDescription?.toLowerCase().includes('s2'),
    context.evaluatorType === 'STRING_ALGORITHM'
  ];
  
  return indicators.some(Boolean);
}

/**
 * 检测是否为数学算法上下文
 */
function isMathAlgorithmContext(context?: ParseContext): boolean {
  if (!context) return false;
  
  const indicators = [
    context.templateDescription?.toLowerCase().includes('math'),
    context.templateDescription?.toLowerCase().includes('数学'),
    context.templateDescription?.toLowerCase().includes('number'),
    context.templateDescription?.toLowerCase().includes('数字'),
    context.evaluatorType === 'MATH_ALGORITHM'
  ];
  
  return indicators.some(Boolean);
}

/**
 * 解析单个参数，支持字符串、数字、布尔值
 */
function parseParameter(param: string): any {
  // 去除首尾引号
  if ((param.startsWith('"') && param.endsWith('"')) || 
      (param.startsWith("'") && param.endsWith("'"))) {
    return param.slice(1, -1);
  }
  
  // 检测数字
  if (/^-?\d+(\.\d+)?$/.test(param)) {
    return parseFloat(param);
  }
  
  // 检测布尔值
  if (param === 'true') return true;
  if (param === 'false') return false;
  
  // 检测 null 和 undefined
  if (param === 'null') return null;
  if (param === 'undefined') return undefined;
  
  // 其他情况返回字符串
  return param;
}

/**
 * 🚀 获取缓存统计信息
 */
export function getCacheStats(): { size: number; hitRate: number; } {
  return {
    size: configCache.size,
    hitRate: 0 // 简化实现，生产环境可添加命中率计算
  };
}

/**
 * 🚀 清空所有缓存
 */
export function clearCache(): void {
  configCache.clear();
  cacheExpiration.clear();
  console.log('🧹 评分器配置缓存已清空');
}

/**
 * 使用示例导出
 */
export const CompatibilityExample = {
  // 示例1: 处理旧格式评分器
  handleLegacyEvaluator: (evaluator: any) => {
    try {
      const context = resolveEvaluatorConfig(evaluator);
      console.log('✅ 旧格式评分器兼容处理成功', context);
      return context;
    } catch (error) {
      console.error('❌ 旧格式评分器处理失败', error);
      throw error;
    }
  },
  
  // 示例2: 处理新格式评分器+测试用例
  handleModernEvaluator: (evaluator: any, testCase: any) => {
    try {
      const context = resolveEvaluatorConfig(evaluator, testCase);
      console.log('✅ 新格式评分器兼容处理成功', context);
      return context;
    } catch (error) {
      console.error('❌ 新格式评分器处理失败', error);
      throw error;
    }
  }
};