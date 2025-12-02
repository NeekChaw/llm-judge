import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';

/**
 * POST /api/analytics/query - 执行分析查询
 */
export const POST = withMonitoring('analytics_query', async (request: NextRequest) => {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    const {
      dimensions = [],
      metrics = [],
      filters = {},
      groupBy = [],
      orderBy = [],
      limit = 100,
      offset = 0
    } = body;

    // 构建基础查询
    let query = supabase
      .from('evaluation_results')
      .select(`
        *,
        evaluation_tasks!inner(
          id,
          name,
          status,
          config,
          created_at,
          evaluation_templates(
            id,
            name,
            description
          )
        )
      `);

    // 应用过滤条件
    if (filters.task_status) {
      query = query.eq('evaluation_tasks.status', filters.task_status);
    }
    
    if (filters.template_id) {
      query = query.eq('evaluation_tasks.template_id', filters.template_id);
    }
    
    if (filters.score_min !== undefined) {
      query = query.gte('score', filters.score_min);
    }
    
    if (filters.score_max !== undefined) {
      query = query.lte('score', filters.score_max);
    }
    
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }

    // 执行查询
    const { data: results, error } = await query
      .limit(limit)
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    if (!results || results.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          results: [],
          total: 0,
          aggregations: {}
        }
      });
    }

    // 处理数据聚合
    const processedResults = results.map(result => {
      const task = result.evaluation_tasks;
      const template = task?.evaluation_templates;
      
      return {
        id: result.id,
        score: result.score,
        status: result.status,
        created_at: result.created_at,
        task_id: task?.id,
        task_name: task?.name,
        task_status: task?.status,
        template_id: template?.id,
        template_name: template?.name,
        model_ids: task?.config?.model_ids || [],
        // 添加维度数据
        dimensions: {
          task_name: task?.name,
          template_name: template?.name,
          task_status: task?.status,
          score_range: getScoreRange(result.score),
          created_date: result.created_at?.split('T')[0]
        },
        // 添加指标数据
        metrics: {
          score: result.score,
          execution_time: result.execution_time || 0,
          token_count: result.total_tokens || 0
        }
      };
    });

    // 计算聚合数据
    const aggregations = calculateAggregations(processedResults, groupBy, metrics);

    return NextResponse.json({
      success: true,
      data: {
        results: processedResults,
        total: results.length,
        aggregations
      }
    });

  } catch (error) {
    console.error('执行分析查询失败:', error);
    return NextResponse.json(
      { 
        error: '执行分析查询失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
});

// 获取分数范围
function getScoreRange(score: number): string {
  if (score >= 90) return '优秀 (90-100)';
  if (score >= 80) return '良好 (80-89)';
  if (score >= 70) return '中等 (70-79)';
  if (score >= 60) return '及格 (60-69)';
  return '不及格 (<60)';
}

// 计算聚合数据
function calculateAggregations(results: any[], groupBy: string[], metrics: string[]) {
  if (groupBy.length === 0) {
    // 无分组，计算总体聚合
    return {
      total_count: results.length,
      avg_score: results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length,
      max_score: Math.max(...results.map(r => r.score || 0)),
      min_score: Math.min(...results.map(r => r.score || 0)),
      score_distribution: getScoreDistribution(results)
    };
  }

  // 按指定字段分组
  const groups = {};
  results.forEach(result => {
    const groupKey = groupBy.map(field => {
      if (field.startsWith('dimensions.')) {
        return result.dimensions[field.replace('dimensions.', '')];
      }
      return result[field];
    }).join('|');

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(result);
  });

  // 计算每组的聚合数据
  const groupedResults = Object.entries(groups).map(([key, groupResults]: [string, any[]]) => {
    const keyParts = key.split('|');
    const groupDimensions = {};
    groupBy.forEach((field, index) => {
      groupDimensions[field] = keyParts[index];
    });

    return {
      dimensions: groupDimensions,
      metrics: {
        count: groupResults.length,
        avg_score: groupResults.reduce((sum, r) => sum + (r.score || 0), 0) / groupResults.length,
        max_score: Math.max(...groupResults.map(r => r.score || 0)),
        min_score: Math.min(...groupResults.map(r => r.score || 0))
      }
    };
  });

  return {
    grouped_results: groupedResults,
    total_groups: groupedResults.length
  };
}

// 获取分数分布
function getScoreDistribution(results: any[]) {
  const distribution = {
    '优秀 (90-100)': 0,
    '良好 (80-89)': 0,
    '中等 (70-79)': 0,
    '及格 (60-69)': 0,
    '不及格 (<60)': 0
  };

  results.forEach(result => {
    const range = getScoreRange(result.score || 0);
    distribution[range]++;
  });

  return distribution;
}
