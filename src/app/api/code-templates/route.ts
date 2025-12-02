import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import type { CodeEvaluationTemplate, CodeTemplateListResponse } from '@/types/code-templates';

/**
 * GET /api/code-templates - 获取代码评估模板列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const language = searchParams.get('language');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createClient();

    // 构建查询
    let query = supabase
      .from('code_evaluation_templates')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    // 应用过滤条件
    if (category) {
      query = query.eq('category', category);
    }

    if (language) {
      query = query.eq('language', language);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // 应用分页
    query = query.range(offset, offset + limit - 1);

    const { data: templates, error, count } = await query;

    if (error) {
      console.error('获取模板列表失败:', error);
      return NextResponse.json(
        { error: '获取模板列表失败' },
        { status: 500 }
      );
    }

    // 获取总数（用于分页）
    const { count: totalCount } = await supabase
      .from('code_evaluation_templates')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const response: CodeTemplateListResponse = {
      templates: templates || [],
      total: totalCount || 0
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('获取模板列表异常:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/code-templates - 创建新的代码模板（管理员功能）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      category,
      language,
      template_code,
      config_schema,
      example_config,
      tags
    } = body;

    // 基本验证
    if (!name || !category || !language || !template_code || !config_schema) {
      return NextResponse.json(
        { error: '缺少必需字段' },
        { status: 400 }
      );
    }

    // 验证category和language的有效性
    const validCategories = ['algorithm', 'format', 'performance', 'quality'];
    const validLanguages = ['python', 'javascript', 'typescript', 'cpp', 'java', 'go'];

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: '无效的模板类别' },
        { status: 400 }
      );
    }

    if (!validLanguages.includes(language)) {
      return NextResponse.json(
        { error: '无效的编程语言' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 检查名称是否已存在
    const { data: existing } = await supabase
      .from('code_evaluation_templates')
      .select('id')
      .eq('name', name)
      .eq('language', language)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: '该语言下已存在同名模板' },
        { status: 409 }
      );
    }

    // 创建模板
    const { data: template, error } = await supabase
      .from('code_evaluation_templates')
      .insert({
        name,
        description,
        category,
        language,
        template_code,
        config_schema,
        example_config,
        tags: tags || []
      })
      .select()
      .single();

    if (error) {
      console.error('创建模板失败:', error);
      return NextResponse.json(
        { error: '创建模板失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      template
    });

  } catch (error) {
    console.error('创建模板异常:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}