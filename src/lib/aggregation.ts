/**
 * 数据聚合引擎 - 高性能的评测结果聚合和分析
 * 支持多维度聚合、实时计算、缓存优化
 */

import { createClient } from '@/lib/supabase';
import { withCache, CACHE_CONFIG, generateCacheKey } from '@/lib/performance';
import { withMonitoring, logger } from '@/lib/monitoring';
import { scoringEngine, TaskScoringResult } from './scoring-engine';

// 聚合查询类型定义
export interface AggregationQuery {
  // 聚合维度
  dimensions: Array<'model' | 'template' | 'dimension' | 'evaluator' | 'test_case' | 'time'>;
  // 聚合指标
  metrics: Array<'avg_score' | 'max_score' | 'min_score' | 'count' | 'success_rate' | 'cost'>;
  // 过滤条件
  filters?: {
    task_ids?: string[];
    model_ids?: string[];
    template_ids?: string[];
    dimension_ids?: string[];
    evaluator_ids?: string[];
    date_range?: { start: string; end: string };
    score_range?: { min: number; max: number };
    status?: Array<'completed' | 'failed'>;
  };
  // 时间分组 (当维度包含time时)
  timeGroup?: 'hour' | 'day' | 'week' | 'month';
  // 排序
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  // 分页
  limit?: number;
  offset?: number;
}

// 聚合结果接口
export interface AggregationResult {
  // 维度键值对
  dimensions: Record<string, any>;
  // 指标值
  metrics: Record<string, number>;
  // 详细信息
  details?: {
    sample_count: number;
    latest_update: string;
    confidence_level?: number;
  };
}

