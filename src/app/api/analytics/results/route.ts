import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

/**
 * GET /api/analytics/results - 获取结果探索数据
 * POST /api/analytics/results - 获取筛选选项或执行查询
 */

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    
    console.log('获取结果探索数据，查询参数:', Object.fromEntries(searchParams));

    // 获取评测结果数据，包含模型和维度信息
    const { data: results, error: resultsError } = await supabase
      .from('evaluation_results')
      .select(`
        id,
        score,
        status,
        created_at,
        execution_time,
        total_tokens,
        model_id,
        dimension_id,
        evaluation_tasks!inner(
          id,
          name,
          config
        ),
        models!inner(
          id,
          name,
          provider
        ),
        dimensions!inner(
          id,
          name,
          description
        )
      `)
      .not('score', 'is', null)
      .limit(100)
      .order('created_at', { ascending: false });

    if (resultsError) {
      console.error('获取评测结果失败:', resultsError);
      // 返回空数据而不是错误
      return NextResponse.json({
        success: true,
        data: [],
        meta: {
          current_page: 1,
          total_items: 0,
          total_pages: 0,
          items_per_page: 0
        },
        message: '暂无结果数据'
      });
    }

    // 处理数据格式，使用真实的模型和维度信息
    const formattedData = (results || []).map(result => {
      const task = result.evaluation_tasks;
      const model = result.models;
      const dimension = result.dimensions;
      
      // 使用真实的模型名称和提供商
      const modelName = model?.name || result.model_id || '未知模型';
      const modelDisplayName = getModelDisplayName(modelName);
      const modelProvider = model?.provider || getModelProvider(modelName);
      
      // 使用真实的维度名称
      const dimensionName = dimension?.name || '综合评估';
      
      return {
        result_id: result.id,
        task_name: task?.name || '未知任务',
        model_name: modelDisplayName,
        model_provider: modelProvider,
        dimension_name: dimensionName,
        normalized_score: result.score || 0,
        status: result.status || 'unknown',
        created_at: result.created_at,
        execution_time: result.execution_time,
        total_tokens: result.total_tokens
      };
    });

    console.log('结果探索数据处理完成，数量:', formattedData.length);

    return NextResponse.json({
      success: true,
      data: formattedData,
      meta: {
        current_page: 1,
        total_items: formattedData.length,
        total_pages: 1,
        items_per_page: Math.min(100, formattedData.length)
      }
    });

  } catch (error) {
    console.error('结果探索API错误:', error);
    
    // 返回空数据而不是500错误
    return NextResponse.json({
      success: true,
      data: [],
      meta: {
        current_page: 1,
        total_items: 0,
        total_pages: 0,
        items_per_page: 0
      },
      message: '获取数据时出现问题，请稍后重试'
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const body = await request.json();
    const { type } = body;

    console.log('POST请求类型:', type);

    if (type === 'models') {
      // 获取模型列表
      const { data: tasks } = await supabase
        .from('evaluation_tasks')
        .select('config')
        .not('config', 'is', null);

      const modelSet = new Set();
      tasks?.forEach(task => {
        const modelIds = task.config?.model_ids || [];
        modelIds.forEach(modelId => modelSet.add(modelId));
      });

      const models = Array.from(modelSet).map(modelId => ({
        id: modelId,
        name: modelId,
        provider: getModelProvider(modelId)
      }));

      return NextResponse.json({
        success: true,
        data: models
      });
    }

    if (type === 'tasks') {
      // 获取任务列表
      const { data: tasks } = await supabase
        .from('evaluation_tasks')
        .select('id, name, description')
        .limit(50);

      return NextResponse.json({
        success: true,
        data: tasks || []
      });
    }

    if (type === 'dimensions') {
      // 获取维度列表
      const { data: dimensions } = await supabase
        .from('evaluation_dimensions')
        .select('id, name, description')
        .limit(50);

      // 如果没有维度数据，返回默认维度
      const defaultDimensions = [
        { id: '1', name: '逻辑推理', description: '评估模型的逻辑推理能力' },
        { id: '2', name: '语言理解', description: '评估模型的语言理解能力' },
        { id: '3', name: '创意表达', description: '评估模型的创意表达能力' },
        { id: '4', name: '事实准确性', description: '评估模型回答的事实准确性' }
      ];

      return NextResponse.json({
        success: true,
        data: dimensions && dimensions.length > 0 ? dimensions : defaultDimensions
      });
    }

    return NextResponse.json({
      success: false,
      error: '未知的请求类型'
    }, { status: 400 });

  } catch (error) {
    console.error('结果探索POST API错误:', error);
    
    return NextResponse.json({
      success: true,
      data: [],
      message: '获取筛选选项时出现问题'
    });
  }
}

// 辅助函数：根据模型ID获取中文显示名称
function getModelDisplayName(modelId: string): string {
  const lowerModelId = modelId.toLowerCase();

  // 中文显示名称映射
  if (lowerModelId.includes('gpt-4')) return 'GPT-4';
  if (lowerModelId.includes('gpt-3.5-turbo')) return 'GPT-3.5 Turbo';
  if (lowerModelId.includes('gpt-3.5')) return 'GPT-3.5';
  if (lowerModelId.includes('claude-3-opus')) return 'Claude-3 Opus';
  if (lowerModelId.includes('claude-3-sonnet')) return 'Claude-3 Sonnet';
  if (lowerModelId.includes('claude-3-haiku')) return 'Claude-3 Haiku';
  if (lowerModelId.includes('claude-3')) return 'Claude-3';
  if (lowerModelId.includes('claude-2')) return 'Claude-2';
  if (lowerModelId.includes('claude')) return 'Claude';
  if (lowerModelId.includes('deepseek-v3')) return 'DeepSeek-V3';
  if (lowerModelId.includes('deepseek-v2')) return 'DeepSeek-V2';
  if (lowerModelId.includes('deepseek')) return 'DeepSeek';
  if (lowerModelId.includes('gemini-pro')) return 'Gemini Pro';
  if (lowerModelId.includes('gemini-ultra')) return 'Gemini Ultra';
  if (lowerModelId.includes('gemini')) return 'Gemini';
  if (lowerModelId.includes('llama-2-70b')) return 'Llama 2 70B';
  if (lowerModelId.includes('llama-2-13b')) return 'Llama 2 13B';
  if (lowerModelId.includes('llama-2-7b')) return 'Llama 2 7B';
  if (lowerModelId.includes('llama-2')) return 'Llama 2';
  if (lowerModelId.includes('llama')) return 'Llama';
  if (lowerModelId.includes('qwen-max')) return '通义千问 Max';
  if (lowerModelId.includes('qwen-plus')) return '通义千问 Plus';
  if (lowerModelId.includes('qwen-turbo')) return '通义千问 Turbo';
  if (lowerModelId.includes('qwen')) return '通义千问';
  if (lowerModelId.includes('chatglm')) return 'ChatGLM';
  if (lowerModelId.includes('baichuan')) return '百川';

  // 如果没有匹配到，返回格式化的原始ID
  return modelId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// 辅助函数：根据模型ID获取提供商
function getModelProvider(modelId: string): string {
  if (modelId.includes('gpt')) return 'OpenAI';
  if (modelId.includes('claude')) return 'Anthropic';
  if (modelId.includes('deepseek')) return '硅基流动';
  if (modelId.includes('gemini')) return 'Google';
  if (modelId.includes('llama')) return 'Meta';
  if (modelId.includes('qwen')) return '阿里巴巴';
  if (modelId.includes('chatglm')) return '智谱AI';
  if (modelId.includes('baichuan')) return '百川智能';
  return '未知';
}
