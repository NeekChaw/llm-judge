import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { CodeScoringRules, SCORING_TEMPLATES, DEFAULT_SCORING_RULES } from '@/lib/e2b/scoring-rules';

/**
 * 获取评分规则
 * GET /api/scoring-rules
 * GET /api/scoring-rules?evaluator_id=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const evaluatorId = searchParams.get('evaluator_id');
    const templateName = searchParams.get('template');

    // 如果请求模板，返回预设模板
    if (templateName) {
      if (templateName === 'all') {
        return NextResponse.json({
          success: true,
          data: {
            templates: SCORING_TEMPLATES,
            default: DEFAULT_SCORING_RULES
          }
        });
      }

      const template = SCORING_TEMPLATES[templateName];
      if (!template) {
        return NextResponse.json({
          success: false,
          error: '模板不存在'
        }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: template
      });
    }

    // 如果指定了评分器ID，获取该评分器的自定义规则
    if (evaluatorId) {
      const { data, error } = await supabase
        .from('evaluators')
        .select('config')
        .eq('id', evaluatorId)
        .eq('type', 'CODE')
        .single();

      if (error) {
        return NextResponse.json({
          success: false,
          error: '获取评分器配置失败'
        }, { status: 500 });
      }

      // 检查是否有自定义评分规则
      const customRules = data.config?.scoringRules;
      const rules = customRules || DEFAULT_SCORING_RULES;

      return NextResponse.json({
        success: true,
        data: {
          rules,
          isCustom: !!customRules,
          evaluatorId
        }
      });
    }

    // 返回默认规则和所有模板
    return NextResponse.json({
      success: true,
      data: {
        default: DEFAULT_SCORING_RULES,
        templates: SCORING_TEMPLATES
      }
    });

  } catch (error) {
    console.error('获取评分规则失败:', error);
    return NextResponse.json({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 });
  }
}

/**
 * 更新评分规则
 * PUT /api/scoring-rules
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { evaluatorId, rules } = body;

    if (!evaluatorId || !rules) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数'
      }, { status: 400 });
    }

    // 验证评分规则格式
    if (!isValidScoringRules(rules)) {
      return NextResponse.json({
        success: false,
        error: '评分规则格式无效'
      }, { status: 400 });
    }

    // 获取当前评分器配置
    const { data: currentData, error: fetchError } = await supabase
      .from('evaluators')
      .select('config')
      .eq('id', evaluatorId)
      .eq('type', 'CODE')
      .single();

    if (fetchError) {
      return NextResponse.json({
        success: false,
        error: '获取评分器配置失败'
      }, { status: 500 });
    }

    // 更新配置中的评分规则
    const updatedConfig = {
      ...currentData.config,
      scoringRules: rules
    };

    const { error: updateError } = await supabase
      .from('evaluators')
      .update({ config: updatedConfig })
      .eq('id', evaluatorId);

    if (updateError) {
      return NextResponse.json({
        success: false,
        error: '更新评分规则失败'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        evaluatorId,
        rules,
        message: '评分规则更新成功'
      }
    });

  } catch (error) {
    console.error('更新评分规则失败:', error);
    return NextResponse.json({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 });
  }
}

/**
 * 预览评分规则变更影响
 * POST /api/scoring-rules/preview
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { evaluatorId, newRules, taskId, limit = 10 } = body;

    if (!evaluatorId || !newRules) {
      return NextResponse.json({
        success: false,
        error: '缺少必要参数'
      }, { status: 400 });
    }

    // 这里应该实现预览逻辑
    // 1. 获取历史执行结果
    // 2. 使用新规则重新计算评分
    // 3. 比较差异

    // 暂时返回模拟数据
    const previewResult = {
      affectedResults: [
        {
          taskId: 'task-1',
          subtaskId: 'subtask-1',
          currentScore: 75,
          previewScore: 82,
          scoreDiff: 7,
          significantChanges: ['功能评分权重增加', '性能加分启用']
        }
      ],
      summary: {
        totalAffected: 1,
        averageScoreDiff: 7,
        maxScoreDiff: 7,
        minScoreDiff: 7
      }
    };

    return NextResponse.json({
      success: true,
      data: previewResult
    });

  } catch (error) {
    console.error('预览评分规则变更失败:', error);
    return NextResponse.json({
      success: false,
      error: '服务器内部错误'
    }, { status: 500 });
  }
}

/**
 * 验证评分规则格式
 */
function isValidScoringRules(rules: any): rules is CodeScoringRules {
  if (!rules || typeof rules !== 'object') return false;

  const requiredFields = ['syntax', 'functional', 'performance', 'memory'];
  for (const field of requiredFields) {
    if (!rules[field] || typeof rules[field] !== 'object') return false;
    
    const rule = rules[field];
    if (typeof rule.enabled !== 'boolean' ||
        typeof rule.weight !== 'number' ||
        typeof rule.maxScore !== 'number' ||
        !rule.config) {
      return false;
    }
  }

  return true;
}
