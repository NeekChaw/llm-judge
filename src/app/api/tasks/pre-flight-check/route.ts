import { NextRequest, NextResponse } from 'next/server';
import { TaskHealthChecker } from '@/lib/task-health-checker';
import { createClient } from '@/lib/supabase';
import { extractLogicalName } from '@/lib/model-utils';

interface PreFlightRequest {
  model_ids: string[];
  timeout_ms?: number;
  include_detailed_results?: boolean;
}

/**
 * POST /api/tasks/pre-flight-check
 * 任务创建前的模型健康检查API
 */
export async function POST(request: NextRequest) {
  try {
    const body: PreFlightRequest = await request.json();
    
    // 验证请求
    if (!body.model_ids || !Array.isArray(body.model_ids) || body.model_ids.length === 0) {
      return NextResponse.json({
        error: '无效的模型ID列表'
      }, { status: 400 });
    }

    // 🔧 移除硬性限制，改为分批处理
    console.log(`🔍 开始预检查 ${body.model_ids.length} 个模型，将自动分批处理`);

    if (body.model_ids.length > 100) {
      return NextResponse.json({
        error: '模型数量过多，建议控制在100个以内以确保合理的响应时间'
      }, { status: 400 });
    }
    
    const checker = new TaskHealthChecker();
    const timeoutMs = body.timeout_ms || 30000; // 默认30秒

    // 🔧 实现分批处理逻辑
    const result = await performBatchHealthCheck(checker, body.model_ids, timeoutMs);

    // 🔧 修复：按逻辑模型组聚合健康检查结果
    const groupedResults = await groupHealthCheckResultsByLogicalModel(body.model_ids, result);

    // 构建响应
    const response: any = {
      success: result.overall_success,
      summary: {
        total_models: groupedResults.logicalGroupCount, // 🔧 使用逻辑组数量
        healthy_models: groupedResults.healthyGroupCount,
        unhealthy_models: groupedResults.unhealthyGroupCount,
        success_rate: Math.round((groupedResults.healthyGroupCount / groupedResults.logicalGroupCount) * 100)
      },
      healthy_models: result.healthy_models,
      unhealthy_models: result.unhealthy_models,
      recommendations: result.recommendations,
      timestamp: new Date().toISOString(),
      // 🔧 新增：逻辑模型组信息
      logical_model_groups: groupedResults.logicalGroups
    };
    
    // 如果请求详细结果，包含详细检查数据
    if (body.include_detailed_results) {
      response.detailed_results = result.detailed_results;
    }
    
    // 始终返回200状态码，让前端根据成功率决定如何展示
    // 503状态码会导致前端抛出错误，阻止用户查看详细结果
    return NextResponse.json(response, { status: 200 });
    
  } catch (error: any) {
    console.error('预检查失败:', error);
    
    return NextResponse.json({
      error: '预检查执行失败',
      details: error.message,
      success: false
    }, { status: 500 });
  }
}

/**
 * GET /api/tasks/pre-flight-check
 * 获取预检查功能信息
 */
export async function GET() {
  return NextResponse.json({
    name: '任务预检查服务',
    description: '在创建评测任务前检查模型健康状态，降低任务失败率',
    version: '1.0.0',
    features: [
      '模型连通性检测',
      '响应时间测试',
      '并发健康检查',
      '智能故障诊断',
      '改进建议生成',
      '自动分批处理（支持大量模型）'
    ],
    usage: {
      endpoint: 'POST /api/tasks/pre-flight-check',
      parameters: {
        model_ids: 'string[] - 要检查的模型ID列表',
        timeout_ms: 'number? - 单个模型检查超时时间（默认30000ms）',
        include_detailed_results: 'boolean? - 是否包含详细检查结果'
      }
    },
    limits: {
      max_models_per_request: 100,
      batch_size: 20,
      default_timeout: 30000,
      max_timeout: 120000
    }
  });
}

/**
 * 🔧 新增：按逻辑模型组聚合健康检查结果
 */
