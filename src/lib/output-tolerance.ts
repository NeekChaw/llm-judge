/**
 * 输出格式容错机制
 * 解决 "期望25，输出[25]" 类型的格式差异问题
 */

export interface OutputComparisonResult {
  isMatch: boolean;
  confidence: number; // 0-1, 匹配置信度
  reason: string;
  suggestion?: string;
  originalScore?: number; // 如果有基础分数，调整后的分数
}

/**
 * 智能输出比较函数 - 支持格式容错
 */
export function compareOutputWithTolerance(expected: any, actual: any): OutputComparisonResult {
  // 1. 完全匹配 - 最高置信度
  if (expected === actual) {
    return {
      isMatch: true,
      confidence: 1.0,
      reason: "完全匹配"
    };
  }
  
  // 如果两者都是null或undefined，视为匹配
  if ((expected == null && actual == null)) {
    return {
      isMatch: true,
      confidence: 1.0,
      reason: "都为空值"
    };
  }
  
  // 2. 数组包装容错：[25] vs 25
  if (Array.isArray(actual) && actual.length === 1 && !Array.isArray(expected)) {
    if (expected === actual[0]) {
      return {
        isMatch: true,
        confidence: 0.95,
        reason: "数组包装格式差异，内容正确",
        suggestion: "建议统一输出格式为非数组形式"
      };
    }
  }
  
  // 3. 反向：25 vs [25]
  if (Array.isArray(expected) && expected.length === 1 && !Array.isArray(actual)) {
    if (expected[0] === actual) {
      return {
        isMatch: true,
        confidence: 0.95,
        reason: "缺少数组包装，但内容正确",
        suggestion: "建议按要求返回数组格式"
      };
    }
  }
  
  // 4. 类型转换容错：\"25\" vs 25
  if (String(expected) === String(actual)) {
    return {
      isMatch: true,
      confidence: 0.9,
      reason: "数据类型差异，但值相等",
      suggestion: "注意返回值的数据类型"
    };
  }
  
  // 5. 数值精度容错：25.0 vs 25
  if (typeof expected === 'number' && typeof actual === 'number') {
    const diff = Math.abs(expected - actual);
    // 更宽松的精度容错，适应不同精度场景
    const tolerance = Math.max(1e-10, Math.min(expected, actual) * 1e-6);
    if (diff < tolerance) {
      return {
        isMatch: true,
        confidence: 0.98,
        reason: "浮点数精度差异，实质相等"
      };
    }
  }
  
  // 6. 字符串空白字符容错：" 25 " vs "25"
  if (typeof expected === 'string' && typeof actual === 'string') {
    if (expected.trim() === actual.trim()) {
      return {
        isMatch: true,
        confidence: 0.95,
        reason: "字符串空白字符差异，内容相等",
        suggestion: "注意输出时的空白字符处理"
      };
    }
  }
  
  // 7. 多维数组扁平化容错：[[25]] vs [25] vs 25
  const flatExpected = flattenDeep(expected);
  const flatActual = flattenDeep(actual);
  if (flatExpected.length === 1 && flatActual.length === 1 && 
      flatExpected[0] !== expected && flatActual[0] !== actual) { // 防止无限递归
    if (flatExpected[0] === flatActual[0]) {
      return {
        isMatch: true,
        confidence: 0.85,
        reason: "多维数组结构差异，但核心值正确",
        suggestion: "注意数组维度要求"
      };
    }
  }
  
  // 8. JSON对象容错：对象属性顺序不同但内容相同
  if (typeof expected === 'object' && typeof actual === 'object' && 
      expected !== null && actual !== null &&
      !Array.isArray(expected) && !Array.isArray(actual)) {
    try {
      if (JSON.stringify(sortObjectKeys(expected)) === JSON.stringify(sortObjectKeys(actual))) {
        return {
          isMatch: true,
          confidence: 0.95,
          reason: "对象属性顺序差异，但内容相同",
          suggestion: "对象属性顺序不影响正确性"
        };
      }
    } catch (e) {
      // JSON序列化失败，继续其他比较
    }
  }
  
  // 9. 布尔值容错：true vs "true" vs 1
  if (isBooleanEquivalent(expected, actual)) {
    return {
      isMatch: true,
      confidence: 0.88,
      reason: "布尔值类型差异，但逻辑值相等",
      suggestion: "注意布尔值的表示方式"
    };
  }
  
  // 10. 数组内容顺序无关的比较（适用于某些算法结果）
  if (Array.isArray(expected) && Array.isArray(actual) && 
      expected.length === actual.length && expected.length > 1) {
    const sortedExpected = [...expected].sort();
    const sortedActual = [...actual].sort();
    if (JSON.stringify(sortedExpected) === JSON.stringify(sortedActual)) {
      return {
        isMatch: true,
        confidence: 0.85,
        reason: "数组元素顺序差异，但内容完全相同",
        suggestion: "检查题目是否要求特定顺序"
      };
    }
  }
  
  // 11. 不匹配
  return {
    isMatch: false,
    confidence: 0,
    reason: "输出不匹配",
    suggestion: `期望: ${JSON.stringify(expected)}, 实际: ${JSON.stringify(actual)}`
  };
}

