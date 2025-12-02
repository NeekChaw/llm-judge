import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';

// 辅助函数：从题目输入中提取标题
function extractQuestionTitle(input: string): string | null {
  try {
    if (!input) return null;

    // 尝试解析JSON格式的输入
    if (input.trim().startsWith('{')) {
      const parsed = JSON.parse(input);
      if (parsed.question) return parsed.question.slice(0, 50) + '...';
      if (parsed.prompt) return parsed.prompt.slice(0, 50) + '...';
      if (parsed.description) return parsed.description.slice(0, 50) + '...';
    }

    // 直接文本输入
    const title = input.split('\n')[0]?.trim();
    return title && title.length > 0 ? title.slice(0, 50) + '...' : null;
  } catch {
    return input.slice(0, 50) + '...';
  }
}

/**
 * GET /api/analytics/questions - 获取考题分析数据
 */
export const GET = withMonitoring('analytics_questions', async (request: NextRequest) => {
  try {
    const supabase = createClient();
    const url = new URL(request.url);

    // 解析查询参数
    const timeRange = url.searchParams.get('timeRange') || '30d'; // 30d, 7d, 1d
    const templateId = url.searchParams.get('templateId');
    const sortBy = url.searchParams.get('sortBy') || 'accuracy'; // accuracy, test_count, title
    const sortOrder = url.searchParams.get('sortOrder') || 'desc';
    const difficultyFilter = url.searchParams.get('difficulty'); // easy, medium, hard

    // 计算时间范围
    const timeRangeMap = {
      '1d': 1,
      '7d': 7,
      '30d': 30,
      'all': null
    };
    const daysAgo = timeRangeMap[timeRange as keyof typeof timeRangeMap];
    const startDate = daysAgo ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString() : null;

    // 构建基础查询
    let query = supabase
      .from('evaluation_results')
      .select(`
        score,
        test_case_id,
        task_id,
        created_at,
        test_cases(
          id,
          input,
          reference_answer,
          max_score
        ),
        evaluation_tasks(
          id,
          name,
          template_id,
          templates(name)
        )
      `)
      .not('score', 'is', null);

    // 添加时间过滤
    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    // 添加模板过滤
    if (templateId) {
      query = query.eq('evaluation_tasks.template_id', templateId);
    }

    const { data: results, error } = await query;

    if (error) {
      console.error('获取评测结果失败:', error);
      return NextResponse.json(
        { error: '获取评测结果失败', details: error.message },
        { status: 500 }
      );
    }

    // 按题目ID聚合统计
    const questionStats: Record<string, {
      id: string;
      title: string;
      template_name: string;
      test_count: number;
      total_score: number;
      scores: number[];
      max_score: number;
      created_dates: string[];
    }> = {};

    if (results) {
      results.forEach(result => {
        const testCase = result.test_cases;
        const task = result.evaluation_tasks;
        if (!testCase) return;

        const questionId = testCase.id;

        if (!questionStats[questionId]) {
          questionStats[questionId] = {
            id: questionId,
            title: extractQuestionTitle(testCase.input) || `题目 ${questionId.slice(0, 8)}`,
            template_name: task?.templates?.name || task?.name || '未知模板',
            test_count: 0,
            total_score: 0,
            scores: [],
            max_score: testCase.max_score || 100, // 记录题目的满分
            created_dates: []
          };
        }

        const stat = questionStats[questionId];
        stat.test_count++;
        stat.total_score += result.score || 0;
        stat.scores.push(result.score || 0);
        stat.created_dates.push(result.created_at);
      });
    }

    // 计算正确率和统计信息
    const questions = Object.values(questionStats)
      .map(stat => {
        const avgScore = stat.scores.length > 0
          ? stat.scores.reduce((sum, s) => sum + s, 0) / stat.scores.length
          : 0;

        // 根据题目实际满分计算正确率百分比
        const accuracy = stat.max_score > 0
          ? (avgScore / stat.max_score) * 100
          : 0;

        // 计算标准差
        const scoreMean = avgScore;
        const variance = stat.scores.length > 1
          ? stat.scores.reduce((sum, s) => sum + Math.pow(s - scoreMean, 2), 0) / (stat.scores.length - 1)
          : 0;
        const stdDev = Math.sqrt(variance);

        // 难度分级
        let difficultyLevel: 'easy' | 'medium' | 'hard';
        if (accuracy >= 80) difficultyLevel = 'easy';
        else if (accuracy >= 50) difficultyLevel = 'medium';
        else difficultyLevel = 'hard';

        // 计算平均响应时间（简化版，实际需要从execution_time字段获取）
        const avgTime = 2.0 + Math.random() * 6; // 临时模拟数据

        return {
          id: stat.id,
          title: stat.title,
          template_name: stat.template_name,
          accuracy: Math.round(accuracy * 10) / 10,
          test_count: stat.test_count,
          avg_score: Math.round(avgScore * 10) / 10,
          max_score: stat.max_score,
          std_dev: Math.round(stdDev * 10) / 10,
          difficulty_level: difficultyLevel,
          avg_time: Math.round(avgTime * 10) / 10,
          latest_test: stat.created_dates.sort().reverse()[0]
        };
      });

    // 应用难度过滤
    const filteredQuestions = difficultyFilter
      ? questions.filter(q => q.difficulty_level === difficultyFilter)
      : questions;

    // 排序
    const sortedQuestions = filteredQuestions.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortBy) {
        case 'accuracy':
          aVal = a.accuracy;
          bVal = b.accuracy;
          break;
        case 'test_count':
          aVal = a.test_count;
          bVal = b.test_count;
          break;
        case 'title':
          aVal = a.title;
          bVal = b.title;
          break;
        default:
          aVal = a.accuracy;
          bVal = b.accuracy;
      }

      if (sortOrder === 'desc') {
        return typeof aVal === 'string' ? bVal.localeCompare(aVal) : bVal - aVal;
      } else {
        return typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
      }
    });

    // 计算概览统计
    const overview = {
      total_questions: questions.length,
      avg_accuracy: questions.length > 0
        ? Math.round((questions.reduce((sum, q) => sum + q.accuracy, 0) / questions.length) * 10) / 10
        : 0,
      difficult_count: questions.filter(q => q.difficulty_level === 'hard').length,
      total_tests: questions.reduce((sum, q) => sum + q.test_count, 0)
    };

    return NextResponse.json({
      success: true,
      data: {
        overview,
        questions: sortedQuestions,
        filters: {
          time_range: timeRange,
          template_id: templateId,
          sort_by: sortBy,
          sort_order: sortOrder,
          difficulty: difficultyFilter
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('获取考题分析数据失败:', error);
    return NextResponse.json(
      {
        error: '获取考题分析数据失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
});