/**
 * 子任务生成器
 * 从Worker逻辑中提取出来，用于在任务创建时直接生成子任务
 */

import { supabase } from '@/lib/supabase';

export interface TemplateMapping {
  dimension_id: string;
  evaluator_id: string;
  test_case_ids: string[];  // 🔧 添加维度专用测试用例支持
}

export interface SubTaskData {
  task_id: string;
  test_case_id: string;
  model_id: string;
  dimension_id: string;
  evaluator_id: string;
  status: string;
  created_at: string;
  // 🆕 多次运行支持
  repetition_index?: number; // 运行轮次索引，从1开始，默认为1
}

/**
 * 为指定任务生成所有子任务
 */
export async function generateSubTasksForTask(taskId: string): Promise<{
  success: boolean;
  subtasks_created: number;
  error?: string;
}> {
  console.log(`📋 开始为任务 ${taskId} 生成子任务...`);
  
  try {
    // Using global supabase singleton

    // 1. 获取任务配置
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .select('id, name, config')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      throw new Error(`获取任务失败: ${taskError?.message || '任务不存在'}`);
    }

    const config = task.config;
    // 🆕 获取多次运行配置
    const runCount = config.run_count || 1;
    const humanEvaluationMode = config.human_evaluation_mode || 'independent';

    console.log(`   任务: ${task.name}`);
    console.log(`   模型数量: ${config.model_ids?.length || 0}`);
    console.log(`   测试用例数量: ${config.test_case_ids?.length || 0}`);
    console.log(`   🆕 运行次数: ${runCount}`);
    console.log(`   🆕 人工评分模式: ${humanEvaluationMode}`);

    // 2. 获取模板映射
    const templateMappings = await getTemplateMappings(config.template_id, config.test_case_ids);
    console.log(`   模板映射数量: ${templateMappings.length}`);

    if (templateMappings.length === 0) {
      throw new Error('模板没有配置维度-评分器映射');
    }

    // 3. 🔧 修复：按逻辑模型组去重，避免重复计算
    const logicalModelGroups = await getLogicalModelGroups(config.model_ids);
    console.log(`   逻辑模型组数量: ${logicalModelGroups.length} (原始模型实例: ${config.model_ids.length})`);

    // 生成子任务数据 - 🆕 支持多次运行
    const subtasks: SubTaskData[] = [];

    // 🆕 为每次运行生成子任务
    for (let runIndex = 1; runIndex <= runCount; runIndex++) {
      for (const logicalGroup of logicalModelGroups) {
        // 🔧 使用逻辑组的主模型ID，但保留组信息用于执行时failover
        const primaryModelId = logicalGroup.primaryModelId;
        for (const mapping of templateMappings) {
          // 🔧 关键修复：每个维度只使用自己配置的测试用例
          const testCaseIdsForThisDimension = mapping.test_case_ids && mapping.test_case_ids.length > 0
            ? mapping.test_case_ids
            : config.test_case_ids; // 回退到用户选择（兼容统一模板）

          for (const testCaseId of testCaseIdsForThisDimension) {
            const subtask: any = {
              task_id: taskId,
              test_case_id: testCaseId,
              model_id: primaryModelId, // 🔧 使用主模型ID
              dimension_id: mapping.dimension_id,
              evaluator_id: mapping.evaluator_id,
              status: 'pending',
              created_at: new Date().toISOString(),
              // 🆕 添加运行轮次索引
              repetition_index: runIndex,
              // 🔧 修复：同时设置run_index字段以满足数据库唯一约束
              run_index: runIndex,
              // 默认标记为依赖已解析，简化处理流程
              dependencies_resolved: true,
            };

            // 🔧 注释：逻辑模型组信息可以通过model_id查询获得，不需要冗余存储
            subtasks.push(subtask);
          }
        }
      }
    }

    console.log(`   预计生成子任务数: ${subtasks.length} (${runCount}次运行 × ${subtasks.length / runCount}个基础子任务)`);

    // 4. 检查是否已有子任务存在
    const { data: existingSubtasks } = await supabase
      .from('evaluation_results')
      .select('id')
      .eq('task_id', taskId);

    if (existingSubtasks && existingSubtasks.length > 0) {
      console.log(`⚠️ 任务 ${taskId} 已有 ${existingSubtasks.length} 个子任务，跳过生成`);
      return {
        success: true,
        subtasks_created: existingSubtasks.length,
      };
    }

    // 5. 批量插入子任务到数据库
    const { data: insertedSubtasks, error: insertError } = await supabase
      .from('evaluation_results')
      .insert(subtasks)
      .select('id');

    if (insertError) {
      // 检查是否是唯一约束冲突
      if (insertError.message.includes('unique') || insertError.message.includes('duplicate')) {
        console.log(`⚠️ 检测到重复子任务，查询现有子任务数量...`);

        const { data: currentSubtasks } = await supabase
          .from('evaluation_results')
          .select('id')
          .eq('task_id', taskId);

        return {
          success: true,
          subtasks_created: currentSubtasks?.length || 0,
        };
      }

      throw new Error(`插入子任务失败: ${insertError.message}`);
    }

    const actualCount = insertedSubtasks?.length || 0;
    console.log(`✅ 成功生成 ${actualCount} 个子任务`);

    // 6. 更新任务状态为running
    const { error: updateError } = await supabase
      .from('evaluation_tasks')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      console.warn(`更新任务状态失败: ${updateError.message}`);
      // 不抛出错误，因为子任务已经生成成功
    } else {
      console.log(`✅ 任务状态已更新为running`);
    }

    return {
      success: true,
      subtasks_created: actualCount,
    };

  } catch (error) {
    console.error(`❌ 生成子任务失败:`, error);
    return {
      success: false,
      subtasks_created: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 获取模板的维度-评分器映射（兼容双模板系统）
 */
async function getTemplateMappings(templateId: string, testCaseIds: string[] = []): Promise<TemplateMapping[]> {
  try {
    // 使用新的模板服务生成执行计划，传入正确的测试用例ID
    const { templateService } = await import('@/lib/template-service');
    const executionPlan = await templateService.generateExecutionPlan(templateId, testCaseIds);
    
    // 🔧 修复：保留每个维度的专用测试用例信息
    return executionPlan.mappings.map(mapping => ({
      dimension_id: mapping.dimension_id,
      evaluator_id: mapping.evaluator_id,
      test_case_ids: mapping.test_case_ids || [] // 关键修复：保留维度专用测试用例
    }));
  } catch (error) {
    console.error('获取模板映射失败:', error);
    
    // 如果新服务失败，回退到原来的查询方式（统一模板）
    // Using global supabase singleton
    const { data: mappings, error: fallbackError } = await supabase
      .from('template_mappings')
      .select('dimension_id, evaluator_id')
      .eq('template_id', templateId);

    if (fallbackError) {
      console.error('回退查询也失败:', fallbackError);
      return [];
    }

    // 🔧 回退时也需要提供test_case_ids（统一模板使用全部测试用例）
    return (mappings || []).map(mapping => ({
      ...mapping,
      test_case_ids: testCaseIds // 统一模板：所有维度使用相同的测试用例集
    }));
  }
}

/**
 * 验证子任务生成结果
 */
export async function validateSubTaskGeneration(taskId: string): Promise<{
  valid: boolean;
  expected_count: number;
  actual_count: number;
  details: string;
}> {
  try {
    // Using global supabase singleton

    // 获取任务配置
    const { data: task } = await supabase
      .from('evaluation_tasks')
      .select('config')
      .eq('id', taskId)
      .single();

    if (!task) {
      return {
        valid: false,
        expected_count: 0,
        actual_count: 0,
        details: '任务不存在',
      };
    }

    const config = task.config;
    
    // 获取模板映射数量
    const templateMappings = await getTemplateMappings(config.template_id, config.test_case_ids);
    
    // 🔧 修复预期子任务数计算逻辑 - 🆕 支持多次运行
    const runCount = config.run_count || 1;

    // 🔧 按逻辑模型组计算，而不是按物理模型实例
    const logicalModelGroups = await getLogicalModelGroups(config.model_ids);
    const logicalModelCount = logicalModelGroups.length;

    let expectedCount = 0;
    for (const mapping of templateMappings) {
      const testCaseCount = mapping.test_case_ids && mapping.test_case_ids.length > 0
        ? mapping.test_case_ids.length
        : config.test_case_ids.length; // 回退到用户选择（统一模板）
      expectedCount += logicalModelCount * testCaseCount; // 🔧 使用逻辑模型数量
    }
    // 🆕 乘以运行次数
    expectedCount *= runCount;

    // 获取实际子任务数
    const { data: subtasks } = await supabase
      .from('evaluation_results')
      .select('id')
      .eq('task_id', taskId);

    const actualCount = subtasks?.length || 0;
    
    return {
      valid: expectedCount === actualCount,
      expected_count: expectedCount,
      actual_count: actualCount,
      details: expectedCount === actualCount 
        ? '子任务数量正确' 
        : `预期${expectedCount}个，实际${actualCount}个`,
    };

  } catch (error) {
    return {
      valid: false,
      expected_count: 0,
      actual_count: 0,
      details: `验证失败: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * 🔧 新增：按逻辑模型组去重，避免重复计算子任务
 */
async function getLogicalModelGroups(modelIds: string[]): Promise<{
  primaryModelId: string;
  allModelIds: string[];
  logicalName: string;
}[]> {
  try {
    // Using global supabase singleton

    // 获取所有模型的详细信息
    const { data: models, error } = await supabase
      .from('models')
      .select('id, name, logical_name, provider')
      .in('id', modelIds);

    if (error || !models) {
      console.error('获取模型信息失败:', error);
      // 降级：把每个模型都当作独立的逻辑组
      return modelIds.map(id => ({
        primaryModelId: id,
        allModelIds: [id],
        logicalName: id
      }));
    }

    // 按逻辑名称分组
    const { extractLogicalName } = await import('@/lib/model-utils');
    const groups = new Map<string, typeof models>();

    for (const model of models) {
      const logicalName = model.logical_name || extractLogicalName(model.name);
      if (!groups.has(logicalName)) {
        groups.set(logicalName, []);
      }
      groups.get(logicalName)!.push(model);
    }

    // 为每个逻辑组选择主模型（按提供商优先级）
    const providerPriority = ['智谱', 'OpenRouter', 'siliconflow']; // 可配置的优先级

    const logicalGroups = Array.from(groups.entries()).map(([logicalName, groupModels]) => {
      // 按提供商优先级排序
      const sortedModels = groupModels.sort((a, b) => {
        const aPriority = providerPriority.indexOf(a.provider) !== -1
          ? providerPriority.indexOf(a.provider)
          : 999;
        const bPriority = providerPriority.indexOf(b.provider) !== -1
          ? providerPriority.indexOf(b.provider)
          : 999;
        return aPriority - bPriority;
      });

      return {
        primaryModelId: sortedModels[0].id, // 使用优先级最高的作为主模型
        allModelIds: groupModels.map(m => m.id),
        logicalName
      };
    });

    console.log(`🔧 模型去重结果: ${modelIds.length}个物理实例 -> ${logicalGroups.length}个逻辑组`);
    logicalGroups.forEach(group => {
      console.log(`   ${group.logicalName}: 主模型=${group.primaryModelId}, 备用=${group.allModelIds.length - 1}个`);
    });

    return logicalGroups;
  } catch (error) {
    console.error('模型分组失败:', error);
    // 降级：把每个模型都当作独立的逻辑组
    return modelIds.map(id => ({
      primaryModelId: id,
      allModelIds: [id],
      logicalName: id
    }));
  }
}

/**
 * 清理失败的子任务生成
 */
export async function cleanupFailedSubTaskGeneration(taskId: string): Promise<void> {
  console.log(`🧹 清理任务 ${taskId} 的失败子任务生成...`);
  
  try {
    // Using global supabase singleton

    // 删除已生成的子任务
    const { error: deleteError } = await supabase
      .from('evaluation_results')
      .delete()
      .eq('task_id', taskId);

    if (deleteError) {
      console.error('删除子任务失败:', deleteError);
    } else {
      console.log('✅ 已清理子任务');
    }

    // 重置任务状态
    const { error: resetError } = await supabase
      .from('evaluation_tasks')
      .update({
        status: 'pending',
        started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (resetError) {
      console.error('重置任务状态失败:', resetError);
    } else {
      console.log('✅ 任务状态已重置');
    }

  } catch (error) {
    console.error('清理过程失败:', error);
  }
}