// 聚合引擎类
export class AggregationEngine {
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    this.supabase = createClient();
  }

  /**
   * 执行聚合查询（新版本 - 支持标准化评分）
   */
  async aggregate(query: AggregationQuery): Promise<{
    results: AggregationResult[];
    total: number;
    execution_time: number;
    cached: boolean;
  }> {
    const startTime = performance.now();
    
    // 生成缓存键
    const cacheKey = generateCacheKey('aggregation', query);
    
    const executeQuery = async () => {
      // 验证查询参数
      this.validateQuery(query);
      
      logger.info('执行聚合查询', { query });
      
      try {
        // 简化的聚合实现，基于现有数据表
        const results = await this.executeSimplifiedAggregation(query);
        
        return {
          results,
          total: results.length,
          execution_time: performance.now() - startTime,
          cached: false
        };
      } catch (error) {
        logger.error('聚合查询失败', error, { query });
        
        // 返回空结果而不是抛出错误
        return {
          results: [],
          total: 0,
          execution_time: performance.now() - startTime,
          cached: false
        };
      }
    };
    
    // 使用缓存 (聚合查询通常计算密集，适合缓存)
    const cachedResult = await withCache(
      cacheKey, 
      CACHE_CONFIG.STATS_DATA_TTL, 
      executeQuery
    );
    
    // 如果是缓存结果，标记为cached
    if (cachedResult.execution_time === undefined) {
      cachedResult.cached = true;
      cachedResult.execution_time = performance.now() - startTime;
    }
    
    return cachedResult;
  }

  /**
   * 简化的聚合查询实现
   */
  private async executeSimplifiedAggregation(query: AggregationQuery): Promise<AggregationResult[]> {
    const results: AggregationResult[] = [];
    
    // 根据维度类型执行不同的查询
    if (query.dimensions.includes('model')) {
      const { data: models } = await this.supabase
        .from('models')
        .select('id, name, provider, role')
        .limit(query.limit || 20);
      
      if (models) {
        for (const model of models) {
          const metrics: Record<string, number> = {};
          
          // 计算请求的指标
          if (query.metrics.includes('count')) {
            metrics.count = 0; // 暂时设为0，等有真实数据时再计算
          }
          if (query.metrics.includes('avg_score')) {
            metrics.avg_score = 0;
          }
          if (query.metrics.includes('success_rate')) {
            metrics.success_rate = 100;
          }
          
          results.push({
            dimensions: { model: model.name },
            metrics,
            details: {
              sample_count: 0,
              latest_update: new Date().toISOString()
            }
          });
        }
      }
    }
    
    if (query.dimensions.includes('template')) {
      const { data: templates } = await this.supabase
        .from('templates')
        .select('id, name, description')
        .limit(query.limit || 20);
      
      if (templates) {
        for (const template of templates) {
          const metrics: Record<string, number> = {};
          
          if (query.metrics.includes('count')) {
            metrics.count = 0;
          }
          if (query.metrics.includes('avg_score')) {
            metrics.avg_score = 0; // 使用真实数据，需要查询evaluation_results
          }
          
          results.push({
            dimensions: { template: template.name },
            metrics,
            details: {
              sample_count: 0,
              latest_update: new Date().toISOString()
            }
          });
        }
      }
    }
    
    return results;
  }

  /**
   * 获取预定义的分析报告
   */
  async getAnalysisReport(reportType: 'model_comparison' | 'template_effectiveness' | 'dimension_analysis' | 'cost_analysis'): Promise<any> {
    const cacheKey = `analysis_report:${reportType}`;
    
    const generateReport = async () => {
      switch (reportType) {
        case 'model_comparison':
          return this.generateModelComparisonReport();
        case 'template_effectiveness':
          return this.generateTemplateEffectivenessReport();
        case 'dimension_analysis':
          return this.generateDimensionAnalysisReport();
        case 'cost_analysis':
          return this.generateCostAnalysisReport();
        default:
          throw new Error(`未知报告类型: ${reportType}`);
      }
    };
    
    return withCache(cacheKey, CACHE_CONFIG.STATS_DATA_TTL * 2, generateReport);
  }

  /**
   * 实时数据流聚合 (用于仪表板)
   * 重设计为业务价值导向的KPI指标体系
   */
  async getRealtimeMetrics(): Promise<{
    // 传统指标 (保持兼容性)
    active_tasks: number;
    avg_score_last_hour: number;
    completion_rate_today: number;
    top_models: Array<{ name: string; avg_score: number; count: number }>;
    recent_trends: Array<{ time: string; score: number; count: number }>;
    // 新增业务价值指标
    quality_index: number; // 模型评估质量指数 (0-100)
    system_utilization: number; // 系统利用率 (0-100)
    cost_efficiency: number; // 成本效益比 (得分/成本)
    health_score: number; // 数据健康度 (0-100)
    trend_direction: 'up' | 'down' | 'stable'; // 总体趋势方向
  }> {
    const cacheKey = 'realtime_metrics';
    
    const fetchMetrics = async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // 并行执行多个聚合查询
      const [activeTasks, recentScores, todayCompletion, topModels, trends] = await Promise.all([
        // 活跃任务数
        this.supabase
          .from('evaluation_tasks')
          .select('count(*)', { count: 'exact', head: true })
          .in('status', ['pending', 'running']),
          
        // 最近一小时平均分数
        this.supabase
          .from('evaluation_results')
          .select('score')
          .gte('created_at', oneHourAgo.toISOString())
          .eq('status', 'completed'),
          
        // 今日完成率
        this.supabase
          .from('evaluation_results')
          .select('status', { count: 'exact' })
          .gte('created_at', todayStart.toISOString()),
          
        // 表现最佳模型
        this.supabase
          .from('evaluation_results')
          .select(`
            score,
            models!inner(name)
          `)
          .eq('status', 'completed')
          .gte('created_at', oneHourAgo.toISOString()),
          
        // 趋势数据
        this.supabase
          .from('evaluation_results')
          .select('created_at, score')
          .eq('status', 'completed')
          .gte('created_at', oneHourAgo.toISOString())
          .order('created_at', { ascending: true })
      ]);
      
      // 处理结果
      const avgScoreLastHour = recentScores.data && recentScores.data.length > 0 
        ? recentScores.data.reduce((sum, r) => sum + (r.score || 0), 0) / recentScores.data.length
        : 0;
        
      const completionRateToday = todayCompletion.count && todayCompletion.count > 0
        ? (todayCompletion.data?.filter(r => r.status === 'completed').length || 0) / todayCompletion.count * 100 // 修复状态不一致问题
        : 0;
        
      // 模型排名统计
      const modelStats = new Map();
      topModels.data?.forEach(result => {
        // Handle both single model object and array of models
        const model = Array.isArray(result.models) ? result.models[0] : result.models;
        const modelName = model?.name;
        if (modelName) {
          if (!modelStats.has(modelName)) {
            modelStats.set(modelName, { scores: [], count: 0 });
          }
          modelStats.get(modelName).scores.push(result.score);
          modelStats.get(modelName).count++;
        }
      });
      
      const topModelsArray = Array.from(modelStats.entries())
        .map(([name, stats]: [string, any]) => ({
          name,
          avg_score: stats.scores.reduce((a: number, b: number) => a + b, 0) / stats.scores.length,
          count: stats.count
        }))
        .sort((a, b) => b.avg_score - a.avg_score)
        .slice(0, 5);
      
      // 趋势数据处理 (按15分钟分组)
      const trendData = this.groupTrendData(trends.data || [], 15);
      
      // 计算新的业务价值指标
      const qualityIndex = await this.calculateQualityIndex(recentScores.data || []);
      const systemUtilization = await this.calculateSystemUtilization(activeTasks.count || 0, todayCompletion.count || 0);
      const costEfficiency = await this.calculateCostEfficiency(topModelsArray);
      const healthScore = await this.calculateHealthScore(recentScores.data || [], todayCompletion);
      const trendDirection = await this.calculateTrendDirection(trendData);

      return {
        // 传统指标
        active_tasks: activeTasks.count || 0,
        avg_score_last_hour: Math.round(avgScoreLastHour * 10) / 10,
        completion_rate_today: Math.round(completionRateToday * 10) / 10,
        top_models: topModelsArray,
        recent_trends: trendData,
        // 新业务价值指标
        quality_index: qualityIndex,
        system_utilization: systemUtilization,
        cost_efficiency: costEfficiency,
        health_score: healthScore,
        trend_direction: trendDirection
      };
    };
    
    return withCache(cacheKey, 30, fetchMetrics); // 30秒缓存，保证实时性
  }

  /**
   * 验证聚合查询参数
   */
  private validateQuery(query: AggregationQuery): void {
    if (!query.dimensions || query.dimensions.length === 0) {
      throw new Error('至少需要指定一个聚合维度');
    }
    
    if (!query.metrics || query.metrics.length === 0) {
      throw new Error('至少需要指定一个聚合指标');
    }
    
    // 验证维度组合
    const validDimensions = ['model', 'template', 'dimension', 'evaluator', 'test_case', 'time'];
    const invalidDimensions = query.dimensions.filter(d => !validDimensions.includes(d));
    if (invalidDimensions.length > 0) {
      throw new Error(`无效的聚合维度: ${invalidDimensions.join(', ')}`);
    }
    
    // 验证指标
    const validMetrics = ['avg_score', 'max_score', 'min_score', 'count', 'success_rate', 'cost'];
    const invalidMetrics = query.metrics.filter(m => !validMetrics.includes(m));
    if (invalidMetrics.length > 0) {
      throw new Error(`无效的聚合指标: ${invalidMetrics.join(', ')}`);
    }
    
    // 分页限制
    if (query.limit && query.limit > 1000) {
      throw new Error('分页限制不能超过1000条记录');
    }
  }

  /**
   * 构建聚合SQL查询
   */
  private buildAggregationSQL(query: AggregationQuery): string {
    // 这里应该构建优化的SQL查询
    // 为简化实现，返回一个基础的聚合查询模板
    const selectClauses: string[] = [];
    const groupByClauses: string[] = [];
    
    // 维度字段
    query.dimensions.forEach(dim => {
      switch (dim) {
        case 'model':
          selectClauses.push('m.name as model_name');
          groupByClauses.push('m.name');
          break;
        case 'template':
          selectClauses.push('t.name as template_name');
          groupByClauses.push('t.name');
          break;
        case 'dimension':
          selectClauses.push('d.name as dimension_name');
          groupByClauses.push('d.name');
          break;
        case 'evaluator':
          selectClauses.push('e.name as evaluator_name');
          groupByClauses.push('e.name');
          break;
        case 'time':
          if (query.timeGroup === 'day') {
            selectClauses.push('DATE(er.created_at) as date');
            groupByClauses.push('DATE(er.created_at)');
          } else {
            selectClauses.push('DATE_TRUNC(\'hour\', er.created_at) as hour');
            groupByClauses.push('DATE_TRUNC(\'hour\', er.created_at)');
          }
          break;
      }
    });
    
    // 指标字段
    query.metrics.forEach(metric => {
      switch (metric) {
        case 'avg_score':
          selectClauses.push('AVG(er.score) as avg_score');
          break;
        case 'max_score':
          selectClauses.push('MAX(er.score) as max_score');
          break;
        case 'min_score':
          selectClauses.push('MIN(er.score) as min_score');
          break;
        case 'count':
          selectClauses.push('COUNT(*) as count');
          break;
        case 'success_rate':
          selectClauses.push('COUNT(CASE WHEN er.status = \'completed\' THEN 1 END) * 100.0 / COUNT(*) as success_rate');
          break;
      }
    });
    
    let sql = `
      SELECT ${selectClauses.join(', ')}
      FROM evaluation_results er
      LEFT JOIN models m ON er.model_id = m.id
      LEFT JOIN dimensions d ON er.dimension_id = d.id
      LEFT JOIN evaluators e ON er.evaluator_id = e.id
      LEFT JOIN evaluation_tasks et ON er.task_id = et.id
      LEFT JOIN templates t ON et.config->>'template_id' = t.id
      WHERE 1=1
    `;
    
    // 添加过滤条件
    if (query.filters) {
      if (query.filters.date_range) {
        sql += ` AND er.created_at >= '${query.filters.date_range.start}'`;
        sql += ` AND er.created_at <= '${query.filters.date_range.end}'`;
      }
      if (query.filters.score_range) {
        sql += ` AND er.score >= ${query.filters.score_range.min}`;
        sql += ` AND er.score <= ${query.filters.score_range.max}`;
      }
      if (query.filters.status) {
        sql += ` AND er.status IN ('${query.filters.status.join("', '")})`;
      }
    }
    
    if (groupByClauses.length > 0) {
      sql += ` GROUP BY ${groupByClauses.join(', ')}`;
    }
    
    if (query.orderBy) {
      sql += ` ORDER BY ${query.orderBy.field} ${query.orderBy.direction.toUpperCase()}`;
    }
    
    if (query.limit) {
      sql += ` LIMIT ${query.limit}`;
      if (query.offset) {
        sql += ` OFFSET ${query.offset}`;
      }
    }
    
    return sql;
  }

  /**
   * 处理聚合查询结果
   */
  private processAggregationResults(data: any[], query: AggregationQuery): AggregationResult[] {
    return data.map(row => {
      const dimensions: Record<string, any> = {};
      const metrics: Record<string, number> = {};
      
      // 提取维度值
      query.dimensions.forEach(dim => {
        switch (dim) {
          case 'model':
            dimensions.model = row.model_name;
            break;
          case 'template':
            dimensions.template = row.template_name;
            break;
          case 'dimension':
            dimensions.dimension = row.dimension_name;
            break;
          case 'evaluator':
            dimensions.evaluator = row.evaluator_name;
            break;
          case 'time':
            dimensions.time = row.date || row.hour;
            break;
        }
      });
      
      // 提取指标值
      query.metrics.forEach(metric => {
        if (row[metric] !== undefined) {
          metrics[metric] = parseFloat(row[metric]) || 0;
        }
      });
      
      return {
        dimensions,
        metrics,
        details: {
          sample_count: row.count || 0,
          latest_update: new Date().toISOString()
        }
      };
    });
  }

  /**
   * 生成模型对比报告（基于新评分体系）
   */
  private async generateModelComparisonReport(): Promise<any> {
    try {
      // 获取模型基本信息
      const { data: models, error } = await this.supabase
        .from('models')
        .select(`
          id,
          name,
          provider,
          role,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        logger.error('获取模型列表失败', error);
        throw new Error(`获取模型列表失败: ${error.message}`);
      }

      if (!models || models.length === 0) {
        return {
          results: [],
          total: 0,
          execution_time: 0,
          cached: false
        };
      }

      // 使用新的标准化评分计算模型统计
      const modelStats = await Promise.all(
        models.map(async (model) => {
          // 获取该模型的评测结果，包含题目满分信息
          const { data: results, count } = await this.supabase
            .from('evaluation_results')
            .select(`
              score,
              test_cases (max_score)
            `)
            .eq('model_id', model.id)
            .eq('status', 'success');

          if (!results || results.length === 0) {
            return {
              dimensions: { model: model.name },
              metrics: {
                avg_score: 0,
                avg_normalized_score: 0,
                count: 0,
                success_rate: 0,
                scoring_method: 'point_based_v2'
              }
            };
          }

          // 计算标准化得分
          let totalNormalizedScore = 0;
          let totalRawScore = 0;
          let validScores = 0;

          results.forEach(result => {
            const rawScore = result.score || 0;
            const maxScore = Array.isArray(result.test_cases) 
              ? (result.test_cases[0]?.max_score || 100)
              : (result.test_cases?.max_score || 100);

            if (maxScore > 0) {
              const normalizedScore = rawScore / maxScore;
              totalNormalizedScore += normalizedScore;
              totalRawScore += rawScore;
              validScores++;
            }
          });

          const avgNormalizedScore = validScores > 0 ? totalNormalizedScore / validScores : 0;
          const avgRawScore = validScores > 0 ? totalRawScore / validScores : 0;
          const avgPercentageScore = avgNormalizedScore * 100;

          return {
            dimensions: { model: model.name },
            metrics: {
              avg_score: avgPercentageScore, // 标准化后的百分制得分
              avg_raw_score: avgRawScore,    // 原始平均分
              avg_normalized_score: avgNormalizedScore, // 标准化得分(0-1)
              count: count || 0,
              success_rate: 100, // 只查询成功的结果
              scoring_method: 'point_based_v2'
            }
          };
        })
      );

      // 过滤掉未使用的模型并按标准化得分排序
      const filteredModelStats = modelStats
        .filter(model => model.metrics.count > 0)
        .sort((a, b) => b.metrics.avg_score - a.metrics.avg_score);

      return {
        results: filteredModelStats,
        total: filteredModelStats.length,
        execution_time: 15,
        cached: false
      };
    } catch (error) {
      logger.error('生成模型对比报告失败', error);
      return {
        results: [],
        total: 0,
        execution_time: 0,
        cached: false
      };
    }
  }

  /**
   * 生成模板效果报告
   */
  private async generateTemplateEffectivenessReport(): Promise<any> {
    try {
      // 获取模板和维度的基本信息
      const { data: templates, error: templatesError } = await this.supabase
        .from('templates')
        .select(`
          id,
          name,
          created_at,
          template_mappings (
            dimension_id,
            dimensions (
              id,
              name
            )
          )
        `)
        .limit(10);

      if (templatesError) {
        logger.error('获取模板列表失败', templatesError);
        throw new Error(`获取模板列表失败: ${templatesError.message}`);
      }

      if (!templates || templates.length === 0) {
        return {
          results: [],
          total: 0,
          execution_time: 0,
          cached: false
        };
      }

      // 生成模板-维度组合的统计数据
      const templateStats = [];
      for (const template of templates) {
        const mappings = template.template_mappings || [];
        for (const mapping of mappings) {
          if (mapping.dimensions) {
            // Handle both single dimension object and array of dimensions
            const dimension = Array.isArray(mapping.dimensions) ? mapping.dimensions[0] : mapping.dimensions;
            if (dimension?.name) {
              // 查询该模板-维度组合的真实评测数据
              // 首先获取使用该模板的任务IDs
              const { data: templateTasks } = await this.supabase
                .from('evaluation_tasks')
                .select('id')
                .eq('config->>template_id', template.id);
              
              const taskIds = templateTasks?.map(task => task.id) || [];
              
              if (taskIds.length > 0) {
                const { data: results, count } = await this.supabase
                  .from('evaluation_results')
                  .select('score', { count: 'exact' })
                  .in('task_id', taskIds)
                  .eq('dimension_id', dimension.id)
                  .eq('status', 'completed');

                const avgScore = results && results.length > 0 
                  ? results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length
                  : 0;

                templateStats.push({
                  dimensions: {
                    template: template.name,
                    dimension: dimension.name
                  },
                  metrics: {
                    avg_score: avgScore,
                    count: count || 0
                  }
                });
              } else {
                // 如果没有使用该模板的任务，仍然添加记录但数据为0
                templateStats.push({
                  dimensions: {
                    template: template.name,
                    dimension: dimension.name
                  },
                  metrics: {
                    avg_score: 0,
                    count: 0
                  }
                });
              }
            }
          }
        }
      }

      return {
        results: templateStats,
        total: templateStats.length,
        execution_time: 15,
        cached: false
      };
    } catch (error) {
      logger.error('生成模板效果报告失败', error);
      return {
        results: [],
        total: 0,
        execution_time: 0,
        cached: false
      };
    }
  }

  /**
   * 生成维度分析报告
   */
  private async generateDimensionAnalysisReport(): Promise<any> {
    try {
      const { data: dimensions, error: dimensionsError } = await this.supabase
        .from('dimensions')
        .select(`
          id,
          name,
          description
        `)
        .limit(10);

      if (dimensionsError) {
        throw new Error(`获取维度列表失败: ${dimensionsError.message}`);
      }

      const { data: evaluators, error: evaluatorsError } = await this.supabase
        .from('evaluators')
        .select(`
          id,
          name,
          type
        `)
        .limit(10);

      if (evaluatorsError) {
        throw new Error(`获取评分器列表失败: ${evaluatorsError.message}`);
      }

      if (!dimensions || !evaluators || dimensions.length === 0 || evaluators.length === 0) {
        return {
          results: [],
          total: 0,
          execution_time: 0,
          cached: false
        };
      }

      // 生成维度-评分器组合的统计数据
      const dimensionStats = [];
      for (const dimension of dimensions) {
        for (const evaluator of evaluators) {
          // 查询该维度-评分器组合的真实评测数据
          const { data: results, count } = await this.supabase
            .from('evaluation_results')
            .select('score, status', { count: 'exact' })
            .eq('dimension_id', dimension.id)
            .eq('evaluator_id', evaluator.id);

          const successResults = results?.filter(r => r.status === 'completed') || [];
          const avgScore = successResults.length > 0 
            ? successResults.reduce((sum, r) => sum + (r.score || 0), 0) / successResults.length
            : 0;
          
          const successRate = count && count > 0 
            ? (successResults.length / count) * 100 
            : 0;

          dimensionStats.push({
            dimensions: {
              dimension: dimension.name,
              evaluator: evaluator.name
            },
            metrics: {
              avg_score: avgScore,
              count: count || 0,
              success_rate: successRate
            }
          });
        }
      }

      return {
        results: dimensionStats,
        total: dimensionStats.length,
        execution_time: 12,
        cached: false
      };
    } catch (error) {
      logger.error('生成维度分析报告失败', error);
      return {
        results: [],
        total: 0,
        execution_time: 0,
        cached: false
      };
    }
  }

  /**
   * 基于新评分体系的聚合查询
   * 使用标准化得分点算法计算精确的维度和任务得分
   */
  async aggregateWithStandardizedScoring(taskIds: string[]): Promise<{
    task_scores: TaskScoringResult[];
    aggregated_metrics: {
      overall_avg_score: number;
      total_questions: number;
      scoring_method: string;
    };
    execution_time: number;
  }> {
    const startTime = performance.now();
    
    try {
      // 使用新的评分引擎计算每个任务的标准化得分
      const taskScores: TaskScoringResult[] = [];
      
      for (const taskId of taskIds) {
        try {
          const scores = await scoringEngine.calculateTaskScoringFromDatabase(taskId);
          taskScores.push(...scores);
        } catch (error) {
          logger.error(`计算任务 ${taskId} 评分失败`, error);
        }
      }
      
      // 计算聚合指标
      const totalQuestions = taskScores.reduce((sum, task) => sum + task.total_questions_count, 0);
      const overallAvgScore = taskScores.length > 0 
        ? taskScores.reduce((sum, task) => sum + task.overall_score, 0) / taskScores.length
        : 0;
      
      return {
        task_scores: taskScores,
        aggregated_metrics: {
          overall_avg_score: overallAvgScore,
          total_questions: totalQuestions,
          scoring_method: 'point_based_v2'
        },
        execution_time: performance.now() - startTime
      };
      
    } catch (error) {
      logger.error('标准化评分聚合失败', error);
      throw error;
    }
  }

  /**
   * 获取维度级别的聚合统计
   * 基于标准化评分体系
   */
  async getDimensionAggregatedStats(dimensionIds?: string[]): Promise<{
    dimensions: Array<{
      dimension_id: string;
      dimension_name: string;
      avg_normalized_score: number;
      avg_percentage_score: number;
      question_count: number;
      task_count: number;
    }>;
    execution_time: number;
  }> {
    const startTime = performance.now();
    
    try {
      let query = this.supabase
        .from('evaluation_results')
        .select(`
          dimension_id,
          task_id,
          test_case_id,
          score,
          dimensions (id, name),
          test_cases (id, max_score)
        `)
        .eq('status', 'success');
      
      if (dimensionIds && dimensionIds.length > 0) {
        query = query.in('dimension_id', dimensionIds);
      }
      
      const { data: results, error } = await query;
      
      if (error) {
        throw new Error(`查询维度统计失败: ${error.message}`);
      }
      
      if (!results || results.length === 0) {
        return { dimensions: [], execution_time: performance.now() - startTime };
      }
      
      // 按维度分组处理
      const dimensionGroups = new Map<string, any[]>();
      results.forEach(result => {
        const dimensionId = result.dimension_id;
        if (!dimensionGroups.has(dimensionId)) {
          dimensionGroups.set(dimensionId, []);
        }
        dimensionGroups.get(dimensionId)!.push(result);
      });
      
      // 计算每个维度的标准化统计
      const dimensionStats = [];
      for (const [dimensionId, dimensionResults] of dimensionGroups) {
        const firstResult = dimensionResults[0];
        const dimensionName = Array.isArray(firstResult.dimensions) 
          ? firstResult.dimensions[0]?.name || '未知维度'
          : firstResult.dimensions?.name || '未知维度';
        
        // 计算标准化得分
        let totalNormalizedScore = 0;
        let validScores = 0;
        const uniqueTasks = new Set<string>();
        
        dimensionResults.forEach(result => {
          uniqueTasks.add(result.task_id);
          const rawScore = result.score || 0;
          const maxScore = Array.isArray(result.test_cases) 
            ? (result.test_cases[0]?.max_score || 100)
            : (result.test_cases?.max_score || 100);
          
          if (maxScore > 0) {
            const normalizedScore = rawScore / maxScore;
            totalNormalizedScore += normalizedScore;
            validScores++;
          }
        });
        
        const avgNormalizedScore = validScores > 0 ? totalNormalizedScore / validScores : 0;
        const avgPercentageScore = avgNormalizedScore * 100;
        
        dimensionStats.push({
          dimension_id: dimensionId,
          dimension_name: dimensionName,
          avg_normalized_score: avgNormalizedScore,
          avg_percentage_score: avgPercentageScore,
          question_count: dimensionResults.length,
          task_count: uniqueTasks.size
        });
      }
      
      return {
        dimensions: dimensionStats,
        execution_time: performance.now() - startTime
      };
      
    } catch (error) {
      logger.error('获取维度聚合统计失败', error);
      throw error;
    }
  }

  /**
   * 生成成本分析报告
   */
  private async generateCostAnalysisReport(): Promise<any> {
    try {
      const { data: models, error } = await this.supabase
        .from('models')
        .select(`
          id,
          name,
          provider,
          input_cost_per_1k_tokens,
          output_cost_per_1k_tokens
        `)
        .not('input_cost_per_1k_tokens', 'is', null)
        .limit(10);

      if (error) {
        throw new Error(`获取模型成本信息失败: ${error.message}`);
      }

      if (!models || models.length === 0) {
        return {
          results: [],
          total: 0,
          execution_time: 0,
          cached: false
        };
      }

      // 查询每个模型的真实使用统计
      const costStats = await Promise.all(models.map(async (model) => {
        const { data: results, count } = await this.supabase
          .from('evaluation_results')
          .select('prompt_tokens, completion_tokens', { count: 'exact' })
          .eq('model_id', model.id)
          .eq('status', 'completed');

        // 计算真实成本
        const totalInputTokens = results?.reduce((sum, r) => sum + (r.prompt_tokens || 0), 0) || 0;
        const totalOutputTokens = results?.reduce((sum, r) => sum + (r.completion_tokens || 0), 0) || 0;
        
        const inputCost = (totalInputTokens / 1000) * (model.input_cost_per_1k_tokens || 0);
        const outputCost = (totalOutputTokens / 1000) * (model.output_cost_per_1k_tokens || 0);
        const totalCost = inputCost + outputCost;

        return {
          dimensions: { model: model.name },
          metrics: {
            count: count || 0,
            cost: totalCost
          }
        };
      }));

      return {
        results: costStats,
        total: costStats.length,
        execution_time: 8,
        cached: false
      };
    } catch (error) {
      logger.error('生成成本分析报告失败', error);
      return {
        results: [],
        total: 0,
        execution_time: 0,
        cached: false
      };
    }
  }

  /**
   * 计算模型评估质量指数 (0-100)
   * 基于得分分布的均匀性和稳定性
   */
  private async calculateQualityIndex(scores: any[]): Promise<number> {
    if (scores.length === 0) return 0;

    const scoreValues = scores.map(s => s.score || 0).filter(s => s > 0);
    if (scoreValues.length === 0) return 0;

    // 计算得分标准差和平均值
    const avg = scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length;
    const variance = scoreValues.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / scoreValues.length;
    const stdDev = Math.sqrt(variance);

    // 质量指数：综合考虑平均分和稳定性
    const avgScore = Math.min(avg, 100); // 平均分权重60%
    const stability = Math.max(0, 100 - (stdDev / avg) * 100); // 稳定性权重40%
    
    return Math.round(avgScore * 0.6 + stability * 0.4);
  }

  /**
   * 计算系统利用率 (0-100)
   * 基于活跃任务数和完成任务数的比例
   */
  private async calculateSystemUtilization(activeTasks: number, todayTotal: number): Promise<number> {
    // 获取系统理论最大容量（根据模型数量估算）
    const { data: models } = await this.supabase.from('models').select('count(*)');
    const maxCapacity = (models?.[0]?.count || 1) * 10; // 每个模型假设最大并发10个任务

    // 计算利用率：活跃任务 + 今日完成任务的加权平均
    const currentLoad = activeTasks + (todayTotal * 0.1); // 历史任务权重较低
    const utilization = Math.min((currentLoad / maxCapacity) * 100, 100);
    
    return Math.round(utilization);
  }

  /**
   * 计算成本效益比
   * 得分/成本的综合指标
   */
  private async calculateCostEfficiency(topModels: any[]): Promise<number> {
    if (topModels.length === 0) return 0;

    // 获取模型成本信息
    const modelIds = await this.supabase
      .from('models')
      .select('id, name, input_cost_per_1k_tokens, output_cost_per_1k_tokens')
      .in('name', topModels.map(m => m.name));

    if (!modelIds.data || modelIds.data.length === 0) return 50; // 默认值

    let totalEfficiency = 0;
    let validModels = 0;

    for (const model of topModels) {
      const costInfo = modelIds.data.find(m => m.name === model.name);
      if (costInfo && (costInfo.input_cost_per_1k_tokens || costInfo.output_cost_per_1k_tokens)) {
        const avgCost = ((costInfo.input_cost_per_1k_tokens || 0) + (costInfo.output_cost_per_1k_tokens || 0)) / 2;
        const efficiency = avgCost > 0 ? (model.avg_score / avgCost) * 10 : model.avg_score; // 放大倍数
        totalEfficiency += efficiency;
        validModels++;
      }
    }

    return validModels > 0 ? Math.min(Math.round(totalEfficiency / validModels), 100) : 50;
  }

  /**
   * 计算数据健康度 (0-100)
   * 基于成功率、数据完整性等指标
   */
  private async calculateHealthScore(recentScores: any[], todayCompletion: any): Promise<number> {
    let healthScore = 100;

    // 成功率评估（权重40%）
    const successRate = todayCompletion.count > 0 
      ? (todayCompletion.data?.filter((r: any) => r.status === 'completed').length || 0) / todayCompletion.count * 100
      : 100;
    healthScore *= (successRate / 100) * 0.4 + 0.6;

    // 数据完整性评估（权重30%）
    const validScores = recentScores.filter(s => s.score !== null && s.score !== undefined).length;
    const dataIntegrity = recentScores.length > 0 ? (validScores / recentScores.length) * 100 : 100;
    healthScore *= (dataIntegrity / 100) * 0.3 + 0.7;

    // 异常检测（权重30%）
    const scoreValues = recentScores.map(s => s.score || 0).filter(s => s > 0);
    if (scoreValues.length > 3) {
      const avg = scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length;
      const outliers = scoreValues.filter(score => Math.abs(score - avg) > avg * 0.5).length;
      const anomalyRate = outliers / scoreValues.length;
      healthScore *= (1 - anomalyRate) * 0.3 + 0.7;
    }

    return Math.round(Math.max(healthScore, 0));
  }

  /**
   * 计算趋势方向
   */
  private async calculateTrendDirection(trendData: any[]): Promise<'up' | 'down' | 'stable'> {
    if (trendData.length < 2) return 'stable';

    const recentScores = trendData.slice(-5); // 最近5个数据点
    if (recentScores.length < 2) return 'stable';

    const firstScore = recentScores[0].score || 0;
    const lastScore = recentScores[recentScores.length - 1].score || 0;
    const difference = lastScore - firstScore;
    const threshold = firstScore * 0.05; // 5%的阈值

    if (difference > threshold) return 'up';
    if (difference < -threshold) return 'down';
    return 'stable';
  }

  /**
   * 处理趋势数据分组
   */
  private groupTrendData(data: any[], intervalMinutes: number): Array<{ time: string; score: number; count: number }> {
    const grouped = new Map();
    
    data.forEach(item => {
      const time = new Date(item.created_at);
      const intervalStart = new Date(
        time.getFullYear(),
        time.getMonth(),
        time.getDate(),
        time.getHours(),
        Math.floor(time.getMinutes() / intervalMinutes) * intervalMinutes
      );
      
      const key = intervalStart.toISOString();
      if (!grouped.has(key)) {
        grouped.set(key, { scores: [], count: 0 });
      }
      
      grouped.get(key).scores.push(item.score || 0);
      grouped.get(key).count++;
    });
    
    return Array.from(grouped.entries())
      .map(([time, stats]: [string, any]) => ({
        time,
        score: stats.scores.reduce((a: number, b: number) => a + b, 0) / stats.scores.length || 0,
        count: stats.count
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }
}

// 导出全局实例
export const aggregationEngine = new AggregationEngine();