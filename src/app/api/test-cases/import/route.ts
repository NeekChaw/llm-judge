import { supabase } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { 
  TestCaseImportData, 
  TestCaseImportResult 
} from '@/types/test-case';

// POST /api/test-cases/import - 批量导入测试用例
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, format } = body;

    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { error: '导入数据格式错误，需要数组格式' },
        { status: 400 }
      );
    }

    const result: TestCaseImportResult = {
      success: true,
      total: data.length,
      imported: 0,
      failed: 0,
      errors: []
    };

    // 验证和处理每个测试用例
    const validTestCases: any[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const item: TestCaseImportData = data[i];
      
      // 验证必填字段
      if (!item.input || typeof item.input !== 'string' || item.input.trim() === '') {
        result.errors.push({
          row: i + 1,
          error: '输入内容不能为空',
          data: item
        });
        result.failed++;
        continue;
      }

      // 构建metadata
      const metadata: Record<string, any> = {};
      if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
        metadata.tags = item.tags;
      }
      if (item.category && typeof item.category === 'string') {
        metadata.category = item.category;
      }
      if (item.metadata && typeof item.metadata === 'object') {
        Object.assign(metadata, item.metadata);
      }

      // 验证max_score字段
      let maxScore = 100; // 默认值
      if (item.max_score !== undefined) {
        if (typeof item.max_score === 'number' && item.max_score > 0) {
          maxScore = item.max_score;
        } else if (typeof item.max_score === 'string') {
          const parsed = parseFloat(item.max_score);
          if (!isNaN(parsed) && parsed > 0) {
            maxScore = parsed;
          } else {
            result.errors.push({
              row: i + 1,
              error: 'max_score必须是大于0的数字',
              data: item
            });
            result.failed++;
            continue;
          }
        } else {
          result.errors.push({
            row: i + 1,
            error: 'max_score格式无效，必须是大于0的数字',
            data: item
          });
          result.failed++;
          continue;
        }
      }

      // 构建数据库记录
      const dbRecord: any = {
        input: item.input.trim(),
        reference_answer: item.reference_answer?.trim() || null,
        max_score: maxScore,
        metadata: Object.keys(metadata).length > 0 ? metadata : null
      };
      
      // 🆕 支持CODE类型配置字段
      if (item.code_test_config && typeof item.code_test_config === 'object') {
        dbRecord.code_test_config = item.code_test_config;
      }
      
      if (item.execution_environment && typeof item.execution_environment === 'string') {
        dbRecord.execution_environment = item.execution_environment.trim();
      }
      
      if (item.validation_rules && typeof item.validation_rules === 'object') {
        dbRecord.validation_rules = item.validation_rules;
      }
      
      validTestCases.push(dbRecord);
    }

    // 批量插入到数据库
    if (validTestCases.length > 0) {
      const { data: insertedData, error } = await supabase
        .from('test_cases')
        .insert(validTestCases)
        .select();

      if (error) {
        console.error('批量插入失败:', error);
        return NextResponse.json(
          { error: '批量导入失败', details: error.message },
          { status: 500 }
        );
      }

      result.imported = insertedData?.length || 0;
    }

    // 判断整体是否成功
    result.success = result.failed === 0;

    return NextResponse.json(
      { 
        result, 
        message: `导入完成：成功 ${result.imported} 条，失败 ${result.failed} 条` 
      },
      { status: result.success ? 200 : 207 }
    );

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}