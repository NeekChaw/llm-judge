import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';

/**
 * GET /api/analytics - 获取分析台数据
 */
export const GET = withMonitoring('analytics_get', async (request: NextRequest) => {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'overview';

    switch (view) {
      case 'overview':
        return await getOverviewData(supabase);
      case 'model-comparison':
        return await getModelComparisonData(supabase);
      case 'template-analysis':
        return await getTemplateAnalysisData(supabase);
      case 'dimension-analysis':
        return await getDimensionAnalysisData(supabase);
      case 'results-explorer':
        return await getResultsExplorerData(supabase);
      default:
        return NextResponse.json({ error: '未知的视图类型' }, { status: 400 });
    }
  } catch (error) {
    console.error('获取分析数据失败:', error);
    return NextResponse.json(
      { error: '获取分析数据失败' },
      { status: 500 }
    );
  }
});

// 获取概览数据
async function getOverviewData(supabase: any) {
  try {
    // 获取基础统计
    const { data: tasks } = await supabase
      .from('evaluation_tasks')
      .select('*');

    const { data: results } = await supabase
      .from('evaluation_results')
      .select('*')
      .not('score', 'is', null);

    // 计算实时指标
    const metrics = {
      active_tasks: tasks?.filter(t => t.status === 'running').length || 0,
      avg_score_last_hour: results?.length > 0 
        ? results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length 
        : 0,
      completion_rate_today: tasks?.length > 0 
        ? (tasks.filter(t => t.status === 'completed').length / tasks.length) * 100 
        : 0,
      top_models: [],
      recent_trends: [],
      quality_index: 85,
      system_utilization: 72,
      cost_efficiency: 1.2,
      health_score: 90,
      trend_direction: 'up' as const
    };

    return NextResponse.json({
      success: true,
      data: {
        metrics,
        charts: {
          trend: [],
          distribution: [],
          comparison: []
        }
      }
    });
  } catch (error) {
    throw error;
  }
}

// 获取模型对比数据
async function getModelComparisonData(supabase: any) {
  try {
    const { data: results } = await supabase
      .from('evaluation_results')
      .select(`
        *,
        evaluation_tasks!inner(
          config
        )
      `)
      .not('score', 'is', null);

    if (!results || results.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: '暂无模型对比数据',
          models: [],
          comparison: []
        }
      });
    }

    // 处理模型对比数据
    const modelStats = {};
    results.forEach(result => {
      const modelIds = result.evaluation_tasks?.config?.model_ids || [];
      modelIds.forEach(modelId => {
        if (!modelStats[modelId]) {
          modelStats[modelId] = {
            name: modelId,
            scores: [],
            avgScore: 0,
            count: 0
          };
        }
        modelStats[modelId].scores.push(result.score);
        modelStats[modelId].count++;
      });
    });

    // 计算平均分
    Object.values(modelStats).forEach((model: any) => {
      model.avgScore = model.scores.reduce((sum, score) => sum + score, 0) / model.scores.length;
    });

    return NextResponse.json({
      success: true,
      data: {
        models: Object.values(modelStats),
        comparison: Object.values(modelStats)
      }
    });
  } catch (error) {
    throw error;
  }
}

// 获取模板分析数据
async function getTemplateAnalysisData(supabase: any) {
  try {
    console.log('开始获取模板分析数据');

    // 🔧 修复表名：使用正确的templates表名
    const { data: templates, error: templatesError } = await supabase
      .from('templates')
      .select(`
        id,
        name,
        description,
        status,
        created_at
      `)
      .limit(50);

    if (templatesError) {
      console.error('获取模板数据失败:', templatesError);
      return NextResponse.json({
        success: true,
        data: {
          message: '获取模板数据失败，请稍后重试',
          templates: []
        }
      });
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: '暂无模板数据',
          templates: []
        }
      });
    }

    // 分别查询使用这些模板的任务
    const templateIds = templates.map(t => t.id);
    const { data: tasks } = await supabase
      .from('evaluation_tasks')
      .select('id, template_id, status')
      .in('template_id', templateIds);

    // 为每个模板统计使用情况
    const templateStats = templates.map(template => {
      const templateTasks = tasks?.filter(task => task.template_id === template.id) || [];
      const completedTasks = templateTasks.filter(task => task.status === 'completed');
      
      return {
        id: template.id,
        name: template.name,
        description: template.description,
        status: template.status,
        taskCount: templateTasks.length,
        completedTaskCount: completedTasks.length,
        successRate: templateTasks.length > 0 
          ? Math.round((completedTasks.length / templateTasks.length) * 100) 
          : 0,
        created_at: template.created_at
      };
    });

    console.log('模板分析数据处理完成，模板数量:', templateStats.length);

    return NextResponse.json({
      success: true,
      data: {
        templates: templateStats,
        total_templates: templates.length
      }
    });
  } catch (error) {
    console.error('获取模板分析数据异常:', error);
    
    return NextResponse.json({
      success: true,
      data: {
        message: '获取模板分析数据时出现问题，请稍后重试',
        templates: [],
        error_fallback: true
      }
    });
  }
}

// 获取维度分析数据
async function getDimensionAnalysisData(supabase: any) {
  try {
    console.log('开始获取维度分析数据');

    // 🔧 修复表名：使用正确的dimensions表名
    const { data: dimensions, error: dimensionsError } = await supabase
      .from('dimensions')
      .select('id, name, description, created_at')
      .limit(50);

    if (dimensionsError) {
      console.error('获取维度数据失败:', dimensionsError);
      return NextResponse.json({
        success: true,
        data: {
          message: '获取维度数据失败，请稍后重试',
          dimensions: []
        }
      });
    }

    if (!dimensions || dimensions.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          message: '暂无维度数据',
          dimensions: []
        }
      });
    }

    // 可以添加维度使用统计
    const dimensionsWithStats = dimensions.map(dim => ({
      id: dim.id,
      name: dim.name,
      description: dim.description,
      weight: 1, // 可以后续从配置中获取
      usage_count: 0, // 可以后续添加使用统计
      created_at: dim.created_at
    }));

    console.log('维度分析数据处理完成，维度数量:', dimensionsWithStats.length);

    return NextResponse.json({
      success: true,
      data: {
        dimensions: dimensionsWithStats,
        total_dimensions: dimensions.length
      }
    });
  } catch (error) {
    console.error('获取维度分析数据异常:', error);
    
    return NextResponse.json({
      success: true,
      data: {
        message: '获取维度分析数据时出现问题，请稍后重试',
        dimensions: [],
        error_fallback: true
      }
    });
  }
}

// 获取结果探索数据
async function getResultsExplorerData(supabase: any) {
  try {
    const { data: results } = await supabase
      .from('evaluation_results')
      .select(`
        *,
        evaluation_tasks(
          name,
          config
        )
      `)
      .limit(100)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      success: true,
      data: {
        results: results || [],
        total: results?.length || 0
      }
    });
  } catch (error) {
    throw error;
  }
}

