import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { calculateTaskCostSummary } from '@/lib/task-cost-summary';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tasks/[id]/cost-summary - 获取任务成本汇总
 */
export async function GET(
  request: NextRequest,
  context: Context
) {
  try {
    const { id } = await context.params;
    const supabase = createClient();

    // 获取子任务数据
    const { data: subTasks, error: subTasksError } = await supabase
      .from('evaluation_results')
      .select('model_name, prompt_tokens, completion_tokens, model_response')
      .eq('task_id', id);

    if (subTasksError) {
      console.error('获取子任务失败:', subTasksError);
      return NextResponse.json(
        { error: '获取子任务数据失败' },
        { status: 500 }
      );
    }

    // 获取涉及的模型信息
    const modelNames = [...new Set(subTasks?.map(t => t.model_name) || [])];
    
    let models = [];
    if (modelNames.length > 0) {
      const { data: modelsData, error: modelsError } = await supabase
        .from('models')
        .select('name, input_cost_per_1k_tokens, output_cost_per_1k_tokens, cost_currency')
        .in('name', modelNames);

      if (modelsError) {
        console.error('获取模型数据失败:', modelsError);
        return NextResponse.json(
          { error: '获取模型数据失败' },
          { status: 500 }
        );
      }

      models = modelsData || [];
    }

    // 计算成本汇总
    const costSummary = calculateTaskCostSummary(subTasks || [], models);

    return NextResponse.json({
      cost_summary: costSummary,
      models_count: models.length,
      subtasks_count: subTasks?.length || 0
    });

  } catch (error) {
    console.error('获取任务成本汇总失败:', error);
    return NextResponse.json(
      { error: '获取成本汇总失败' },
      { status: 500 }
    );
  }
}