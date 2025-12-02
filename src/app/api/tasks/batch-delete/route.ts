import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';

/**
 * POST /api/tasks/batch-delete - 批量删除任务
 */
export const POST = withMonitoring('tasks_batch_delete', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { task_ids } = body;

    if (!Array.isArray(task_ids) || task_ids.length === 0) {
      return NextResponse.json(
        { error: '请提供要删除的任务ID列表' },
        { status: 400 }
      );
    }

    // 限制批量删除的数量，避免过载
    if (task_ids.length > 50) {
      return NextResponse.json(
        { error: '一次最多只能删除50个任务' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 查询所有任务的状态，确保只能删除已完成、失败或取消的任务
    const { data: tasks, error: queryError } = await supabase
      .from('evaluation_tasks')
      .select('id, status, name')
      .in('id', task_ids);

    if (queryError) {
      console.error('Query tasks error:', queryError);
      return NextResponse.json(
        { error: '查询任务失败' },
        { status: 500 }
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json(
        { error: '未找到要删除的任务' },
        { status: 404 }
      );
    }

    // 检查任务状态
    const deletableTasks = tasks.filter(task =>
      ['completed', 'failed', 'cancelled', 'pending'].includes(task.status)
    );
    const nonDeletableTasks = tasks.filter(task =>
      !['completed', 'failed', 'cancelled', 'pending'].includes(task.status)
    );

    if (nonDeletableTasks.length > 0) {
      return NextResponse.json(
        {
          error: '部分任务无法删除',
          details: {
            total_requested: task_ids.length,
            deletable_count: deletableTasks.length,
            non_deletable_count: nonDeletableTasks.length,
            non_deletable_tasks: nonDeletableTasks.map(task => ({
              id: task.id,
              name: task.name,
              status: task.status,
              reason: `状态为"${task.status}"的任务无法删除，只能删除已完成、已失败、已取消或等待中的任务`
            }))
          }
        },
        { status: 400 }
      );
    }

    // 执行批量删除
    const { error: deleteError } = await supabase
      .from('evaluation_tasks')
      .delete()
      .in('id', deletableTasks.map(task => task.id));

    if (deleteError) {
      console.error('Batch delete error:', deleteError);
      return NextResponse.json(
        { error: '批量删除任务失败' },
        { status: 500 }
      );
    }

    console.log(`🗑️ Batch deleted ${deletableTasks.length} tasks:`, deletableTasks.map(t => t.id));

    return NextResponse.json({
      message: `成功删除 ${deletableTasks.length} 个任务`,
      deleted_count: deletableTasks.length,
      deleted_tasks: deletableTasks.map(task => ({
        id: task.id,
        name: task.name
      }))
    });

  } catch (error) {
    console.error('批量删除任务失败:', error);
    return NextResponse.json(
      { error: '批量删除任务失败' },
      { status: 500 }
    );
  }
});