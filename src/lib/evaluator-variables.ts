/**
 * 评分器系统变量处理
 * 支持在评分器Prompt模板中使用系统预设变量
 */

export interface SystemVariables {
  test_case_input: string;
  model_response: string;
  reference_answer?: string;
  // 🆕 Bug #6 修复: 多模态参考答案附件支持
  reference_answer_attachments?: Array<{
    type: 'image' | 'audio' | 'video';
    url: string;
    description?: string;
    metadata?: Record<string, any>;
  }>;
  dimension_name?: string;
  dimension_description?: string;
  test_case_metadata?: {
    category?: string;
    tags?: string[];
    [key: string]: any;
  };
  task_name?: string;
  model_name?: string;
  model_provider?: string;
  evaluator_name?: string;
  // 🔧 添加测试用例最大分数变量
  max_score?: number;
  // 被评测模型的token消耗和成本数据
  tested_model_prompt_tokens?: number;
  tested_model_completion_tokens?: number;
  tested_model_total_tokens?: number;
  tested_model_execution_time_ms?: number;
  tested_model_cost_usd?: number;
  // 评分器模型的token消耗和成本数据（仅PROMPT类型评分器）
  evaluator_model_prompt_tokens?: number;
  evaluator_model_completion_tokens?: number;
  evaluator_model_total_tokens?: number;
  evaluator_model_execution_time_ms?: number;
  evaluator_model_cost_usd?: number;
  code_execution_result?: {
    stdout: string;
    stderr: string;
    execution_status: 'success' | 'failed';
    execution_time_ms: number;
    test_results?: any;
  };
}

export interface VariableDefinition {
  name: string;
  description: string;
  example: string;
  category: 'basic' | 'code' | 'metadata' | 'context' | 'advanced';
}

/**
 * 系统预设变量定义
 */