async function groupHealthCheckResultsByLogicalModel(modelIds: string[], healthCheckResult: any) {
  const supabase = createClient();

  // 获取所有模型的详细信息
  const { data: models, error } = await supabase
    .from('models')
    .select('id, name, logical_name, provider')
    .in('id', modelIds);

  if (error || !models) {
    console.error('获取模型信息失败:', error);
    // 降级：把每个模型都当作独立的逻辑组
    return {
      logicalGroupCount: modelIds.length,
      healthyGroupCount: healthCheckResult.healthy_models.length,
      unhealthyGroupCount: healthCheckResult.unhealthy_models.length,
      logicalGroups: []
    };
  }

  // 按逻辑名称分组
  const groups = new Map<string, any[]>();

  for (const model of models) {
    const logicalName = model.logical_name || extractLogicalName(model.name);
    if (!groups.has(logicalName)) {
      groups.set(logicalName, []);
    }
    groups.get(logicalName)!.push(model);
  }

  // 为每个逻辑组计算健康状态
  const logicalGroups = [];
  let healthyGroupCount = 0;
  let unhealthyGroupCount = 0;

  for (const [logicalName, groupModels] of groups.entries()) {
    const groupModelIds = groupModels.map(m => m.id);

    // 检查组内是否有至少一个健康的模型
    const hasHealthyModel = groupModelIds.some(id =>
      healthCheckResult.healthy_models.includes(id)
    );

    // 获取组内所有模型的检查结果
    const groupResults = healthCheckResult.detailed_results.filter(
      (result: any) => groupModelIds.includes(result.model_id)
    );

    // 选择最好的提供商结果作为代表
    const bestResult = groupResults.find((r: any) => r.success) || groupResults[0];

    const logicalGroup = {
      logical_name: logicalName,
      provider_count: groupModels.length,
      providers: groupModels.map(m => m.provider),
      is_healthy: hasHealthyModel,
      best_provider: bestResult ? {
        provider: bestResult.provider,
        response_time: bestResult.response_time,
        success: bestResult.success,
        error: bestResult.error
      } : null,
      all_results: groupResults
    };

    logicalGroups.push(logicalGroup);

    if (hasHealthyModel) {
      healthyGroupCount++;
    } else {
      unhealthyGroupCount++;
    }
  }

  console.log(`🔧 健康检查结果聚合: ${modelIds.length}个物理实例 -> ${groups.size}个逻辑组`);
  console.log(`   健康逻辑组: ${healthyGroupCount}, 异常逻辑组: ${unhealthyGroupCount}`);

  return {
    logicalGroupCount: groups.size,
    healthyGroupCount,
    unhealthyGroupCount,
    logicalGroups
  };
}

/**
 * 🔧 新增：分批处理健康检查
 * 自动将大量模型分成小批次进行检查，然后聚合结果
 */
async function performBatchHealthCheck(checker: any, modelIds: string[], timeoutMs: number) {
  const BATCH_SIZE = 20; // 每批次最多20个模型
  const batches: string[][] = [];

  // 将模型ID分成批次
  for (let i = 0; i < modelIds.length; i += BATCH_SIZE) {
    batches.push(modelIds.slice(i, i + BATCH_SIZE));
  }

  console.log(`🔍 开始分批检查 ${modelIds.length} 个模型，分为 ${batches.length} 个批次`);

  // 并行处理所有批次
  const batchPromises = batches.map(async (batch, index) => {
    console.log(`📋 处理第 ${index + 1}/${batches.length} 批次 (${batch.length} 个模型)`);
    try {
      const batchResult = await checker.performPreFlightCheck(batch, timeoutMs);
      console.log(`✅ 第 ${index + 1} 批次完成`);
      return batchResult;
    } catch (error) {
      console.error(`❌ 第 ${index + 1} 批次失败:`, error);
      // 即使某个批次失败，也返回失败结果而不是抛出错误
      return {
        overall_success: false,
        healthy_models: [],
        unhealthy_models: batch, // 将整个批次标记为不健康
        recommendations: [`第 ${index + 1} 批次检查失败: ${error.message || error}`],
        detailed_results: batch.map(modelId => ({
          success: false,
          model_id: modelId,
          model_name: 'Unknown',
          provider: 'Unknown',
          response_time: 0,
          error: `批次检查失败: ${error.message || error}`
        }))
      };
    }
  });

  // 等待所有批次完成
  const batchResults = await Promise.all(batchPromises);

  // 聚合所有批次的结果
  const aggregatedResult = {
    overall_success: batchResults.some(r => r.overall_success),
    healthy_models: [] as string[],
    unhealthy_models: [] as string[],
    recommendations: [] as string[],
    detailed_results: [] as any[]
  };

  for (const batchResult of batchResults) {
    aggregatedResult.healthy_models.push(...(batchResult.healthy_models || []));
    aggregatedResult.unhealthy_models.push(...(batchResult.unhealthy_models || []));
    aggregatedResult.recommendations.push(...(batchResult.recommendations || []));
    aggregatedResult.detailed_results.push(...(batchResult.detailed_results || []));
  }

  // 更新整体成功状态
  aggregatedResult.overall_success = aggregatedResult.healthy_models.length > 0;

  // 添加分批处理的总结信息
  if (batches.length > 1) {
    aggregatedResult.recommendations.unshift(
      `完成分批检查：${batches.length} 个批次，共 ${modelIds.length} 个模型`
    );
  }

  console.log(`🎉 分批检查完成: 健康 ${aggregatedResult.healthy_models.length}，异常 ${aggregatedResult.unhealthy_models.length}`);

  return aggregatedResult;
}