/**
 * 🔍 错误分类和溯源系统
 *
 * 防止验证警告与实际执行错误混淆的分类机制
 */

export interface ErrorContext {
  source: 'validation' | 'execution' | 'api' | 'system';
  severity: 'error' | 'warning' | 'info';
  category: 'configuration' | 'runtime' | 'network' | 'data';
  traceId: string;
  timestamp: string;
  component: string;
}

export interface ClassifiedError {
  message: string;
  context: ErrorContext;
  originalError?: string;
  suggestions?: string[];
  relatedErrors?: string[];
}

export class ErrorClassifier {

  /**
   * 🔍 分类验证错误，防止与执行错误混淆
   */
  static classifyValidationError(
    error: string,
    templateName: string,
    operationId: string
  ): ClassifiedError {

    const context: ErrorContext = {
      source: 'validation',
      severity: error.includes('缺少必需') ? 'error' : 'warning',
      category: 'configuration',
      traceId: operationId,
      timestamp: new Date().toISOString(),
      component: 'code-template-engine'
    };

    // 🔍 检测新旧架构混淆问题
    if (error.includes('缺少必需') && error.includes('新架构-不应有测试用例')) {
      return {
        message: `🏗️ 架构配置错误：${error}`,
        context,
        originalError: error,
        suggestions: [
          '这是新架构评分器，应该清空 test_cases 配置',
          '测试用例数据应该来自题目级别，而不是评分器配置',
          '检查评分器配置中的 template_config.test_cases 字段'
        ],
        relatedErrors: ['新旧架构混用', '配置不匹配']
      };
    }

    // 🔍 检测旧架构数据不完整问题
    if (error.includes('缺少必需') && error.includes('旧架构-需要完整数据')) {
      return {
        message: `📋 数据完整性错误：${error}`,
        context,
        originalError: error,
        suggestions: [
          '这是旧架构评分器，需要在配置中提供完整的测试用例',
          '确保每个测试用例都有 input 和 expected/reference_answer 字段',
          '考虑迁移到新架构以避免重复配置'
        ],
        relatedErrors: ['数据缺失', '配置不完整']
      };
    }

    // 默认分类
    return {
      message: `⚠️ 配置验证警告：${error}`,
      context,
      originalError: error,
      suggestions: ['检查配置格式是否正确', '参考示例配置进行修正'],
      relatedErrors: []
    };
  }

  /**
   * 🚨 分类执行错误，区别于验证警告
   */
  static classifyExecutionError(
    error: string,
    taskId: string,
    evaluatorId: string
  ): ClassifiedError {

    const context: ErrorContext = {
      source: 'execution',
      severity: 'error',
      category: 'runtime',
      traceId: `EXEC_${Date.now()}`,
      timestamp: new Date().toISOString(),
      component: 'task-processor'
    };

    // LLM API失败
    if (error.includes('All vendors failed') || error.includes('No available vendors')) {
      return {
        message: `🌐 LLM API连接失败：${error}`,
        context: { ...context, category: 'network' },
        originalError: error,
        suggestions: [
          '检查对应供应商的API密钥是否正确配置',
          '验证网络连接和API服务状态',
          '检查模型名称是否正确',
          '查看任务处理器的环境变量加载情况'
        ],
        relatedErrors: ['API认证失败', '网络连接问题', '环境变量缺失']
      };
    }

    // 代码执行错误
    if (error.includes('object of type') && error.includes('has no len()')) {
      return {
        message: `🐍 代码执行错误：${error}`,
        context,
        originalError: error,
        suggestions: [
          '检查函数参数类型是否正确',
          '确认模型生成的函数签名与测试数据匹配',
          '查看CODE模板的参数传递逻辑',
          '检查测试用例数据格式是否正确'
        ],
        relatedErrors: ['类型错误', '参数不匹配', '模板逻辑问题']
      };
    }

    return {
      message: `💥 执行错误：${error}`,
      context,
      originalError: error,
      suggestions: ['查看详细日志了解具体错误原因'],
      relatedErrors: []
    };
  }

  /**
   * 📊 生成错误报告，明确区分不同类型的错误
   */
  static generateErrorReport(errors: ClassifiedError[]): string {
    const report = ['🔍 错误分析报告', '=' .repeat(50)];

    const bySource = errors.reduce((acc, error) => {
      const source = error.context.source;
      if (!acc[source]) acc[source] = [];
      acc[source].push(error);
      return acc;
    }, {} as Record<string, ClassifiedError[]>);

    for (const [source, sourceErrors] of Object.entries(bySource)) {
      report.push(`\n📂 ${source.toUpperCase()} 类错误 (${sourceErrors.length}个):`);

      sourceErrors.forEach((error, i) => {
        report.push(`\n${i + 1}. ${error.message}`);
        report.push(`   🕐 时间: ${error.context.timestamp}`);
        report.push(`   🔗 追踪ID: ${error.context.traceId}`);
        report.push(`   📍 组件: ${error.context.component}`);

        if (error.suggestions && error.suggestions.length > 0) {
          report.push(`   💡 建议:`);
          error.suggestions.forEach(suggestion => {
            report.push(`      - ${suggestion}`);
          });
        }
      });
    }

    report.push('\n' + '=' .repeat(50));
    report.push(`总结: 发现 ${errors.length} 个错误`);
    report.push(`验证错误: ${bySource.validation?.length || 0} 个`);
    report.push(`执行错误: ${bySource.execution?.length || 0} 个`);
    report.push(`API错误: ${bySource.api?.length || 0} 个`);

    return report.join('\n');
  }
}

/**
 * 🎯 快速错误分类助手
 */
export function classifyError(
  error: string,
  context: {
    type: 'validation' | 'execution' | 'api';
    templateName?: string;
    taskId?: string;
    evaluatorId?: string;
    operationId?: string;
  }
): ClassifiedError {

  switch (context.type) {
    case 'validation':
      return ErrorClassifier.classifyValidationError(
        error,
        context.templateName || 'unknown',
        context.operationId || `VAL_${Date.now()}`
      );

    case 'execution':
      return ErrorClassifier.classifyExecutionError(
        error,
        context.taskId || 'unknown',
        context.evaluatorId || 'unknown'
      );

    default:
      return {
        message: error,
        context: {
          source: context.type,
          severity: 'error',
          category: 'system',
          traceId: `UNK_${Date.now()}`,
          timestamp: new Date().toISOString(),
          component: 'unknown'
        }
      };
  }
}