export const SYSTEM_VARIABLES: VariableDefinition[] = [
  // 基础变量
  {
    name: 'test_case_input',
    description: '测评题目或测试用例输入内容',
    example: '请编写一个Python函数来计算斐波那契数列的第n项',
    category: 'basic'
  },
  {
    name: 'model_response',
    description: 'LLM模型的原始回答内容',
    example: 'def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)',
    category: 'basic'
  },
  {
    name: 'reference_answer',
    description: '测试用例的标准参考答案',
    example: 'def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)',
    category: 'basic'
  },
  {
    name: 'max_score',
    description: '测试用例的最大分数限制',
    example: '12',
    category: 'basic'
  },
  
  // 评估上下文变量
  {
    name: 'dimension_name',
    description: '当前评估维度的名称',
    example: '代码质量',
    category: 'context'
  },
  {
    name: 'dimension_description',
    description: '当前评估维度的详细描述',
    example: '评估代码的可读性、可维护性和最佳实践遵循程度',
    category: 'context'
  },
  
  // 元数据变量
  {
    name: 'test_case_metadata',
    description: '测试用例的完整元数据对象',
    example: '{"category": "算法", "tags": ["动态规划", "递归"]}',
    category: 'metadata'
  },
  {
    name: 'test_case_metadata.category',
    description: '测试用例的分类标签',
    example: '算法',
    category: 'metadata'
  },
  {
    name: 'test_case_metadata.tags',
    description: '测试用例的标签数组',
    example: '["动态规划", "递归", "数学"]',
    category: 'metadata'
  },
  
  // 任务和模型上下文变量
  {
    name: 'task_name',
    description: '当前评测任务的名称',
    example: 'Python算法基础评测',
    category: 'context'
  },
  {
    name: 'model_name',
    description: '被评测模型的名称',
    example: 'GPT-4',
    category: 'context'
  },
  {
    name: 'model_provider',
    description: '被评测模型的提供商',
    example: 'OpenAI',
    category: 'context'
  },
  {
    name: 'evaluator_name',
    description: '当前评分器的名称',
    example: 'Python代码质量评分器',
    category: 'context'
  },
  
  // 被评测模型性能变量
  {
    name: 'tested_model_prompt_tokens',
    description: '被评测模型消耗的输入token数量',
    example: '1250',
    category: 'advanced'
  },
  {
    name: 'tested_model_completion_tokens',
    description: '被评测模型生成的输出token数量',
    example: '523',
    category: 'advanced'
  },
  {
    name: 'tested_model_total_tokens',
    description: '被评测模型调用的总token数量',
    example: '1773',
    category: 'advanced'
  },
  {
    name: 'tested_model_execution_time_ms',
    description: '被评测模型调用的执行时间（毫秒）',
    example: '2340',
    category: 'advanced'
  },
  {
    name: 'tested_model_cost_usd',
    description: '被评测模型调用的估算成本（美元）',
    example: '0.00354',
    category: 'advanced'
  },
  
  // 评分器模型性能变量
  {
    name: 'evaluator_model_prompt_tokens',
    description: '评分器模型消耗的输入token数量',
    example: '890',
    category: 'advanced'
  },
  {
    name: 'evaluator_model_completion_tokens',
    description: '评分器模型生成的输出token数量',
    example: '156',
    category: 'advanced'
  },
  {
    name: 'evaluator_model_total_tokens',
    description: '评分器模型调用的总token数量',
    example: '1046',
    category: 'advanced'
  },
  {
    name: 'evaluator_model_execution_time_ms',
    description: '评分器模型调用的执行时间（毫秒）',
    example: '1850',
    category: 'advanced'
  },
  {
    name: 'evaluator_model_cost_usd',
    description: '评分器模型调用的估算成本（美元）',
    example: '0.00142',
    category: 'advanced'
  },
  
  // 🆕 混合评估系统变量 - 核心变量
  {
    name: 'EXTRACTED_CODE',
    description: '从模型响应中提取的源代码',
    example: 'def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)',
    category: 'code'
  },
  {
    name: 'EXECUTION_SUCCESS',
    description: '代码执行成功状态（true/false）',
    example: 'true',
    category: 'code'
  },
  {
    name: 'EXECUTION_OUTPUT',
    description: '代码执行的标准输出内容',
    example: 'F(0) = 0\nF(1) = 1\nF(2) = 1\nF(3) = 2',
    category: 'code'
  },
  {
    name: 'EXECUTION_ERROR',
    description: '代码执行的错误信息',
    example: 'NameError: name "undefined_var" is not defined',
    category: 'code'
  },

  // 🆕 混合评估系统变量 - 性能指标
  {
    name: 'EXECUTION_TIME',
    description: '代码执行耗时（毫秒）',
    example: '1234',
    category: 'code'
  },
  {
    name: 'MEMORY_USAGE',
    description: '代码执行内存使用量（字节）',
    example: '2048576',
    category: 'code'
  },
  {
    name: 'PERFORMANCE_LEVEL',
    description: '性能等级评估（excellent/good/fair/poor）',
    example: 'excellent',
    category: 'code'
  },
  {
    name: 'EXIT_CODE',
    description: '程序退出码（0表示成功）',
    example: '0',
    category: 'code'
  },

  // 🆕 混合评估系统变量 - 代码质量
  {
    name: 'CODE_LANGUAGE',
    description: '识别出的编程语言',
    example: 'python',
    category: 'code'
  },
  {
    name: 'CODE_LENGTH',
    description: '代码字符数',
    example: '186',
    category: 'code'
  },
  {
    name: 'CODE_LINES',
    description: '代码行数',
    example: '8',
    category: 'code'
  },
  {
    name: 'HAS_COMMENTS',
    description: '是否包含注释（true/false）',
    example: 'true',
    category: 'code'
  },
  {
    name: 'HAS_FUNCTIONS',
    description: '是否包含函数定义（true/false）',
    example: 'true',
    category: 'code'
  },

  // 🆕 混合评估系统变量 - 提取质量
  {
    name: 'EXTRACTION_METHOD',
    description: '代码提取使用的方法',
    example: 'auto_markdown',
    category: 'code'
  },
  {
    name: 'EXTRACTION_CONFIDENCE',
    description: '代码提取置信度（0-100）',
    example: '95',
    category: 'code'
  },
  {
    name: 'EXTRACTION_QUALITY',
    description: '提取质量评级（excellent/good/fair/poor）',
    example: 'excellent',
    category: 'code'
  },

  // 🆕 混合评估系统变量 - 状态和输出分析
  {
    name: 'SUCCESS_MESSAGE',
    description: '成功执行时的状态消息（仅执行成功时可用）',
    example: '代码执行成功',
    category: 'code'
  },
  {
    name: 'FAILURE_MESSAGE',
    description: '执行失败时的状态消息（仅执行失败时可用）',
    example: '代码执行失败',
    category: 'code'
  },
  {
    name: 'HAS_OUTPUT',
    description: '是否有输出内容（true/false）',
    example: 'true',
    category: 'code'
  },
  {
    name: 'OUTPUT_JSON',
    description: '输出内容的JSON格式（如果可解析）',
    example: '{"result": [0, 1, 1, 2, 3, 5, 8]}',
    category: 'code'
  },
  {
    name: 'IS_VALID_JSON',
    description: '输出是否为有效JSON（true/false）',
    example: 'false',
    category: 'code'
  },
  {
    name: 'ERROR_TYPE',
    description: '错误类型分类（syntax_error/runtime_error/timeout_error等）',
    example: 'syntax_error',
    category: 'code'
  },

  // 🆕 混合评估系统变量 - 元数据
  {
    name: 'HYBRID_EVALUATION_SUCCESS',
    description: '混合评估执行成功标记（true/false）',
    example: 'true',
    category: 'code'
  },
  {
    name: 'EVALUATION_TIMESTAMP',
    description: '评估执行时间戳',
    example: '2025-09-10T03:24:00.000Z',
    category: 'code'
  },
  {
    name: 'TASK_ID',
    description: '评估任务ID',
    example: 'task_123456789',
    category: 'code'
  },
  {
    name: 'SUBTASK_ID',
    description: '评估子任务ID',
    example: 'subtask_987654321',
    category: 'code'
  },

  // 原有变量（向后兼容）
  {
    name: 'code_execution_result',
    description: '代码执行的完整结果对象（传统格式，建议使用新的混合评估变量）',
    example: '{"stdout": "55", "stderr": "", "execution_status": "success", "execution_time_ms": 1234}',
    category: 'advanced'
  },
  {
    name: 'code_execution_result.stdout',
    description: '代码执行的标准输出内容（传统格式，建议使用 EXECUTION_OUTPUT）',
    example: '程序运行的正常输出结果',
    category: 'advanced'
  },
  {
    name: 'code_execution_result.stderr',
    description: '代码执行的错误输出内容（传统格式，建议使用 EXECUTION_ERROR）',
    example: 'Traceback (most recent call last): ...',
    category: 'advanced'
  },
  {
    name: 'code_execution_result.execution_status',
    description: '代码执行状态（传统格式，建议使用 EXECUTION_SUCCESS）',
    example: 'success',
    category: 'advanced'
  },
  {
    name: 'code_execution_result.execution_time_ms',
    description: '代码执行耗时（传统格式，建议使用 EXECUTION_TIME）',
    example: '1234',
    category: 'advanced'
  },
  {
    name: 'code_execution_result.test_results',
    description: '代码测试结果数据（传统格式）',
    example: '{"passed": 5, "failed": 1, "total": 6}',
    category: 'advanced'
  }
];

