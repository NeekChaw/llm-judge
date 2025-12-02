/**
 * CODE评分器的可配置评分规则系统
 */

export interface ScoringRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  weight: number; // 权重系数 (0-1)
  maxScore: number; // 最大分值
  config: Record<string, any>; // 规则特定配置
}

export interface SyntaxScoringRule extends ScoringRule {
  config: {
    successScore: number; // 语法正确时的分数
    failureScore: number; // 语法错误时的分数
    considerStderr: boolean; // 是否考虑stderr作为错误指标
  };
}

export interface FunctionalScoringRule extends ScoringRule {
  config: {
    baseScore: number; // 基础分数
    passRateMultiplier: number; // 通过率乘数
    minPassRate: number; // 最低通过率要求 (0-1)
    noTestCaseScore: number; // 无测试用例时的分数
  };
}

export interface PerformanceScoringRule extends ScoringRule {
  config: {
    timeThresholds: {
      excellent: number; // 优秀阈值 (ms)
      good: number; // 良好阈值 (ms)
      acceptable: number; // 可接受阈值 (ms)
    };
    scoreMapping: {
      excellent: number; // 优秀时的分数
      good: number; // 良好时的分数
      acceptable: number; // 可接受时的分数
      poor: number; // 较差时的分数
    };
    bonusEnabled: boolean; // 是否启用加分机制
    maxBonus: number; // 最大加分
  };
}

export interface MemoryScoringRule extends ScoringRule {
  config: {
    memoryThresholds: {
      excellent: number; // 优秀阈值 (MB)
      good: number; // 良好阈值 (MB)
      acceptable: number; // 可接受阈值 (MB)
    };
    scoreMapping: {
      excellent: number; // 优秀时的分数
      good: number; // 良好时的分数
      acceptable: number; // 可接受时的分数
      poor: number; // 较差时的分数
    };
    enabled: boolean; // 是否启用内存评分
  };
}

export interface CodeScoringRules {
  syntax: SyntaxScoringRule;
  functional: FunctionalScoringRule;
  performance: PerformanceScoringRule;
  memory: MemoryScoringRule;
  totalMaxScore: number; // 总分上限
  normalizationEnabled: boolean; // 是否启用分数归一化
}

/**
 * 预设评分模板
 */
