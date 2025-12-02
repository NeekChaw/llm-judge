import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { CreateTaskRequest, EvaluationTask, TaskStatus, TaskPriority } from '@/types/task';
import { addEvaluationTask } from '@/lib/queue';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';
import { generateSubTasksForTask } from '@/lib/subtask-generator';
import { getTaskProcessorService } from '@/lib/task-processor';

/**
 * GET /api/tasks - 获取任务列表
 */
export const GET = withMonitoring('tasks_list', async (request: NextRequest) => {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') as TaskStatus | null;
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || ''; // 🆕 任务类型筛选

    // 构建查询 - 根据实际数据库结构修正
    let query = supabase
      .from('evaluation_tasks')
      .select('*')
      .order('created_at', { ascending: false });

    // 添加状态筛选
    if (status) {
      query = query.eq('status', status);
    }

    // 添加搜索条件
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // 🔧 修复：获取所有数据，在应用层面处理分页和筛选
    const { data: tasks, error } = await query;

    if (error) {
      console.error('Tasks query error:', error);
      return NextResponse.json({ error: '获取任务列表失败' }, { status: 500 });
    }

    // 格式化任务数据，添加进度信息
    const formattedTasks = await Promise.all(
      (tasks || []).map(async (task) => {
        // 获取任务进度统计
        const { data: results } = await supabase
          .from('evaluation_results')
          .select('status')
          .eq('task_id', task.id);

        const total = results?.length || 0;
        const success = results?.filter(r => r.status === 'completed').length || 0;
        const failed = results?.filter(r => r.status === 'failed').length || 0;
        // completed 表示已执行完毕的任务数（成功+失败）
        const completed = success + failed;

        // 从config中提取模板和模型信息
        const config = task.config || {};

        return {
          ...task,
          template_id: task.template_id || config.template_id || null, // 优先使用主字段，兼容旧数据
          model_ids: config.model_ids || [],
          test_case_ids: config.test_case_ids || [],
          progress: {
            total,
            completed, // 已执行完毕的任务数（成功+失败）
            success,   // 成功的任务数
            failed,    // 失败的任务数
          },
        };
      })
    );

    // 🆕 根据任务类型筛选
    let filteredTasks = formattedTasks;
    if (type === 'single') {
      filteredTasks = formattedTasks.filter(task => {
        const runCount = task.config?.run_count || 1;
        return runCount === 1;
      });
    } else if (type === 'multi') {
      filteredTasks = formattedTasks.filter(task => {
        const runCount = task.config?.run_count || 1;
        return runCount > 1;
      });
    }

    // 🔧 修复分页逻辑：先筛选，再分页
    const totalFiltered = filteredTasks.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTasks = filteredTasks.slice(startIndex, endIndex);

    // 🆕 计算统计数据（基于筛选后的所有任务）
    const stats = filteredTasks.reduce((acc, task) => {
      acc.total++;
      if (task.status === 'running') acc.running++;
      else if (task.status === 'completed') acc.completed++;
      else if (task.status === 'failed') acc.failed++;
      else if (task.status === 'pending') acc.pending++;
      else if (task.status === 'cancelled') acc.cancelled++;
      return acc;
    }, { total: 0, running: 0, completed: 0, failed: 0, pending: 0, cancelled: 0 });

    return NextResponse.json({
      tasks: paginatedTasks,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit),
      },
      stats, // 🆕 返回统计数据
    });
  } catch (error) {
    console.error('获取任务列表失败:', error);
    return NextResponse.json(
      { error: '获取任务列表失败' },
      { status: 500 }
    );
  }
});

/**
 * POST /api/tasks - 创建新任务
 */
