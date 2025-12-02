import { supabase } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { ExportFormat } from '@/types/test-case';

// CSV字段转义函数
function escapeCSVField(field: string): string {
  if (!field) return '""';
  
  // 如果字段包含逗号、换行符或引号，需要用引号包围并转义
  if (field.includes(',') || field.includes('\n') || field.includes('\r') || field.includes('"')) {
    // 将引号转义为双引号
    const escaped = field.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  
  // 为了保持一致性，所有字段都用引号包围
  return `"${field}"`;
}

// GET /api/test-cases/export - 导出测试用例
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'json') as ExportFormat;
    const search = searchParams.get('search');
    const category = searchParams.get('category');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || [];

    let query = supabase
      .from('test_cases')
      .select('*')
      .order('created_at', { ascending: false });

    // 应用相同的筛选条件
    if (search) {
      query = query.or(`input.ilike.%${search}%,reference_answer.ilike.%${search}%`);
    }

    if (category) {
      query = query.eq('metadata->>category', category);
    }


    if (tags.length > 0) {
      for (const tag of tags) {
        query = query.contains('metadata->>tags', `"${tag}"`);
      }
    }

    const { data: testCases, error } = await query;

    if (error) {
      console.error('获取测试用例失败:', error);
      return NextResponse.json(
        { error: '导出失败', details: error.message },
        { status: 500 }
      );
    }

    if (!testCases || testCases.length === 0) {
      return NextResponse.json(
        { error: '没有找到符合条件的测试用例' },
        { status: 404 }
      );
    }

    // 转换数据格式
    const exportData = testCases.map(testCase => {
      const metadata = testCase.metadata || {};
      const baseData = {
        input: testCase.input,
        reference_answer: testCase.reference_answer,
        max_score: testCase.max_score || 100, // 支持最大分数字段，默认100
        tags: metadata.tags || [],
        category: metadata.category || '',
        created_at: testCase.created_at,
        updated_at: testCase.updated_at
      };
      
      // 🆕 包含CODE类型配置字段（如果存在）
      if (testCase.code_test_config) {
        baseData.code_test_config = testCase.code_test_config;
      }
      
      if (testCase.execution_environment) {
        baseData.execution_environment = testCase.execution_environment;
      }
      
      if (testCase.validation_rules) {
        baseData.validation_rules = testCase.validation_rules;
      }
      
      return baseData;
    });

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    switch (format) {
      case 'json':
        return new NextResponse(JSON.stringify(exportData, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="test-cases-${timestamp}.json"`
          }
        });

      case 'csv':
        // CSV格式，添加UTF-8 BOM解决中文乱码问题
        const csvHeaders = ['input', 'reference_answer', 'max_score', 'tags', 'category', 'created_at'];
        const csvRows = exportData.map(item => [
          escapeCSVField(item.input || ''),
          escapeCSVField(item.reference_answer || ''),
          escapeCSVField(String(item.max_score || 100)),
          escapeCSVField(Array.isArray(item.tags) ? item.tags.join(';') : ''),
          escapeCSVField(item.category || ''),
          escapeCSVField(item.created_at || '')
        ]);
        
        // 添加UTF-8 BOM (\uFEFF) 确保中文字符正确显示
        const csvContent = '\uFEFF' + [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
        
        return new NextResponse(csvContent, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="test-cases-${timestamp}.csv"`
          }
        });

      default:
        return NextResponse.json(
          { error: '不支持的导出格式' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}