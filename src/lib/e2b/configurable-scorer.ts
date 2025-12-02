/**
 * 可配置的CODE评分器计算引擎
 */

import { 
  CodeScoringRules, 
  SyntaxScoringRule, 
  FunctionalScoringRule, 
  PerformanceScoringRule, 
  MemoryScoringRule,
  DEFAULT_SCORING_RULES 
} from './scoring-rules';

export interface EvaluationResult {
  success: boolean;
  executionResult: {
    stdout: string;
    stderr: string;
    sessionId?: string;
    sandboxId?: string;
  };
  metrics: {
    testsPassed: number;
    testsTotal: number;
    totalExecutionTime: number;
    memoryUsage?: number;
  };
}

export interface ScoringResult {
  finalScore: number;
  maxPossibleScore: number;
  justification: string;
  syntaxCorrect: boolean;
  functionalCorrect: boolean;
  breakdown: {
    syntax: { score: number; maxScore: number; details: string };
    functional: { score: number; maxScore: number; details: string };
    performance: { score: number; maxScore: number; details: string };
    memory: { score: number; maxScore: number; details: string };
  };
  appliedRules: CodeScoringRules;
}

export class ConfigurableScorer {
  private rules: CodeScoringRules;

  constructor(rules?: CodeScoringRules) {
    this.rules = rules || DEFAULT_SCORING_RULES;
  }

  /**
   * 更新评分规则
   */
  updateRules(rules: CodeScoringRules): void {
    this.rules = rules;
  }

  /**
   * 获取当前评分规则
   */
  getRules(): CodeScoringRules {
    return this.rules;
  }

  /**
   * 计算综合评分
   */
  calculateScore(evaluationResult: EvaluationResult): ScoringResult {
    const breakdown = {
      syntax: this.calculateSyntaxScore(evaluationResult),
      functional: this.calculateFunctionalScore(evaluationResult),
      performance: this.calculatePerformanceScore(evaluationResult),
      memory: this.calculateMemoryScore(evaluationResult)
    };

    // 计算加权总分
    let totalScore = 0;
    let maxPossibleScore = 0;
    const justificationParts: string[] = [];

    // 语法评分
    if (this.rules.syntax.enabled) {
      totalScore += breakdown.syntax.score * this.rules.syntax.weight;
      maxPossibleScore += breakdown.syntax.maxScore * this.rules.syntax.weight;
      justificationParts.push(breakdown.syntax.details);
    }

    // 功能评分
    if (this.rules.functional.enabled) {
      totalScore += breakdown.functional.score * this.rules.functional.weight;
      maxPossibleScore += breakdown.functional.maxScore * this.rules.functional.weight;
      justificationParts.push(breakdown.functional.details);
    }

    // 性能评分
    if (this.rules.performance.enabled) {
      totalScore += breakdown.performance.score * this.rules.performance.weight;
      maxPossibleScore += breakdown.performance.maxScore * this.rules.performance.weight;
      justificationParts.push(breakdown.performance.details);
    }

    // 内存评分
    if (this.rules.memory.enabled && this.rules.memory.config.enabled) {
      totalScore += breakdown.memory.score * this.rules.memory.weight;
      maxPossibleScore += breakdown.memory.maxScore * this.rules.memory.weight;
      justificationParts.push(breakdown.memory.details);
    }

    // 归一化到指定总分
    let finalScore = totalScore;
    if (this.rules.normalizationEnabled && maxPossibleScore > 0) {
      finalScore = (totalScore / maxPossibleScore) * this.rules.totalMaxScore;
    }

    // 确保分数在合理范围内
    finalScore = Math.max(0, Math.min(this.rules.totalMaxScore, Math.round(finalScore)));

    return {
      finalScore,
      maxPossibleScore: this.rules.totalMaxScore,
      justification: justificationParts.filter(Boolean).join('\n'),
      syntaxCorrect: breakdown.syntax.score > 0,
      functionalCorrect: breakdown.functional.score >= (breakdown.functional.maxScore * this.rules.functional.config.minPassRate),
      breakdown,
      appliedRules: this.rules
    };
  }

  /**
   * 计算语法评分
   */
  private calculateSyntaxScore(evaluationResult: EvaluationResult): { score: number; maxScore: number; details: string } {
    const rule = this.rules.syntax;
    const hasStderr = evaluationResult.executionResult.stderr && evaluationResult.executionResult.stderr.trim().length > 0;
    
    let syntaxCorrect = evaluationResult.success;
    if (rule.config.considerStderr) {
      syntaxCorrect = syntaxCorrect && !hasStderr;
    }

    const score = syntaxCorrect ? rule.config.successScore : rule.config.failureScore;
    const details = syntaxCorrect 
      ? `✅ 代码语法正确，执行成功 (${score}/${rule.maxScore}分)`
      : `❌ 代码执行失败 (${score}/${rule.maxScore}分)${hasStderr ? ': ' + evaluationResult.executionResult.stderr.substring(0, 100) : ''}`;

    return {
      score: Math.min(score, rule.maxScore),
      maxScore: rule.maxScore,
      details
    };
  }

