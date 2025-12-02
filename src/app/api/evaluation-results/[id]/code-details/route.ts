import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/evaluation-results/[id]/code-details - 获取代码执行详情
 */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const supabase = createClient();

    // 获取评测结果基本信息
    const { data: evaluationResult, error: resultError } = await supabase
      .from('evaluation_results')
      .select(`
        id,
        task_id,
        test_case_id,
        model_id,
        dimension_id,
        evaluator_id,
        model_response,
        score,
        justification,
        status,
        created_at,
        evaluators!inner(type, name, config),
        test_cases(input, reference_answer),
        models(name, provider)
      `)
      .eq('id', id)
      .single();

    if (resultError) {
      console.error('获取评测结果失败:', resultError);
      return NextResponse.json(
        { error: '获取评测结果失败' },
        { status: 500 }
      );
    }

    if (!evaluationResult) {
      return NextResponse.json(
        { error: '评测结果不存在' },
        { status: 404 }
      );
    }

    // 检查是否为CODE类型评分器
    if (evaluationResult.evaluators.type !== 'CODE') {
      return NextResponse.json(
        { error: '该评测结果不是代码执行类型' },
        { status: 400 }
      );
    }

    // 获取代码执行详情
    const { data: codeDetails, error: detailsError } = await supabase
      .from('code_execution_results')
      .select('*')
      .eq('evaluation_result_id', parseInt(id))
      .single();

    if (detailsError && detailsError.code !== 'PGRST116') {
      console.error('获取代码执行详情失败:', detailsError);
      return NextResponse.json(
        { error: '获取代码执行详情失败' },
        { status: 500 }
      );
    }

    // 构建响应数据
    const response = {
      evaluation_result: {
        id: evaluationResult.id,
        task_id: evaluationResult.task_id,
        score: evaluationResult.score,
        justification: evaluationResult.justification,
        status: evaluationResult.status,
        created_at: evaluationResult.created_at,
        model_response: evaluationResult.model_response,
        test_case_input: evaluationResult.test_cases?.input,
        reference_answer: evaluationResult.test_cases?.reference_answer,
        model_name: evaluationResult.models?.name,
        model_provider: evaluationResult.models?.provider,
        evaluator_name: evaluationResult.evaluators?.name,
        evaluator_config: evaluationResult.evaluators?.config
      },
      code_execution_details: codeDetails ? {
        id: codeDetails.id,
        sandbox_id: codeDetails.sandbox_id,
        stdout: codeDetails.stdout,
        stderr: codeDetails.stderr,
        execution_time_ms: codeDetails.execution_time_ms,
        memory_usage_mb: codeDetails.memory_usage_mb,
        exit_code: codeDetails.exit_code,
        files_created: codeDetails.files_created,
        test_results: codeDetails.test_results,
        debug_info: {
          session_logs: codeDetails.session_logs || [],
          environment_vars: codeDetails.environment_vars || {},
          working_directory: codeDetails.working_directory || '/tmp',
          python_version: codeDetails.python_version,
          installed_packages: codeDetails.installed_packages || []
        },
        created_at: codeDetails.created_at
      } : null,
      // 系统变量（用于评分器Prompt模板）
      system_variables: {
        test_case_input: evaluationResult.test_cases?.input || '',
        model_response: evaluationResult.model_response || '',
        code_execution_result: codeDetails ? {
          stdout: codeDetails.stdout || '',
          stderr: codeDetails.stderr || '',
          execution_status: codeDetails.exit_code === 0 ? 'success' : 'failed',
          execution_time_ms: codeDetails.execution_time_ms || 0,
          test_results: codeDetails.test_results || null
        } : null
      }
    };

    return NextResponse.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('获取代码执行详情异常:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
