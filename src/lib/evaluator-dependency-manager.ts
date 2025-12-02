/**
 * 评分器依赖关系管理器
 * 负责管理评分器之间的执行顺序和依赖关系
 */

import { createClient } from '@/lib/supabase';

export interface EvaluatorDependency {
  evaluator_id: string;
  depends_on: string[];
  priority: number;
  type: 'CODE' | 'PROMPT' | 'REGEX' | 'HUMAN';
}

export interface SubTaskDependency {
  subtask_id: string;
  task_id: string;
  test_case_id: string;
  model_id: string;
  evaluator_id: string;
  evaluator_type: string;
  depends_on_subtasks: string[];
  priority: number;
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
}

export interface ExecutionGroup {
  group_id: string;
  task_id: string;
  test_case_id: string;
  model_id: string;
  subtasks: SubTaskDependency[];
  execution_order: string[];
}

/**
 * 评分器依赖关系管理器
 */
export class EvaluatorDependencyManager {
  // 懒加载 Supabase 客户端，避免构建时初始化
  private get supabase() {
    return createClient();
  }

  /**
   * 分析模板中的评分器依赖关系（使用数据库持久化数据）
   */
  async analyzeTemplateDependencies(templateId: string): Promise<EvaluatorDependency[]> {
    try {
      // 首先尝试从数据库获取已存储的依赖关系
      const { data: storedDependencies, error: depError } = await this.supabase
        .from('evaluator_dependency_view')
        .select('*')
        .eq('template_id', templateId)
        .eq('is_active', true);

      if (!depError && storedDependencies && storedDependencies.length > 0) {
        console.log(`✅ 从数据库获取到 ${storedDependencies.length} 个依赖关系`);

        // 转换为标准格式
        return storedDependencies.map(dep => ({
          evaluator_id: dep.evaluator_id,
          depends_on: dep.depends_on_evaluator_id ? [dep.depends_on_evaluator_id] : [],
          priority: dep.priority,
          type: dep.evaluator_type as 'CODE' | 'PROMPT' | 'REGEX' | 'HUMAN'
        }));
      }

      console.log('⚠️ 数据库中无依赖关系，进行实时分析并存储...');

      // 如果数据库中没有依赖关系，则分析并存储
      const dependencies = await this.analyzeAndStoreDependencies(templateId);
      return dependencies;
    } catch (error) {
      console.error('分析模板依赖关系失败:', error);
      return [];
    }
  }

  /**
   * 分析并存储依赖关系到数据库
   */
  private async analyzeAndStoreDependencies(templateId: string): Promise<EvaluatorDependency[]> {
    try {
      // 获取模板映射
      const { data: mappings, error } = await this.supabase
        .from('template_mappings')
        .select(`
          *,
          evaluators!inner(id, name, type, config)
        `)
        .eq('template_id', templateId);

      if (error || !mappings || mappings.length === 0) {
        return [];
      }

      const dependencies: EvaluatorDependency[] = [];
      const dependenciesToStore: any[] = [];

      // 按维度分组评分器
      const dimensionGroups = new Map<string, any[]>();
      for (const mapping of mappings) {
        const dimensionId = mapping.dimension_id;
        if (!dimensionGroups.has(dimensionId)) {
          dimensionGroups.set(dimensionId, []);
        }
        dimensionGroups.get(dimensionId)!.push(mapping);
      }

      // 为每个维度分析依赖关系
      for (const [dimensionId, dimensionMappings] of dimensionGroups) {
        const codeEvaluators = dimensionMappings.filter(m => m.evaluators.type === 'CODE');
        const promptEvaluators = dimensionMappings.filter(m => m.evaluators.type === 'PROMPT');
        const otherEvaluators = dimensionMappings.filter(m =>
          m.evaluators.type !== 'CODE' && m.evaluators.type !== 'PROMPT'
        );

        // CODE评分器优先级最高，无依赖
        for (const codeMapping of codeEvaluators) {
          dependencies.push({
            evaluator_id: codeMapping.evaluator_id,
            depends_on: [],
            priority: 1,
            type: 'CODE'
          });
        }

        // PROMPT评分器依赖于同维度的CODE评分器
        for (const promptMapping of promptEvaluators) {
          const codeDependencies = codeEvaluators.map(c => c.evaluator_id);
          dependencies.push({
            evaluator_id: promptMapping.evaluator_id,
            depends_on: codeDependencies,
            priority: 2,
            type: 'PROMPT'
          });

          // 存储PROMPT -> CODE依赖关系到数据库
          for (const codeEvaluatorId of codeDependencies) {
            dependenciesToStore.push({
              evaluator_id: promptMapping.evaluator_id,
              depends_on_evaluator_id: codeEvaluatorId,
              priority: 2,
              dependency_type: 'execution_order',
              template_id: templateId,
              dimension_id: dimensionId
            });
          }
        }

        // 其他评分器优先级中等，无特殊依赖
        for (const otherMapping of otherEvaluators) {
          dependencies.push({
            evaluator_id: otherMapping.evaluator_id,
            depends_on: [],
            priority: 1.5,
            type: otherMapping.evaluators.type
          });
        }
      }

      // 批量存储依赖关系到数据库
      if (dependenciesToStore.length > 0) {
        const { error: storeError } = await this.supabase
          .from('evaluator_dependencies')
          .upsert(dependenciesToStore, {
            onConflict: 'template_id,evaluator_id,depends_on_evaluator_id'
          });

        if (storeError) {
          console.error('存储依赖关系失败:', storeError);
        } else {
          console.log(`✅ 成功存储 ${dependenciesToStore.length} 个依赖关系到数据库`);
        }
      }

      return dependencies;
    } catch (error) {
      console.error('分析并存储依赖关系失败:', error);
      return [];
    }
  }