export const SCORING_TEMPLATES: Record<string, CodeScoringRules> = {
  strict: {
    syntax: {
      id: 'syntax',
      name: '语法正确性',
      description: '代码是否能正确执行，无语法错误',
      enabled: true,
      weight: 0.4,
      maxScore: 40,
      config: {
        successScore: 40,
        failureScore: 0,
        considerStderr: true
      }
    },
    functional: {
      id: 'functional',
      name: '功能正确性',
      description: '代码是否通过所有测试用例',
      enabled: true,
      weight: 0.5,
      maxScore: 50,
      config: {
        baseScore: 0,
        passRateMultiplier: 50,
        minPassRate: 1.0, // 严格模式要求100%通过
        noTestCaseScore: 10
      }
    },
    performance: {
      id: 'performance',
      name: '执行效率',
      description: '代码执行时间评估',
      enabled: true,
      weight: 0.05,
      maxScore: 5,
      config: {
        timeThresholds: {
          excellent: 1000, // 1秒
          good: 3000, // 3秒
          acceptable: 5000 // 5秒
        },
        scoreMapping: {
          excellent: 5,
          good: 3,
          acceptable: 1,
          poor: 0
        },
        bonusEnabled: false,
        maxBonus: 0
      }
    },
    memory: {
      id: 'memory',
      name: '内存使用',
      description: '代码内存使用效率评估',
      enabled: true,
      weight: 0.05,
      maxScore: 5,
      config: {
        memoryThresholds: {
          excellent: 50, // 50MB
          good: 100, // 100MB
          acceptable: 200 // 200MB
        },
        scoreMapping: {
          excellent: 5,
          good: 3,
          acceptable: 1,
          poor: 0
        },
        enabled: true
      }
    },
    totalMaxScore: 100,
    normalizationEnabled: true
  },

  balanced: {
    syntax: {
      id: 'syntax',
      name: '语法正确性',
      description: '代码是否能正确执行，无语法错误',
      enabled: true,
      weight: 0.3,
      maxScore: 30,
      config: {
        successScore: 30,
        failureScore: 0,
        considerStderr: true
      }
    },
    functional: {
      id: 'functional',
      name: '功能正确性',
      description: '代码是否通过测试用例',
      enabled: true,
      weight: 0.5,
      maxScore: 50,
      config: {
        baseScore: 0,
        passRateMultiplier: 50,
        minPassRate: 0.6, // 平衡模式要求60%通过
        noTestCaseScore: 20
      }
    },
    performance: {
      id: 'performance',
      name: '执行效率',
      description: '代码执行时间评估',
      enabled: true,
      weight: 0.1,
      maxScore: 10,
      config: {
        timeThresholds: {
          excellent: 2000, // 2秒
          good: 5000, // 5秒
          acceptable: 10000 // 10秒
        },
        scoreMapping: {
          excellent: 10,
          good: 6,
          acceptable: 3,
          poor: 0
        },
        bonusEnabled: true,
        maxBonus: 5
      }
    },
    memory: {
      id: 'memory',
      name: '内存使用',
      description: '代码内存使用效率评估',
      enabled: true,
      weight: 0.1,
      maxScore: 10,
      config: {
        memoryThresholds: {
          excellent: 100, // 100MB
          good: 200, // 200MB
          acceptable: 500 // 500MB
        },
        scoreMapping: {
          excellent: 10,
          good: 6,
          acceptable: 3,
          poor: 0
        },
        enabled: true
      }
    },
    totalMaxScore: 100,
    normalizationEnabled: true
  },

  lenient: {
    syntax: {
      id: 'syntax',
      name: '语法正确性',
      description: '代码是否能正确执行，无语法错误',
      enabled: true,
      weight: 0.6,
      maxScore: 60,
      config: {
        successScore: 60,
        failureScore: 20, // 宽松模式即使失败也给基础分
        considerStderr: false // 不严格考虑stderr
      }
    },
    functional: {
      id: 'functional',
      name: '功能正确性',
      description: '代码是否通过测试用例',
      enabled: true,
      weight: 0.3,
      maxScore: 30,
      config: {
        baseScore: 10, // 基础分数
        passRateMultiplier: 20,
        minPassRate: 0.3, // 宽松模式只要求30%通过
        noTestCaseScore: 25
      }
    },
    performance: {
      id: 'performance',
      name: '执行效率',
      description: '代码执行时间评估',
      enabled: true,
      weight: 0.05,
      maxScore: 5,
      config: {
        timeThresholds: {
          excellent: 5000, // 5秒
          good: 15000, // 15秒
          acceptable: 30000 // 30秒
        },
        scoreMapping: {
          excellent: 5,
          good: 3,
          acceptable: 1,
          poor: 0
        },
        bonusEnabled: true,
        maxBonus: 10
      }
    },
    memory: {
      id: 'memory',
      name: '内存使用',
      description: '代码内存使用效率评估',
      enabled: false, // 宽松模式不考虑内存
      weight: 0.05,
      maxScore: 5,
      config: {
        memoryThresholds: {
          excellent: 500, // 500MB
          good: 1000, // 1GB
          acceptable: 2000 // 2GB
        },
        scoreMapping: {
          excellent: 5,
          good: 3,
          acceptable: 1,
          poor: 0
        },
        enabled: false
      }
    },
    totalMaxScore: 100,
    normalizationEnabled: true
  }
};

/**
 * 默认评分规则（当前系统使用的规则）
 */
export const DEFAULT_SCORING_RULES: CodeScoringRules = SCORING_TEMPLATES.balanced;