/**
 * 替换模板中的系统变量
 */
export function replaceSystemVariables(
  template: string,
  variables: SystemVariables
): string {
  let result = template;

  // 基础变量替换
  result = result.replace(/\{\{test_case_input\}\}/g, variables.test_case_input || '');
  result = result.replace(/\{\{model_response\}\}/g, variables.model_response || '');
  result = result.replace(/\{\{reference_answer\}\}/g, variables.reference_answer || '');
  result = result.replace(/\{\{max_score\}\}/g, String(variables.max_score || 100));

  // 评估上下文变量替换
  result = result.replace(/\{\{dimension_name\}\}/g, variables.dimension_name || '');
  result = result.replace(/\{\{dimension_description\}\}/g, variables.dimension_description || '');

  // 任务和模型上下文变量替换
  result = result.replace(/\{\{task_name\}\}/g, variables.task_name || '');
  result = result.replace(/\{\{model_name\}\}/g, variables.model_name || '');
  result = result.replace(/\{\{model_provider\}\}/g, variables.model_provider || '');
  result = result.replace(/\{\{evaluator_name\}\}/g, variables.evaluator_name || '');

  // 被评测模型性能数据替换
  result = result.replace(/\{\{tested_model_prompt_tokens\}\}/g, String(variables.tested_model_prompt_tokens || 0));
  result = result.replace(/\{\{tested_model_completion_tokens\}\}/g, String(variables.tested_model_completion_tokens || 0));
  result = result.replace(/\{\{tested_model_total_tokens\}\}/g, String(variables.tested_model_total_tokens || 0));
  result = result.replace(/\{\{tested_model_execution_time_ms\}\}/g, String(variables.tested_model_execution_time_ms || 0));
  result = result.replace(/\{\{tested_model_cost_usd\}\}/g, String(variables.tested_model_cost_usd || 0));

  // 评分器模型性能数据替换
  result = result.replace(/\{\{evaluator_model_prompt_tokens\}\}/g, String(variables.evaluator_model_prompt_tokens || 0));
  result = result.replace(/\{\{evaluator_model_completion_tokens\}\}/g, String(variables.evaluator_model_completion_tokens || 0));
  result = result.replace(/\{\{evaluator_model_total_tokens\}\}/g, String(variables.evaluator_model_total_tokens || 0));
  result = result.replace(/\{\{evaluator_model_execution_time_ms\}\}/g, String(variables.evaluator_model_execution_time_ms || 0));
  result = result.replace(/\{\{evaluator_model_cost_usd\}\}/g, String(variables.evaluator_model_cost_usd || 0));

  // 测试用例元数据变量替换
  if (variables.test_case_metadata) {
    const metadata = variables.test_case_metadata;
    
    // 完整的元数据对象
    result = result.replace(
      /\{\{test_case_metadata\}\}/g,
      JSON.stringify(metadata, null, 2)
    );

    // 单独的字段访问
    result = result.replace(/\{\{test_case_metadata\.category\}\}/g, metadata.category || '');
    
    if (metadata.tags) {
      result = result.replace(
        /\{\{test_case_metadata\.tags\}\}/g,
        Array.isArray(metadata.tags) ? JSON.stringify(metadata.tags) : String(metadata.tags)
      );
    }
  } else {
    // 如果没有元数据，清空相关变量
    result = result.replace(/\{\{test_case_metadata(?:\.[^}]+)?\}\}/g, '');
  }

  // 代码执行结果变量替换
  if (variables.code_execution_result) {
    const codeResult = variables.code_execution_result;
    
    // 完整的代码执行结果对象
    result = result.replace(
      /\{\{code_execution_result\}\}/g,
      JSON.stringify(codeResult, null, 2)
    );

    // 单独的字段访问
    result = result.replace(/\{\{code_execution_result\.stdout\}\}/g, codeResult.stdout || '');
    result = result.replace(/\{\{code_execution_result\.stderr\}\}/g, codeResult.stderr || '');
    result = result.replace(/\{\{code_execution_result\.execution_status\}\}/g, codeResult.execution_status || '');
    result = result.replace(/\{\{code_execution_result\.execution_time_ms\}\}/g, String(codeResult.execution_time_ms || 0));
    
    if (codeResult.test_results) {
      result = result.replace(
        /\{\{code_execution_result\.test_results\}\}/g,
        JSON.stringify(codeResult.test_results, null, 2)
      );
    }
  } else {
    // 如果没有代码执行结果，清空相关变量
    result = result.replace(/\{\{code_execution_result(?:\.[^}]+)?\}\}/g, '');
  }

  return result;
}

