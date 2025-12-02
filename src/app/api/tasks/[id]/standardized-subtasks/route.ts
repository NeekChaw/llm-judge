import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { scoringEngine } from '@/lib/scoring-engine';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tasks/[id]/standardized-subtasks
 * 获取任务的subtasks数据，应用标准化评分算法，生成兼容EvaluationResultsMatrix的数据格式
 */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { id: taskId } = await context.params;
    const supabase = createClient();

    // 1. 获取evaluation_results数据，连接test_cases获取max_score
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
        created_at,
        models (id, name, logical_name, provider),
        dimensions (id, name),
        test_cases (id, max_score)
      `)
      .eq('task_id', taskId)
      .eq('status', 'completed')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('获取evaluation results失败:', error);
      return NextResponse.json(
        { error: '获取evaluation results失败', details: error.message },
        { status: 500 }
      );
    }

    if (!results || results.length === 0) {
      return NextResponse.json({
        subtasks: [],
        task_id: taskId,
        scoring_method: 'standardized_v2'
      });
    }

    // 2. 按 model_name + dimension_name 分组，这是关键
    const modelDimensionGroups = new Map<string, any[]>();
    
    results.forEach(result => {
      const models = Array.isArray(result.models) ? result.models[0] : result.models;
      const modelName = models?.logical_name || models?.name;
      const dimensionName = Array.isArray(result.dimensions) ? result.dimensions[0]?.name : result.dimensions?.name;
      
      if (!modelName || !dimensionName) return;
      
      const groupKey = `${modelName}|||${dimensionName}`;
      if (!modelDimensionGroups.has(groupKey)) {
        modelDimensionGroups.set(groupKey, []);
      }
      
      modelDimensionGroups.get(groupKey)!.push({
        ...result,
        model_name: modelName,
        dimension_name: dimensionName,
        max_score: Array.isArray(result.test_cases) ? result.test_cases[0]?.max_score || 100 : result.test_cases?.max_score || 100
      });
    });

    // 3. 为每个model-dimension组合计算标准化得分和生成runs数据
    const subtasks: any[] = [];
    
    for (const [groupKey, groupResults] of modelDimensionGroups) {
      const [modelName, dimensionName] = groupKey.split('|||');
      
      // 按test_case_id分组，计算每个问题的标准化得分
      const testCaseScores = new Map<string, number>();
      
      groupResults.forEach(result => {
        const rawScore = result.score || 0;
        const maxScore = result.max_score;
        const scoringResult = scoringEngine.calculateQuestionScore(rawScore, maxScore);
        testCaseScores.set(result.test_case_id, scoringResult.normalized_score); // 使用0-1的得分率
      });
      
      // 计算该维度的平均得分率
      const normalizedScores = Array.from(testCaseScores.values());
      const dimensionAverageRate = normalizedScores.reduce((sum, score) => sum + score, 0) / normalizedScores.length;
      const dimensionAveragePercentage = dimensionAverageRate * 100; // 转换为百分制
      
      // 检查是否有多次运行（同一个model-dimension有多组完整的test_case结果）
      // 简化处理：如果只有一组结果，就是单次运行；如果有多组，就模拟多次运行
      const uniqueTestCases = new Set(groupResults.map(r => r.test_case_id));
      const totalTestCases = uniqueTestCases.size;
      const totalResults = groupResults.length;
      
      // 如果结果数量是测试用例数量的整数倍，说明有多次运行
      const runCount = Math.floor(totalResults / totalTestCases);
      const isMultiRun = runCount > 1;
      
      if (isMultiRun) {
        // 多次运行：按测试用例分组，确保正确的运行顺序
        const testCaseGroups = new Map<string, any[]>();
        groupResults.forEach(result => {
          if (!testCaseGroups.has(result.test_case_id)) {
            testCaseGroups.set(result.test_case_id, []);
          }
          testCaseGroups.get(result.test_case_id)!.push(result);
        });
        
        // 按创建时间排序每个测试用例的结果，确保运行顺序正确
        for (const [testCaseId, testCaseResults] of testCaseGroups) {
          testCaseResults.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        }
        
        const runs = [];
        for (let runIndex = 0; runIndex < runCount; runIndex++) {
          const runTestCaseScores = new Map<string, number>();
          
          // 为每个测试用例获取第runIndex次的结果
          for (const [testCaseId, testCaseResults] of testCaseGroups) {
            if (testCaseResults[runIndex]) {
              const result = testCaseResults[runIndex];
              const rawScore = result.score || 0;
              const maxScore = result.max_score;
              const scoringResult = scoringEngine.calculateQuestionScore(rawScore, maxScore);
              runTestCaseScores.set(testCaseId, scoringResult.normalized_score);
            }
          }
          
          const runNormalizedScores = Array.from(runTestCaseScores.values());
          const runDimensionAverageRate = runNormalizedScores.reduce((sum, score) => sum + score, 0) / runNormalizedScores.length;
          const runDimensionAveragePercentage = runDimensionAverageRate * 100;
          
          runs.push({
            run_index: runIndex,
            status: 'completed',
            score: null, // 不使用这个字段
            dimension_average: runDimensionAveragePercentage // 这是关键字段！
          });
        }
        
        // 计算多次运行的总体统计
        const runAverages = runs.map(run => run.dimension_average);
        const overallAverage = runAverages.reduce((sum, avg) => sum + avg, 0) / runAverages.length;
        
        subtasks.push({
          id: `${groupKey}-multi`,
          model_name: modelName,
          dimension_name: dimensionName,
          score: overallAverage, // 总体平均分
          status: 'completed',
          // 多次运行标识
          is_multi_run: true,
          run_count: runCount,
          runs: runs,
          multi_run_stats: {
            overall_average: overallAverage,
            highest: Math.max(...runAverages),
            lowest: Math.min(...runAverages),
            count: runCount,
            total_runs: runCount
          }
        });
      } else {
        // 单次运行
        subtasks.push({
          id: `${groupKey}-single`,
          model_name: modelName,
          dimension_name: dimensionName,
          score: dimensionAveragePercentage,
          status: 'completed',
          is_multi_run: false
        });
      }
    }

    return NextResponse.json({
      subtasks: subtasks,
      task_id: taskId,
      scoring_method: 'standardized_v2',
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('获取standardized subtasks失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}