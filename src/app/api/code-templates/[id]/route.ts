import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import type { CodeEvaluationTemplate, CodeTemplateResponse } from '@/types/code-templates';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/code-templates/[id] - 获取指定模板的详细信息
 */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    
    if (!id) {
      return NextResponse.json(
        { error: '模板ID是必需的' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    const { data: template, error } = await supabase
      .from('code_evaluation_templates')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '模板不存在' },
          { status: 404 }
        );
      }

      console.error('获取模板详情失败:', error);
      return NextResponse.json(
        { error: '获取模板详情失败' },
        { status: 500 }
      );
    }

    const response: CodeTemplateResponse = {
      template
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('获取模板详情异常:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/code-templates/[id] - 更新模板（管理员功能）
 */
export async function PUT(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    
    if (!id) {
      return NextResponse.json(
        { error: '模板ID是必需的' },
        { status: 400 }
      );
    }

    const {
      name,
      description,
      template_code,
      config_schema,
      example_config,
      tags,
      is_active
    } = body;

    const supabase = createClient();

    // 检查模板是否存在
    const { data: existing, error: checkError } = await supabase
      .from('code_evaluation_templates')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existing) {
      return NextResponse.json(
        { error: '模板不存在' },
        { status: 404 }
      );
    }

    // 构建更新数据
    const updateData: Partial<CodeEvaluationTemplate> = {};
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (template_code !== undefined) updateData.template_code = template_code;
    if (config_schema !== undefined) updateData.config_schema = config_schema;
    if (example_config !== undefined) updateData.example_config = example_config;
    if (tags !== undefined) updateData.tags = tags;
    if (is_active !== undefined) updateData.is_active = is_active;

    // 执行更新
    const { data: template, error } = await supabase
      .from('code_evaluation_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新模板失败:', error);
      return NextResponse.json(
        { error: '更新模板失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      template
    });

  } catch (error) {
    console.error('更新模板异常:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/code-templates/[id] - 删除模板（软删除）
 */
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    
    if (!id) {
      return NextResponse.json(
        { error: '模板ID是必需的' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 执行软删除（设置is_active为false）
    const { error } = await supabase
      .from('code_evaluation_templates')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('删除模板失败:', error);
      return NextResponse.json(
        { error: '删除模板失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '模板已删除'
    });

  } catch (error) {
    console.error('删除模板异常:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}