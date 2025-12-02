import { supabase } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { TestCaseFormData } from '@/types/test-case';

interface Context {
  params: Promise<{ id: string }>;
}

// GET /api/test-cases/[id] - 获取单个测试用例
export async function GET(
  request: NextRequest,
  context: Context
) {
  try {
    const { id } = await context.params;
    // 🚀 优化查询：显式选择字段而不是使用 select('*')，包含attachments
    const { data: testCase, error } = await supabase
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
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '测试用例不存在' },
          { status: 404 }
        );
      }
      console.error('获取测试用例失败:', error);
      return NextResponse.json(
        { error: '获取测试用例失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ test_case: testCase });

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// PUT /api/test-cases/[id] - 更新测试用例
export async function PUT(
  request: NextRequest,
  context: Context
) {
  try {
    const { id } = await context.params;
    const body: TestCaseFormData = await request.json();

    // 验证必填字段
    if (!body.input || body.input.trim() === '') {
      return NextResponse.json(
        { error: '输入内容不能为空' },
        { status: 400 }
      );
    }

    // 构建metadata对象
    const metadata: Record<string, any> = {};
    if (body.tags && body.tags.length > 0) {
      metadata.tags = body.tags;
    }
    if (body.category) {
      metadata.category = body.category;
    }
    if (body.metadata) {
      Object.assign(metadata, body.metadata);
    }

    // 🚀 优化更新：支持新架构字段和多模态attachments，显式选择返回字段
    const { data: testCase, error } = await supabase
      .from('test_cases')
      .update({
        input: body.input.trim(),
        reference_answer: body.reference_answer?.trim() || null,
        // 🆕 Bug #4修复: 多模态参考答案支持
        reference_answer_multimodal: body.reference_answer_multimodal || null,
        max_score: body.max_score || 100, // 题目满分字段
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
        // 🆕 新架构字段支持
        code_test_config: body.code_test_config || null,
        execution_environment: body.execution_environment || null,
        validation_rules: body.validation_rules || null,
        // 🆕 多模态附件支持
        attachments: body.attachments || [],
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
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
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '测试用例不存在' },
          { status: 404 }
        );
      }
      console.error('更新测试用例失败:', error);
      return NextResponse.json(
        { error: '更新测试用例失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { test_case: testCase, message: '测试用例更新成功' }
    );

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// DELETE /api/test-cases/[id] - 删除测试用例
export async function DELETE(
  request: NextRequest,
  context: Context
) {
  try {
    const { id } = await context.params;
    // 检查是否有关联的评测结果
    const { data: results, error: resultError } = await supabase
      .from('evaluation_results')
      .select('id')
      .eq('test_case_id', id)
      .limit(1);

    if (resultError) {
      console.error('检查关联评测结果失败:', resultError);
      return NextResponse.json(
        { error: '检查关联关系失败' },
        { status: 500 }
      );
    }

    if (results && results.length > 0) {
      return NextResponse.json(
        { error: '无法删除：此测试用例已有评测结果' },
        { status: 409 }
      );
    }

    // 删除测试用例
    const { error } = await supabase
      .from('test_cases')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '测试用例不存在' },
          { status: 404 }
        );
      }
      console.error('删除测试用例失败:', error);
      return NextResponse.json(
        { error: '删除测试用例失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: '测试用例删除成功' }
    );

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}