  /**
   * 为任务生成子任务依赖关系（使用数据库持久化数据）
   */
  async generateSubTaskDependencies(taskId: string): Promise<ExecutionGroup[]> {
    try {
      // 获取任务配置
      const { data: task, error: taskError } = await this.supabase
        .from('evaluation_tasks')
        .select('config')
        .eq('id', taskId)
        .single();

      if (taskError || !task) {
        throw new Error(`获取任务配置失败: ${taskError?.message}`);
      }

      const config = task.config;
      const templateId = config.template_id;

      // 获取现有子任务（evaluation_results）
      const { data: subtasks, error: subtasksError } = await this.supabase
        .from('evaluation_results')
        .select(`
          id,
          task_id,
          test_case_id,
          model_id,
          evaluator_id,
          status,
          execution_priority,
          dependencies_resolved,
          evaluators!inner(type)
        `)
        .eq('task_id', taskId);

      if (subtasksError) {
        throw new Error(`获取子任务失败: ${subtasksError.message}`);
      }

      if (!subtasks || subtasks.length === 0) {
        return [];
      }

      // 获取或创建子任务依赖关系
      await this.ensureSubtaskDependencies(taskId, templateId, subtasks);

      // 获取子任务依赖关系
      const { data: dependencies, error: depError } = await this.supabase
        .from('evaluation_result_dependencies')
        .select('*')
        .in('evaluation_result_id', subtasks.map(s => s.id));

      if (depError) {
        console.error('获取子任务依赖关系失败:', depError);
      }

      // 按测试用例和模型分组
      const groups = new Map<string, SubTaskDependency[]>();

      for (const subtask of subtasks) {
        const groupKey = `${subtask.test_case_id}_${subtask.model_id}`;

        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }

        // 查找依赖关系
        const subtaskDependencies = dependencies?.filter(d =>
          d.evaluation_result_id === subtask.id
        ) || [];

        const dependsOnSubtasks = subtaskDependencies.map(d => d.depends_on_evaluation_result_id);

        const subTaskDep: SubTaskDependency = {
          subtask_id: subtask.id,
          task_id: subtask.task_id,
          test_case_id: subtask.test_case_id,
          model_id: subtask.model_id,
          evaluator_id: subtask.evaluator_id,
          evaluator_type: subtask.evaluators.type,
          depends_on_subtasks: dependsOnSubtasks,
          priority: subtask.execution_priority || 1,
          status: this.mapSubtaskStatus(subtask.status)
        };

        groups.get(groupKey)!.push(subTaskDep);
      }

      // 生成执行组
      const executionGroups: ExecutionGroup[] = [];

      for (const [groupKey, groupSubtasks] of groups) {
        const [testCaseId, modelId] = groupKey.split('_');

        // 计算执行顺序
        const executionOrder = this.calculateExecutionOrder(groupSubtasks);

        const executionGroup: ExecutionGroup = {
          group_id: groupKey,
          task_id: taskId,
          test_case_id: testCaseId,
          model_id: modelId,
          subtasks: groupSubtasks,
          execution_order: executionOrder
        };

        executionGroups.push(executionGroup);
      }

      return executionGroups;
    } catch (error) {
      console.error('生成子任务依赖关系失败:', error);
      return [];
    }
  }

  /**
   * 确保子任务依赖关系存在于数据库中
   */
  private async ensureSubtaskDependencies(taskId: string, templateId: string, subtasks: any[]) {
    try {
      // 获取模板的评分器依赖关系
      const evaluatorDependencies = await this.analyzeTemplateDependencies(templateId);

      const dependenciesToCreate: any[] = [];

      // 按测试用例和模型分组
      const groups = new Map<string, any[]>();
      for (const subtask of subtasks) {
        const groupKey = `${subtask.test_case_id}_${subtask.model_id}`;
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(subtask);
      }

      // 为每个组创建依赖关系
      for (const [groupKey, groupSubtasks] of groups) {
        for (const subtask of groupSubtasks) {
          const evaluatorDep = evaluatorDependencies.find(d => d.evaluator_id === subtask.evaluator_id);

          if (evaluatorDep && evaluatorDep.depends_on.length > 0) {
            // 查找同组中的依赖子任务
            const dependentSubtasks = groupSubtasks.filter(s =>
              evaluatorDep.depends_on.includes(s.evaluator_id)
            );

            for (const dependentSubtask of dependentSubtasks) {
              dependenciesToCreate.push({
                evaluation_result_id: subtask.id,
                depends_on_evaluation_result_id: dependentSubtask.id,
                dependency_type: 'execution_order',
                priority: evaluatorDep.priority
              });
            }
          }
        }
      }

      // 批量创建依赖关系
      if (dependenciesToCreate.length > 0) {
        const { error } = await this.supabase
          .from('evaluation_result_dependencies')
          .upsert(dependenciesToCreate, {
            onConflict: 'evaluation_result_id,depends_on_evaluation_result_id'
          });

        if (error) {
          console.error('创建子任务依赖关系失败:', error);
        } else {
          console.log(`✅ 成功创建 ${dependenciesToCreate.length} 个子任务依赖关系`);
        }
      }
    } catch (error) {
      console.error('确保子任务依赖关系失败:', error);
    }
  }

  /**
   * 检查子任务是否可以执行（使用数据库中的依赖状态）
   */
  async canExecuteSubTask(subtaskId: string): Promise<{
    canExecute: boolean;
    reason?: string;
    dependsOn?: string[];
  }> {
    try {
      // 获取子任务信息（evaluation_results）
      const { data: subtask, error } = await this.supabase
        .from('evaluation_results')
        .select(`
          id,
          task_id,
          test_case_id,
          model_id,
          evaluator_id,
          status,
          dependencies_resolved,
          evaluators!inner(type)
        `)
        .eq('id', subtaskId)
        .single();

      if (error || !subtask) {
        return {
          canExecute: false,
          reason: '子任务不存在'
        };
      }

      // 如果子任务已经完成，不需要重复执行
      if (subtask.status === 'completed') {
        return {
          canExecute: false,
          reason: `子任务状态为 ${subtask.status}`
        };
      }
      
      // 🔧 修复并发控制：允许pending状态的任务执行，running状态由调用方处理
      // 这样并发控制逻辑可以在任务处理器层面统一管理

      // 使用数据库中的依赖解析状态
      if (subtask.dependencies_resolved) {
        return {
          canExecute: true,
          reason: '所有依赖已解析'
        };
      }

      // 获取未解析的依赖关系
      const { data: unresolvedDependencies, error: depError } = await this.supabase
        .from('evaluation_result_dependencies')
        .select(`
          depends_on_evaluation_result_id,
          evaluation_results!depends_on_evaluation_result_id(id, status)
        `)
        .eq('evaluation_result_id', subtaskId)
        .eq('is_resolved', false);

      if (depError) {
        return {
          canExecute: false,
          reason: '检查依赖失败'
        };
      }

      if (!unresolvedDependencies || unresolvedDependencies.length === 0) {
        // 没有未解析的依赖，更新状态并允许执行
        await this.supabase
          .from('evaluation_results')
          .update({ dependencies_resolved: true })
          .eq('id', subtaskId);

        return {
          canExecute: true,
          reason: '无依赖关系'
        };
      }

      // 检查依赖的子任务状态
      const incompleteDependencies = unresolvedDependencies.filter(dep =>
        dep.evaluation_results?.status !== 'completed'
      );

      if (incompleteDependencies.length > 0) {
        return {
          canExecute: false,
          reason: '依赖的子任务尚未完成',
          dependsOn: incompleteDependencies.map(dep => dep.depends_on_evaluation_result_id)
        };
      }

      // 所有依赖都已完成，更新状态
      await this.supabase
        .from('evaluation_results')
        .update({ dependencies_resolved: true })
        .eq('id', subtaskId);

      return {
        canExecute: true,
        reason: '所有依赖已满足'
      };
    } catch (error) {
      console.error('检查子任务执行条件失败:', error);
      return {
        canExecute: false,
        reason: '检查失败'
      };
    }
  }

  /**
   * 获取CODE评分器的执行结果，供PROMPT评分器使用
   */
  async getCodeExecutionResult(taskId: string, testCaseId: string, modelId: string): Promise<any> {
    try {
      // 使用新的数据库视图获取完整的执行信息
      const { data: codeResults, error } = await this.supabase
        .from('evaluation_result_execution_view')
        .select('*')
        .eq('task_id', taskId)
        .eq('test_case_id', testCaseId)
        .eq('model_id', modelId)
        .eq('evaluator_type', 'CODE')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !codeResults || codeResults.length === 0) {
        console.log(`⚠️ 未找到CODE执行结果: task=${taskId}, testCase=${testCaseId}, model=${modelId}`);
        return null;
      }

      const codeResult = codeResults[0];

      // 构造完整的代码执行结果对象，供PROMPT评分器使用
      return {
        stdout: codeResult.stdout || '',
        stderr: codeResult.stderr || '',
        execution_status: codeResult.status === 'completed' ? 'success' : 'failed',
        execution_time_ms: codeResult.code_execution_time_ms || 0,
        memory_usage_mb: codeResult.memory_usage_mb,
        exit_code: codeResult.exit_code,
        test_results: codeResult.test_results || {
          passed: 0,
          total: 0,
          syntax_correct: false,
          functional_correct: false
        },
        files_created: codeResult.files_created || [],
        sandbox_id: codeResult.sandbox_id,
        debug_info: {
          session_logs: codeResult.session_logs || [],
          environment_vars: codeResult.environment_vars || {},
          working_directory: codeResult.working_directory || '/tmp',
          python_version: codeResult.python_version,
          installed_packages: codeResult.installed_packages || []
        },
        // 评测结果信息
        evaluation_result: {
          success: codeResult.status === 'completed',
          score: codeResult.score,
          justification: codeResult.justification,
          model_response: codeResult.model_response,
          created_at: codeResult.created_at,
          evaluator_id: codeResult.evaluator_id
        }
      };
    } catch (error) {
      console.error('获取CODE执行结果失败:', error);
      return null;
    }
  }

  /**
   * 计算执行顺序
   */
  private calculateExecutionOrder(subtasks: SubTaskDependency[]): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (subtaskId: string) => {
      if (visiting.has(subtaskId)) {
        throw new Error('检测到循环依赖');
      }
      
      if (visited.has(subtaskId)) {
        return;
      }

      visiting.add(subtaskId);
      
      const subtask = subtasks.find(s => s.subtask_id === subtaskId);
      if (subtask) {
        for (const depId of subtask.depends_on_subtasks) {
          visit(depId);
        }
      }

      visiting.delete(subtaskId);
      visited.add(subtaskId);
      order.push(subtaskId);
    };

    // 按优先级排序，然后进行拓扑排序
    const sortedSubtasks = [...subtasks].sort((a, b) => a.priority - b.priority);
    
    for (const subtask of sortedSubtasks) {
      if (!visited.has(subtask.subtask_id)) {
        visit(subtask.subtask_id);
      }
    }

    return order;
  }

  /**
   * 映射子任务状态
   */
  private mapSubtaskStatus(status: string): SubTaskDependency['status'] {
    switch (status) {
      case 'pending': return 'pending';
      case 'running': return 'running';
      case 'completed': return 'completed';
      case 'failed': return 'failed';
      default: return 'pending';
    }
  }
}

// 导出单例实例
export const evaluatorDependencyManager = new EvaluatorDependencyManager();
