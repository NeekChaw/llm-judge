/**
 * 批量获取多个聚合分析的统计信息（优化版）
 * POST /api/tasks/aggregation-batch
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

interface BatchRequest {
  aggregations: Array<{
    id: string;
    taskIds: string[];
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { aggregations }: BatchRequest = await request.json();

    if (!Array.isArray(aggregations) || aggregations.length === 0) {
      return NextResponse.json(
        { error: '需要提供聚合分析列表' },
        { status: 400 }
      );
    }

    console.log(`🔄 批量处理${aggregations.length}个聚合分析...`);

    // 收集所有唯一的任务ID
    const allTaskIds = [...new Set(aggregations.flatMap(agg => agg.taskIds))];
    console.log(`📋 涉及${allTaskIds.length}个唯一任务`);

    // 一次性获取所有任务信息
    const { data: allTasks, error: tasksError } = await supabase
      .from('evaluation_tasks')
      .select('id, name, status, created_at, template_id, config')
      .in('id', allTaskIds)
      .eq('status', 'completed');

    if (tasksError) {
      console.error('❌ 批量获取任务信息失败:', tasksError);
      return NextResponse.json(
        { error: '获取任务信息失败', details: tasksError.message },
        { status: 500 }
      );
    }

    if (!allTasks || allTasks.length === 0) {
      return NextResponse.json(
        { error: '未找到已完成的任务' },
        { status: 404 }
      );
    }

    console.log(`✅ 批量查询到${allTasks.length}个任务`);

    // 获取所有相关的维度信息
    const { data: usedDimensionIds, error: resultsError } = await supabase
      .from('evaluation_results')
      .select('dimension_id, task_id')
      .in('task_id', allTaskIds.map(String))
      .not('dimension_id', 'is', null);

    if (resultsError) {
      console.error('❌ 获取维度使用情况失败:', resultsError);
      return NextResponse.json(
        { error: '获取维度信息失败' },
        { status: 500 }
      );
    }

    // 按任务分组维度
    const dimensionsByTask = new Map<string, string[]>();
    usedDimensionIds?.forEach((result: any) => {
      if (!dimensionsByTask.has(result.task_id)) {
        dimensionsByTask.set(result.task_id, []);
      }
      dimensionsByTask.get(result.task_id)?.push(result.dimension_id);
    });

    // 获取所有相关维度详细信息
    const allDimensionIds = [...new Set(usedDimensionIds?.map((r: any) => r.dimension_id) || [])];
    const { data: allDimensions, error: dimensionsError } = await supabase
      .from('dimensions')
      .select('id, name, description')
      .in('id', allDimensionIds)
      .order('name');

    if (dimensionsError) {
      console.error('❌ 批量获取维度详细信息失败:', dimensionsError);
      return NextResponse.json(
        { error: '获取维度信息失败' },
        { status: 500 }
      );
    }

    // 获取所有相关模型信息
    const allModelIds = [...new Set(allTasks.flatMap(t => t.config?.model_ids || []))];
    const { data: allModels, error: modelsError } = await supabase
      .from('models')
      .select('id, name, provider, status, logical_name')
      .in('id', allModelIds);

    if (modelsError) {
      console.error('❌ 批量获取模型信息失败:', modelsError);
      return NextResponse.json(
        { error: '获取模型信息失败' },
        { status: 500 }
      );
    }

    console.log(`✅ 批量查询到${allModels?.length}个模型, ${allDimensions?.length}个维度`);

    // 为每个聚合分析构建响应数据
    const results = aggregations.map(aggregation => {
      // 获取该聚合分析相关的任务
      const aggTasks = allTasks.filter(task => aggregation.taskIds.includes(task.id));
      
      // 计算该聚合分析的模型并集
      const aggModelIds = [...new Set(aggTasks.flatMap(t => t.config?.model_ids || []))];
      const aggModels = allModels?.filter(m => aggModelIds.includes(m.id)) || [];
      
      // 计算该聚合分析的维度并集
      const aggDimensionIds = [...new Set(
        aggregation.taskIds.flatMap(taskId => dimensionsByTask.get(taskId) || [])
      )];
      const aggDimensions = allDimensions?.filter(d => aggDimensionIds.includes(d.id)) || [];

      // 构建任务详情
      const tasksWithInfo = aggTasks.map(task => {
        const taskModelIds = task.config?.model_ids || [];
        const taskModels = allModels?.filter(m => taskModelIds.includes(m.id)) || [];
        const taskDimensionIds = dimensionsByTask.get(task.id) || [];
        const taskDimensions = allDimensions?.filter(d => taskDimensionIds.includes(d.id)) || [];

        return {
          id: task.id,
          name: task.name,
          status: task.status as 'completed',
          created_at: task.created_at,
          dimensions: taskDimensions.map(d => ({
            id: d.id,
            name: d.name,
            description: d.description
          })),
          models: taskModels.map(m => ({
            id: m.id,
            name: m.logical_name || m.name,
            provider: m.provider
          })),
          model_ids: taskModelIds,
          dimension_ids: taskDimensionIds
        };
      });

      return {
        aggregationId: aggregation.id,
        success: true,
        tasks: tasksWithInfo,
        // 预聚合统计信息
        aggregatedStats: {
          modelCount: aggModels.length,
          dimensionCount: aggDimensions.length,
          taskCount: aggTasks.length,
          lastUpdatedAt: new Date().toISOString()
        }
      };
    });

    console.log(`🎉 批量处理完成，返回${results.length}个聚合分析结果`);

    return NextResponse.json({
      success: true,
      results,
      meta: {
        totalAggregations: aggregations.length,
        totalTasks: allTasks.length,
        totalModels: allModels?.length || 0,
        totalDimensions: allDimensions?.length || 0,
        processedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ 批量获取聚合信息失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}