  /**
   * 计算功能评分
   */
  private calculateFunctionalScore(evaluationResult: EvaluationResult): { score: number; maxScore: number; details: string } {
    const rule = this.rules.functional;
    const testsPassed = evaluationResult.metrics.testsPassed || 0;
    const testsTotal = evaluationResult.metrics.testsTotal || 0;

    let score = rule.config.baseScore;
    let details = '';

    if (testsTotal > 0) {
      const passRate = testsPassed / testsTotal;
      const functionalScore = passRate * rule.config.passRateMultiplier;
      score += functionalScore;

      if (passRate >= rule.config.minPassRate) {
        details = `✅ 功能测试通过率达标 (${testsPassed}/${testsTotal}, ${Math.round(passRate * 100)}%) (${Math.round(score)}/${rule.maxScore}分)`;
      } else {
        details = `⚠️ 功能测试通过率不足 (${testsPassed}/${testsTotal}, ${Math.round(passRate * 100)}%) (${Math.round(score)}/${rule.maxScore}分)`;
      }
    } else {
      score = rule.config.noTestCaseScore;
      details = `ℹ️ 无测试用例，给予基础分数 (${score}/${rule.maxScore}分)`;
    }

    return {
      score: Math.min(score, rule.maxScore),
      maxScore: rule.maxScore,
      details
    };
  }

  /**
   * 计算性能评分
   */
  private calculatePerformanceScore(evaluationResult: EvaluationResult): { score: number; maxScore: number; details: string } {
    const rule = this.rules.performance;
    const executionTime = evaluationResult.metrics.totalExecutionTime || 0;

    let score = 0;
    let performanceLevel = '';

    if (executionTime <= rule.config.timeThresholds.excellent) {
      score = rule.config.scoreMapping.excellent;
      performanceLevel = '优秀';
    } else if (executionTime <= rule.config.timeThresholds.good) {
      score = rule.config.scoreMapping.good;
      performanceLevel = '良好';
    } else if (executionTime <= rule.config.timeThresholds.acceptable) {
      score = rule.config.scoreMapping.acceptable;
      performanceLevel = '可接受';
    } else {
      score = rule.config.scoreMapping.poor;
      performanceLevel = '较差';
    }

    // 加分机制
    let bonus = 0;
    if (rule.config.bonusEnabled && executionTime > 0 && executionTime <= rule.config.timeThresholds.excellent) {
      bonus = Math.min(rule.config.maxBonus, Math.max(0, rule.config.maxBonus - Math.floor(executionTime / 500)));
      score += bonus;
    }

    const details = `⚡ 执行效率${performanceLevel} (${executionTime}ms)${bonus > 0 ? ` +${bonus}加分` : ''} (${score}/${rule.maxScore}分)`;

    return {
      score: Math.min(score, rule.maxScore),
      maxScore: rule.maxScore,
      details
    };
  }

  /**
   * 计算内存评分
   */
  private calculateMemoryScore(evaluationResult: EvaluationResult): { score: number; maxScore: number; details: string } {
    const rule = this.rules.memory;
    
    if (!rule.config.enabled) {
      return {
        score: 0,
        maxScore: rule.maxScore,
        details: 'ℹ️ 内存评分已禁用'
      };
    }

    const memoryUsage = evaluationResult.metrics.memoryUsage || 0;
    
    if (memoryUsage === 0) {
      return {
        score: 0,
        maxScore: rule.maxScore,
        details: 'ℹ️ 内存使用数据不可用'
      };
    }

    let score = 0;
    let memoryLevel = '';

    if (memoryUsage <= rule.config.memoryThresholds.excellent) {
      score = rule.config.scoreMapping.excellent;
      memoryLevel = '优秀';
    } else if (memoryUsage <= rule.config.memoryThresholds.good) {
      score = rule.config.scoreMapping.good;
      memoryLevel = '良好';
    } else if (memoryUsage <= rule.config.memoryThresholds.acceptable) {
      score = rule.config.scoreMapping.acceptable;
      memoryLevel = '可接受';
    } else {
      score = rule.config.scoreMapping.poor;
      memoryLevel = '较差';
    }

    const details = `🧠 内存使用${memoryLevel} (${memoryUsage.toFixed(1)}MB) (${score}/${rule.maxScore}分)`;

    return {
      score: Math.min(score, rule.maxScore),
      maxScore: rule.maxScore,
      details
    };
  }

  /**
   * 预览评分规则变更对特定结果的影响
   */
  previewScoreChange(evaluationResult: EvaluationResult, newRules: CodeScoringRules): {
    current: ScoringResult;
    preview: ScoringResult;
    changes: {
      scoreDiff: number;
      significantChanges: string[];
    };
  } {
    const current = this.calculateScore(evaluationResult);
    
    const originalRules = this.rules;
    this.rules = newRules;
    const preview = this.calculateScore(evaluationResult);
    this.rules = originalRules;

    const scoreDiff = preview.finalScore - current.finalScore;
    const significantChanges: string[] = [];

    // 检测显著变化
    if (Math.abs(scoreDiff) >= 5) {
      significantChanges.push(`总分变化: ${scoreDiff > 0 ? '+' : ''}${scoreDiff.toFixed(1)}分`);
    }

    Object.keys(current.breakdown).forEach(key => {
      const currentBreakdown = current.breakdown[key as keyof typeof current.breakdown];
      const previewBreakdown = preview.breakdown[key as keyof typeof preview.breakdown];
      const diff = previewBreakdown.score - currentBreakdown.score;
      
      if (Math.abs(diff) >= 2) {
        significantChanges.push(`${key}评分变化: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}分`);
      }
    });

    return {
      current,
      preview,
      changes: {
        scoreDiff,
        significantChanges
      }
    };
  }
}
