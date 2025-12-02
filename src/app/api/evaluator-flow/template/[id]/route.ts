import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { evaluatorDependencyManager } from '@/lib/evaluator-dependency-manager';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/evaluator-flow/template/[id] - 获取模板的评分器执行流程
 */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { id: templateId } = await context.params;
    const supabase = createClient();

    // 获取模板信息
    const { data: template, error: templateError } = await supabase
      .from('templates')
      .select('id, name, description')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      console.error('模板查询错误:', templateError);
      return NextResponse.json(
        { error: '模板不存在', details: templateError?.message },
        { status: 404 }
      );
    }

    // 获取模板映射
    const { data: mappings, error: mappingsError } = await supabase
      .from('template_mappings')
      .select(`
        *,
        evaluators!inner(id, name, type, config),
        dimensions!inner(id, name)
      `)
      .eq('template_id', templateId);

    if (mappingsError) {
      return NextResponse.json(
        { error: '获取模板映射失败' },
        { status: 500 }
      );
    }

    if (!mappings || mappings.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    // 分析依赖关系
    const dependencies = await evaluatorDependencyManager.analyzeTemplateDependencies(templateId);

    // 按维度分组
    const dimensionGroups = new Map<string, any[]>();
    for (const mapping of mappings) {
      const dimensionId = mapping.dimension_id;
      if (!dimensionGroups.has(dimensionId)) {
        dimensionGroups.set(dimensionId, []);
      }
      dimensionGroups.get(dimensionId)!.push(mapping);
    }

    // 生成流程组
    const flowGroups = [];
    let groupIndex = 0;

    for (const [dimensionId, dimensionMappings] of dimensionGroups) {
      const dimensionName = dimensionMappings[0].dimensions.name;

      // 创建节点
      const nodes = dimensionMappings.map(mapping => {
        const dependency = dependencies.find(d => d.evaluator_id === mapping.evaluator_id);
        
        return {
          id: mapping.evaluator_id,
          name: mapping.evaluators.name,
          type: mapping.evaluators.type,
          priority: dependency?.priority || 1,
          status: 'pending' as const,
          dependsOn: dependency?.depends_on || []
        };
      });

      // 计算执行顺序
      const executionOrder = calculateExecutionOrder(nodes);

      const flowGroup = {
        groupId: `dimension_${groupIndex++}`,
        testCaseName: `${dimensionName}维度`,
        modelName: '所有模型',
        nodes,
        executionOrder
      };

      flowGroups.push(flowGroup);
    }

    return NextResponse.json({
      success: true,
      data: flowGroups
    });

  } catch (error) {
    console.error('获取模板流程失败:', error);
    return NextResponse.json(
      { error: '获取模板流程失败' },
      { status: 500 }
    );
  }
}

/**
 * 计算执行顺序（拓扑排序）
 */
function calculateExecutionOrder(nodes: any[]): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (nodeId: string) => {
    if (visiting.has(nodeId)) {
      throw new Error('检测到循环依赖');
    }
    
    if (visited.has(nodeId)) {
      return;
    }

    visiting.add(nodeId);
    
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      for (const depId of node.dependsOn) {
        visit(depId);
      }
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    order.push(nodeId);
  };

  // 按优先级排序，然后进行拓扑排序
  const sortedNodes = [...nodes].sort((a, b) => a.priority - b.priority);
  
  for (const node of sortedNodes) {
    if (!visited.has(node.id)) {
      visit(node.id);
    }
  }

  return order;
}
