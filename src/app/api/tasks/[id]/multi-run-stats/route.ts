import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { MultiRunStats, MultiRunSubTaskResult } from '@/types/task';

/**
 * 获取多次运行任务的统计信息
 * GET /api/tasks/[id]/multi-run-stats
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const supabase = createClient();

    // 1. 获取任务信息
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .select('id, name, config')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      );
    }

    const runCount = task.config?.run_count || 1;
    const isMultiRun = runCount > 1;

    // 2. 获取所有子任务结果
    const { data: subtasks, error: subtasksError } = await supabase
      .from('evaluation_results')
      .select(`
        id,
        task_id,
        test_case_id,
        model_id,
        dimension_id,
        evaluator_id,
        run_index,
        status,
        score,
        justification,
        model_response,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        execution_time,
        created_at,
        completed_at,
        models!inner(id, name, logical_name, provider),
        dimensions!inner(id, name),
        evaluators!inner(id, name, type)
      `)
      .eq('task_id', taskId)
      .eq('status', 'completed')
      .not('score', 'is', null);

    if (subtasksError) {
      console.error('获取子任务失败:', subtasksError);
      return NextResponse.json(
        { error: '获取子任务失败' },
        { status: 500 }
      );
    }

    if (!subtasks || subtasks.length === 0) {
      return NextResponse.json({
        task_id: taskId,
        task_name: task.name,
        is_multi_run: isMultiRun,
        run_count: runCount,
        results: [],
        message: '暂无完成的子任务'
      });
    }

    // 3. 按 model_id + dimension_id + evaluator_id + test_case_id 分组
    const groupedResults = new Map<string, any[]>();
    
    for (const subtask of subtasks) {
      const key = `${subtask.model_id}-${subtask.dimension_id}-${subtask.evaluator_id}-${subtask.test_case_id}`;
      if (!groupedResults.has(key)) {
        groupedResults.set(key, []);
      }
      groupedResults.get(key)!.push(subtask);
    }

    // 4. 计算每组的统计信息
    const results: MultiRunSubTaskResult[] = [];

    for (const [key, runs] of groupedResults) {
      if (runs.length === 0) continue;

      const firstRun = runs[0];
      const scores = runs.map(r => r.score).filter(s => s !== null);
      
      if (scores.length === 0) continue;

      // 计算统计信息
      const stats: MultiRunStats = calculateStats(scores);

      const result: MultiRunSubTaskResult = {
        task_id: taskId,
        model_id: firstRun.model_id,
        dimension_id: firstRun.dimension_id,
        evaluator_id: firstRun.evaluator_id,
        test_case_id: firstRun.test_case_id,
        runs: runs.sort((a, b) => (a.run_index || 1) - (b.run_index || 1)),
        stats,
        model_name: firstRun.models?.logical_name || firstRun.models?.name,
        dimension_name: firstRun.dimensions?.name,
        evaluator_name: firstRun.evaluators?.name,
      };

      results.push(result);
    }

    return NextResponse.json({
      task_id: taskId,
      task_name: task.name,
      is_multi_run: isMultiRun,
      run_count: runCount,
      results: results.sort((a, b) => {
        // 按模型名称、维度名称排序
        const modelCompare = (a.model_name || '').localeCompare(b.model_name || '');
        if (modelCompare !== 0) return modelCompare;
        return (a.dimension_name || '').localeCompare(b.dimension_name || '');
      })
    });

  } catch (error) {
    console.error('获取多次运行统计失败:', error);
    return NextResponse.json(
      { error: '获取统计信息失败' },
      { status: 500 }
    );
  }
}

/**
 * 计算统计信息
 */
function calculateStats(scores: number[]): MultiRunStats {
  if (scores.length === 0) {
    return {
      run_count: 0,
      scores: [],
      average: 0,
      highest: 0,
      lowest: 0,
      standard_deviation: 0,
      median: 0,
    };
  }

  const sortedScores = [...scores].sort((a, b) => a - b);
  const sum = scores.reduce((acc, score) => acc + score, 0);
  const average = sum / scores.length;
  
  // 计算标准差
  const variance = scores.reduce((acc, score) => acc + Math.pow(score - average, 2), 0) / scores.length;
  const standardDeviation = Math.sqrt(variance);
  
  // 计算中位数
  const median = sortedScores.length % 2 === 0
    ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
    : sortedScores[Math.floor(sortedScores.length / 2)];

  return {
    run_count: scores.length,
    scores: scores,
    average: Math.round(average * 100) / 100, // 保留2位小数
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
    standard_deviation: Math.round(standardDeviation * 100) / 100,
    median: Math.round(median * 100) / 100,
  };
}
