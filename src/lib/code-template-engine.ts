/**
 * 代码模板生成引擎
 * 负责将用户配置转换为可执行的评分代码
 */

import Ajv from 'ajv';
import type { 
  CodeEvaluationTemplate, 
  GenerateCodeResponse, 
  TemplateConfigValidation,
  CodeGenerator 
} from '@/types/code-templates';

export class CodeTemplateEngine implements CodeGenerator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ 
      allErrors: true,
      removeAdditional: true,
      useDefaults: true
    });
  }

  /**
   * 生成最终的可执行代码
   */
  async generateCode(template: CodeEvaluationTemplate, userConfig: any, modelCode?: string): Promise<GenerateCodeResponse> {
    // 🔍 错误溯源：生成唯一的操作ID用于追踪
    const operationId = `TEMPLATE_GEN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const operationContext = {
      operationId,
      templateId: template.id,
      templateName: template.name,
      timestamp: new Date().toISOString(),
      userConfigHash: this.hashConfig(userConfig)
    };

    try {
      console.log(`🔧 [${operationId}] 代码模板引擎开始生成代码`);
      console.log(`   模板ID: ${template.id} (${template.name})`);
      console.log(`   用户配置: ${JSON.stringify(userConfig, null, 2)}`);
      console.log(`   操作追踪ID: ${operationId}`);
      if (modelCode) {
        console.log(`   🎯 模型代码长度: ${modelCode.length} 字符`);
      }

      // 1. 验证用户配置
      const validation = this.validateConfig(template, userConfig, operationContext);
      if (!validation.valid) {
        // 🚨 错误溯源：详细记录验证失败的上下文
        console.log(`🚨 [${operationId}] 模板验证失败 - 可追踪错误报告:`);
        console.log(`   📍 错误来源: 代码模板引擎验证阶段`);
        console.log(`   🕐 发生时间: ${operationContext.timestamp}`);
        console.log(`   📄 模板信息: ${template.name} (ID: ${template.id})`);
        console.log(`   ⚙️ 配置哈希: ${operationContext.userConfigHash}`);
        console.log(`   ❌ 验证错误: ${validation.errors.join(' | ')}`);
        console.log(`   ⚠️ 验证警告: ${validation.warnings.join(' | ')}`);
        console.log(`   🔧 用户配置: ${JSON.stringify(userConfig, null, 2)}`);

        // 添加溯源信息到错误中
        const trackedErrors = validation.errors.map(error =>
          `[TRACE:${operationId}] ${error}`
        );

        return {
          generated_code: '',
          validation_errors: trackedErrors,
          operation_trace: operationContext
        };
      }

      console.log(`   ✅ 验证通过 (警告: ${validation.warnings.length})`);

      // 2. 应用默认值并清理配置
      const cleanConfig = this.applyDefaults(template.config_schema, userConfig);
      console.log(`   📋 清理后的配置: ${JSON.stringify(cleanConfig, null, 2)}`);

      // 3. 替换模板占位符（包括模型代码插入）
      const generatedCode = this.replaceTemplatePlaceholders(template.template_code, cleanConfig, modelCode);
      console.log(`   🔧 生成的代码长度: ${generatedCode.length} 字符`);

      return {
        generated_code: generatedCode,
        validation_errors: validation.warnings.length > 0 ? validation.warnings : undefined,
        operation_trace: operationContext
      };
    } catch (error) {
      return {
        generated_code: '',
        validation_errors: [`代码生成失败: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * 验证用户配置
   */
  validateConfig(template: CodeEvaluationTemplate, userConfig: any, operationContext?: any): TemplateConfigValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 使用JSON Schema验证
      const validate = this.ajv.compile(template.config_schema);
      const isValid = validate(userConfig);

      if (!isValid && validate.errors) {
        for (const error of validate.errors) {
          const field = error.instancePath ? error.instancePath.slice(1) : error.schemaPath;
          errors.push(`字段 "${field}": ${error.message}`);
        }
      }

      // 额外的业务逻辑验证
      const businessValidation = this.performBusinessValidation(template, userConfig, operationContext);
      errors.push(...businessValidation.errors);
      warnings.push(...businessValidation.warnings);

    } catch (error) {
      errors.push(`配置验证失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 替换模板占位符
   */
  replaceTemplatePlaceholders(templateCode: string, config: any, modelCode?: string): string {
    let result = templateCode;

    // 清理模板代码中的回车符
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 🎯 首先处理模型代码插入点（在其他替换之前）
    if (modelCode && result.includes('# 🎯 此处将由模板引擎插入LLM生成的实际代码')) {
      console.log(`🔧 检测到模型代码插入点，插入 ${modelCode.length} 字符的代码`);

      const insertionPoint = `# ===============================================
# 🎯 此处将由模板引擎插入LLM生成的实际代码
# 替换 {{MODEL_CODE_INSERTION_POINT}} 占位符
# ===============================================`;

      // 清理模型代码并插入
      const cleanedModelCode = CodeTemplateEngine.cleanCodeString(modelCode);

      result = result.replace(insertionPoint, `# ===============================================
# 🎯 LLM生成的代码插入开始
# ===============================================

${cleanedModelCode}

# ===============================================
# 🎯 LLM生成的代码插入结束
# ===============================================`);
    }

    // 递归替换所有配置项
    const replaceValue = (key: string, value: any): string => {
      if (typeof value === 'string') {
        // 对于字符串类型，先清理Unicode引号字符，然后直接返回
        // 不使用JSON.stringify()，因为它会添加额外的引号和转义
        const cleanedValue = value
          .replace(/[""]/g, '"')  // 替换Unicode左右双引号
          .replace(/['']/g, "'")  // 替换Unicode左右单引号
          .replace(/\r\n/g, '\n') // 清理回车符
          .replace(/\r/g, '\n');
        return cleanedValue;
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      } else if (Array.isArray(value) || typeof value === 'object') {
        return JSON.stringify(value, null, 2);
      } else {
        return String(value);
      }
    };

    // 替换所有占位符 {{KEY}}
    for (const [key, value] of Object.entries(config)) {
      // 尝试替换原始键名的大写版本
      const placeholder = new RegExp(`\\{\\{${key.toUpperCase()}\\}\\}`, 'g');
      result = result.replace(placeholder, replaceValue(key, value));

      // 也尝试替换原始键名（如果不同）
      if (key !== key.toUpperCase()) {
        const originalPlaceholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(originalPlaceholder, replaceValue(key, value));
      }
    }

    // 处理特殊的系统占位符
    result = this.replacSystemPlaceholders(result);

    return result;
  }

  /**
   * 应用默认值
   */
  private applyDefaults(schema: any, userConfig: any): any {
    const config = { ...userConfig };

    // 使用AJV应用默认值
    const validate = this.ajv.compile(schema);
    validate(config);

    return config;
  }

  /**
   * 业务逻辑验证
   */
  private performBusinessValidation(template: CodeEvaluationTemplate, config: any, operationContext?: any): {
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 根据模板类别进行特定验证
    switch (template.category) {
      case 'algorithm':
        this.validateAlgorithmTemplate(config, errors, warnings, operationContext);
        break;
      case 'format':
        this.validateFormatTemplate(config, errors, warnings);
        break;
      case 'performance':
        this.validatePerformanceTemplate(config, errors, warnings);
        break;
      case 'quality':
        this.validateQualityTemplate(config, errors, warnings);
        break;
    }

    return { errors, warnings };
  }

  /**
   * 🏗️ 算法模板验证 - 新旧架构智能识别
   *
   * 【架构演进】
   * 旧架构：模板配置中必须包含完整的测试用例数据
   * 新架构：允许模板配置中test_cases为空，数据来源于题目级别
   *
   * 【智能验证逻辑】
   * 1. 检测架构类型：通过test_cases数量和配置特征判断新旧架构
   * 2. 新架构：test_cases为空时只产生信息性警告，不产生错误
   * 3. 旧架构：严格验证test_cases完整性
   * 4. 字段兼容：expected 或 reference_answer 都可以
   */
  private validateAlgorithmTemplate(config: any, errors: string[], warnings: string[], operationContext?: any): void {
    if (config.test_cases && Array.isArray(config.test_cases)) {
      const testCaseCount = config.test_cases.length;

      // 🔍 智能架构检测：判断是新架构还是旧架构
      const isNewArchitecture = this.detectNewArchitecture(config);
      const traceId = operationContext?.operationId || 'NO_TRACE';

      console.log(`🏗️ [${traceId}] ARCHITECTURE_DETECTION: 检测到${isNewArchitecture ? '新' : '旧'}架构评分器`);
      console.log(`   - test_cases数量: ${testCaseCount}`);
      console.log(`   - 架构类型: ${isNewArchitecture ? '通用评分器(数据来自题目级别)' : '自包含评分器(数据在配置中)'}`);

      // 🏗️ 新架构处理：空测试用例是正常的
      if (isNewArchitecture && testCaseCount === 0) {
        warnings.push(`✅ [TRACE:${traceId}] 新架构通用评分器：测试用例将从题目级别动态解析（这是正确的配置）`);
        return; // 新架构空配置直接通过，不进行后续验证
      }

      // 🏗️ 旧架构或有测试用例的新架构：验证测试用例完整性
      if (testCaseCount > 0) {
        console.log(`🔍 TEMPLATE_VALIDATION: 验证${testCaseCount}个测试用例的完整性...`);

        for (let i = 0; i < testCaseCount; i++) {
          const testCase = config.test_cases[i];

          // 验证字段完整性
          const hasInput = testCase.input !== undefined && testCase.input !== null && testCase.input !== '';
          const hasExpected = testCase.expected !== undefined && testCase.expected !== null && testCase.expected !== '';
          const hasRef = testCase.reference_answer !== undefined && testCase.reference_answer !== null && testCase.reference_answer !== '';

          if (!hasInput || (!hasExpected && !hasRef)) {
            const issue = !hasInput ? 'input缺少' : 'expected和reference_answer都缺少';

            // 🚨 关键修复：添加架构上下文和追踪ID到错误信息中
            const errorMsg = `[TRACE:${traceId}] 测试用例 ${i + 1} 缺少必需字段 (${issue}) [${isNewArchitecture ? '新架构-不应有测试用例' : '旧架构-需要完整数据'}]`;
            errors.push(errorMsg);

            console.log(`❌ 测试用例 ${i + 1} 验证失败: ${issue}`);
            console.log(`   架构建议: ${isNewArchitecture ? '新架构评分器应该清空test_cases配置' : '旧架构评分器需要完整的测试用例数据'}`);
          } else {
            console.log(`✅ 测试用例 ${i + 1} 验证通过`);
          }

          if (Array.isArray(testCase.input) && testCase.input.length > 10000) {
            warnings.push(`测试用例 ${i + 1} 输入数据较大，可能影响执行性能`);
          }
        }
      }

      // 验证权重配置
      const correctnessWeight = config.correctness_weight || 0.7;
      const performanceWeight = config.performance_weight || 0.3;

      if (Math.abs(correctnessWeight + performanceWeight - 1.0) > 0.001) {
        errors.push('正确性权重与性能权重之和必须等于1.0');
      }
    }
  }

  /**
   * 🔍 智能架构检测：判断评分器是新架构还是旧架构
   *
   * 检测规则：
   * 1. test_cases为空数组 -> 新架构（通用评分器）
   * 2. 包含function_name_hints等新架构特征 -> 新架构
   * 3. 包含大量完整测试用例 -> 旧架构
   */
  private detectNewArchitecture(config: any): boolean {
    // 规则1：空测试用例数组 + 新架构特征
    if (config.test_cases?.length === 0) {
      const hasNewArchFeatures = !!(
        config.function_name_hints ||
        config.timeout_per_test ||
        config.dynamic_parsing
      );
      if (hasNewArchFeatures) {
        return true;
      }
    }

    // 规则2：测试用例数量少且有新架构配置特征
    if (config.test_cases?.length <= 2 && config.function_name_hints) {
      return true;
    }

    // 规则3：明确的旧架构特征（大量完整测试用例）
    if (config.test_cases?.length > 5) {
      return false;
    }

    // 默认：根据test_cases是否为空判断
    return config.test_cases?.length === 0;
  }

  /**
   * 格式验证模板验证
   */
  private validateFormatTemplate(config: any, errors: string[], warnings: string[]): void {
    if (config.required_fields && Array.isArray(config.required_fields)) {
      if (config.required_fields.length === 0) {
        warnings.push('建议至少指定一个必需字段');
      }

      // 验证字段类型定义
      if (config.field_types) {
        for (const field of config.required_fields) {
          if (!config.field_types[field]) {
            warnings.push(`必需字段 "${field}" 未定义类型`);
          }
        }
      }
    }
  }

  /**
   * 性能测试模板验证
   */
  private validatePerformanceTemplate(config: any, errors: string[], warnings: string[]): void {
    if (config.large_dataset_size && config.small_dataset_size) {
      if (config.large_dataset_size <= config.small_dataset_size) {
        errors.push('大数据集大小必须大于小数据集大小');
      }

      const sizeRatio = config.large_dataset_size / config.small_dataset_size;
      if (sizeRatio < 10) {
        warnings.push('建议大数据集至少是小数据集的10倍以获得更好的性能测试效果');
      }
    }

    if (config.time_limit_ms && config.time_limit_ms < 10) {
      warnings.push('时间限制过短可能导致正常算法也被判定为超时');
    }
  }

  /**
   * 代码质量模板验证
   */
  private validateQualityTemplate(config: any, errors: string[], warnings: string[]): void {
    if (config.max_line_length && config.max_line_length < 60) {
      warnings.push('行长度限制过短可能过于严格');
    }

    if (config.max_line_length && config.max_line_length > 120) {
      warnings.push('行长度限制过长可能影响代码可读性');
    }
  }

  /**
   * 替换系统占位符
   */
  private replacSystemPlaceholders(code: string): string {
    // 这些占位符会在评分器执行时由系统自动提供
    const systemPlaceholders = {
      'model_response': 'model_response',
      'test_input': 'test_input',
      'reference_answer': 'reference_answer',
      'test_case_metadata': 'test_case_metadata'
    };

    let result = code;
    for (const [placeholder, variable] of Object.entries(systemPlaceholders)) {
      const regex = new RegExp(`\\{\\{${placeholder.toUpperCase()}\\}\\}`, 'g');
      result = result.replace(regex, variable);
    }

    // 🔧 修复 testCaseResults 未定义的问题
    // 在生成的代码开头添加变量定义，确保即使有地方引用也不会出错
    const compatibility_fix = `
# 兼容性修复：定义可能被引用的变量
testCaseResults = []
tolerance_details = []
tolerance_applied = False
test_results = []
evaluation_results = []
final_score = 0.0

`;

    // 🔧 增强的兼容性修复：无论是否有import都要确保变量定义
    const lines = result.split('\n');
    let insertIndex = 0;
    let hasImports = false;

    // 寻找最佳插入位置
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.startsWith('from ')) {
        hasImports = true;
        insertIndex = i + 1;
      } else if (line === '' && hasImports && insertIndex > 0) {
        // 空行，可能是import结束
        continue;
      } else if (hasImports && insertIndex > 0 && line !== '') {
        // 非import行，插入兼容性修复
        break;
      }
    }

    if (hasImports) {
      // 在import语句后插入
      lines.splice(insertIndex, 0, compatibility_fix);
      result = lines.join('\n');
    } else {
      // 如果没有import，在开头插入
      result = compatibility_fix + result;
    }

    // 🔧 最后检查：确保兼容性修复真的被插入了
    if (!result.includes('testCaseResults = []')) {
      console.warn('⚠️ 兼容性修复可能没有正确插入，强制在开头添加');
      result = compatibility_fix + result;
    }

    return result;
  }

  /**
   * 🔍 生成配置哈希用于追踪
   */
  private hashConfig(config: any): string {
    try {
      const configStr = JSON.stringify(config, Object.keys(config).sort());
      // 简单哈希算法
      let hash = 0;
      for (let i = 0; i < configStr.length; i++) {
        const char = configStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
      }
      return Math.abs(hash).toString(36).toUpperCase();
    } catch {
      return 'HASH_ERROR';
    }
  }

  /**
   * 清理代码中的Unicode字符和格式问题
   */
  static cleanCodeString(code: string): string {
    if (typeof code !== 'string') {
      return String(code);
    }

    // 🔍 日志：检查是否包含markdown代码块标记
    const hasMarkdownBlocks = code.includes('```');
    if (hasMarkdownBlocks) {
      console.log('🔧 MARKDOWN_CLEANUP: 检测到模型响应包含markdown代码块标记');
      const markdownMatches = code.match(/```[\s\S]*?```/g);
      if (markdownMatches) {
        console.log(`   发现 ${markdownMatches.length} 个代码块`);
        markdownMatches.forEach((match, index) => {
          const preview = match.substring(0, 50).replace(/\n/g, '\\n');
          console.log(`   块${index + 1}: ${preview}...`);
        });
      }
    }

    const cleanedCode = code
      // 🔧 首先移除markdown代码块标记
      .replace(/^```(?:python|py|javascript|js|typescript|ts)?\s*\n?/gm, '')  // 移除开始标记
      .replace(/\n?```\s*$/gm, '')  // 移除结束标记
      .replace(/```/g, '')  // 移除任何剩余的代码块标记

      // Unicode引号处理
      .replace(/[""]/g, '"')     // 替换Unicode左右双引号
      .replace(/['']/g, "'")     // 替换Unicode左右单引号
      
      // 中文标点符号处理
      .replace(/[、]/g, ',')     // 替换顿号为逗号
      .replace(/[；]/g, ';')     // 替换中文分号
      .replace(/[：]/g, ':')     // 替换中文冒号
      .replace(/[！]/g, '!')     // 替换中文感叹号
      .replace(/[？]/g, '?')     // 替换中文问号
      .replace(/[（]/g, '(')     // 替换中文左括号
      .replace(/[）]/g, ')')     // 替换中文右括号
      .replace(/[【]/g, '[')     // 替换中文左方括号
      .replace(/[】]/g, ']')     // 替换中文右方括号
      .replace(/[《]/g, '<')     // 替换中文左书名号
      .replace(/[》]/g, '>')     // 替换中文右书名号
      .replace(/[￥]/g, '$')     // 替换人民币符号
      
      // 其他Unicode符号处理
      .replace(/[…]/g, '...')    // 替换省略号
      .replace(/[—]/g, '--')     // 替换em dash
      .replace(/[–]/g, '-')      // 替换en dash
      .replace(/[·]/g, '.')      // 替换中点
      .replace(/[×]/g, '*')      // 替换乘号
      .replace(/[÷]/g, '/')      // 替换除号
      
      // 空白字符处理
      .replace(/[\u3000]/g, ' ') // 替换全角空格为半角空格
      .replace(/\r\n/g, '\n')    // 统一换行符
      .replace(/\r/g, '\n')
      
      // 去除BOM和其他不可见字符
      .replace(/^\uFEFF/, '')    // 去除BOM
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // 去除零宽字符
      
      .trim();                   // 去除首尾空白

    // 🔍 日志：记录清理效果
    if (hasMarkdownBlocks) {
      const stillHasMarkdown = cleanedCode.includes('```');
      if (stillHasMarkdown) {
        console.log('⚠️ MARKDOWN_CLEANUP: 清理后仍包含markdown标记');
      } else {
        console.log('✅ MARKDOWN_CLEANUP: 成功移除所有markdown标记');
        console.log(`   原始长度: ${code.length} -> 清理后长度: ${cleanedCode.length}`);
      }
    }

    return cleanedCode;
  }
}

// 导出单例实例
export const codeTemplateEngine = new CodeTemplateEngine();