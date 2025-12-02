import { supabase } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { EvaluatorFormData } from '@/types/evaluator';
import { EvaluatorConfigValidator } from '@/lib/evaluator-validator';

interface Context {
  params: Promise<{ id: string }>;
}

// GET /api/evaluators/[id] - 获取单个评分器
export async function GET(
  request: NextRequest,
  context: Context
) {
  try {
    const { id } = await context.params;
    const { data: evaluator, error } = await supabase
      .from('evaluators')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '评分器不存在' },
          { status: 404 }
        );
      }
      console.error('获取评分器失败:', error);
      return NextResponse.json(
        { error: '获取评分器失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ evaluator });

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// PUT /api/evaluators/[id] - 更新评分器
export async function PUT(
  request: NextRequest,
  context: Context
) {
  try {
    const { id } = await context.params;
    const body: EvaluatorFormData = await request.json();

    // 验证必填字段
    if (!body.name || !body.type) {
      return NextResponse.json(
        { error: '名称和类型为必填字段' },
        { status: 400 }
      );
    }

    // 验证评分器配置
    const validationErrors = EvaluatorConfigValidator.validate(body.type, body.config);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { 
          error: '配置验证失败', 
          validation_errors: validationErrors 
        },
        { status: 400 }
      );
    }

    // 检查名称是否重复（排除当前记录）
    const { data: existing } = await supabase
      .from('evaluators')
      .select('id')
      .eq('name', body.name)
      .neq('id', id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: '评分器名称已存在' },
        { status: 409 }
      );
    }

    // 更新评分器
    const { data: evaluator, error } = await supabase
      .from('evaluators')
      .update({
        name: body.name,
        type: body.type,
        description: body.description || null,
        config: body.config,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '评分器不存在' },
          { status: 404 }
        );
      }
      console.error('更新评分器失败:', error);
      return NextResponse.json(
        { error: '更新评分器失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { evaluator, message: '评分器更新成功' }
    );

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// DELETE /api/evaluators/[id] - 删除评分器
export async function DELETE(
  request: NextRequest,
  context: Context
) {
  try {
    const { id } = await context.params;
    // 检查是否有关联的模板映射
    const { data: mappings, error: mappingError } = await supabase
      .from('template_mappings')
      .select('template_id')
      .eq('evaluator_id', id)
      .limit(1);

    if (mappingError) {
      console.error('检查关联关系失败:', mappingError);
      return NextResponse.json(
        { error: '检查关联关系失败' },
        { status: 500 }
      );
    }

    if (mappings && mappings.length > 0) {
      return NextResponse.json(
        { error: '无法删除：此评分器已被模板使用' },
        { status: 409 }
      );
    }

    // 检查是否有关联的评测结果
    const { data: results, error: resultError } = await supabase
      .from('evaluation_results')
      .select('id')
      .eq('evaluator_id', id)
      .limit(1);

    if (resultError) {
      console.error('检查评测结果失败:', resultError);
      return NextResponse.json(
        { error: '检查评测结果失败' },
        { status: 500 }
      );
    }

    if (results && results.length > 0) {
      return NextResponse.json(
        { error: '无法删除：此评分器已有评测结果' },
        { status: 409 }
      );
    }

    // 删除评分器
    const { error } = await supabase
      .from('evaluators')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '评分器不存在' },
          { status: 404 }
        );
      }
      console.error('删除评分器失败:', error);
      return NextResponse.json(
        { error: '删除评分器失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: '评分器删除成功' }
    );

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}