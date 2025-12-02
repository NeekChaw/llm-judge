import { NextRequest, NextResponse } from 'next/server';
import { EvaluationTask, TaskStatus } from '@/types/task';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tasks/[id] - 获取任务详情
 */
export const GET = async (request: NextRequest, context: Context) => {
  try {
    const { id } = await context.params;
    
    // 使用与任务列表API相同的数据库客户端
    const { supabase } = require('@/lib/db');
    
    // 获取任务基础信息
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (taskError) {
      console.error('任务查询失败:', taskError);
      return NextResponse.json(
        { error: `数据库查询失败: ${taskError.message}` },
        { status: 500 }
      );
    }

    if (!task) {
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      );
    }

    // 优化的任务结果统计查询 - 使用聚合查询减少数据传输
    const { data: statusCounts } = await supabase
      .rpc('get_task_status_counts', { task_id_param: id });

    let total = 0;
    let success = 0;
    let failed = 0;
    
    if (statusCounts && statusCounts.length > 0) {
      // 如果有 RPC 函数结果，使用它
      for (const row of statusCounts) {
        switch (row.status) {
          case 'completed':
            success = row.count;
            break;
          case 'failed':
            failed = row.count;
            break;
        }
      }
      total = success + failed;
    } else {
      // 如果 RPC 函数不存在，回退到简化的查询
      const { count: completedCount } = await supabase
        .from('evaluation_results')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', id)
        .eq('status', 'completed');

      const { count: failedCount } = await supabase
        .from('evaluation_results')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', id)
        .eq('status', 'failed');

      // 获取所有子任务的总数，而不仅仅是成功和失败的
      const { count: totalCount } = await supabase
        .from('evaluation_results')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', id);

      success = completedCount || 0;
      failed = failedCount || 0;
      total = totalCount || 0;
    }

    const completed = success + failed;

    // 对于pending状态的任务，快速估算预期的子任务总数
    if (task.status === 'pending' && total === 0 && task.config) {
      const modelIds = task.config.model_ids || [];
      const testCaseIds = task.config.test_case_ids || [];
      const templateId = task.config.template_id;
      
      if (templateId && modelIds.length > 0 && testCaseIds.length > 0) {
        // 优化：只获取维度数量，不获取完整数据
        const { count: dimensionsCount } = await supabase
          .from('template_mappings')
          .select('*', { count: 'exact', head: true })
          .eq('template_id', templateId);
        
        // 总任务数 = 模型数 × 测试用例数 × 维度数
        total = modelIds.length * testCaseIds.length * (dimensionsCount || 0);
      }
    }

    // 返回任务数据（与任务列表API格式一致）
    const taskData = {
      id: task.id,
      name: task.name,
      description: task.description,
      status: task.status,
      created_at: task.created_at,
      started_at: task.started_at,
      finished_at: task.finished_at,
      template_id: task.template_id || task.config?.template_id || '', // 优先使用主字段，兼容旧数据
      model_ids: task.config?.model_ids || [],
      test_case_ids: task.config?.test_case_ids || [],
      progress: {
        total,
        completed, // 已执行完毕的任务数（成功+失败）
        success,   // 成功的任务数
        failed,    // 失败的任务数
      },
      config: task.config || {},
    };

    return NextResponse.json({ task: taskData });
  } catch (error) {
    console.error('获取任务详情失败:', error);
    return NextResponse.json(
      { error: '获取任务详情失败' },
      { status: 500 }
    );
  }
};

/**
 * PUT /api/tasks/[id] - 更新任务（暂停/恢复/取消）
 */
export const PUT = withMonitoring('task_control', async (request: NextRequest, context: Context) => {
  try {
    const { id } = await context.params;
    const supabase = createClient();
    const body = await request.json();
    const { action } = body;

    if (!['start', 'pause', 'resume', 'cancel'].includes(action)) {
      return NextResponse.json(
        { error: '无效的操作类型' },
        { status: 400 }
      );
    }

    // 检查任务是否存在
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .select('id, status')
      .eq('id', id)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      );
    }

    let newStatus: TaskStatus;
    let updateFields: any = {};

    switch (action) {
      case 'start':
        if (task.status !== 'pending') {
          return NextResponse.json(
            { error: '只能启动等待中的任务' },
            { status: 400 }
          );
        }
        newStatus = TaskStatus.RUNNING;
        updateFields.started_at = new Date().toISOString();
        console.log(`🚀 Starting task: ${id}`);
        break;
      
      case 'pause':
        if (task.status !== 'running') {
          return NextResponse.json(
            { error: '只能暂停运行中的任务' },
            { status: 400 }
          );
        }
        newStatus = TaskStatus.PAUSED;
        console.log(`⏸️ Pausing task: ${id}`);
        break;
      
      case 'resume':
        if (task.status !== 'paused') {
          return NextResponse.json(
            { error: '只能恢复已暂停的任务' },
            { status: 400 }
          );
        }
        newStatus = TaskStatus.RUNNING;
        updateFields.started_at = new Date().toISOString();
        console.log(`▶️ Resuming task: ${id}`);
        break;
      
      case 'cancel':
        if (!['pending', 'running', 'paused'].includes(task.status)) {
          return NextResponse.json(
            { error: '只能取消未完成的任务' },
            { status: 400 }
          );
        }
        newStatus = TaskStatus.CANCELLED;
        updateFields.finished_at = new Date().toISOString();
        console.log(`❌ Cancelling task: ${id}`);
        break;
      
      default:
        return NextResponse.json(
          { error: '无效的操作类型' },
          { status: 400 }
        );
    }

    // 更新任务状态
    const { error: updateError } = await supabase
      .from('evaluation_tasks')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...updateFields,
      })
      .eq('id', id);

    if (updateError) {
      console.error('Update task error:', updateError);
      return NextResponse.json(
        { error: '更新任务状态失败' },
        { status: 500 }
      );
    }

    // TODO: 通知任务队列系统执行相应操作

    return NextResponse.json({
      message: `任务${action}操作成功`,
      task_id: id,
      action,
      new_status: newStatus,
    });
  } catch (error) {
    console.error('更新任务失败:', error);
    return NextResponse.json(
      { error: '更新任务失败' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/tasks/[id] - 删除任务
 */
export const DELETE = withMonitoring('task_delete', async (request: NextRequest, context: Context) => {
  try {
    const { id } = await context.params;
    const supabase = createClient();

    // 检查任务状态，只能删除已完成或失败的任务
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .select('id, status')
      .eq('id', id)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      );
    }

    if (!['completed', 'failed', 'cancelled', 'pending'].includes(task.status)) {
      return NextResponse.json(
        { error: '只能删除已完成、已失败、已取消或等待中的任务' },
        { status: 400 }
      );
    }

    // 删除任务和相关结果（通过级联删除）
    const { error: deleteError } = await supabase
      .from('evaluation_tasks')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Delete task error:', deleteError);
      return NextResponse.json(
        { error: '删除任务失败' },
        { status: 500 }
      );
    }

    console.log(`🗑️ Deleted task: ${id}`);

    return NextResponse.json({
      message: '任务删除成功',
      task_id: id,
    });
  } catch (error) {
    console.error('删除任务失败:', error);
    return NextResponse.json(
      { error: '删除任务失败' },
      { status: 500 }
    );
  }
});