/**
 * 检测模板中使用的变量
 */
export function detectUsedVariables(template: string): string[] {
  const variablePattern = /\{\{([^}]+)\}\}/g;
  const matches = template.match(variablePattern);
  
  if (!matches) return [];

  return matches.map(match => {
    // 提取变量名（去掉花括号）
    const variable = match.replace(/\{\{|\}\}/g, '');
    // 如果是对象属性访问，只返回根变量名
    return variable.split('.')[0];
  }).filter((value, index, self) => self.indexOf(value) === index); // 去重
}

/**
 * 验证模板中的变量是否有效
 */
export function validateTemplateVariables(template: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const usedVariables = detectUsedVariables(template);
  const validVariables = SYSTEM_VARIABLES.map(v => v.name);
  
  const errors: string[] = [];
  const warnings: string[] = [];

  usedVariables.forEach(variable => {
    if (!validVariables.includes(variable)) {
      errors.push(`未知的系统变量: {{${variable}}}`);
    }
  });

  // 检查代码执行相关变量的使用
  const hasCodeVariables = usedVariables.some(v => v.startsWith('code_execution_result'));
  if (hasCodeVariables) {
    warnings.push('使用了代码执行相关变量，请确保该评分器用于CODE类型的评测');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 生成变量使用示例
 */
export function generateVariableExample(variableName: string): string {
  const variable = SYSTEM_VARIABLES.find(v => v.name === variableName);
  if (!variable) return '';

  switch (variableName) {
    case 'test_case_input':
      return `测试用例: {{test_case_input}}`;
    
    case 'model_response':
      return `模型回答: {{model_response}}`;
    
    case 'code_execution_result':
      return `代码执行结果: {{code_execution_result}}
执行状态: {{code_execution_result.execution_status}}
标准输出: {{code_execution_result.stdout}}
错误输出: {{code_execution_result.stderr}}
执行时间: {{code_execution_result.execution_time_ms}}ms`;
    
    default:
      return `{{${variableName}}}`;
  }
}

/**
 * 获取变量的类型信息
 */
export function getVariableInfo(variableName: string): VariableDefinition | null {
  return SYSTEM_VARIABLES.find(v => v.name === variableName) || null;
}

/**
 * 按类别分组变量
 */
export function getVariablesByCategory(): Record<string, VariableDefinition[]> {
  return SYSTEM_VARIABLES.reduce((acc, variable) => {
    if (!acc[variable.category]) {
      acc[variable.category] = [];
    }
    acc[variable.category].push(variable);
    return acc;
  }, {} as Record<string, VariableDefinition[]>);
}

/**
 * 为评分器配置界面生成变量选择器数据
 */
export function getVariableSelectorData() {
  const categories = getVariablesByCategory();
  
  return {
    categories: [
      {
        id: 'basic',
        name: '基础变量',
        description: '所有评分器都可以使用的基础变量',
        variables: categories.basic || []
      },
      {
        id: 'metadata',
        name: '元数据变量',
        description: '测试用例的分类、难度、标签等元数据信息',
        variables: categories.metadata || []
      },
      {
        id: 'context',
        name: '上下文变量',
        description: '评估任务、模型、维度等上下文信息',
        variables: categories.context || []
      },
      {
        id: 'code',
        name: '代码执行变量',
        description: '仅在CODE类型评分器中可用的变量',
        variables: categories.code || []
      },
      {
        id: 'advanced',
        name: '高级变量',
        description: '高级功能相关的变量',
        variables: categories.advanced || []
      }
    ],
    allVariables: SYSTEM_VARIABLES
  };
}
