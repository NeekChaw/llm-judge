import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { scoringEngine } from '@/lib/scoring-engine';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tasks/[id]/subtasks-with-max-scores
 * 获取任务的subtasks数据，同时包含test_cases的max_score信息
 * 用于评测结果矩阵的标准化评分计算
 */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { id: taskId } = await context.params;
    const supabase = createClient();

    // 1. 获取evaluation_results数据，连接test_cases获取max_score 和完整内容（包括附件）
    const { data: subtasks, error } = await supabase
      .from('evaluation_results')
      .select(`
        id,
        task_id,
        model_id,
        dimension_id,
        test_case_id,
        repetition_index,
        score,
        status,
        created_at,
        model_response,
        justification,
        reasoning,
        execution_time,
        models!inner (id, name, logical_name, provider),
        dimensions!inner (id, name),
        test_cases!inner (id, max_score, input, reference_answer, attachments),
        evaluators!inner (id, name, type, config)
      `)
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('获取subtasks失败:', error);
      return NextResponse.json(
        { error: '获取subtasks失败', details: error.message },
        { status: 500 }
      );
    }

    if (!subtasks || subtasks.length === 0) {
      return NextResponse.json({
        subtasks: [],
        task_id: taskId,
        scoring_method: 'point_based_v2',
        matrix_data: {}
      });
    }

    // 2. 简化的 subtask 处理，减少不必要的计算
    const enhancedSubtasks = subtasks.map(subtask => {
      const rawScore = subtask.score || 0;
      const maxScore = subtask.test_cases?.max_score || 100;
      
      // 简化标准化得分计算
      const normalizedScore = maxScore > 0 ? rawScore / maxScore : 0;
      const percentageScore = normalizedScore * 100;
      
      const standardizedScore = {
        raw_score: rawScore,
        max_score: maxScore,
        normalized_score: normalizedScore,
        percentage_score: percentageScore
      };

      return {
        id: subtask.id,
        task_id: subtask.task_id,
        model_id: subtask.model_id,
        model_name: subtask.models?.logical_name || subtask.models?.name || '未知模型',
        dimension_id: subtask.dimension_id,
        dimension_name: subtask.dimensions?.name || '未知维度',
        test_case_id: subtask.test_case_id,
        repetition_index: subtask.repetition_index,
        status: subtask.status,
        created_at: subtask.created_at,
        score: subtask.score,
        standardized_score: standardizedScore,
        test_case_max_score: maxScore,
        // 新增：完整的测试用例和回答信息
        test_case_input: subtask.test_cases?.input || '',
        test_case_reference: subtask.test_cases?.reference_answer || '',
        test_case_attachments: subtask.test_cases?.attachments || [], // 🖼️ 添加附件信息
        // 🖼️ 保留完整的 model_response 对象（可能包含附件）
        model_response: typeof subtask.model_response === 'object' && subtask.model_response !== null
          ? subtask.model_response // 保留对象格式（可能包含 attachments）
          : subtask.model_response || '',
        reasoning: subtask.justification || '',
        execution_time: subtask.execution_time,
        // 评分器信息
        evaluator_type: subtask.evaluators?.type,
        evaluator_name: subtask.evaluators?.name,
        evaluator_config: subtask.evaluators?.config
      };
    });

    // 3. 优化聚合逻辑 - 直接构建矩阵数据，减少中间步骤
    const matrixData: Record<string, Record<string, {
      standardized_dimension_score: number | null;
      question_count: number;
      completed_count: number;
      average_percentage_score: number | null;
    }>> = {};

    // 使用 Map 来高效地聚合数据
    // 🔧 修复：使用加权平均而不是简单算术平均，与详细结果tab保持一致
    const aggregationMap = new Map<string, {
      totalScore: number;      // 累计得分
      totalMaxScore: number;   // 累计满分
      count: number;           // 总题目数
      completedCount: number;  // 完成题目数
    }>();

    // 单次遍历构建聚合数据
    for (const subtask of enhancedSubtasks) {
      const key = `${subtask.model_name}|||${subtask.dimension_name}`;

      if (!aggregationMap.has(key)) {
        aggregationMap.set(key, {
          totalScore: 0,
          totalMaxScore: 0,
          count: 0,
          completedCount: 0
        });
      }

      const data = aggregationMap.get(key)!;
      data.count++; // 总数包括所有状态

      // 只有已完成的任务才参与评分计算
      if (subtask.status === 'completed' && subtask.score !== null && subtask.test_case_max_score) {
        data.totalScore += subtask.score;
        data.totalMaxScore += subtask.test_case_max_score;
        data.completedCount++;
      }
    }

    // 构建最终矩阵数据
    for (const [key, data] of aggregationMap) {
      const [modelName, dimensionName] = key.split('|||');

      if (!matrixData[modelName]) {
        matrixData[modelName] = {};
      }

      // 🔧 使用加权百分制分数：(总得分 / 总满分) * 100
      // 这与详细结果tab中的calculateWeightedPercentage()保持一致
      const weightedScore = data.totalMaxScore > 0
        ? Math.round((data.totalScore / data.totalMaxScore) * 100 * 10) / 10
        : null;

      matrixData[modelName][dimensionName] = {
        standardized_dimension_score: weightedScore,
        question_count: data.count,
        completed_count: data.completedCount, // 实际完成的数量
        average_percentage_score: weightedScore
      };
    }

    return NextResponse.json({
      task_id: taskId,
      scoring_method: 'point_based_v2',
      subtasks: enhancedSubtasks,
      matrix_data: matrixData,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('获取subtasks with max scores失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}