import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

interface ReExecuteCodeRequest {
  keep_original_result?: boolean; // 是否保留原结果作为备份
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body: ReExecuteCodeRequest = await request.json();

    const supabase = createClient();

    // 1. 获取原始子任务信息
    const { data: subtask, error: subtaskError } = await supabase
      .from('evaluation_results')
      .select('*')
      .eq('id', id)
      .single();

    if (subtaskError || !subtask) {
      console.error('查找评测结果失败:', subtaskError);
      return NextResponse.json(
        { success: false, error: '未找到指定的评测结果' },
        { status: 404 }
      );
    }

    // 2. 验证这是CODE类型的评分器
    const { data: evaluator, error: evaluatorError } = await supabase
      .from('evaluators')
      .select('id, name, type, config')
      .eq('id', subtask.evaluator_id)
      .single();

    if (evaluatorError || !evaluator) {
      console.error('查找评分器信息失败:', evaluatorError);
      return NextResponse.json(
        { success: false, error: '未找到关联的评分器' },
        { status: 404 }
      );
    }

    if (evaluator.type !== 'CODE') {
      return NextResponse.json(
        { success: false, error: '此功能仅适用于CODE类型的评分器' },
        { status: 400 }
      );
    }

    // 3. 验证已有模型响应（代码）
    if (!subtask.model_response) {
      return NextResponse.json(
        { success: false, error: '未找到可执行的代码，请先完成模型响应生成' },
        { status: 400 }
      );
    }

    // 4. 获取任务基本信息
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .select('id, name, status, config, created_at, template_id')
      .eq('id', subtask.task_id)
      .single();

    if (taskError || !task) {
      console.error('查找任务信息失败:', taskError);
      return NextResponse.json(
        { success: false, error: '未找到关联的评测任务' },
        { status: 404 }
      );
    }

    // 5. 备份原始结果（如果需要）
    if (body.keep_original_result) {
      const backupData = {
        original_result_id: subtask.id,
        original_score: subtask.score,
        original_feedback: subtask.justification,
        original_model_id: evaluator.config?.model_id,
        original_model_name: '代码重新执行',
        backup_created_at: new Date().toISOString(),
        backup_reason: 'User requested CODE re-execution in E2B environment'
      };

      const { error: backupError } = await supabase
        .from('evaluation_result_backups')
        .insert(backupData);

      if (backupError) {
        console.warn('备份原始结果失败，但继续重新执行:', backupError);
      }
    }

    // 6. 重置子任务状态，准备重新执行CODE评分
    const { error: resetError } = await supabase
      .from('evaluation_results')
      .update({
        status: 'pending',
        score: null,
        justification: null,
        // 保持原始模型响应不变（不重新生成代码）
        model_response: subtask.model_response, 
        execution_time: null,
        started_at: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
        // 记录重新执行信息
        metadata: {
          ...subtask.metadata,
          re_execution: {
            triggered_at: new Date().toISOString(),
            type: 'CODE_RE_EXECUTION',
            reason: 'User requested re-execution of existing code in E2B environment',
            original_score: subtask.score,
            skip_llm_call: true, // 🔧 关键标记：跳过LLM调用，直接进行CODE评分
            preserve_model_response: true // 🔧 保持原有模型响应
          }
        }
      })
      .eq('id', id);

    if (resetError) {
      return NextResponse.json(
        { success: false, error: '重置评测结果状态失败' },
        { status: 500 }
      );
    }

    // 7. 任务已重置为pending状态，后台任务处理器会自动检测并处理
    console.log(`🔄 CODE重新执行已准备就绪: ${id}`);
    console.log(`   - 子任务状态已重置为 'pending'`);
    console.log(`   - 保持原有模型响应（代码）不变`);
    console.log(`   - 后台任务处理器将自动检测并重新处理此子任务`);

    return NextResponse.json({
      success: true,
      message: 'CODE重新执行已开始',
      data: {
        subtask_id: id,
        evaluation_type: 'CODE_RE_EXECUTION',
        status: 'pending',
        execution_environment: 'E2B',
        note: '后台任务处理器将自动检测并处理此任务'
      }
    });

  } catch (error) {
    console.error('CODE重新执行API错误:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}