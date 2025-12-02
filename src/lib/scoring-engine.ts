/**
 * 新一代评分计算引擎
 * 实现基于得分点的标准化评分体系
 * 
 * 核心原理：
 * 1. 每个题目可设置不同的满分（总得分点数）
 * 2. 题目得分率 = 实际得分 / 题目满分
 * 3. 维度得分 = 所有题目得分率的算术平均
 * 4. 最终展示 = 维度得分 × 100（百分制）
 */

import { createClient } from '@/lib/supabase';

// 评分结果接口
export interface ScoringResult {
  // 原始数据
  raw_score: number;           // 题目实际得分
  max_score: number;           // 题目满分
  // 标准化结果
  normalized_score: number;    // 得分率 (0-1)
  percentage_score: number;    // 百分制得分 (0-100)
}

// 维度评分结果
export interface DimensionScoringResult {
  dimension_id: string;
  dimension_name: string;
  questions: Array<{
    test_case_id: string;
    scoring_result: ScoringResult;
  }>;
  // 维度聚合结果
  average_normalized_score: number;  // 标准化平均分 (0-1)
  final_percentage_score: number;    // 最终百分制得分 (0-100)
  total_questions: number;
}

// 任务整体评分结果
export interface TaskScoringResult {
  task_id: string;
  model_id: string;
  dimensions: DimensionScoringResult[];
  // 任务整体指标
  overall_score: number;             // 总体百分制得分
  total_questions_count: number;
  scoring_method: 'point_based_v2';  // 标识使用新评分体系
}

// 评分计算引擎类
export class ScoringEngine {
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * 计算单个题目的标准化得分
   */
  calculateQuestionScore(rawScore: number, maxScore: number): ScoringResult {
    // 输入验证
    if (maxScore <= 0) {
      throw new Error(`题目满分必须大于0，当前值: ${maxScore}`);
    }
    if (rawScore < 0) {
      throw new Error(`题目得分不能为负数，当前值: ${rawScore}`);
    }
    if (rawScore > maxScore) {
      console.warn(`题目得分(${rawScore})超过满分(${maxScore})，将限制为满分`);
      rawScore = maxScore;
    }

    const normalizedScore = rawScore / maxScore;
    const percentageScore = normalizedScore * 100;

    return {
      raw_score: rawScore,
      max_score: maxScore,
      normalized_score: normalizedScore,
      percentage_score: percentageScore
    };
  }

  /**
   * 计算维度得分
   * 基于该维度下所有题目的标准化得分进行算术平均
   */
  calculateDimensionScore(
    dimensionId: string,
    dimensionName: string,
    questionScores: Array<{ test_case_id: string; raw_score: number; max_score: number }>
  ): DimensionScoringResult {
    if (questionScores.length === 0) {
      return {
        dimension_id: dimensionId,
        dimension_name: dimensionName,
        questions: [],
        average_normalized_score: 0,
        final_percentage_score: 0,
        total_questions: 0
      };
    }

    // 计算每道题的标准化得分
    const questions = questionScores.map(q => ({
      test_case_id: q.test_case_id,
      scoring_result: this.calculateQuestionScore(q.raw_score, q.max_score)
    }));

    // 计算维度的算术平均分（标准化得分的平均）
    const averageNormalizedScore = questions.reduce((sum, q) => 
      sum + q.scoring_result.normalized_score, 0) / questions.length;

    const finalPercentageScore = averageNormalizedScore * 100;

    return {
      dimension_id: dimensionId,
      dimension_name: dimensionName,
      questions,
      average_normalized_score: averageNormalizedScore,
      final_percentage_score: finalPercentageScore,
      total_questions: questions.length
    };
  }

  /**
   * 计算任务整体得分
   * 基于所有维度的得分进行加权平均（当前为等权重）
   */
  calculateTaskScore(
    taskId: string,
    modelId: string,
    dimensionResults: DimensionScoringResult[]
  ): TaskScoringResult {
    if (dimensionResults.length === 0) {
      return {
        task_id: taskId,
        model_id: modelId,
        dimensions: [],
        overall_score: 0,
        total_questions_count: 0,
        scoring_method: 'point_based_v2'
      };
    }

    // 计算总体得分（各维度等权重平均）
    const overallScore = dimensionResults.reduce((sum, dim) => 
      sum + dim.final_percentage_score, 0) / dimensionResults.length;

    const totalQuestionsCount = dimensionResults.reduce((sum, dim) => 
      sum + dim.total_questions, 0);

    return {
      task_id: taskId,
      model_id: modelId,
      dimensions: dimensionResults,
      overall_score: overallScore,
      total_questions_count: totalQuestionsCount,
      scoring_method: 'point_based_v2'
    };
  }

