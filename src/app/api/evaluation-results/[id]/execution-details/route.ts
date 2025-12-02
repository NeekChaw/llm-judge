import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

/**
 * 获取评测结果的完整执行详情
 * 使用新的数据库视图 evaluation_result_execution_view
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: evaluationResultId } = await params;
    const supabase = createClient();

    // 使用新的数据库视图获取完整的执行详情
    const { data: executionDetails, error } = await supabase
      .from('evaluation_result_execution_view')
      .select('*')
      .eq('id', evaluationResultId)
      .single();

    if (error) {
      console.error('获取执行详情失败:', error);
      return NextResponse.json(
        { error: '获取执行详情失败', details: error.message },
        { status: 500 }
      );
    }

    if (!executionDetails) {
      return NextResponse.json(
        { error: '评测结果不存在' },
        { status: 404 }
      );
    }

    // 构造返回数据，保持与原有格式兼容
    const responseData = {
      evaluation_result: {
        id: executionDetails.id,
        task_id: executionDetails.task_id,
        test_case_id: executionDetails.test_case_id,
        model_id: executionDetails.model_id,
        evaluator_id: executionDetails.evaluator_id,
        status: executionDetails.status,
        score: executionDetails.score,
        justification: executionDetails.justification,
        model_response: executionDetails.model_response,
        test_case_input: executionDetails.test_case_input,
        model_name: executionDetails.model_name,
        evaluator_name: executionDetails.evaluator_name,
        created_at: executionDetails.created_at
      },
      code_execution_details: {
        stdout: executionDetails.stdout || '',
        stderr: executionDetails.stderr || '',
        execution_time_ms: executionDetails.code_execution_time_ms || 0,
        memory_usage_mb: executionDetails.memory_usage_mb,
        exit_code: executionDetails.exit_code,
        test_results: executionDetails.test_results || {
          passed: 0,
          total: 0,
          syntax_correct: false,
          functional_correct: false,
          details: []
        },
        sandbox_id: executionDetails.sandbox_id || '',
        files_created: executionDetails.files_created || [],
        debug_info: {
          session_logs: executionDetails.session_logs || [],
          environment_vars: executionDetails.environment_vars || {},
          working_directory: executionDetails.working_directory || '/tmp',
          python_version: executionDetails.python_version,
          installed_packages: executionDetails.installed_packages || []
        }
      }
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('API错误:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
