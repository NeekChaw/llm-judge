'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { BarChart3, Trash2, Download, Eye, RefreshCw, Plus } from 'lucide-react';
import { AggregationItemSkeleton } from '@/components/ui/skeleton';
import { PreAggregationManager } from '@/lib/aggregation-utils';
import { AggregationCacheManager } from '@/lib/smart-cache';

interface AggregationAnalysis {
  id: string;
  name: string;
  type: 'vertical' | 'horizontal';
  taskIds: string[];
  taskNames: string[];
  createdAt: string;
  modelCount: number;
  dimensionCount: number;
}

export default function AggregationPage() {
  const [analyses, setAnalyses] = useState<AggregationAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [exportingId, setExportingId] = useState<string | null>(null);
  
  // 智能缓存管理器
  const cacheManager = new AggregationCacheManager();

  useEffect(() => {
    loadAggregationAnalyses();
  }, []);

  const loadAggregationAnalyses = async () => {
    console.log('🔄 开始加载聚合分析（预聚合优化）...');
    setLoading(true);
    try {
      // 使用预聚合管理器加载配置
      const configs = PreAggregationManager.loadAllAggregationConfigs();
      console.log('📋 预聚合配置数量:', configs.length);
      
      if (configs.length > 0) {
        // 转换为页面所需格式
        const basicData = configs.map(config => ({
          id: config.id,
          name: config.name,
          type: config.type,
          taskIds: config.taskIds,
          taskNames: config.taskNames || [],
          createdAt: config.createdAt,
          // 优先使用预聚合数据
          modelCount: config.preAggregatedStats?.modelCount || 0,
          dimensionCount: config.preAggregatedStats?.dimensionCount || 0
        }));
        
        console.log('✅ 预聚合数据加载成功');
        setAnalyses(basicData);
        setLoading(false);
        
        // 检查是否需要刷新预聚合数据
        loadDetailedStatisticsOptimized(configs, basicData);
      } else {
        console.log('📭 无聚合配置数据，显示空状态');
        setAnalyses([]);
        setLoading(false);
      }
    } catch (error) {
      console.error('❌ 加载聚合分析失败:', error);
      setAnalyses([]);
      setLoading(false);
    }
  };

  const loadDetailedStatistics = async (basicAnalyses: AggregationAnalysis[]) => {
    console.log(`📊 开始加载${basicAnalyses.length}个分析项的详细统计...`);
    
    // 为每个分析项异步加载详细信息
    for (const analysis of basicAnalyses) {
      console.log(`🔍 加载分析项 ${analysis.name} 的详细信息...`);
      
      // 标记当前项正在加载详细信息
      setLoadingDetails(prev => new Set(prev).add(analysis.id));
      
      try {
        const response = await fetch('/api/tasks/aggregation-info', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            taskIds: analysis.taskIds
          })
        });
        
        if (response.ok) {
          const apiData = await response.json();
          if (apiData.success && apiData.tasks) {
            // 计算模型和维度的并集
            const allModels = [...new Map(
              apiData.tasks.flatMap((t: any) => t.models)
                .map((m: any) => [m.id, m])
            ).values()];
            const allDimensions = [...new Map(
              apiData.tasks.flatMap((t: any) => t.dimensions)
                .map((d: any) => [d.id, d])
            ).values()];
            
            console.log(`✅ ${analysis.name}: ${allModels.length}个模型, ${allDimensions.length}个维度`);
            
            // 更新单个分析项的统计信息
            setAnalyses(prev => prev.map(item => 
              item.id === analysis.id 
                ? {
                    ...item,
                    modelCount: allModels.length,
                    dimensionCount: allDimensions.length
                  }
                : item
            ));
          } else {
            console.warn(`⚠️ ${analysis.name}: API返回数据格式错误`);
          }
        } else {
          console.warn(`⚠️ ${analysis.name}: API请求失败 ${response.status}`);
        }
      } catch (error) {
        console.warn(`❌ 获取聚合分析${analysis.id}详细信息失败:`, error);
      } finally {
        // 移除加载状态
        setLoadingDetails(prev => {
          const newSet = new Set(prev);
          newSet.delete(analysis.id);
          return newSet;
        });
      }
    }
    
    console.log('🎉 所有详细统计加载完成');
  };

  const loadDetailedStatisticsOptimized = async (configs: any[], basicData: AggregationAnalysis[]) => {
    console.log('🚀 开始智能预聚合数据刷新检查...');
    
    // 检查哪些配置需要更新统计信息
    const configsNeedingRefresh = configs.filter(config => 
      PreAggregationManager.needsStatsRefresh(config, 30) // 30分钟缓存
    );
    
    if (configsNeedingRefresh.length === 0) {
      console.log('✨ 所有预聚合数据都是最新的，无需更新');
      return;
    }
    
    console.log(`🔄 需要更新${configsNeedingRefresh.length}个配置的统计信息`);
    
    // 标记所有需要更新的配置为加载中
    const configsToUpdate = new Set(configsNeedingRefresh.map(c => c.id));
    setLoadingDetails(prev => new Set([...prev, ...configsToUpdate]));
    
    try {
      // 使用批量API一次性获取所有需要更新的统计信息
      const batchRequest = {
        aggregations: configsNeedingRefresh.map(config => ({
          id: config.id,
          taskIds: config.taskIds
        }))
      };
      
      console.log('🚀 使用批量API获取统计信息（带智能缓存）...');
      const response = await fetch('/api/tasks/aggregation-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batchRequest)
      });
      
      if (response.ok) {
        const batchData = await response.json();
        if (batchData.success && batchData.results) {
          console.log(`✅ 批量API成功返回${batchData.results.length}个结果`);
          
          // 处理每个聚合分析的结果
          batchData.results.forEach((result: any) => {
            if (result.success && result.aggregatedStats) {
              const { modelCount, dimensionCount } = result.aggregatedStats;
              const config = configsNeedingRefresh.find(c => c.id === result.aggregationId);
              
              if (config) {
                // 从批量结果中提取模型和维度信息
                const allModels = [...new Map(
                  result.tasks.flatMap((t: any) => t.models)
                    .map((m: any) => [m.id, m])
                ).values()];
                const allDimensions = [...new Map(
                  result.tasks.flatMap((t: any) => t.dimensions)
                    .map((d: any) => [d.id, d])
                ).values()];
                
                console.log(`✅ ${config.name}: 批量更新为${modelCount}个模型, ${dimensionCount}个维度`);
                
                // 更新预聚合数据
                PreAggregationManager.updatePreAggregatedStats(
                  config.id,
                  allModels,
                  allDimensions
                );
                
                // 缓存统计信息以进一步提升性能
                cacheManager.cacheAggregationStats(
                  config.taskIds,
                  { modelCount, dimensionCount, models: allModels, dimensions: allDimensions },
                  60 // 缓存60分钟
                );
                
                // 更新UI显示
                setAnalyses(prev => prev.map(item => 
                  item.id === config.id 
                    ? {
                        ...item,
                        modelCount,
                        dimensionCount
                      }
                    : item
                ));
              }
            }
          });
          
          // 显示缓存统计信息
          const cacheStats = cacheManager.getCacheStats();
          console.log(`📊 缓存统计 - 命中率: ${cacheStats.hitRate.toFixed(1)}%, 大小: ${cacheStats.size}/${cacheStats.maxSize}`);
          console.log('🎉 批量更新完成，提升性能显著');
        } else {
          console.warn('⚠️ 批量API返回数据格式错误');
          // 回退到原有的单个API调用方式
          await fallbackToIndividualUpdates(configsNeedingRefresh);
        }
      } else {
        console.warn(`⚠️ 批量API请求失败 ${response.status}，回退到单个API`);
        // 回退到原有的单个API调用方式
        await fallbackToIndividualUpdates(configsNeedingRefresh);
      }
    } catch (error) {
      console.error('❌ 批量API调用失败:', error);
      // 回退到原有的单个API调用方式
      await fallbackToIndividualUpdates(configsNeedingRefresh);
    } finally {
      // 清除所有加载状态
      setLoadingDetails(prev => {
        const newSet = new Set(prev);
        configsToUpdate.forEach(id => newSet.delete(id));
        return newSet;
      });
    }
  };

  // 回退到单个API调用的方法
  const fallbackToIndividualUpdates = async (configsNeedingRefresh: any[]) => {
    console.log('🔄 回退到单个API调用模式...');
    
    for (const config of configsNeedingRefresh) {
      try {
        const response = await fetch('/api/tasks/aggregation-info', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            taskIds: config.taskIds
          })
        });
        
        if (response.ok) {
          const apiData = await response.json();
          if (apiData.success && apiData.tasks) {
            const allModels = [...new Map(
              apiData.tasks.flatMap((t: any) => t.models)
                .map((m: any) => [m.id, m])
            ).values()];
            const allDimensions = [...new Map(
              apiData.tasks.flatMap((t: any) => t.dimensions)
                .map((d: any) => [d.id, d])
            ).values()];
            
            PreAggregationManager.updatePreAggregatedStats(
              config.id,
              allModels,
              allDimensions
            );
            
            setAnalyses(prev => prev.map(item => 
              item.id === config.id 
                ? {
                    ...item,
                    modelCount: allModels.length,
                    dimensionCount: allDimensions.length
                  }
                : item
            ));
          }
        }
      } catch (error) {
        console.warn(`❌ 回退API调用失败 ${config.id}:`, error);
      }
    }
  };

  const deleteAnalysis = (id: string) => {
    if (confirm('确定要删除这个聚合分析吗？')) {
      const updated = analyses.filter(a => a.id !== id);
      setAnalyses(updated);
      localStorage.setItem('aggregation_analyses', JSON.stringify(updated));
    }
  };

  const handleExportAnalysis = async (analysis: AggregationAnalysis) => {
    console.log('开始导出聚合分析:', analysis.id);
    setExportingId(analysis.id);
    
    try {
      // 从API获取完整的任务信息
      const response = await fetch('/api/tasks/aggregation-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskIds: analysis.taskIds
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.tasks) {
          // 提取所有模型和维度的并集
          const allModels = [...new Map(
            data.tasks.flatMap((t: any) => t.models)
              .map((m: any) => [m.id, m])
          ).values()];
          const allDimensions = [...new Map(
            data.tasks.flatMap((t: any) => t.dimensions)
              .map((d: any) => [d.id, d])
          ).values()];

          // 构建完整配置
          const completeConfig = {
            ...analysis,
            tasksInfo: data.tasks,
            models: allModels,
            dimensions: allDimensions,
            modelCount: allModels.length,
            dimensionCount: allDimensions.length,
          };
          
          // 构建导出数据
          const aggregationData = await buildAggregationExportData(completeConfig);
          
          // 包装数据为ExportData格式
          const exportDataPackage = {
            title: `${analysis.name} - 聚合分析报告`,
            data: aggregationData,
            metadata: {
              generatedAt: new Date().toISOString(),
              source: 'AI Benchmark V2 - 聚合分析',
              aggregationType: analysis.type === 'vertical' ? '纵向聚合' : '横向聚合',
              analysisId: analysis.id
            }
          };
          
          // 导出数据
          const { exportData } = await import('@/lib/export-utils');
          exportData(exportDataPackage, 'excel', `${analysis.name}_聚合分析`);
          
        } else {
          throw new Error('获取聚合信息失败');
        }
      } else {
        throw new Error(`API请求失败: ${response.status}`);
      }
      
    } catch (error) {
      console.error('导出聚合分析失败:', error);
      alert(`导出失败: ${error instanceof Error ? error.message : '请重试'}`);
    } finally {
      setExportingId(null);
    }
  };

  // 构建聚合分析导出数据
  const buildAggregationExportData = async (config: any) => {
    // 1. 获取所有模型-维度的评分数据
    const matrixData: (number | null)[][] = [];
    const detailedData: any[] = [];
    
    for (const model of config.models) {
      const modelRow: (number | null)[] = [];
      
      for (const dimension of config.dimensions) {
        try {
          // 获取该模型在该维度的聚合评分
          let aggregatedScore: number | null = null;
          
          // 从所有任务中收集该模型-维度组合的评分
          for (const taskInfo of config.tasksInfo) {
            const response = await fetch(`/api/tasks/${taskInfo.id}/subtasks?model_id=${model.id}&dimension_id=${dimension.id}`);
            if (response.ok) {
              const data = await response.json();
              if (data.subtasks && data.subtasks.length > 0) {
                const subtasks = data.subtasks;
                const validScores = subtasks
                  .filter((st: any) => st.score !== null && st.score !== undefined)
                  .map((st: any) => st.score);
                
                if (validScores.length > 0) {
                  const taskAvgScore = validScores.reduce((sum: number, score: number) => sum + score, 0) / validScores.length;
                  
                  // 记录详细数据
                  detailedData.push({
                    任务名称: taskInfo.name,
                    模型名称: model.name,
                    提供商: model.provider || '',
                    评测维度: dimension.name,
                    维度描述: dimension.description || '',
                    平均分数: taskAvgScore,
                    评测次数: validScores.length,
                    任务创建时间: taskInfo.created_at,
                    聚合类型: config.type === 'vertical' ? '纵向聚合' : '横向聚合'
                  });
                  
                  // 更新聚合分数（这里使用简单平均，也可以用加权平均）
                  aggregatedScore = aggregatedScore === null ? taskAvgScore : (aggregatedScore + taskAvgScore) / 2;
                }
              }
            }
          }
          
          modelRow.push(aggregatedScore);
        } catch (error) {
          console.warn(`获取${model.name}-${dimension.name}评分失败:`, error);
          modelRow.push(null);
        }
      }
      
      matrixData.push(modelRow);
    }

    // 2. 构建导出数据结构
    return {
      title: `${config.name} - 聚合分析报告`,
      data: detailedData,
      metadata: {
        generatedAt: new Date().toISOString(),
        source: 'LLM Benchmark System - 聚合分析',
        aggregationId: config.id,
        aggregationType: config.type,
        exportedBy: '系统用户',
        totalRecords: detailedData.length
      },
      // 聚合概览
      taskOverview: {
        id: config.id,
        name: config.name,
        description: `${getTypeLabel(config.type)} - ${getTypeDescription(config.type)}`,
        status: 'completed',
        createdAt: config.createdAt,
        totalSubtasks: detailedData.length,
        completedSubtasks: detailedData.length,
        failedSubtasks: 0,
        template: '聚合分析',
        models: config.models.map((m: any) => m.name),
        dimensions: config.dimensions.map((d: any) => d.name)
      },
      // 矩阵数据
      matrixData: {
        rowHeaders: config.models.map((m: any) => m.name),
        columnHeaders: config.dimensions.map((d: any) => d.name),
        values: matrixData,
        taskInfo: {
          name: config.name,
          description: `${getTypeLabel(config.type)}分析，包含${config.tasksInfo.length}个任务`,
          totalModels: config.models.length,
          totalDimensions: config.dimensions.length
        }
      },
      // 任务统计
      performanceStats: config.tasksInfo.map((task: any) => ({
        任务名称: task.name,
        任务状态: task.status,
        创建时间: task.created_at,
        模型数量: task.models.length,
        维度数量: task.dimensions.length,
        参与聚合: '是'
      }))
    };
  };

  const getTypeDescription = (type: string) => {
    if (type === 'vertical') {
      return '扩展模型范围，保持相同维度';
    } else {
      return '扩展维度范围，保持相同模型';
    }
  };

  const getTypeLabel = (type: string) => {
    return type === 'vertical' ? '纵向聚合' : '横向聚合';
  };

  const getTypeColor = (type: string) => {
    return type === 'vertical' 
      ? 'bg-blue-100 text-blue-800' 
      : 'bg-green-100 text-green-800';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* 操作按钮 */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            正在加载聚合分析... (如果长时间显示此信息，请检查浏览器控制台)
          </div>
          <div className="flex space-x-3">
            <Button variant="outline" disabled>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          </div>
        </div>

        {/* 骨架屏列表 */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {[...Array(3)].map((_, index) => (
              <AggregationItemSkeleton key={index} />
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 操作按钮 */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          总共 {analyses.length} 个聚合分析
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={loadAggregationAnalyses}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      {/* 聚合分析列表 */}
      {analyses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">暂无聚合分析</h3>
          <p className="mt-1 text-sm text-gray-500">
            请先在任务列表中选择任务创建聚合分析
          </p>
          <div className="mt-6">
            <Button onClick={() => window.location.href = '/workbench/tasks'}>
              <Plus className="mr-2 h-4 w-4" />
              去任务列表
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {analyses.map((analysis) => (
              <li key={analysis.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <BarChart3 className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {analysis.name}
                        </p>
                        <div className="mt-1 flex items-center space-x-3 text-sm text-gray-500">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(analysis.type)}`}>
                            {getTypeLabel(analysis.type)}
                          </span>
                          <span>{analysis.taskNames.length} 个任务</span>
                          <span className="flex items-center">
                            {loadingDetails.has(analysis.id) ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                计算中...
                              </>
                            ) : (
                              `${analysis.modelCount || 0} 个模型`
                            )}
                          </span>
                          <span className="flex items-center">
                            {loadingDetails.has(analysis.id) ? (
                              <>
                                <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                计算中...
                              </>
                            ) : (
                              `${analysis.dimensionCount || 0} 个维度`
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">
                          创建时间: {new Date(analysis.createdAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          window.location.href = `/workbench/aggregation/${analysis.id}`;
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportAnalysis(analysis)}
                        disabled={exportingId === analysis.id}
                      >
                        {exportingId === analysis.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteAnalysis(analysis.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* 任务列表 */}
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">包含任务:</p>
                    <div className="flex flex-wrap gap-1">
                      {analysis.taskNames.map((taskName, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700"
                        >
                          {taskName}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}