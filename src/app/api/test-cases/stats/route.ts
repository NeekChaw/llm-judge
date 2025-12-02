import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { TestCaseStats } from '@/types/test-case';

// GET /api/test-cases/stats - 获取测试用例统计信息
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // 获取总数
    const { count: total, error: totalError } = await supabase
      .from('test_cases')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      console.error('获取总数失败:', totalError);
      return NextResponse.json(
        { error: '获取统计信息失败', details: totalError.message },
        { status: 500 }
      );
    }

    // 获取所有测试用例的metadata用于统计
    const { data: testCases, error: dataError } = await supabase
      .from('test_cases')
      .select('metadata');

    if (dataError) {
      console.error('获取测试用例数据失败:', dataError);
      return NextResponse.json(
        { error: '获取统计信息失败', details: dataError.message },
        { status: 500 }
      );
    }

    // 统计分类
    const categoryStats: Record<string, number> = {};
    const tagStats: Record<string, number> = {};

    testCases?.forEach(testCase => {
      const metadata = testCase.metadata || {};
      
      // 统计分类
      const category = metadata.category || '未分类';
      categoryStats[category] = (categoryStats[category] || 0) + 1;

      // 统计标签
      const tags = metadata.tags || [];
      if (Array.isArray(tags)) {
        tags.forEach((tag: string) => {
          tagStats[tag] = (tagStats[tag] || 0) + 1;
        });
      }
    });

    const stats: TestCaseStats = {
      total: total || 0,
      by_category: categoryStats,
      by_tags: tagStats
    };

    return NextResponse.json({ stats });

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}