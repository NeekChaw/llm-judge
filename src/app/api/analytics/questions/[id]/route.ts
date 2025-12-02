import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';

/**
 * GET /api/analytics/questions/[id] - 获取具体题目详情分析
 */
export const GET = withMonitoring('analytics_question_detail', async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  try {
    const supabase = createClient();
    const questionId = params.id;

    if (!questionId) {
      return NextResponse.json(
        { error: '题目ID不能为空' },
        { status: 400 }
      );
    }

    // 获取题目基本信息
    const { data: testCase, error: testCaseError } = await supabase
      .from('test_cases')
      .select('*')
      .eq('id', questionId)
      .single();

    if (testCaseError || !testCase) {
      console.error('获取题目信息失败:', testCaseError);
      return NextResponse.json(
        { error: '题目不存在', details: testCaseError?.message },
        { status: 404 }
      );
    }

    // 获取该题目的所有评测结果
    const { data: results, error: resultsError } = await supabase
      .from('evaluation_results')
      .select(`
        score,
        model_id,
        task_id,
        created_at,
        models(name, logical_name, provider),
        evaluation_tasks(name, templates(name))
      `)
      .eq('test_case_id', questionId)
      .not('score', 'is', null)
      .order('created_at', { ascending: false });

    if (resultsError) {
      console.error('获取评测结果失败:', resultsError);
      return NextResponse.json(
        { error: '获取评测结果失败', details: resultsError.message },
        { status: 500 }
      );
    }

    // 统计模型表现
    const modelPerformance: Record<string, {
      name: string;
      logical_name: string;
      provider: string;
      scores: number[];
      avg_score: number;
      best_score: number;
      worst_score: number;
      test_count: number;
      latest_test: string;
    }> = {};

    if (results) {
      results.forEach(result => {
        const model = result.models;
        if (!model) return;

        const logicalName = model.logical_name || model.name;

        if (!modelPerformance[logicalName]) {
          modelPerformance[logicalName] = {
            name: logicalName,
            logical_name: logicalName,
            provider: model.provider,
            scores: [],
            avg_score: 0,
            best_score: 0,
            worst_score: 100,
            test_count: 0,
            latest_test: result.created_at
          };
        }

        const perf = modelPerformance[logicalName];
        perf.scores.push(result.score || 0);
        perf.test_count++;

        // 更新最新测试时间
        if (result.created_at > perf.latest_test) {
          perf.latest_test = result.created_at;
        }
      });

      // 计算统计信息
      Object.values(modelPerformance).forEach(perf => {
        if (perf.scores.length > 0) {
          perf.avg_score = perf.scores.reduce((sum, s) => sum + s, 0) / perf.scores.length;
          perf.best_score = Math.max(...perf.scores);
          perf.worst_score = Math.min(...perf.scores);
        }
      });
    }

    // 生成趋势数据（最近30天，每天一个点）
    const trends = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const dayResults = results?.filter(r => {
        const resultTime = new Date(r.created_at);
        return resultTime >= dayStart && resultTime < dayEnd;
      }) || [];

      const avgScore = dayResults.length > 0
        ? dayResults.reduce((sum, r) => sum + (r.score || 0), 0) / dayResults.length
        : null;

      trends.push({
        date: dayStart.toISOString().split('T')[0],
        score: avgScore ? Math.round(avgScore * 10) / 10 : null,
        count: dayResults.length
      });
    }

    // 计算整体统计
    const allScores = results?.map(r => r.score || 0) || [];
    const overallStats = {
      total_tests: allScores.length,
      avg_score: allScores.length > 0
        ? Math.round((allScores.reduce((sum, s) => sum + s, 0) / allScores.length) * 10) / 10
        : 0,
      best_score: allScores.length > 0 ? Math.max(...allScores) : 0,
      worst_score: allScores.length > 0 ? Math.min(...allScores) : 0,
      std_dev: allScores.length > 1 ? (() => {
        const mean = allScores.reduce((sum, s) => sum + s, 0) / allScores.length;
        const variance = allScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (allScores.length - 1);
        return Math.round(Math.sqrt(variance) * 10) / 10;
      })() : 0
    };

    // 难度分级
    const accuracy = overallStats.avg_score;
    let difficultyLevel: 'easy' | 'medium' | 'hard';
    if (accuracy >= 80) difficultyLevel = 'easy';
    else if (accuracy >= 50) difficultyLevel = 'medium';
    else difficultyLevel = 'hard';

    // 提取题目标题
    const extractTitle = (input: string): string => {
      try {
        if (!input) return `题目 ${questionId.slice(0, 8)}`;

        // 尝试解析JSON格式的输入
        if (input.trim().startsWith('{')) {
          const parsed = JSON.parse(input);
          if (parsed.question) return parsed.question.slice(0, 100);
          if (parsed.prompt) return parsed.prompt.slice(0, 100);
          if (parsed.description) return parsed.description.slice(0, 100);
        }

        // 直接文本输入
        const title = input.split('\n')[0]?.trim();
        return title && title.length > 0 ? title.slice(0, 100) : `题目 ${questionId.slice(0, 8)}`;
      } catch {
        return input.slice(0, 100);
      }
    };

    const response = {
      id: testCase.id,
      title: extractTitle(testCase.input),
      content: testCase.input,
      reference_answer: testCase.reference_answer,
      template_name: results?.[0]?.evaluation_tasks?.templates?.name || '未知模板',
      difficulty_level: difficultyLevel,
      overall_stats: overallStats,
      model_performance: Object.values(modelPerformance)
        .sort((a, b) => b.avg_score - a.avg_score),
      trends: trends.filter(t => t.score !== null), // 只返回有数据的日期
      latest_tests: results?.slice(0, 10).map(r => ({
        model_name: r.models?.logical_name || r.models?.name || 'Unknown',
        score: r.score,
        created_at: r.created_at
      })) || []
    };

    return NextResponse.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('获取题目详情失败:', error);
    return NextResponse.json(
      {
        error: '获取题目详情失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
});