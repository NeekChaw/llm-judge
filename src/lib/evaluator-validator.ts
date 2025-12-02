import { 
  EvaluatorConfig, 
  EvaluatorType, 
  PromptEvaluatorConfig,
  RegexEvaluatorConfig,
  CodeEvaluatorConfig,
  HumanEvaluatorConfig,
  EvaluatorValidationError
} from '@/types/evaluator';

export class EvaluatorConfigValidator {
  
  // 验证评分器配置
  static validate(type: EvaluatorType, config: any): EvaluatorValidationError[] {
    const errors: EvaluatorValidationError[] = [];
    
    if (!config || typeof config !== 'object') {
      errors.push({ field: 'config', message: '配置不能为空' });
      return errors;
    }
    
    if (config.type !== type) {
      errors.push({ field: 'config.type', message: '配置类型与评分器类型不匹配' });
    }
    
    switch (type) {
      case 'PROMPT':
        errors.push(...this.validatePromptConfig(config));
        break;
      case 'REGEX':
        errors.push(...this.validateRegexConfig(config));
        break;
      case 'CODE':
        errors.push(...this.validateCodeConfig(config));
        break;
      case 'HUMAN':
        errors.push(...this.validateHumanConfig(config));
        break;
      default:
        errors.push({ field: 'type', message: '不支持的评分器类型' });
    }
    
    return errors;
  }
  
  // 验证PROMPT类型配置
  private static validatePromptConfig(config: any): EvaluatorValidationError[] {
    const errors: EvaluatorValidationError[] = [];
    
    if (!config.model_id || typeof config.model_id !== 'string') {
      errors.push({ field: 'config.model_id', message: '模型ID不能为空' });
    }
    
    if (config.system_prompt !== undefined && typeof config.system_prompt !== 'string') {
      errors.push({ field: 'config.system_prompt', message: '系统提示词必须是字符串类型' });
    }
    
    if (!config.evaluation_prompt || typeof config.evaluation_prompt !== 'string') {
      errors.push({ field: 'config.evaluation_prompt', message: '评估提示词不能为空' });
    }
    
    if (config.temperature !== undefined) {
      if (typeof config.temperature !== 'number' || config.temperature < 0 || config.temperature > 2) {
        errors.push({ field: 'config.temperature', message: '温度值必须在0-2之间' });
      }
    }
    
    if (config.max_tokens !== undefined) {
      if (typeof config.max_tokens !== 'number' || config.max_tokens < 1) {
        errors.push({ field: 'config.max_tokens', message: '最大token数必须大于0' });
      }
    }
    
    return errors;
  }
  
  // 验证REGEX类型配置
  private static validateRegexConfig(config: any): EvaluatorValidationError[] {
    const errors: EvaluatorValidationError[] = [];
    
    if (!Array.isArray(config.patterns) || config.patterns.length === 0) {
      errors.push({ field: 'config.patterns', message: '正则表达式模式不能为空' });
    } else {
      config.patterns.forEach((pattern: any, index: number) => {
        if (!pattern.pattern || typeof pattern.pattern !== 'string') {
          errors.push({ 
            field: `config.patterns.${index}.pattern`, 
            message: '正则表达式不能为空' 
          });
        } else {
          // 验证正则表达式语法
          try {
            new RegExp(pattern.pattern, pattern.flags || '');
          } catch (e) {
            errors.push({ 
              field: `config.patterns.${index}.pattern`, 
              message: '无效的正则表达式语法' 
            });
          }
        }
        
        if (typeof pattern.score !== 'number') {
          errors.push({ 
            field: `config.patterns.${index}.score`, 
            message: '分数必须为数字' 
          });
        }
      });
    }
    
    if (typeof config.default_score !== 'number') {
      errors.push({ field: 'config.default_score', message: '默认分数必须为数字' });
    }
    
    return errors;
  }
  
