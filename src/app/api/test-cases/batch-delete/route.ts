import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';

/**
 * DELETE /api/test-cases/batch-delete - 批量删除测试用例
 */
export const DELETE = withMonitoring('test_cases_batch_delete', async (request: NextRequest) => {
  try {
    const supabase = createClient();
    const body = await request.json();
    
    // 验证请求参数
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { error: '请提供要删除的测试用例ID列表' },
        { status: 400 }
      );
    }

    // 限制批量删除数量
    if (body.ids.length > 100) {
      return NextResponse.json(
        { error: '单次最多只能删除100个测试用例' },
        { status: 400 }
      );
    }

    // 验证所有ID格式
    const invalidIds = body.ids.filter((id: any) => typeof id !== 'string' || !id.trim());
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: '部分测试用例ID格式无效' },
        { status: 400 }
      );
    }

    const testCaseIds: string[] = body.ids;

    // 检查测试用例是否存在
    const { data: existingTestCases, error: checkError } = await supabase
      .from('test_cases')
      .select('id')
      .in('id', testCaseIds);

    if (checkError) {
      console.error('检查测试用例存在性失败:', checkError);
      return NextResponse.json(
        { error: '检查测试用例失败' },
        { status: 500 }
      );
    }

    const existingIds = existingTestCases?.map(tc => tc.id) || [];
    const notFoundIds = testCaseIds.filter(id => !existingIds.includes(id));

    if (notFoundIds.length > 0) {
      return NextResponse.json(
        { 
          error: '部分测试用例不存在或已被删除',
          details: { not_found: notFoundIds }
        },
        { status: 404 }
      );
    }

    // 检查测试用例是否正在被使用
    console.log('🔍 检查测试用例使用情况...');
    
    // 检查任务配置中的使用
    const { data: tasksUsingTestCases, error: taskCheckError } = await supabase
      .from('evaluation_tasks')
      .select('id, name, config')
      .not('config', 'is', null);

    if (taskCheckError) {
      console.error('检查任务使用情况失败:', taskCheckError);
      return NextResponse.json(
        { error: '检查测试用例使用情况失败' },
        { status: 500 }
      );
    }

    // 分析任务配置中使用的测试用例
    const usedTestCaseIds = new Set<string>();
    const usingTasks: Array<{ id: string, name: string }> = [];
    
    tasksUsingTestCases?.forEach(task => {
      const config = task.config || {};
      const taskTestCaseIds = config.test_case_ids || [];
      
      taskTestCaseIds.forEach((id: string) => {
        if (testCaseIds.includes(id)) {
          usedTestCaseIds.add(id);
          if (!usingTasks.some(t => t.id === task.id)) {
            usingTasks.push({ id: task.id, name: task.name });
          }
        }
      });
    });

    // 检查模板自定义映射中的使用
    const { data: customMappings, error: customMappingError } = await supabase
      .from('template_custom_mappings')
      .select('template_id, test_case_ids');

    if (!customMappingError && customMappings) {
      customMappings.forEach(mapping => {
        const mappingTestCaseIds = mapping.test_case_ids || [];
        mappingTestCaseIds.forEach((id: string) => {
          if (testCaseIds.includes(id)) {
            usedTestCaseIds.add(id);
          }
        });
      });
    }

    // 检查评估结果中的使用
    const { data: evaluationResults, error: resultsError } = await supabase
      .from('evaluation_results')
      .select('test_case_id')
      .in('test_case_id', testCaseIds)
      .limit(1);

    if (!resultsError && evaluationResults && evaluationResults.length > 0) {
      evaluationResults.forEach(result => {
        if (result.test_case_id && testCaseIds.includes(result.test_case_id)) {
          usedTestCaseIds.add(result.test_case_id);
        }
      });
    }

    // 如果有测试用例正在被使用，阻止删除
    if (usedTestCaseIds.size > 0) {
      return NextResponse.json(
        { 
          error: `无法删除正在使用的测试用例，共 ${usedTestCaseIds.size} 个测试用例正在被使用`,
          details: {
            used_test_case_ids: Array.from(usedTestCaseIds),
            using_tasks: usingTasks.slice(0, 5), // 只返回前5个使用的任务
            total_using_tasks: usingTasks.length
          }
        },
        { status: 409 }
      );
    }

    // 执行批量删除
    console.log(`🗑️ 开始批量删除 ${testCaseIds.length} 个测试用例...`);
    
    const { data: deletedTestCases, error: deleteError } = await supabase
      .from('test_cases')
      .delete()
      .in('id', testCaseIds)
      .select('id');

    if (deleteError) {
      console.error('批量删除失败:', deleteError);
      return NextResponse.json(
        { error: '批量删除失败', details: deleteError.message },
        { status: 500 }
      );
    }

    const deletedCount = deletedTestCases?.length || 0;
    console.log(`✅ 成功删除 ${deletedCount} 个测试用例`);

    return NextResponse.json({
      success: true,
      deleted_count: deletedCount,
      deleted_ids: deletedTestCases?.map(tc => tc.id) || [],
      message: `成功删除 ${deletedCount} 个测试用例`
    });

  } catch (error) {
    console.error('批量删除API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
});