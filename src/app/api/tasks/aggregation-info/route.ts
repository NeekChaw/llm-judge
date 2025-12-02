/**
 * 获取任务聚合所需的信息
 * POST /api/tasks/aggregation-info
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { taskIds } = await request.json();

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: '需要提供任务ID列表' },
        { status: 400 }
      );
    }

    // 获取任务基本信息
    console.log('查询任务ID:', taskIds);
    const { data: tasks, error: tasksError } = await supabase
      .from('evaluation_tasks')
      .select('id, name, status, created_at, template_id, config')
      .in('id', taskIds)
      .eq('status', 'completed');

    if (tasksError) {
      console.error('获取任务信息失败:', tasksError);
      console.error('具体错误详情:', JSON.stringify(tasksError, null, 2));
      return NextResponse.json(
        { error: '获取任务信息失败', details: tasksError.message },
        { status: 500 }
      );
    }

    console.log('查询到的任务:', tasks?.length || 0, '个');
    console.log('任务详情:', tasks?.map(t => ({id: t.id, name: t.name, status: t.status})));

    if (!tasks || tasks.length === 0) {
      return NextResponse.json(
        { error: '未找到已完成的任务' },
        { status: 404 }
      );
    }

    // 获取所有任务实际使用的维度信息
    // 从evaluation_results表中查找这些任务使用的维度
    const { data: usedDimensionIds, error: resultsError } = await supabase
      .from('evaluation_results')
      .select('dimension_id')
      .in('task_id', taskIds.map(String))
      .not('dimension_id', 'is', null);

    if (resultsError) {
      console.error('获取使用的维度失败:', resultsError);
      return NextResponse.json(
        { error: '获取维度信息失败' },
        { status: 500 }
      );
    }

    const uniqueDimensionIds = [...new Set((usedDimensionIds || []).map(r => r.dimension_id))];
    
    // 获取维度详细信息
    const { data: dimensions, error: dimensionsError } = await supabase
      .from('dimensions')
      .select('id, name, description')
      .in('id', uniqueDimensionIds)
      .order('name');

    if (dimensionsError) {
      console.error('获取维度详细信息失败:', dimensionsError);
      return NextResponse.json(
        { error: '获取维度信息失败' },
        { status: 500 }
      );
    }

    // 获取所有相关模型信息
    const allModelIds = [...new Set(tasks.flatMap(t => t.config?.model_ids || []))];
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select('id, name, provider, status, logical_name')
      .in('id', allModelIds);

    if (modelsError) {
      console.error('获取模型信息失败:', modelsError);
      return NextResponse.json(
        { error: '获取模型信息失败' },
        { status: 500 }
      );
    }

    // 构建任务聚合信息
    const tasksWithInfo = tasks.map(task => {
      // 从config中提取model_ids
      const taskModelIds = task.config?.model_ids || [];
      
      // 该任务的模型
      const taskModels = models?.filter(m => 
        taskModelIds.includes(m.id)
      ) || [];

      return {
        id: task.id,
        name: task.name,
        status: task.status as 'completed',
        created_at: task.created_at,
        dimensions: dimensions?.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description
        })) || [],
        models: taskModels.map(m => ({
          id: m.id,
          name: m.logical_name || m.name, // 优先使用用户自定义的逻辑名称
          provider: m.provider
        })),
        model_ids: taskModelIds,
        dimension_ids: uniqueDimensionIds
      };
    });

    return NextResponse.json({
      success: true,
      tasks: tasksWithInfo
    });

  } catch (error) {
    console.error('获取聚合信息失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}