export const POST = withMonitoring('tasks_create', async (request: NextRequest) => {
  try {
    const supabase = createClient();
    const body: CreateTaskRequest = await request.json();

    // 验证必填字段
    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: '任务名称不能为空' },
        { status: 400 }
      );
    }

    if (!body.template_id?.trim()) {
      return NextResponse.json(
        { error: '模板ID不能为空' },
        { status: 400 }
      );
    }

    // 对于统一模板，需要验证测试用例选择
    // 对于自定义模板，测试用例在模板中预定义
    if (!body.test_case_ids?.length) {
      // 如果没有提供测试用例ID，检查是否是自定义模板
      // 先获取模板信息来确定类型（这里暂时跳过验证，稍后会验证模板）
    }

    if (!body.model_ids?.length) {
      return NextResponse.json(
        { error: '至少需要选择一个模型' },
        { status: 400 }
      );
    }

    // 验证template_id是否存在，并获取模板类型
    const { data: template } = await supabase
      .from('templates')
      .select('id, name, template_type')
      .eq('id', body.template_id)
      .single();

    if (!template) {
      return NextResponse.json(
        { error: '指定的模板不存在' },
        { status: 400 }
      );
    }

    // 处理测试用例验证：根据模板类型决定验证策略
    let finalTestCaseIds = body.test_case_ids;

    if (template.template_type === 'custom') {
      // 自定义模板：从模板配置中获取测试用例
      if (!body.test_case_ids?.length) {
        // 如果前端没有提供测试用例，从模板的custom_mappings中提取
        const { data: customMappings } = await supabase
          .from('template_custom_mappings')
          .select('test_case_ids')
          .eq('template_id', body.template_id);

        if (customMappings && customMappings.length > 0) {
          // 合并所有维度的测试用例ID
          const allTestCaseIds = new Set<string>();
          customMappings.forEach(mapping => {
            if (mapping.test_case_ids && Array.isArray(mapping.test_case_ids)) {
              mapping.test_case_ids.forEach(id => allTestCaseIds.add(id));
            }
          });
          finalTestCaseIds = Array.from(allTestCaseIds);
        }
      }
    } else {
      // 统一模板：必须提供测试用例
      if (!body.test_case_ids?.length) {
        return NextResponse.json(
          { error: '统一模板需要选择测试用例' },
          { status: 400 }
        );
      }
    }

    // 验证最终的测试用例ID是否存在
    if (!finalTestCaseIds?.length) {
      return NextResponse.json(
        { error: '没有找到有效的测试用例' },
        { status: 400 }
      );
    }

    const { data: testCases } = await supabase
      .from('test_cases')
      .select('id')
      .in('id', finalTestCaseIds);

    if (!testCases || testCases.length !== finalTestCaseIds.length) {
      return NextResponse.json(
        { error: '部分测试用例不存在' },
        { status: 400 }
      );
    }

    // 验证model_ids是否存在
    const { data: models } = await supabase
      .from('models')
      .select('id')
      .in('id', body.model_ids);

    if (!models || models.length !== body.model_ids.length) {
      return NextResponse.json(
        { error: '部分模型不存在' },
        { status: 400 }
      );
    }

    // 🆕 验证多次运行配置
    const runCount = body.config?.run_count || 1;
    if (runCount < 1 || runCount > 10) {
      return NextResponse.json(
        { error: '运行次数必须在1-10之间' },
        { status: 400 }
      );
    }

    const humanEvaluationMode = body.config?.human_evaluation_mode || 'independent';
    if (!['independent', 'shared'].includes(humanEvaluationMode)) {
      return NextResponse.json(
        { error: '人工评分模式必须是 independent 或 shared' },
        { status: 400 }
      );
    }

    // 创建任务配置，使用最终确定的测试用例ID
    const taskConfig = {
      template_id: body.template_id,
      test_case_ids: finalTestCaseIds, // 使用经过验证的测试用例ID
      model_ids: body.model_ids,
      concurrent_limit: body.config?.concurrent_limit || 10,
      timeout: body.config?.timeout || 300,
      retry_count: body.config?.retry_count || 3,
      // 只有在明确提供max_tokens时才添加，否则允许无限制输出
      ...(body.config?.max_tokens ? { max_tokens: body.config.max_tokens } : {}),
      // 🆕 多次运行配置
      run_count: runCount,
      human_evaluation_mode: humanEvaluationMode,
      // 🆕 模型默认配置支持
      use_model_defaults: body.config?.use_model_defaults,
      // 如果不使用模型默认配置，则保存用户自定义配置
      ...(!body.config?.use_model_defaults && {
        temperature: body.config?.temperature,
        thinking_budget: body.config?.thinking_budget,
      }),
    };

    // 保存任务到数据库
    const { data: task, error: taskError } = await supabase
      .from('evaluation_tasks')
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() || null,
        system_prompt: body.system_prompt?.trim() || null,
        template_id: body.template_id, // 修复：将template_id存储到主字段
        status: TaskStatus.PENDING,
        config: taskConfig,
      })
      .select()
      .single();

    if (taskError) {
      console.error('Task creation error:', taskError);
      return NextResponse.json(
        { error: '创建任务失败' },
        { status: 500 }
      );
    }

    // 创建完整的任务对象，使用最终确定的测试用例ID
    const evaluationTask: EvaluationTask = {
      id: task.id,
      name: task.name,
      template_id: body.template_id,
      test_case_ids: finalTestCaseIds, // 使用经过验证的测试用例ID
      model_ids: body.model_ids,
      status: TaskStatus.PENDING,
      priority: body.priority || TaskPriority.NORMAL,
      created_at: task.created_at,
      progress: {
        total: 0, // 将在Worker中计算
        completed: 0,
        failed: 0,
      },
      config: {
        concurrent_limit: body.config?.concurrent_limit || 10,
        timeout: body.config?.timeout || 300,
        retry_count: body.config?.retry_count || 3,
        // 只有在明确提供max_tokens时才添加到返回对象
        ...(body.config?.max_tokens ? { max_tokens: body.config.max_tokens } : {}),
        // 🆕 多次运行配置
        run_count: runCount,
        human_evaluation_mode: humanEvaluationMode,
        // 🆕 模型默认配置支持
        use_model_defaults: body.config?.use_model_defaults,
        // 如果不使用模型默认配置，则保存用户自定义配置
        ...(!body.config?.use_model_defaults && {
          temperature: body.config?.temperature,
          thinking_budget: body.config?.thinking_budget,
        }),
      },
    };

    // 🔥 使用统一的任务处理器系统
    console.log(`🔧 开始处理任务 ${task.id}...`);

    try {
      const processorService = getTaskProcessorService();

      // 检查处理器是否已初始化
      const currentMode = processorService.getCurrentMode();
      if (!currentMode) {
        // 如果处理器未初始化，使用传统方式
        console.log('⚠️ 处理器未初始化，使用传统子任务生成方式');
        const subtaskResult = await generateSubTasksForTask(task.id);

        if (!subtaskResult.success) {
          console.error(`❌ 子任务生成失败: ${subtaskResult.error}`);
          return NextResponse.json({
            error: `任务创建成功，但子任务生成失败: ${subtaskResult.error}`,
            task_id: task.id,
          }, { status: 500 });
        }

        return NextResponse.json({
          task: {
            ...evaluationTask,
            status: 'running',
            subtasks_created: subtaskResult.subtasks_created,
          },
          message: `任务创建成功，已生成 ${subtaskResult.subtasks_created} 个子任务 (传统模式)`,
        }, { status: 201 });
      }

      // 使用统一处理器处理任务
      console.log(`📋 使用${currentMode}模式处理器处理任务`);
      
      // 创建处理器兼容的任务数据结构，使用最终确定的测试用例ID
      const taskDataForProcessor = {
        ...evaluationTask,
        status: 'pending' as const, // 确保状态类型匹配
        config: {
          ...evaluationTask.config,
          template_id: body.template_id,
          model_ids: body.model_ids,
          test_case_ids: finalTestCaseIds, // 使用经过验证的测试用例ID
          // 确保模型默认配置字段传递给处理器
          use_model_defaults: body.config?.use_model_defaults,
          ...(!body.config?.use_model_defaults && {
            temperature: body.config?.temperature,
            thinking_budget: body.config?.thinking_budget,
          }),
        }
      };
      
      const processingResult = await processorService.processTask(taskDataForProcessor);

      if (!processingResult.success) {
        console.error(`❌ 任务处理失败: ${processingResult.error}`);
        return NextResponse.json({
          error: `任务创建成功，但处理失败: ${processingResult.error}`,
          task_id: task.id,
        }, { status: 500 });
      }

      console.log(`✅ 任务处理成功: ${task.id} (${currentMode}模式)`);

      return NextResponse.json({
        task: {
          ...evaluationTask,
          status: 'running',
          subtasks_created: processingResult.subtasks_created,
          processor_mode: currentMode,
        },
        message: `任务创建成功，使用${currentMode}模式处理`,
      }, { status: 201 });

    } catch (processorError) {
      console.error('❌ 处理器处理失败，降级到传统模式:', processorError);

      // 降级到传统子任务生成方式
      const subtaskResult = await generateSubTasksForTask(task.id);

      if (!subtaskResult.success) {
        return NextResponse.json({
          error: `任务创建成功，但子任务生成失败: ${subtaskResult.error}`,
          task_id: task.id,
        }, { status: 500 });
      }

      return NextResponse.json({
        task: {
          ...evaluationTask,
          status: 'running',
          subtasks_created: subtaskResult.subtasks_created,
        },
        message: `任务创建成功，已生成 ${subtaskResult.subtasks_created} 个子任务 (降级模式)`,
      }, { status: 201 });
    }
  } catch (error) {
    console.error('创建任务失败:', error);
    return NextResponse.json(
      { error: '创建任务失败' },
      { status: 500 }
    );
  }
});