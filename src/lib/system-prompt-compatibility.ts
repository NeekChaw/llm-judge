/**
 * 系统提示词兼容性处理
 * 支持双模板系统的角色优先级管理
 */

import type { CustomTemplateMapping, SystemPromptContext } from './template-types';

export interface TaskWithSystemPrompt {
  id: string;
  system_prompt?: string;
  [key: string]: any;
}

export interface EvaluatorWithSystemPrompt {
  id: string;
  config?: {
    system_prompt?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * 获取系统提示词 - 支持双模板系统的角色优先级
 * 优先级：维度级别 > 任务级别 > 评分器级别 > 空字符串
 */
export function getSystemPrompt(
  task: TaskWithSystemPrompt | null | undefined,
  evaluator: EvaluatorWithSystemPrompt | null | undefined,
  customMapping?: CustomTemplateMapping | null | undefined
): string {
  // 1. 最高优先级：自定义模板的维度级别角色
  if (customMapping?.system_prompt && customMapping.system_prompt.trim()) {
    return customMapping.system_prompt;
  }
  
  // 2. 第二优先级：任务级别的system_prompt
  if (task?.system_prompt && task.system_prompt.trim()) {
    return task.system_prompt;
  }
  
  // 3. 向后兼容：评分器级别的system_prompt（遗留）
  if (evaluator?.config?.system_prompt && evaluator.config.system_prompt.trim()) {
    return evaluator.config.system_prompt;
  }
  
  // 4. 默认返回空字符串（使用模型原生行为）
  return '';
}

/**
 * 获取系统提示词上下文 - 用于调试和日志
 */
export function getSystemPromptContext(
  task: TaskWithSystemPrompt | null | undefined,
  evaluator: EvaluatorWithSystemPrompt | null | undefined,
  customMapping?: CustomTemplateMapping | null | undefined
): SystemPromptContext {
  return {
    custom_mapping_prompt: customMapping?.system_prompt || undefined,
    task_prompt: task?.system_prompt || undefined,
    evaluator_prompt: evaluator?.config?.system_prompt || undefined
  };
}

/**
 * 检查是否使用了系统提示词
 */
export function hasSystemPrompt(
  task: TaskWithSystemPrompt | null | undefined,
  evaluator: EvaluatorWithSystemPrompt | null | undefined,
  customMapping?: CustomTemplateMapping | null | undefined
): boolean {
  return getSystemPrompt(task, evaluator, customMapping).length > 0;
}

/**
 * 获取系统提示词的来源信息
 */
export function getSystemPromptSource(
  task: TaskWithSystemPrompt | null | undefined,
  evaluator: EvaluatorWithSystemPrompt | null | undefined,
  customMapping?: CustomTemplateMapping | null | undefined
): 'custom_mapping' | 'task' | 'evaluator' | 'none' {
  if (customMapping?.system_prompt && customMapping.system_prompt.trim()) {
    return 'custom_mapping';
  }
  
  if (task?.system_prompt && task.system_prompt.trim()) {
    return 'task';
  }
  
  if (evaluator?.config?.system_prompt && evaluator.config.system_prompt.trim()) {
    return 'evaluator';
  }
  
  return 'none';
}

/**
 * 系统提示词模板预设
 */
export const SYSTEM_PROMPT_TEMPLATES = {
  python_expert: {
    name: 'Python编程专家',
    description: '专业的Python开发专家，提供高质量的Python代码解决方案',
    content: '你是一个经验丰富的Python编程专家。请提供准确、高效、符合Python最佳实践的代码解决方案。代码应该具有良好的可读性和可维护性。'
  },
  frontend_expert: {
    name: '前端开发专家',
    description: '精通现代前端技术的开发专家',
    content: '你是一个前端开发专家，精通HTML、CSS、JavaScript以及现代前端框架。请提供符合现代前端开发最佳实践的解决方案，注重代码的可维护性和用户体验。'
  },
  algorithm_expert: {
    name: '算法分析专家',
    description: '专业的算法和数据结构专家',
    content: '你是一个算法和数据结构专家。请提供高效的算法解决方案，并分析时间复杂度和空间复杂度。代码应该清晰易懂，并包含必要的注释说明算法思路。'
  },
  code_reviewer: {
    name: '代码审查专家',
    description: '专业的代码质量审查专家',
    content: '你是一个代码审查专家，专注于代码质量、可读性、可维护性和最佳实践。请提供符合业界标准的高质量代码，注重代码规范和设计模式的应用。'
  },
  ascii_code: {
    name: '标准ASCII代码专家',
    description: '确保代码使用标准ASCII字符，防止执行错误',
    content: 'You are a professional programming assistant. When generating code, follow these strict formatting rules:\n\n1. ONLY use standard ASCII characters in code\n2. NEVER use Unicode punctuation like Chinese punctuation marks - use ASCII equivalents instead\n3. ALWAYS use standard ASCII quotes (" and \') instead of Unicode quotes\n4. Write clean, executable code without any decorative Unicode characters\n5. Use English variable names and comments when possible\n6. Follow standard Python/JavaScript syntax strictly\n\nIMPORTANT: Your code will be executed in a strict ASCII environment. Any Unicode punctuation will cause syntax errors.'
  },
  general: {
    name: '通用助手',
    description: '通用的AI助手，使用模型默认行为',
    content: ''
  }
} as const;

export type SystemPromptTemplateKey = keyof typeof SYSTEM_PROMPT_TEMPLATES;

/**
 * 获取系统提示词模板
 */
export function getSystemPromptTemplate(key: SystemPromptTemplateKey) {
  return SYSTEM_PROMPT_TEMPLATES[key];
}

/**
 * 获取所有系统提示词模板
 */
export function getAllSystemPromptTemplates() {
  return Object.entries(SYSTEM_PROMPT_TEMPLATES).map(([key, template]) => ({
    key: key as SystemPromptTemplateKey,
    ...template
  }));
}