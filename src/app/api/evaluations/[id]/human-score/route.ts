import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

interface Context {
  params: Promise<{ id: string }>;
}

interface HumanScoreRequest {
  score: number;
  reasoning: string;
  evaluator_id?: number;
}

/**
 * POST /api/evaluations/[id]/human-score - 提交人工评分
 */
export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const evaluationResultId = parseInt(id);
    
    if (isNaN(evaluationResultId)) {
      return NextResponse.json(
        { error: '无效的评测结果ID' },
        { status: 400 }
      );
    }

    const body: HumanScoreRequest = await request.json();
    const { score, reasoning } = body;

    // 验证输入数据
    if (typeof score !== 'number' || isNaN(score)) {
      return NextResponse.json(
        { error: '评分必须是有效数字' },
        { status: 400 }
      );
    }

    if (!reasoning || typeof reasoning !== 'string' || !reasoning.trim()) {
      return NextResponse.json(
        { error: '评分理由不能为空' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 获取评测结果信息以验证是否存在且为HUMAN类型
    const { data: evaluationResult, error: getError } = await supabase
      .from('evaluation_results')
      .select(`
        id,
        status,
        evaluator_id,
        score,
        metadata,
        evaluators!inner(type, name, config)
      `)
      .eq('id', evaluationResultId)
      .single();

    if (getError) {
      console.error('获取评测结果失败:', getError);
      return NextResponse.json(
        { error: '获取评测结果失败' },
        { status: 500 }
      );
    }

    if (!evaluationResult) {
      return NextResponse.json(
        { error: '评测结果不存在' },
        { status: 404 }
      );
    }

    // 🔧 修复：允许所有类型的评分器进行人工评分覆盖（不再限制只有HUMAN类型）
    // 对于有问题的AI评分，也允许人工干预修正
    console.log('允许人工评分覆盖:', {
      evaluatorType: evaluationResult.evaluators.type,
      evaluatorName: evaluationResult.evaluators.name,
      evaluationId: evaluationResultId
    });

    // 验证评分范围（如果评分器配置中有范围限制）
    const evaluatorConfig = evaluationResult.evaluators.config as any;
    if (evaluatorConfig?.scoring_scale) {
      const { min, max } = evaluatorConfig.scoring_scale;
      if (score < min || score > max) {
        return NextResponse.json(
          { error: `评分必须在 ${min}-${max} 范围内` },
          { status: 400 }
        );
      }
    }

    // 更新评测结果
    const { data: updatedResult, error: updateError } = await supabase
      .from('evaluation_results')
      .update({
        score: score,
        reasoning: reasoning.trim(),
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // 🔧 使用metadata字段记录人工评分信息
        metadata: {
          ...(evaluationResult.metadata as Record<string, any> || {}),
          is_manual_score: true,
          manual_scored_at: new Date().toISOString(),
          original_score: evaluationResult.score,
          manual_override_reason: 'Manual scoring override'
        }
      })
      .eq('id', evaluationResultId)
      .select(`
        id,
        score,
        reasoning,
        status,
        completed_at,
        evaluators(name, type)
      `)
      .single();

    if (updateError) {
      console.error('更新评测结果失败:', updateError);
      return NextResponse.json(
        { error: '保存评分失败' },
        { status: 500 }
      );
    }

    // 记录操作日志
    console.log(`✅ 人工评分已保存: 结果ID=${evaluationResultId}, 评分=${score}`);

    return NextResponse.json({
      success: true,
      message: '人工评分已成功保存',
      data: {
        id: updatedResult.id,
        score: updatedResult.score,
        reasoning: updatedResult.reasoning,
        status: updatedResult.status,
        completed_at: updatedResult.completed_at,
        evaluator_name: updatedResult.evaluators?.name,
        evaluator_type: updatedResult.evaluators?.type
      }
    });

  } catch (error) {
    console.error('提交人工评分异常:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/evaluations/[id]/human-score - 获取人工评分详情
 */
export async function GET(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const evaluationResultId = parseInt(id);
    
    if (isNaN(evaluationResultId)) {
      return NextResponse.json(
        { error: '无效的评测结果ID' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 获取人工评分详情
    const { data: evaluationResult, error: getError } = await supabase
      .from('evaluation_results')
      .select(`
        id,
        score,
        reasoning,
        status,
        created_at,
        completed_at,
        metadata,
        evaluators!inner(type, name, config),
        test_cases(input, reference_answer),
        models(name, provider)
      `)
      .eq('id', evaluationResultId)
      .single();

    if (getError) {
      console.error('获取评测结果失败:', getError);
      return NextResponse.json(
        { error: '获取评测结果失败' },
        { status: 500 }
      );
    }

    if (!evaluationResult) {
      return NextResponse.json(
        { error: '评测结果不存在' },
        { status: 404 }
      );
    }

    // 🔧 修复：允许所有类型的评分器查看人工评分覆盖状态
    console.log('获取人工评分详情:', {
      evaluatorType: evaluationResult.evaluators.type,
      evaluatorName: evaluationResult.evaluators.name,
      evaluationId: evaluationResultId
    });

    // 构建响应数据
    const response = {
      evaluation_result: {
        id: evaluationResult.id,
        score: evaluationResult.score,
        reasoning: evaluationResult.reasoning,
        status: evaluationResult.status,
        created_at: evaluationResult.created_at,
        completed_at: evaluationResult.completed_at,
        metadata: evaluationResult.metadata,
        test_case_input: evaluationResult.test_cases?.input,
        reference_answer: evaluationResult.test_cases?.reference_answer,
        model_name: evaluationResult.models?.name,
        model_provider: evaluationResult.models?.provider,
        evaluator_name: evaluationResult.evaluators?.name,
        evaluator_config: evaluationResult.evaluators?.config
      },
      human_scoring_details: {
        scoring_scale: evaluationResult.evaluators?.config?.scoring_scale || {
          min: 0,
          max: 100,
          step: 1
        },
        guidelines: evaluationResult.evaluators?.config?.guidelines || '',
        scoring_criteria: evaluationResult.evaluators?.config?.scoring_criteria || [],
        required_qualifications: evaluationResult.evaluators?.config?.required_qualifications || []
      }
    };

    return NextResponse.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('获取人工评分详情异常:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}