/**
 * 深度扁平化数组
 */
function flattenDeep(arr: any): any[] {
  if (!Array.isArray(arr)) return [arr];
  return arr.reduce((acc, val) => Array.isArray(val) ? acc.concat(flattenDeep(val)) : acc.concat(val), []);
}

/**
 * 对象键排序（用于比较）
 */
function sortObjectKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj;
  }
  
  const sorted: any = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = sortObjectKeys(obj[key]);
  });
  return sorted;
}

/**
 * 判断是否为布尔值等价
 */
function isBooleanEquivalent(a: any, b: any): boolean {
  const normalize = (val: any): boolean | null => {
    if (typeof val === 'boolean') return val;
    if (val === 'true' || val === 1 || val === '1') return true;
    if (val === 'false' || val === 0 || val === '0') return false;
    return null;
  };
  
  const normalizedA = normalize(a);
  const normalizedB = normalize(b);
  
  return normalizedA !== null && normalizedB !== null && normalizedA === normalizedB;
}

/**
 * 评分策略：基于匹配置信度
 */
export function calculateToleranceScore(comparison: OutputComparisonResult, baseScore: number = 100): number {
  if (!comparison.isMatch) return 0;
  
  // 根据置信度调整分数
  const adjustedScore = Math.round(baseScore * comparison.confidence);
  
  // 最低给分阈值（避免格式问题导致过低分数）
  const minimumScore = comparison.confidence > 0.8 ? Math.max(adjustedScore, baseScore * 0.8) : adjustedScore;
  
  return minimumScore;
}

/**
 * 生成容错比较报告
 */
export function generateToleranceReport(comparison: OutputComparisonResult): string {
  let report = `🎯 输出比较结果: ${comparison.isMatch ? '✅ 匹配' : '❌ 不匹配'}\n`;
  report += `📊 匹配置信度: ${(comparison.confidence * 100).toFixed(1)}%\n`;
  report += `💡 比较说明: ${comparison.reason}\n`;
  
  if (comparison.suggestion) {
    report += `🔧 优化建议: ${comparison.suggestion}\n`;
  }
  
  return report;
}

/**
 * 智能测试用例比较：批量处理多个测试用例
 */
export function compareTestCaseResults(
  testCases: Array<{ expected: any; actual: any; description?: string }>,
  baseScore: number = 100
): {
  totalScore: number;
  passedTests: number;
  toleranceApplied: number;
  details: Array<{
    description?: string;
    comparison: OutputComparisonResult;
    score: number;
    passed: boolean;
  }>;
} {
  const details = testCases.map((testCase, index) => {
    const comparison = compareOutputWithTolerance(testCase.expected, testCase.actual);
    const score = calculateToleranceScore(comparison, baseScore);
    
    return {
      description: testCase.description || `测试用例 ${index + 1}`,
      comparison,
      score,
      passed: comparison.isMatch
    };
  });
  
  const passedTests = details.filter(d => d.passed).length;
  const toleranceApplied = details.filter(d => d.passed && d.comparison.confidence < 1.0).length;
  const totalScore = details.reduce((sum, d) => sum + d.score, 0) / details.length;
  
  return {
    totalScore: Math.round(totalScore),
    passedTests,
    toleranceApplied,
    details
  };
}