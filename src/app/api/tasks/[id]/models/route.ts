import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 获取任务中涉及的模型信息 - 支持按模型-维度组合筛选
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const taskId = params.id;
    
    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const modelName = searchParams.get('model_name');
    const dimensionName = searchParams.get('dimension_name');

    // 构建查询：获取任务中使用的模型
    let query = supabase
      .from('evaluation_results')
      .select(`
        models!inner (
          id,
          name,
          logical_name,
          vendor_name,
          tags,
          status
        ),
        dimensions!inner (
          id,
          name
        )
      `)
      .eq('task_id', taskId);

    // 如果指定了模型-维度组合，添加筛选条件
    if (modelName && dimensionName) {
      query = query
        .eq('models.name', modelName)
        .eq('dimensions.name', dimensionName);
    }

    const { data: results, error } = await query;

    if (error) {
      console.error('获取任务模型信息失败:', error);
      return NextResponse.json(
        { error: '获取任务模型信息失败' },
        { status: 500 }
      );
    }

    // 去重并整理模型列表
    const modelMap = new Map();
    results?.forEach((result: any) => {
      const model = result.models;
      if (model && !modelMap.has(model.id)) {
        modelMap.set(model.id, {
          id: model.id,
          name: model.name,
          logical_name: model.logical_name,
          vendor_name: model.vendor_name,
          tags: model.tags || ['推理'],
          status: model.status
        });
      }
    });

    const models = Array.from(modelMap.values());

    return NextResponse.json({
      models,
      total_count: models.length,
      reasoning_models_count: models.filter(m => (m.tags || []).includes('推理')).length
    });

  } catch (error) {
    console.error('获取任务模型信息异常:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}