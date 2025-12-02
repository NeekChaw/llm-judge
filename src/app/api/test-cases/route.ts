import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { TestCaseFormData } from '@/types/test-case';

// GET /api/test-cases - 获取测试用例列表
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    
    // 解析查询参数
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const tags = searchParams.get('tags') || '';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // 🚀 优化查询：显式选择字段而不是使用 select('*')，包含attachments
    let query = supabase
      .from('test_cases')
      .select(`
        id,
        input,
        reference_answer,
        reference_answer_multimodal,
        max_score,
        metadata,
        code_test_config,
        execution_environment,
        validation_rules,
        attachments,
        created_at,
        updated_at
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    // 🚀 优化搜索功能：包含新架构字段
    if (search) {
      query = query.or(`
        input.ilike.%${search}%,
        reference_answer.ilike.%${search}%,
        execution_environment.ilike.%${search}%
      `.replace(/\s+/g, ''));
    }

    // 分类筛选
    if (category) {
      if (category === '未分类') {
        // 对于未分类，需要筛选 category 为 null 或者不存在的记录
        query = query.or('metadata->>category.is.null,metadata.is.null');
      } else {
        query = query.eq('metadata->>category', category);
      }
    }


    // 标签筛选
    if (tags) {
      const tagList = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      if (tagList.length > 0) {
        // 确保 metadata 不为 null 且 tags 字段存在
        query = query.not('metadata', 'is', null);
        
        // 对于每个标签，使用 @> 操作符检查 JSON 数组是否包含该标签
        for (const tag of tagList) {
          query = query.contains('metadata->tags', JSON.stringify([tag]));
        }
      }
    }

    // 分页
    query = query.range(offset, offset + limit - 1);

    const { data: testCases, error, count } = await query;

    if (error) {
      console.error('获取测试用例列表失败:', error);
      return NextResponse.json(
        { error: '获取测试用例列表失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      test_cases: testCases || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('获取测试用例列表失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// POST /api/test-cases - 创建测试用例
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body: TestCaseFormData = await request.json();

    // 验证必填字段
    if (!body.input || body.input.trim() === '') {
      return NextResponse.json({ error: '输入内容不能为空' }, { status: 400 });
    }

    // 🚀 优化数据构建：支持新架构字段和多模态attachments
    const testCaseData = {
      input: body.input.trim(),
      reference_answer: body.reference_answer?.trim() || null,
      // 🆕 Bug #4修复: 多模态参考答案支持
      reference_answer_multimodal: body.reference_answer_multimodal || null,
      max_score: body.max_score || 100, // 题目满分，默认100分
      metadata: {
        tags: body.tags || [],
        category: body.category || null
      },
      // 🆕 新架构字段支持
      code_test_config: body.code_test_config || null,
      execution_environment: body.execution_environment || null,
      validation_rules: body.validation_rules || null,
      // 🆕 多模态附件支持
      attachments: body.attachments || []
    };

    // 🚀 优化插入：显式选择返回字段，包含attachments
    const { data, error } = await supabase
      .from('test_cases')
      .insert([testCaseData])
      .select(`
        id,
        input,
        reference_answer,
        reference_answer_multimodal,
        max_score,
        metadata,
        code_test_config,
        execution_environment,
        validation_rules,
        attachments,
        created_at,
        updated_at
      `)
      .single();

    if (error) {
      console.error('创建测试用例失败:', error);
      return NextResponse.json(
        { error: '创建测试用例失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      test_case: data,
      message: '测试用例创建成功'
    }, { status: 201 });

  } catch (error) {
    console.error('创建测试用例失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}