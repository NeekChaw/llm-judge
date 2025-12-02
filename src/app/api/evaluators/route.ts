import { supabase } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { 
  BaseEvaluator, 
  EvaluatorFormData, 
  EvaluatorListParams,
  EvaluatorType 
} from '@/types/evaluator';
import { EvaluatorConfigValidator } from '@/lib/evaluator-validator';

// GET /api/evaluators - 获取评分器列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as EvaluatorType | null;
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('evaluators')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // 按类型筛选
    if (type) {
      query = query.eq('type', type);
    }

    // 按名称搜索
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // 分页
    query = query.range(offset, offset + limit - 1);

    const { data: evaluators, error, count } = await query;

    if (error) {
      console.error('获取评分器列表失败:', error);
      return NextResponse.json(
        { error: '获取评分器列表失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      evaluators,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// POST /api/evaluators - 创建新评分器
export async function POST(request: NextRequest) {
  try {
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

    // 检查名称是否重复
    const { data: existing } = await supabase
      .from('evaluators')
      .select('id')
      .eq('name', body.name)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: '评分器名称已存在' },
        { status: 409 }
      );
    }

    // 创建评分器
    const { data: evaluator, error } = await supabase
      .from('evaluators')
      .insert([{
        name: body.name,
        type: body.type,
        description: body.description || null,
        config: body.config
      }])
      .select()
      .single();

    if (error) {
      console.error('创建评分器失败:', error);
      return NextResponse.json(
        { error: '创建评分器失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { evaluator, message: '评分器创建成功' },
      { status: 201 }
    );

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}