  // 验证CODE类型配置
  private static validateCodeConfig(config: any): EvaluatorValidationError[] {
    const errors: EvaluatorValidationError[] = [];
    
    const supportedLanguages = ['python', 'javascript', 'typescript', 'cpp', 'java', 'go'];
    if (!config.language || !supportedLanguages.includes(config.language)) {
      errors.push({ 
        field: 'config.language', 
        message: `语言必须是以下之一: ${supportedLanguages.join(', ')}` 
      });
    }
    
    // 检查配置模式：模板模式或手动模式
    const isTemplateMode = config.use_template === true;
    const isManualMode = !isTemplateMode;
    
    if (isTemplateMode) {
      // 模板模式：需要template_id
      if (!config.template_id || typeof config.template_id !== 'string') {
        errors.push({ 
          field: 'config.template_id', 
          message: '使用模板模式时，必须选择一个代码模板' 
        });
      }
    } else {
      // 手动模式：需要code
      if (!config.code || typeof config.code !== 'string') {
        errors.push({ 
          field: 'config.code', 
          message: '手动模式时，代码内容不能为空' 
        });
      }
    }
    
    if (config.timeout_ms !== undefined) {
      if (typeof config.timeout_ms !== 'number' || config.timeout_ms < 1000) {
        errors.push({ field: 'config.timeout_ms', message: '超时时间必须至少1000毫秒' });
      }
    }
    
    if (config.requirements && !Array.isArray(config.requirements)) {
      errors.push({ field: 'config.requirements', message: '依赖列表必须是数组' });
    }
    
    if (config.environment_vars && typeof config.environment_vars !== 'object') {
      errors.push({ field: 'config.environment_vars', message: '环境变量必须是对象' });
    }
    
    return errors;
  }
  
  // 验证HUMAN类型配置
  private static validateHumanConfig(config: any): EvaluatorValidationError[] {
    const errors: EvaluatorValidationError[] = [];
    
    if (!config.guidelines || typeof config.guidelines !== 'string') {
      errors.push({ field: 'config.guidelines', message: '评估指南不能为空' });
    }
    
    if (!Array.isArray(config.scoring_criteria) || config.scoring_criteria.length === 0) {
      errors.push({ field: 'config.scoring_criteria', message: '评分标准不能为空' });
    } else {
      let totalWeight = 0;
      config.scoring_criteria.forEach((criterion: any, index: number) => {
        if (!criterion.criterion || typeof criterion.criterion !== 'string') {
          errors.push({ 
            field: `config.scoring_criteria.${index}.criterion`, 
            message: '评分标准名称不能为空' 
          });
        }
        
        if (typeof criterion.weight !== 'number' || criterion.weight <= 0) {
          errors.push({ 
            field: `config.scoring_criteria.${index}.weight`, 
            message: '权重必须为正数' 
          });
        } else {
          totalWeight += criterion.weight;
        }
      });
      
      // 检查权重总和是否为1
      if (Math.abs(totalWeight - 1) > 0.001) {
        errors.push({ 
          field: 'config.scoring_criteria', 
          message: '所有评分标准的权重总和必须等于1' 
        });
      }
    }
    
    return errors;
  }
  
  // 获取默认配置模板
  static getDefaultConfig(type: EvaluatorType): Partial<EvaluatorConfig> {
    switch (type) {
      case 'PROMPT':
        return {
          type: 'PROMPT',
          model_id: '',
          system_prompt: '',
          evaluation_prompt: '请根据以下标准评估代码:\n\n{input}\n\n请给出0-100分的评分并说明理由。',
          temperature: 0.3,
          max_tokens: 500
        } as PromptEvaluatorConfig;
        
      case 'REGEX':
        return {
          type: 'REGEX',
          patterns: [],
          default_score: 0,
          case_sensitive: false
        } as RegexEvaluatorConfig;
        
      case 'CODE':
        return {
          type: 'CODE',
          language: 'python',
          use_template: false,
          code: '# 在这里编写你的评估代码\n# 输入变量: input_text, reference_answer\n# 返回: {"score": 0-100, "justification": "评分理由"}\n\nscore = 0\njustification = "待实现"\n\nresult = {\n    "score": score,\n    "justification": justification\n}',
          timeout_ms: 10000
        } as CodeEvaluatorConfig;
        
      case 'HUMAN':
        return {
          type: 'HUMAN',
          guidelines: '请根据以下标准进行人工评估:',
          scoring_criteria: [
            {
              criterion: '总体质量',
              weight: 1.0,
              description: '综合评估整体质量'
            }
          ]
        } as HumanEvaluatorConfig;
        
      default:
        return {};
    }
  }
}