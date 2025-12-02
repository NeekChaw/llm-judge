import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/test-case-sets - 获取测试用例集合列表
// 这个API将test_cases表的数据转换为前端期望的TestCaseSet格式
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    
    // 解析查询参数
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('test_cases')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // 搜索功能
    if (search) {
      query = query.or(`input.ilike.%${search}%,reference_answer.ilike.%${search}%`);
    }

    // 分类筛选
    if (category) {
      query = query.eq('metadata->>category', category);
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

    // 转换为TestCaseSet格式
    const testCaseSets = (testCases || []).map(testCase => {
      // 从input字段生成显示名称
      const displayName = testCase.input ? 
        (testCase.input.length > 50 ? testCase.input.substring(0, 50) + '...' : testCase.input) : 
        'Unnamed TestCase';
      
      // 从metadata中提取信息
      const metadata = testCase.metadata || {};
      const category = metadata.category || '通用';
      const tags = metadata.tags || [];

      return {
        id: testCase.id,
        name: displayName,
        description: testCase.reference_answer || undefined,
        test_cases_count: 1, // 每个测试用例作为一个独立的集合
        category: category,
        tags: tags,
        created_at: testCase.created_at,
        updated_at: testCase.updated_at
      };
    });

    return NextResponse.json({
      test_case_sets: testCaseSets,
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit
      }
    });

  } catch (error) {
    console.error('获取测试用例集合列表失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
