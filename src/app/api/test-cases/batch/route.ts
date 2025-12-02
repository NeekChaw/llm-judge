import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/test-cases/batch - 批量获取测试用例信息
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    // 验证请求体
    if (!body.test_case_ids || !Array.isArray(body.test_case_ids)) {
      return NextResponse.json({ error: '无效的测试用例ID列表' }, { status: 400 });
    }
    
    const testCaseIds = body.test_case_ids.filter(Boolean);
    
    if (testCaseIds.length === 0) {
      return NextResponse.json({ testCases: [] });
    }
    
    // 批量查询测试用例的关键信息（id和max_score）
    const { data: testCases, error } = await supabase
      .from('test_cases')
      .select('id, max_score')
      .in('id', testCaseIds);

    if (error) {
      console.error('批量获取测试用例失败:', error);
      return NextResponse.json(
        { error: '批量获取测试用例失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      testCases: testCases || []
    });

  } catch (error) {
    console.error('批量获取测试用例失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}