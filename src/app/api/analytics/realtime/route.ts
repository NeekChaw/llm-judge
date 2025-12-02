import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { withMonitoring } from '@/lib/monitoring';

/**
 * GET /api/analytics/realtime - 获取实时分析数据
 */
export const GET = withMonitoring('analytics_realtime', async (request: NextRequest) => {
  try {
    const supabase = createClient();

    // 获取最近1小时的数据
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 并行获取各种数据
    const [
      { data: completedTasks },
      { data: recentResults },
      { data: todayTasks },
      { data: allResults },
      { data: templatesUsed }
    ] = await Promise.all([
      // 已完成任务
      supabase
        .from('evaluation_tasks')
        .select('id, status, created_at')
        .eq('status', 'completed'),
      
      // 最近1小时的结果
      supabase
        .from('evaluation_results')
        .select('score, created_at, evaluation_tasks(config)')
        .gte('created_at', oneHourAgo)
        .not('score', 'is', null),
      
      // 今天的任务
      supabase
        .from('evaluation_tasks')
        .select('id, status, created_at')
        .gte('created_at', oneDayAgo),
      
      // 所有结果用于模型统计，包含模型信息
      supabase
        .from('evaluation_results')
        .select(`
          score,
          model_id,
          models(name, logical_name, provider),
          evaluation_tasks(config)
        `)
        .not('score', 'is', null),
      
      // 使用的模板数量
      supabase
        .from('evaluation_tasks')
        .select('template_id')
        .not('template_id', 'is', null)
    ]);

    // 计算使用的模板数量
    const uniqueTemplates = templatesUsed && templatesUsed.length > 0
      ? new Set(templatesUsed.map(t => t.template_id)).size
      : 0;

    // 计算累计成本 - 基于token使用量和模型定价
    const { data: tokenResults, error: tokenError } = await supabase
      .from('evaluation_results')
      .select(`
        prompt_tokens,
        completion_tokens,
        model_id,
        models(
          input_cost_per_1k_tokens,
          output_cost_per_1k_tokens,
          cost_currency,
          provider_input_cost_per_1k_tokens,
          provider_output_cost_per_1k_tokens,
          provider_cost_currency
        )
      `)
      .not('prompt_tokens', 'is', null)
      .not('completion_tokens', 'is', null);

    // 计算总成本
    let totalCost = 0;
    let validCostRecords = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    if (tokenResults && tokenResults.length > 0) {
      tokenResults.forEach(result => {
        const model = result.models;
        if (model) {
          const promptTokens = result.prompt_tokens || 0;
          const completionTokens = result.completion_tokens || 0;

          totalPromptTokens += promptTokens;
          totalCompletionTokens += completionTokens;

          // 优先使用provider级别的成本，如果不存在则使用默认成本
          const inputCost = model.provider_input_cost_per_1k_tokens || model.input_cost_per_1k_tokens;
          const outputCost = model.provider_output_cost_per_1k_tokens || model.output_cost_per_1k_tokens;

          if (inputCost && outputCost) {
            // 成本是按每1k tokens计算的
            const promptCost = (promptTokens / 1000) * inputCost;
            const completionCost = (completionTokens / 1000) * outputCost;

            totalCost += promptCost + completionCost;
            validCostRecords++;
          }
        }
      });
    }


    // 统计顶级模型 - 按逻辑模型名称统计
    const modelStats = {};
    const logicalModelStats = {}; // 新增：按逻辑模型统计

    if (allResults) {
      allResults.forEach(result => {
        // 优先使用直接关联的模型信息
        if (result.model_id && result.models) {
          const modelKey = result.model_id;
          const logicalName = result.models.logical_name || result.models.name || result.model_id;

          // 按提供商实现统计（用于详细分析）
          if (!modelStats[modelKey]) {
            modelStats[modelKey] = {
              name: result.models.name || result.model_id,
              logical_name: logicalName,
              provider: result.models.provider,
              scores: [],
              count: 0
            };
          }
          modelStats[modelKey].scores.push(result.score);
          modelStats[modelKey].count++;

          // 按逻辑模型统计（用于计数）
          if (!logicalModelStats[logicalName]) {
            logicalModelStats[logicalName] = {
              name: logicalName,
              scores: [],
              count: 0,
              providers: new Set()
            };
          }
          logicalModelStats[logicalName].scores.push(result.score);
          logicalModelStats[logicalName].count++;
          logicalModelStats[logicalName].providers.add(result.models.provider);
        } else {
          // 备用方案：从任务配置中获取模型ID
          const modelIds = result.evaluation_tasks?.config?.model_ids || [];
          modelIds.forEach(modelId => {
            if (!modelStats[modelId]) {
              modelStats[modelId] = { name: modelId, scores: [], count: 0 };
            }
            modelStats[modelId].scores.push(result.score);
            modelStats[modelId].count++;

            // 对于备用方案，也添加到逻辑模型统计中
            if (!logicalModelStats[modelId]) {
              logicalModelStats[modelId] = {
                name: modelId,
                scores: [],
                count: 0,
                providers: new Set(['Unknown'])
              };
            }
            logicalModelStats[modelId].scores.push(result.score);
            logicalModelStats[modelId].count++;
          });
        }
      });
    }


    const allModelsWithStats = Object.values(modelStats)
      .map((model: any) => ({
        name: model.name,
        avg_score: model.scores.reduce((sum, score) => sum + score, 0) / model.scores.length,
        count: model.count
      }));

    // 按逻辑模型统计的top模型（用于显示）
    const logicalModelsWithStats = Object.values(logicalModelStats)
      .map((model: any) => ({
        name: model.name,
        avg_score: model.scores.reduce((sum, score) => sum + score, 0) / model.scores.length,
        count: model.count,
        provider_count: model.providers.size
      }));

    const topModels = logicalModelsWithStats
      .sort((a, b) => b.avg_score - a.avg_score)
      .slice(0, 5);

    // 计算总参与逻辑模型数（按逻辑模型名称去重计数）
    const totalParticipatingModels = logicalModelsWithStats.length;

    // 生成趋势数据（最近24小时，每小时一个点）
    const recentTrends = [];
    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(Date.now() - i * 60 * 60 * 1000);
      const hourEnd = new Date(Date.now() - (i - 1) * 60 * 60 * 1000);
      
      const hourResults = recentResults?.filter(r => {
        const resultTime = new Date(r.created_at);
        return resultTime >= hourStart && resultTime < hourEnd;
      }) || [];

      recentTrends.push({
        time: hourStart.toISOString(),
        score: hourResults.length > 0 
          ? hourResults.reduce((sum, r) => sum + (r.score || 0), 0) / hourResults.length 
          : 0,
        count: hourResults.length
      });
    }

    // 计算今日完成率
    const todayCompletedTasks = todayTasks?.filter(t => t.status === 'completed') || [];
    const completionRateToday = todayTasks && todayTasks.length > 0
      ? (todayCompletedTasks.length / todayTasks.length) * 100
      : 0;

    // 计算业务指标
    const qualityIndex = Math.min(100, Math.max(0, completionRateToday * 1.2)); // 基于完成率计算质量指数
    const systemUtilization = Math.min(100, (completedTasks?.length || 0) / 10); // 基于已完成任务数
    const costEfficiency = completionRateToday > 0 ? completionRateToday / 100 : 0; // 简化的成本效益比
    const healthScore = Math.min(100,
      (completionRateToday * 0.4) +
      (qualityIndex * 0.3) +
      (systemUtilization * 0.3)
    );

    // 判断趋势方向
    const recentScores = recentTrends.slice(-6).map(t => t.score).filter(s => s > 0);
    let trendDirection: 'up' | 'down' | 'stable' = 'stable';
    if (recentScores.length >= 2) {
      const firstHalf = recentScores.slice(0, Math.floor(recentScores.length / 2));
      const secondHalf = recentScores.slice(Math.floor(recentScores.length / 2));
      const firstAvg = firstHalf.reduce((sum, s) => sum + s, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, s) => sum + s, 0) / secondHalf.length;
      
      if (secondAvg > firstAvg * 1.05) trendDirection = 'up';
      else if (secondAvg < firstAvg * 0.95) trendDirection = 'down';
    }

    const metrics = {
      completed_tasks: completedTasks?.length || 0,
      templates_used: uniqueTemplates,
      total_cost: Math.round(totalCost * 100) / 100,
      participating_models: totalParticipatingModels,
      top_models: topModels,
      recent_trends: recentTrends,
      quality_index: Math.round(qualityIndex),
      system_utilization: Math.round(systemUtilization),
      cost_efficiency: Math.round(costEfficiency * 100) / 100,
      health_score: Math.round(healthScore),
      trend_direction: trendDirection
    };


    return NextResponse.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('获取实时分析数据失败:', error);
    return NextResponse.json(
      { 
        error: '获取实时分析数据失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
});
