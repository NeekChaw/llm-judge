import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';
import { generateSubTasksForTask } from '@/lib/subtask-generator';

/**
 * POST /api/tasks/[id]/clone - 克隆任务
 */
export const POST = withMonitoring('tasks_clone', async (
  request: NextRequest,
  { params }: { params: { id: string } }
) => {
  try {
    const supabase = createClient();
    const { name } = await request.json();
    const originalTaskId = params.id;

    // 验证新任务名称
    if (!name?.trim()) {
      return NextResponse.json(
        { error: '任务名称不能为空' },
        { status: 400 }
      );
    }

    // 获取原任务信息
    const { data: originalTask, error: fetchError } = await supabase
      .from('evaluation_tasks')
      .select('*')
      .eq('id', originalTaskId)
      .single();

    if (fetchError || !originalTask) {
      return NextResponse.json(
        { error: '原任务不存在' },
        { status: 404 }
      );
    }

    // 检查新任务名称是否已存在
    const { data: existingTask } = await supabase
      .from('evaluation_tasks')
      .select('id')
      .eq('name', name.trim())
      .single();

    if (existingTask) {
      return NextResponse.json(
        { error: '任务名称已存在，请使用其他名称' },
        { status: 400 }
      );
    }

    // 创建新任务
    const newTaskId = uuidv4();
    const newTask = {
      id: newTaskId,
      name: name.trim(),
      description: originalTask.description ? `${originalTask.description} (克隆自: ${originalTask.name})` : `克隆自: ${originalTask.name}`,
      template_id: originalTask.template_id,
      status: 'pending',
      config: originalTask.config, // 复制所有配置
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: createdTask, error: createError } = await supabase
      .from('evaluation_tasks')
      .insert(newTask)
      .select()
      .single();

    if (createError) {
      console.error('创建克隆任务失败:', createError);
      return NextResponse.json(
        { error: '创建克隆任务失败' },
        { status: 500 }
      );
    }

    // 🆕 生成子任务
    try {
      console.log('为克隆任务生成子任务...');
      const subtaskResult = await generateSubTasksForTask(createdTask.id);

      if (subtaskResult.success) {
        console.log(`子任务生成完成: ${subtaskResult.subtasks_created}个`);
      } else {
        console.error('生成子任务失败:', subtaskResult.error);
      }
    } catch (subTaskError) {
      console.error('生成子任务失败:', subTaskError);
      // 不要因为子任务生成失败而让整个克隆失败
      // 用户可以手动重新生成子任务
    }

    return NextResponse.json({
      message: '任务克隆成功',
      task: createdTask,
      original_task_id: originalTaskId,
    });

  } catch (error) {
    console.error('克隆任务失败:', error);
    return NextResponse.json(
      { error: '克隆任务失败' },
      { status: 500 }
    );
  }
});
