import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { getTaskProcessorService } from '@/lib/task-processor';

interface ReEvaluateRequest {
  new_model_id: string;
  keep_original_result?: boolean; // 是否保留原结果作为备份
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body: ReEvaluateRequest = await request.json();

    if (!body.new_model_id) {
      return NextResponse.json(
        { success: false, error: '新模型ID不能为空' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 1. 获取原始子任务信息 - 使用简化查询，避免复杂JOIN导致的查找失败
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

    // 2. 获取任务基本信息
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

    // 3. 获取评分器信息
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

    // 4. 从evaluator.config中提取当前模型ID
    const currentModelId = evaluator.config?.model_id;
    let currentModel = null;
    
    if (currentModelId) {
      const { data: modelData, error: currentModelError } = await supabase
        .from('models')
        .select('id, name, logical_name, provider')
        .eq('id', currentModelId)
        .single();

      if (currentModelError) {
        console.warn('获取当前模型信息失败:', currentModelError);
      } else {
        currentModel = modelData;
      }
    }

    // 2. 验证新模型是否存在且为evaluator角色
    const { data: newModel, error: modelError } = await supabase
      .from('models')
      .select('id, name, logical_name, provider, role, status')
      .eq('id', body.new_model_id)
      .eq('status', 'active')
      .single();

    if (modelError || !newModel) {
      return NextResponse.json(
        { success: false, error: '指定的新模型不存在或不可用' },
        { status: 400 }
      );
    }

    if (!['evaluator', 'evaluatable'].includes(newModel.role)) {
      return NextResponse.json(
        { success: false, error: '指定的模型不是评分器模型' },
        { status: 400 }
      );
    }

    // 4. 备份原始结果（如果需要）
    if (body.keep_original_result) {
      const backupData = {
        original_result_id: subtask.id,
        original_score: subtask.score,
        original_feedback: subtask.justification,
        original_model_id: currentModelId,
        original_model_name: currentModel?.name || '未知模型',
        backup_created_at: new Date().toISOString(),
        backup_reason: 'User re-evaluation with different model'
      };

      const { error: backupError } = await supabase
        .from('evaluation_result_backups')
        .insert(backupData);

      if (backupError) {
        console.warn('备份原始结果失败，但继续重新评分:', backupError);
      }
    }

    // 5. 更新评分器模型配置
    const updatedConfig = {
      ...evaluator.config,
      model_id: body.new_model_id
    };
    
    const { error: evaluatorUpdateError } = await supabase
      .from('evaluators')
      .update({ 
        config: updatedConfig,
        updated_at: new Date().toISOString()
      })
      .eq('id', evaluator.id);

    if (evaluatorUpdateError) {
      return NextResponse.json(
        { success: false, error: '更新评分器配置失败' },
        { status: 500 }
      );
    }

    // 5. 重置子任务状态，准备重新评分
    const { error: resetError } = await supabase
      .from('evaluation_results')
      .update({
        status: 'pending',
        score: null,
        justification: null,
        model_response: subtask.model_response, // 保持原始模型响应不变
        execution_time: null,
        started_at: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
        // 记录重新评分信息
        metadata: {
          ...subtask.metadata,
          re_evaluation: {
            triggered_at: new Date().toISOString(),
            original_model_id: currentModelId,
            new_model_id: body.new_model_id,
            reason: 'User requested re-evaluation with different model'
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

    // 6. 通过任务处理器重新处理这个子任务
    try {
      const processorService = getTaskProcessorService();
      
      // 构造子任务数据格式
      const subTaskData = {
        id: subtask.id,
        task_id: subtask.task_id,
        test_case_id: subtask.test_case_id,
        model_response: subtask.model_response,
        status: 'pending',
        created_at: subtask.created_at,
        updated_at: new Date().toISOString()
      };

      // 构造任务数据格式
      const taskData = {
        id: task.id,
        name: task.name,
        config: task.config,
        created_at: task.created_at,
        template_id: task.template_id,
        evaluator: {
          ...evaluator,
          config: {
            ...evaluator.config,
            model_id: body.new_model_id // 使用新的模型ID
          },
          models: newModel // 使用新的模型信息
        }
      };

      // 立即处理这个子任务
      console.log(`🔄 开始重新评分子任务: ${id} -> 新模型: ${newModel.name}`);
      
      // 异步处理，不等待完成
      processorService.processSubTask(subTaskData, taskData).catch(error => {
        console.error(`重新评分子任务失败 ${id}:`, error);
        // 可以在这里更新数据库状态为failed
        supabase
          .from('evaluation_results')
          .update({
            status: 'failed',
            justification: `重新评分失败: ${error.message}`,
            completed_at: new Date().toISOString()
          })
          .eq('id', id)
          .then(({ error }) => {
            if (error) {
              console.error('更新失败状态出错:', error);
            }
          });
      });

      return NextResponse.json({
        success: true,
        message: '重新评分已开始',
        data: {
          subtask_id: id,
          original_model: currentModel?.name || '未知模型',
          new_model: newModel.name,
          status: 'processing'
        }
      });

    } catch (processorError) {
      console.error('任务处理器调用失败:', processorError);
      return NextResponse.json(
        { success: false, error: '启动重新评分失败' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('重新评分API错误:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}