/**
 * 测试用例数据验证中间件
 * 防止创建无效的测试用例
 */

export interface TestCaseValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateTestCaseData(data: any): TestCaseValidationResult {
  const errors: string[] = [];
  
  // 1. 必填字段验证
  if (!data.input || (typeof data.input === 'string' && data.input.trim().length === 0)) {
    errors.push('input字段不能为空');
  }
  
  if (!data.reference_answer || data.reference_answer === null || data.reference_answer === '') {
    errors.push('reference_answer字段不能为空');
  }
  
  // 2. reference_answer格式验证
  if (data.reference_answer) {
    try {
      let parsed;
      if (typeof data.reference_answer === 'string') {
        parsed = JSON.parse(data.reference_answer);
      } else {
        parsed = data.reference_answer;
      }
      
      if (!Array.isArray(parsed)) {
        errors.push('reference_answer必须是有效的JSON数组');
      } else if (parsed.length === 0) {
        errors.push('reference_answer数组不能为空');
      } else {
        // 验证数组中每个元素的格式
        parsed.forEach((item, index) => {
          if (typeof item !== 'object' || item === null) {
            errors.push(`reference_answer[${index}]必须是对象`);
            return;
          }
          
          if (!('input' in item)) {
            errors.push(`reference_answer[${index}]必须包含input字段`);
          }
          
          if (!('expected' in item)) {
            errors.push(`reference_answer[${index}]必须包含expected字段`);
          }
          
          // 验证input和expected都是数组
          if (item.input && !Array.isArray(item.input)) {
            errors.push(`reference_answer[${index}].input必须是数组`);
          }
          
          if (item.expected && !Array.isArray(item.expected)) {
            errors.push(`reference_answer[${index}].expected必须是数组`);
          }
        });
      }
    } catch (e) {
      errors.push('reference_answer必须是有效的JSON格式');
    }
  }
  
  // 3. 数据长度验证
  if (data.input && typeof data.input === 'string' && data.input.length > 10000) {
    errors.push('input字段长度不能超过10000字符');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Express/Next.js 中间件包装器
 */
export function testCaseValidationMiddleware() {
  return async (data: any) => {
    const validation = validateTestCaseData(data);
    
    if (!validation.isValid) {
      throw new Error(`测试用例验证失败: ${validation.errors.join(', ')}`);
    }
    
    return data;
  };
}

/**
 * 预处理测试用例数据
 */
export function preprocessTestCaseData(data: any) {
  // 确保reference_answer是字符串格式存储
  if (data.reference_answer && typeof data.reference_answer === 'object') {
    data.reference_answer = JSON.stringify(data.reference_answer);
  }
  
  // 添加时间戳
  data.updated_at = new Date().toISOString();
  
  return data;
}