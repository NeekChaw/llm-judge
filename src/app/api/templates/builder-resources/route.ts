import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// GET /api/templates/builder-resources - 获取模板构建器所需的资源
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();

    // 获取所有可用的维度
    const { data: dimensions, error: dimensionsError } = await supabase
      .from('dimensions')
      .select('id, name, description, criteria')
      .order('name');

    if (dimensionsError) {
      console.error('Dimensions fetch error:', dimensionsError);
      return NextResponse.json({ error: '获取维度列表失败' }, { status: 500 });
    }

    // 获取所有可用的评分器
    const { data: evaluators, error: evaluatorsError } = await supabase
      .from('evaluators')
      .select('id, name, type, description')
      .order('name');

    if (evaluatorsError) {
      console.error('Evaluators fetch error:', evaluatorsError);
      return NextResponse.json({ error: '获取评分器列表失败' }, { status: 500 });
    }

    // 获取所有可用的测试用例
    const { data: testCases, error: testCasesError } = await supabase
      .from('test_cases')
      .select('id, input, reference_answer, metadata')
      .order('created_at', { ascending: false });

    if (testCasesError) {
      console.error('Test cases fetch error:', testCasesError);
      return NextResponse.json({ error: '获取测试用例列表失败' }, { status: 500 });
    }

    // 格式化数据，添加兼容性信息
    const formattedEvaluators = evaluators?.map(evaluator => ({
      ...evaluator,
      // TODO: 后续可以根据业务逻辑添加具体的兼容性规则
      // 目前所有评分器都与所有维度兼容
      compatible_dimensions: dimensions?.map(d => d.id) || []
    })) || [];

    // 格式化测试用例数据，提取metadata中的字段
    const formattedTestCases = testCases?.map(testCase => ({
      ...testCase,
      category: testCase.metadata?.category || null,
      tags: testCase.metadata?.tags || []
    })) || [];

    const resources = {
      dimensions: dimensions || [],
      evaluators: formattedEvaluators,
      testCases: formattedTestCases
    };

    return NextResponse.json({ resources });

  } catch (error) {
    console.error('Builder resources error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}