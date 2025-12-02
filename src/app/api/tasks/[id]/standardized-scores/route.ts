import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { scoringEngine } from '@/lib/scoring-engine';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tasks/[id]/standardized-scores
 * 获取任务的标准化评分结果
 * 基于新的得分点评分体系计算标准化分数
 */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { id: taskId } = await context.params;
    const supabase = createClient();

    // 1. 获取任务的评分结果，包含题目满分信息
    const { data: results, error } = await supabase
      .from('evaluation_results')
      .select(`
        id,
        task_id,
        model_id,
        dimension_id,
        test_case_id,
        score,
        status,
        justification,
        created_at,
        models (id, name, logical_name),
        dimensions (id, name),
        test_cases (id, max_score)
      `)
      .eq('task_id', taskId)
      .eq('status', 'completed');

    if (error) {
      console.error('获取评分结果失败:', error);
      return NextResponse.json(
        { error: '获取评分结果失败', details: error.message },
        { status: 500 }
      );
    }

    if (!results || results.length === 0) {
      return NextResponse.json({
        standardized_results: [],
        task_id: taskId,
        scoring_method: 'point_based_v2'
      });
    }

    // 2. 处理每个评分结果，计算标准化得分
    const standardizedResults = results.map(result => {
      const rawScore = result.score || 0;
      const maxScore = Array.isArray(result.test_cases) 
        ? (result.test_cases[0]?.max_score || 100)
        : (result.test_cases?.max_score || 100);

      // 计算标准化得分
      const scoringResult = scoringEngine.calculateQuestionScore(rawScore, maxScore);

      // 提取模型和维度信息，优先使用 logical_name
      const models = Array.isArray(result.models) ? result.models[0] : result.models;
      const modelName = models?.logical_name || models?.name || '未知模型';
      
      const dimensionName = Array.isArray(result.dimensions) 
        ? result.dimensions[0]?.name || '未知维度'
        : result.dimensions?.name || '未知维度';

      return {
        id: result.id,
        task_id: result.task_id,
        model_id: result.model_id,
        model_name: modelName,
        dimension_id: result.dimension_id,
        dimension_name: dimensionName,
        test_case_id: result.test_case_id,
        // 原始数据
        raw_score: rawScore,
        max_score: maxScore,
        // 标准化数据
        normalized_score: scoringResult.normalized_score,
        percentage_score: scoringResult.percentage_score,
        // 其他信息
        status: result.status,
        justification: result.justification,
        created_at: result.created_at
      };
    });

    // 3. 按模型和维度聚合数据（用于矩阵显示）
    const matrixData = new Map<string, Map<string, any>>();
    
    standardizedResults.forEach(result => {
      const modelKey = result.model_name;
      const dimensionKey = result.dimension_name;
      
      if (!matrixData.has(modelKey)) {
        matrixData.set(modelKey, new Map());
      }
      
      const modelData = matrixData.get(modelKey)!;
      if (!modelData.has(dimensionKey)) {
        modelData.set(dimensionKey, {
          scores: [],
          raw_scores: [],
          max_scores: []
        });
      }
      
      const dimensionData = modelData.get(dimensionKey);
      dimensionData.scores.push(result.percentage_score);
      dimensionData.raw_scores.push(result.raw_score);
      dimensionData.max_scores.push(result.max_score);
    });

    // 4. 计算每个模型-维度的平均标准化得分
    const aggregatedMatrix: Record<string, Record<string, {
      average_percentage_score: number;
      average_raw_score: number;
      average_max_score: number;
      question_count: number;
      all_scores: number[];
    }>> = {};

    for (const [modelName, dimensions] of matrixData) {
      aggregatedMatrix[modelName] = {};
      
      for (const [dimensionName, data] of dimensions) {
        const avgPercentage = data.scores.reduce((sum: number, score: number) => sum + score, 0) / data.scores.length;
        const avgRawScore = data.raw_scores.reduce((sum: number, score: number) => sum + score, 0) / data.raw_scores.length;
        const avgMaxScore = data.max_scores.reduce((sum: number, score: number) => sum + score, 0) / data.max_scores.length;
        
        aggregatedMatrix[modelName][dimensionName] = {
          average_percentage_score: Math.round(avgPercentage * 100) / 100, // 保留2位小数
          average_raw_score: Math.round(avgRawScore * 100) / 100,
          average_max_score: Math.round(avgMaxScore * 100) / 100,
          question_count: data.scores.length,
          all_scores: data.scores
        };
      }
    }

    // 5. 计算统计信息
    const stats = {
      total_results: standardizedResults.length,
      unique_models: new Set(standardizedResults.map(r => r.model_name)).size,
      unique_dimensions: new Set(standardizedResults.map(r => r.dimension_name)).size,
      average_percentage_score: standardizedResults.length > 0 
        ? standardizedResults.reduce((sum, r) => sum + r.percentage_score, 0) / standardizedResults.length
        : 0
    };

    return NextResponse.json({
      task_id: taskId,
      scoring_method: 'point_based_v2',
      standardized_results: standardizedResults,
      matrix_data: aggregatedMatrix,
      statistics: stats,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('获取标准化评分失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}