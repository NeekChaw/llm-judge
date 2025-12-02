import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { evaluatorDependencyManager } from '@/lib/evaluator-dependency-manager';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/evaluator-flow/task/[id] - 获取任务的评分器执行流程
 */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { id: taskId } = await context.params;
    const supabase = createClient();

    // 获取任务信息
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .select('id, name, config, status')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { error: '任务不存在' },
        { status: 404 }
      );
    }

    // 生成子任务依赖关系
    const executionGroups = await evaluatorDependencyManager.generateSubTaskDependencies(taskId);

    if (executionGroups.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    // 获取测试用例和模型名称
    const testCaseIds = [...new Set(executionGroups.map(g => g.test_case_id))];
    const modelIds = [...new Set(executionGroups.map(g => g.model_id))];

    const [testCasesResult, modelsResult] = await Promise.all([
      supabase
        .from('test_cases')
        .select('id, name')
        .in('id', testCaseIds),
      supabase
        .from('models')
        .select('id, name, logical_name')
        .in('id', modelIds)
    ]);

    const testCasesMap = new Map(
      (testCasesResult.data || []).map(tc => [tc.id, tc.name])
    );
    const modelsMap = new Map(
      (modelsResult.data || []).map(m => [m.id, m.logical_name || m.name])
    );

    // 获取评分器信息
    const evaluatorIds = [...new Set(
      executionGroups.flatMap(g => g.subtasks.map(s => s.evaluator_id))
    )];

    const { data: evaluators } = await supabase
      .from('evaluators')
      .select('id, name, type')
      .in('id', evaluatorIds);

    const evaluatorsMap = new Map(
      (evaluators || []).map(e => [e.id, e])
    );

    // 转换为流程组格式
    const flowGroups = executionGroups.map(group => {
      const testCaseName = testCasesMap.get(group.test_case_id) || `测试用例 ${group.test_case_id}`;
      const modelName = modelsMap.get(group.model_id) || `模型 ${group.model_id}`;

      const nodes = group.subtasks.map(subtask => {
        const evaluator = evaluatorsMap.get(subtask.evaluator_id);
        
        return {
          id: subtask.subtask_id,
          name: evaluator?.name || `评分器 ${subtask.evaluator_id}`,
          type: subtask.evaluator_type,
          priority: subtask.priority,
          status: subtask.status,
          dependsOn: subtask.depends_on_subtasks
        };
      });

      return {
        groupId: group.group_id,
        testCaseName,
        modelName,
        nodes,
        executionOrder: group.execution_order
      };
    });

    return NextResponse.json({
      success: true,
      data: flowGroups
    });

  } catch (error) {
    console.error('获取任务流程失败:', error);
    return NextResponse.json(
      { error: '获取任务流程失败' },
      { status: 500 }
    );
  }
}