  /**
   * 从数据库查询并计算任务完整评分
   */
  async calculateTaskScoringFromDatabase(taskId: string): Promise<TaskScoringResult[]> {
    try {
      // 1. 获取任务的所有评分结果，包含题目满分信息
      const { data: results, error: resultsError } = await this.supabase
        .from('evaluation_results')
        .select(`
          task_id,
          model_id,
          dimension_id,
          test_case_id,
          score,
          models (id, name),
          dimensions (id, name),
          test_cases (id, max_score)
        `)
        .eq('task_id', taskId)
        .eq('status', 'success');

      if (resultsError) {
        throw new Error(`查询评分结果失败: ${resultsError.message}`);
      }

      if (!results || results.length === 0) {
        return [];
      }

      // 2. 按模型分组结果
      const resultsByModel = new Map<string, any[]>();
      results.forEach(result => {
        const modelId = result.model_id;
        if (!resultsByModel.has(modelId)) {
          resultsByModel.set(modelId, []);
        }
        resultsByModel.get(modelId)!.push(result);
      });

      // 3. 计算每个模型的评分
      const taskScoringResults: TaskScoringResult[] = [];
      
      for (const [modelId, modelResults] of resultsByModel) {
        // 按维度分组
        const resultsByDimension = new Map<string, any[]>();
        modelResults.forEach(result => {
          const dimensionId = result.dimension_id;
          if (!resultsByDimension.has(dimensionId)) {
            resultsByDimension.set(dimensionId, []);
          }
          resultsByDimension.get(dimensionId)!.push(result);
        });

        // 计算每个维度的得分
        const dimensionScoringResults: DimensionScoringResult[] = [];
        
        for (const [dimensionId, dimensionResults] of resultsByDimension) {
          const firstResult = dimensionResults[0];
          const dimensionName = Array.isArray(firstResult.dimensions) 
            ? firstResult.dimensions[0]?.name || '未知维度'
            : firstResult.dimensions?.name || '未知维度';

          // 准备题目得分数据
          const questionScores = dimensionResults.map(result => ({
            test_case_id: result.test_case_id,
            raw_score: result.score || 0,
            max_score: Array.isArray(result.test_cases) 
              ? (result.test_cases[0]?.max_score || 100)
              : (result.test_cases?.max_score || 100)
          }));

          const dimensionScore = this.calculateDimensionScore(
            dimensionId,
            dimensionName,
            questionScores
          );

          dimensionScoringResults.push(dimensionScore);
        }

        // 计算任务整体得分
        const taskScore = this.calculateTaskScore(taskId, modelId, dimensionScoringResults);
        taskScoringResults.push(taskScore);
      }

      return taskScoringResults;

    } catch (error) {
      console.error('计算任务评分失败:', error);
      throw error;
    }
  }

  /**
   * 从LLM评分文本中提取分数
   * 支持多种格式的分数提取
   */
  extractScoreFromText(text: string, maxScore: number = 100): number {
    if (!text) return 0;

    // 尝试多种分数格式的正则表达式
    const patterns = [
      /(?:得分|分数|score)[:：]\s*(\d+(?:\.\d+)?)/i,
      /(\d+(?:\.\d+)?)\s*\/\s*\d+/,  // X/Y格式
      /(\d+(?:\.\d+)?)\s*分/,         // X分格式
      /分数为\s*(\d+(?:\.\d+)?)/i,
      /评分\s*[:：]\s*(\d+(?:\.\d+)?)/i,
      /最终得分\s*[:：]\s*(\d+(?:\.\d+)?)/i,
      /总分\s*[:：]\s*(\d+(?:\.\d+)?)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const score = parseFloat(match[1]);
        // 确保分数在合理范围内
        if (score >= 0 && score <= maxScore) {
          return score;
        }
        // 如果分数看起来是百分制但题目满分不是100，需要转换
        if (score > maxScore && score <= 100 && maxScore !== 100) {
          return (score / 100) * maxScore;
        }
      }
    }

    // 如果没有找到明确的分数，尝试提取纯数字
    const numberMatch = text.match(/\b(\d+(?:\.\d+)?)\b/);
    if (numberMatch) {
      const score = parseFloat(numberMatch[1]);
      if (score >= 0 && score <= maxScore) {
        return score;
      }
    }

    console.warn(`无法从文本中提取有效分数: ${text.substring(0, 100)}...`);
    return 0;
  }

  /**
   * 批量处理评分结果
   * 用于处理现有的evaluation_results数据
   */
  async batchUpdateScoringResults(taskIds: string[]): Promise<{
    processed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let processed = 0;

    for (const taskId of taskIds) {
      try {
        await this.calculateTaskScoringFromDatabase(taskId);
        processed++;
      } catch (error) {
        errors.push(`任务 ${taskId}: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    return { processed, errors };
  }
}

// 导出全局实例
export const scoringEngine = new ScoringEngine();

// 工具函数：验证评分方案的示例
export function validateScoringExample() {
  const engine = new ScoringEngine();
  
  console.log('=== 评分方案验证示例 ===');
  
  // 示例：维度A包含3道题
  const questionScores = [
    { test_case_id: '1', raw_score: 3, max_score: 4 },   // 得分率 = 3/4 = 0.75
    { test_case_id: '2', raw_score: 5, max_score: 6 },   // 得分率 = 5/6 = 0.833
    { test_case_id: '3', raw_score: 1, max_score: 2 }    // 得分率 = 1/2 = 0.5
  ];
  
  const dimensionResult = engine.calculateDimensionScore(
    'dim_a', 
    '维度A', 
    questionScores
  );
  
  console.log('维度A计算结果:');
  console.log('- 题目1得分率:', dimensionResult.questions[0].scoring_result.normalized_score); // 0.75
  console.log('- 题目2得分率:', dimensionResult.questions[1].scoring_result.normalized_score); // 0.833
  console.log('- 题目3得分率:', dimensionResult.questions[2].scoring_result.normalized_score); // 0.5
  console.log('- 维度平均得分率:', dimensionResult.average_normalized_score); // (0.75 + 0.833 + 0.5) / 3 = 0.694
  console.log('- 最终百分制得分:', dimensionResult.final_percentage_score); // 69.4分
  
  return dimensionResult.final_percentage_score; // 应该约等于69.4
}