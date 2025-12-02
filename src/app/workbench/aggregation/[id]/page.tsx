'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, BarChart3, RefreshCw } from 'lucide-react';
import AggregatedMatrix from '@/components/AggregatedMatrix';
import { PreAggregationManager } from '@/lib/aggregation-utils';
import { AggregationCacheManager, PersistentAggregationCache } from '@/lib/smart-cache';

interface AggregationConfig {
  id: string;
  name: string;
  type: 'vertical' | 'horizontal';
  taskIds: string[];
  taskNames: string[];
  createdAt: string;
  modelCount: number;
  dimensionCount: number;
  models: any[];
  dimensions: any[];
  tasksInfo: any[];
  compatibility: any;
}

export default function AggregationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [config, setConfig] = useState<AggregationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  
  // 🚀 快速导出：缓存已加载的矩阵数据
  const [cachedMatrixData, setCachedMatrixData] = useState<Map<string, Map<string, any[]>> | null>(null);
  const [cachedRankingData, setCachedRankingData] = useState<Map<string, Map<string, number>> | null>(null);
  const [cachedOverallRankingData, setCachedOverallRankingData] = useState<Map<string, number> | null>(null);
  
  // 🎯 持久化缓存状态
  const [hasPersistentCache, setHasPersistentCache] = useState(false);
  const [persistentCacheAge, setPersistentCacheAge] = useState<number | null>(null);
  
  // 智能缓存管理器
  const cacheManager = new AggregationCacheManager();

  useEffect(() => {
    loadAggregationConfig();
  }, [params.id]);
  
  // 🎯 检查持久化缓存状态
  useEffect(() => {
    if (params.id) {
      const aggregationId = params.id as string;
      const hasCache = PersistentAggregationCache.hasValidPersistentCache(aggregationId);
      const cacheAge = PersistentAggregationCache.getCacheAge(aggregationId);
      
      setHasPersistentCache(hasCache);
      setPersistentCacheAge(cacheAge);
      
      if (hasCache && cacheAge !== null) {
        console.log(`🎯 检测到持久化缓存: ${aggregationId} (${cacheAge}分钟前)`);
      }
    }
  }, [params.id]);
  
  // 🚀 接收AggregatedMatrix组件的数据用于快速导出和持久化缓存
  const handleMatrixDataReady = (
    matrixData: Map<string, Map<string, any[]>>,
    rankingData: Map<string, Map<string, number>>,
    overallRankingData: Map<string, number>
  ) => {
    console.log('🎯 接收到矩阵数据，缓存用于快速导出:', {
      matrixDataSize: matrixData.size,
      rankingDataSize: rankingData.size,
      overallRankingDataSize: overallRankingData.size
    });
    
    // 设置内存缓存（用于当前会话的快速导出）
    setCachedMatrixData(matrixData);
    setCachedRankingData(rankingData);
    setCachedOverallRankingData(overallRankingData);
    
    // 🎯 保存到持久化缓存（解决下次访问仍需等待的问题）
    if (params.id) {
      const aggregationId = params.id as string;
      PersistentAggregationCache.saveCompleteMatrixData(
        aggregationId,
        matrixData,
        rankingData,
        overallRankingData
      );
      
      // 更新持久化缓存状态
      setHasPersistentCache(true);
      setPersistentCacheAge(0); // 刚刚创建的缓存
    }
  };

  // 🆕 加载任务信息的辅助函数
  const loadTasksInfo = async (taskIds: string[]) => {
    try {
      const response = await fetch('/api/tasks/aggregation-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskIds: taskIds
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.tasks) {
          return data.tasks.map((task: any) => ({
            id: task.id,
            name: task.name,
            status: task.status,
            created_at: task.created_at,
            models: task.models,
            dimensions: task.dimensions
          }));
        }
      }
      
      console.warn('无法获取任务信息，使用基础数据');
      return taskIds.map(id => ({ id, name: `任务-${id.slice(0, 8)}` }));
    } catch (error) {
      console.error('获取任务信息失败:', error);
      return taskIds.map(id => ({ id, name: `任务-${id.slice(0, 8)}` }));
    }
  };

  const loadAggregationConfig = async () => {
    console.log('🔄 开始加载聚合分析详情（持久化缓存优化版）...');
    setLoading(true);
    try {
      // 🚀 使用预聚合管理器获取配置
      const fullConfig = PreAggregationManager.getAggregationConfig(params.id as string);
      if (!fullConfig) {
        console.error('未找到聚合分析配置');
        router.push('/workbench/aggregation');
        return;
      }
      
      console.log('✅ 预聚合配置加载成功:', fullConfig.name);
      
      // 🎯 尝试立即加载持久化缓存的矩阵数据
      const aggregationId = params.id as string;
      const persistedCache = PersistentAggregationCache.loadPersistedMatrixData(aggregationId);
      
      if (persistedCache) {
        console.log('🚀 发现持久化缓存，立即设置矩阵数据 - 实现秒级加载！');
        
        // 立即设置缓存数据，用户可以马上看到结果和进行导出
        setCachedMatrixData(persistedCache.matrixData);
        setCachedRankingData(persistedCache.rankingData);
        setCachedOverallRankingData(persistedCache.overallRankingData);
        
        // 更新缓存状态
        setHasPersistentCache(true);
        setPersistentCacheAge(persistedCache.cacheAge);
        
        console.log(`⚡ 持久化缓存已加载 (${persistedCache.cacheAge}分钟前的数据)`);
      }
      
      // 🆕 第一阶段：立即显示预聚合数据，同时获取tasksInfo
      if (fullConfig.preAggregatedStats && fullConfig.models && fullConfig.dimensions) {
        // 🔧 必须获取tasksInfo，否则矩阵无法显示数据
        const tasksInfo = await loadTasksInfo(fullConfig.taskIds);
        
        const basicConfig = {
          ...fullConfig,
          modelCount: fullConfig.preAggregatedStats.modelCount,
          dimensionCount: fullConfig.preAggregatedStats.dimensionCount,
          tasksInfo: tasksInfo
        };
        
        setConfig(basicConfig);
        setLoading(false);
        console.log('🚀 立即显示预聚合数据，包含任务信息，开始检查是否需要更新...');
        
        // 检查是否需要刷新数据
        if (PreAggregationManager.needsStatsRefresh(fullConfig, 30)) {
          console.log('🔄 数据需要刷新，异步更新中...');
          await loadLatestConfigData(fullConfig);
        } else {
          console.log('✨ 预聚合数据是最新的，无需更新');
        }
        return;
      }
      
      // 回退到原有逻辑（如果没有预聚合数据）
      const basicConfig = fullConfig;
      
      // 🆕 通过API获取完整的任务信息（包括models、dimensions等）
      const response = await fetch('/api/tasks/aggregation-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskIds: basicConfig.taskIds
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

          // 合并基础配置和API数据，并更新计数
          const completeConfig = {
            ...basicConfig,
            tasksInfo: data.tasks,
            models: allModels,
            dimensions: allDimensions,
            // 🔧 修复：更新模型和维度计数
            modelCount: allModels.length,
            dimensionCount: allDimensions.length,
          };
          
          setConfig(completeConfig);
        } else {
          throw new Error('获取聚合信息失败');
        }
      } else {
        throw new Error(`API请求失败: ${response.status}`);
      }
      
    } catch (error) {
      console.error('加载聚合分析配置失败:', error);
      alert('加载聚合分析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 异步加载最新配置数据
  const loadLatestConfigData = async (currentConfig: any) => {
    try {
      // 🚀 使用智能缓存优化API调用
      const cachedStats = cacheManager.getCachedAggregationStats(currentConfig.taskIds);
      if (cachedStats) {
        console.log('💾 使用缓存的统计数据');
        // 更新预聚合数据
        PreAggregationManager.updatePreAggregatedStats(
          currentConfig.id,
          cachedStats.models,
          cachedStats.dimensions
        );
        
        // 更新UI，确保保持tasksInfo
        setConfig(prev => prev ? {
          ...prev,
          models: cachedStats.models,
          dimensions: cachedStats.dimensions,
          modelCount: cachedStats.modelCount,
          dimensionCount: cachedStats.dimensionCount,
          // 🔧 确保tasksInfo得到保持，如果没有则重新获取
          tasksInfo: prev.tasksInfo && prev.tasksInfo.length > 0 
            ? prev.tasksInfo 
            : []
        } : null);
        return;
      }

      console.log('🔄 从API获取最新数据...');
      const response = await fetch('/api/tasks/aggregation-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskIds: currentConfig.taskIds
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

          console.log(`✅ 更新配置数据: ${allModels.length}个模型, ${allDimensions.length}个维度`);

          // 缓存统计信息
          cacheManager.cacheAggregationStats(
            currentConfig.taskIds,
            { 
              modelCount: allModels.length, 
              dimensionCount: allDimensions.length, 
              models: allModels, 
              dimensions: allDimensions 
            },
            60 // 缓存60分钟
          );

          // 更新预聚合数据
          PreAggregationManager.updatePreAggregatedStats(
            currentConfig.id,
            allModels,
            allDimensions
          );
          
          // 更新完整配置
          const updatedConfig = {
            ...currentConfig,
            tasksInfo: data.tasks,
            models: allModels,
            dimensions: allDimensions,
            modelCount: allModels.length,
            dimensionCount: allDimensions.length,
          };
          
          setConfig(updatedConfig);

          // 显示缓存统计
          const cacheStats = cacheManager.getCacheStats();
          console.log(`📊 缓存统计 - 命中率: ${cacheStats.hitRate.toFixed(1)}%, 大小: ${cacheStats.size}/${cacheStats.maxSize}`);
        } else {
          throw new Error('获取聚合信息失败');
        }
      } else {
        console.warn(`⚠️ API请求失败: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ 异步更新配置数据失败:', error);
    }
  };

  // 🚀 快速导出：使用已缓存的矩阵数据构建导出数据
  const buildFastExportData = (
    config: AggregationConfig,
    matrixData: Map<string, Map<string, any[]>>,
    rankingData: Map<string, Map<string, number>>,
    overallRankingData: Map<string, number>
  ) => {
    const { models, dimensions } = config;
    
    // 🔧 安全检查：确保models和dimensions存在
    if (!models || !Array.isArray(models) || models.length === 0) {
      console.error('❌ 快速导出失败：models数据无效', { models });
      throw new Error('模型数据不可用，无法导出');
    }
    
    if (!dimensions || !Array.isArray(dimensions) || dimensions.length === 0) {
      console.error('❌ 快速导出失败：dimensions数据无效', { dimensions });
      throw new Error('维度数据不可用，无法导出');
    }
    
    console.log('🔍 快速导出数据验证通过:', {
      modelsCount: models.length,
      dimensionsCount: dimensions.length,
      matrixDataSize: matrixData.size,
      rankingDataSize: rankingData.size,
      overallRankingSize: overallRankingData.size
    });
    
    // 构建导出数据结构（与原始函数保持一致）
    const exportData: any[] = [];
    
    // 添加标题行
    exportData.push({
      '模型': '模型',
      '整体排名': '整体排名',
      ...dimensions.reduce((acc, dim) => {
        acc[dim.name] = dim.name;
        acc[`${dim.name}_排名`] = `${dim.name}_排名`;
        return acc;
      }, {} as any)
    });
    
    // 为每个模型添加数据行
    models.forEach(model => {
      const row: any = {
        '模型': model.name,
        '整体排名': overallRankingData.get(model.id) || '-'
      };
      
      dimensions.forEach(dimension => {
        const scores = matrixData.get(model.id)?.get(dimension.id) || [];
        const completedScores = scores.filter((s: any) => s.status === 'completed' && s.score !== undefined);
        const latestScore = completedScores.length > 0 ? completedScores[completedScores.length - 1] : null;
        const ranking = rankingData.get(dimension.id)?.get(model.id);
        
        // 格式化分数
        if (latestScore && latestScore.score !== undefined) {
          const scoreValue = latestScore.score;
          row[dimension.name] = Number.isInteger(scoreValue) ? `${scoreValue}%` : `${scoreValue.toFixed(1)}%`;
        } else {
          row[dimension.name] = '-';
        }
        
        // 添加排名信息
        row[`${dimension.name}_排名`] = ranking ? `#${ranking}` : '-';
      });
      
      exportData.push(row);
    });
    
    console.log('⚡ 快速导出数据构建完成:', {
      totalRows: exportData.length,
      totalModels: models.length,
      totalDimensions: dimensions.length
    });
    
    return exportData;
  };

  const handleExport = async () => {
    if (!config) {
      console.error('❌ 导出失败：配置数据不可用');
      alert('导出失败：配置数据不可用，请刷新页面重试');
      return;
    }
    
    console.log('🚀 开始导出聚合分析详情:', config.id);
    setExporting(true);
    
    try {
      let aggregationData;
      
      // 🎯 优先使用缓存的矩阵数据进行快速导出
      if (cachedMatrixData && cachedRankingData && cachedOverallRankingData) {
        console.log('⚡ 使用已缓存的矩阵数据进行秒级导出');
        
        // 🔧 额外验证配置数据完整性
        if (!config.models || !Array.isArray(config.models) || config.models.length === 0) {
          console.error('❌ 快速导出失败：models数据无效', {
            models: config.models,
            isArray: Array.isArray(config.models),
            length: config.models?.length,
            config: config
          });
          throw new Error('模型数据不可用，请刷新页面重试');
        }
        
        if (!config.dimensions || !Array.isArray(config.dimensions) || config.dimensions.length === 0) {
          console.error('❌ 快速导出失败：dimensions数据无效', {
            dimensions: config.dimensions,
            isArray: Array.isArray(config.dimensions),
            length: config.dimensions?.length,
            config: config
          });
          throw new Error('维度数据不可用，请刷新页面重试');
        }
        
        aggregationData = buildFastExportData(config, cachedMatrixData, cachedRankingData, cachedOverallRankingData);
        
      } else {
        console.log('📥 缓存数据不可用，使用标准导出流程');
        
        // 检查是否有可用的导出函数
        if (typeof buildAggregationExportData === 'undefined') {
          throw new Error('标准导出功能不可用，请刷新页面重试');
        }
        
        aggregationData = await buildAggregationExportData(config);
      }
      
      // 验证导出数据
      if (!aggregationData || aggregationData.length === 0) {
        throw new Error('导出数据为空，请确认聚合分析数据已完全加载');
      }
      
      // 包装数据为ExportData格式
      const exportDataPackage = {
        title: `${config.name} - 聚合分析报告`,
        data: aggregationData,
        metadata: {
          generatedAt: new Date().toISOString(),
          source: 'AI Benchmark V2 - 聚合分析',
          aggregationType: getTypeLabel(config.type),
          configId: config.id
        }
      };
      
      // 使用现有的exportData工具
      const { exportData } = await import('@/lib/export-utils');
      await exportData(exportDataPackage, 'excel', `${config.name}_聚合分析`);
      
      console.log('✅ 导出完成，数据行数:', aggregationData.length);
      
    } catch (error) {
      console.error('❌ 导出聚合分析失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误，请重试';
      alert(`导出失败: ${errorMessage}`);
    } finally {
      setExporting(false);
    }
  };

  const getTypeLabel = (type: string) => {
    return type === 'vertical' ? '纵向聚合' : '横向聚合';
  };

  const getTypeDescription = (type: string) => {
    if (type === 'vertical') {
      return '扩展模型范围，保持相同维度';
    } else {
      return '扩展维度范围，保持相同模型';
    }
  };

  // 🆕 获取测试用例max_score信息（与AggregatedMatrix一致）
  const fetchTestCaseMaxScores = async (tasksInfo: any[]): Promise<Map<string, number>> => {
    const maxScoresMap = new Map<string, number>();
    
    for (const taskInfo of tasksInfo) {
      try {
        const response = await fetch(`/api/tasks/${taskInfo.id}/subtasks`);
        if (response.ok) {
          const data = await response.json();
          if (data.subtasks && data.subtasks.length > 0) {
            data.subtasks.forEach((subtask: any) => {
              if (subtask.test_case_id && subtask.test_case_max_score) {
                maxScoresMap.set(subtask.test_case_id, subtask.test_case_max_score);
              }
            });
          }
        }
      } catch (error) {
        console.warn(`获取任务 ${taskInfo.id} 的测试用例max_score失败:`, error);
      }
    }
    
    return maxScoresMap;
  };

  // 🆕 计算正确的百分制评分（与AggregatedMatrix一致）
  const calculateCorrectPercentage = (rawResults: any[], maxScoresMap: Map<string, number>): number => {
    if (!rawResults || rawResults.length === 0) return 0;
    
    let totalScore = 0;
    let totalMaxScore = 0;
    
    rawResults.forEach(result => {
      const score = result.score || 0;
      const testCaseId = result.test_case_id;
      const maxScore = maxScoresMap.get(testCaseId) || 0;
      
      totalScore += score;
      totalMaxScore += maxScore;
    });
    
    if (totalMaxScore === 0) return 0;
    
    // 正确的百分制计算：(总得分/总满分) × 100
    const percentage = Math.round((totalScore / totalMaxScore) * 100 * 10) / 10;
    return percentage;
  };

  // 🆕 计算排名信息（与AggregatedMatrix一致）
  const calculateRankings = (
    matrixData: Map<string, Map<string, number>>, 
    models: any[], 
    dimensions: any[]
  ): Map<string, Map<string, number>> => {
    const rankings = new Map<string, Map<string, number>>();
    
    // 为每个维度计算排名
    dimensions.forEach(dimension => {
      // 收集该维度下所有模型的评分
      const dimensionScores: Array<{ modelId: string; score: number }> = [];
      
      models.forEach(model => {
        const modelData = matrixData.get(model.id);
        if (modelData?.has(dimension.id)) {
          const score = modelData.get(dimension.id) || 0;
          dimensionScores.push({ modelId: model.id, score });
        }
      });
      
      // 按分数降序排序
      dimensionScores.sort((a, b) => b.score - a.score);
      
      // 分配排名
      dimensionScores.forEach((entry, index) => {
        if (!rankings.has(entry.modelId)) {
          rankings.set(entry.modelId, new Map());
        }
        rankings.get(entry.modelId)?.set(dimension.id, index + 1);
      });
    });
    
    return rankings;
  };

  // 🆕 构建聚合分析导出数据（使用与矩阵相同的百分制计算）
  const buildAggregationExportData = async (config: AggregationConfig) => {
    console.log('🔄 开始构建聚合分析导出数据...');
    
    // 🔧 安全检查：确保必要的数据存在
    if (!config.models || !Array.isArray(config.models) || config.models.length === 0) {
      console.error('❌ 标准导出失败：models数据无效', { models: config.models });
      throw new Error('模型数据不可用，无法进行标准导出');
    }
    
    if (!config.dimensions || !Array.isArray(config.dimensions) || config.dimensions.length === 0) {
      console.error('❌ 标准导出失败：dimensions数据无效', { dimensions: config.dimensions });
      throw new Error('维度数据不可用，无法进行标准导出');
    }
    
    if (!config.tasksInfo || !Array.isArray(config.tasksInfo) || config.tasksInfo.length === 0) {
      console.error('❌ 标准导出失败：tasksInfo数据无效', { tasksInfo: config.tasksInfo });
      throw new Error('任务信息不可用，无法进行标准导出');
    }
    
    console.log('🔍 标准导出数据验证通过:', {
      modelsCount: config.models.length,
      dimensionsCount: config.dimensions.length,
      tasksInfoCount: config.tasksInfo.length
    });
    
    // 1. 首先获取测试用例的max_score信息
    const maxScoresMap = await fetchTestCaseMaxScores(config.tasksInfo);
    console.log('📊 获得max_score信息:', maxScoresMap.size, '个测试用例');
    
    // 2. 构建模型-维度评分矩阵和详细数据
    const matrixData: Map<string, Map<string, number>> = new Map();
    const detailedData: any[] = [];
    const modelScores: Map<string, number[]> = new Map(); // 用于计算排名
    
    // 初始化矩阵
    config.models.forEach(model => {
      matrixData.set(model.id, new Map());
      modelScores.set(model.id, []);
    });
    
    for (const model of config.models) {
      console.log(`🔄 处理模型: ${model.name}`);
      
      for (const dimension of config.dimensions) {
        try {
          // 从所有任务中收集该模型-维度组合的原始评分数据
          const allResults: any[] = [];
          
          for (const taskInfo of config.tasksInfo) {
            const response = await fetch(`/api/tasks/${taskInfo.id}/subtasks?model_id=${model.id}&dimension_id=${dimension.id}`);
            if (response.ok) {
              const data = await response.json();
              if (data.subtasks && data.subtasks.length > 0) {
                allResults.push(...data.subtasks);
              }
            }
          }
          
          if (allResults.length > 0) {
            // 🎯 使用与AggregatedMatrix相同的百分制计算逻辑
            const percentageScore = calculateCorrectPercentage(allResults, maxScoresMap);
            
            // 存储百分制评分
            matrixData.get(model.id)?.set(dimension.id, percentageScore);
            modelScores.get(model.id)?.push(percentageScore);
            
            // 记录详细数据
            detailedData.push({
              任务组合: config.tasksInfo.map(t => t.name).join(' + '),
              模型名称: model.name,
              提供商: model.provider || '',
              评测维度: dimension.name,
              维度描述: dimension.description || '',
              百分制评分: Math.round(percentageScore * 10) / 10, // 保留1位小数
              原始评分总计: allResults.reduce((sum, r) => sum + (r.score || 0), 0),
              满分总计: allResults.reduce((sum, r) => {
                const testCaseId = r.test_case_id;
                return sum + (maxScoresMap.get(testCaseId) || 0);
              }, 0),
              评测次数: allResults.length,
              聚合类型: config.type === 'vertical' ? '纵向聚合' : '横向聚合',
              创建时间: config.createdAt
            });
          } else {
            // 无数据的情况
            matrixData.get(model.id)?.set(dimension.id, 0);
            detailedData.push({
              任务组合: config.tasksInfo.map(t => t.name).join(' + '),
              模型名称: model.name,
              提供商: model.provider || '',
              评测维度: dimension.name,
              维度描述: dimension.description || '',
              百分制评分: 0,
              原始评分总计: 0,
              满分总计: 0,
              评测次数: 0,
              聚合类型: config.type === 'vertical' ? '纵向聚合' : '横向聚合',
              创建时间: config.createdAt
            });
          }
        } catch (error) {
          console.warn(`获取${model.name}-${dimension.name}评分失败:`, error);
          matrixData.get(model.id)?.set(dimension.id, 0);
        }
      }
    }

    // 3. 计算排名信息
    const rankingData = calculateRankings(matrixData, config.models, config.dimensions);
    
    // 4. 为详细数据添加排名信息
    detailedData.forEach(item => {
      const modelId = config.models.find(m => m.name === item.模型名称)?.id;
      const dimensionId = config.dimensions.find(d => d.name === item.评测维度)?.id;
      
      if (modelId && dimensionId && rankingData.has(modelId)) {
        const modelRanking = rankingData.get(modelId);
        if (modelRanking?.has(dimensionId)) {
          const ranking = modelRanking.get(dimensionId);
          item.维度排名 = `${ranking}/${config.models.length}`;
          item.排名描述 = `在${item.评测维度}维度中排名第${ranking}`;
        }
      }
      
      // 计算该模型的总体平均分和排名
      const modelId2 = config.models.find(m => m.name === item.模型名称)?.id;
      if (modelId2 && modelScores.has(modelId2)) {
        const scores = modelScores.get(modelId2) || [];
        const avgScore = scores.length > 0 
          ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
          : 0;
        item.模型总体平均分 = avgScore;
      }
    });

    console.log('✅ 构建聚合分析导出数据完成');
    console.log('📊 导出数据预览:', {
      总记录数: detailedData.length,
      样例数据: detailedData.slice(0, 2),
      矩阵维度: `${config.models.length}个模型 × ${config.dimensions.length}个维度`
    });

    // 5. 构建导出数据结构
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
        models: config.models.map(m => m.name),
        dimensions: config.dimensions.map(d => d.name)
      },
      // 矩阵数据
      matrixData: {
        rowHeaders: config.models.map(m => m.name),
        columnHeaders: config.dimensions.map(d => d.name),
        values: matrixData,
        taskInfo: {
          name: config.name,
          description: `${getTypeLabel(config.type)}分析，包含${config.tasksInfo.length}个任务`,
          totalModels: config.models.length,
          totalDimensions: config.dimensions.length
        }
      },
      // 任务统计
      performanceStats: config.tasksInfo.map(task => ({
        任务名称: task.name,
        任务状态: task.status,
        创建时间: task.created_at,
        模型数量: task.models.length,
        维度数量: task.dimensions.length,
        参与聚合: '是'
      }))
    };
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Button>
        </div>
        
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">加载中...</div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Button>
        </div>
        
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">未找到聚合分析</h3>
          <p className="mt-1 text-sm text-gray-500">
            请检查聚合分析是否存在
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题和操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{config.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {getTypeLabel(config.type)} • {getTypeDescription(config.type)}
            </p>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <Button variant="outline" onClick={loadAggregationConfig}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                导出中...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {cachedMatrixData ? '快速导出' : '导出结果'}
                {cachedMatrixData && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                    {hasPersistentCache ? '💾⚡' : '⚡'}
                  </span>
                )}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 聚合分析信息 */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">聚合信息</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <dt className="text-sm font-medium text-gray-500">聚合类型</dt>
            <dd className="mt-1 text-sm text-gray-900">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                config.type === 'vertical' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {getTypeLabel(config.type)}
              </span>
            </dd>
          </div>
          
          <div>
            <dt className="text-sm font-medium text-gray-500">包含任务</dt>
            <dd className="mt-1 text-sm text-gray-900">{config.taskNames.length} 个</dd>
          </div>
          
          <div>
            <dt className="text-sm font-medium text-gray-500">评测模型</dt>
            <dd className="mt-1 text-sm text-gray-900">{config.modelCount} 个</dd>
          </div>
          
          <div>
            <dt className="text-sm font-medium text-gray-500">评测维度</dt>
            <dd className="mt-1 text-sm text-gray-900">{config.dimensionCount} 个</dd>
          </div>
          
          {/* 🎯 缓存状态指示器 */}
          <div>
            <dt className="text-sm font-medium text-gray-500">缓存状态</dt>
            <dd className="mt-1 text-sm">
              {hasPersistentCache ? (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  💾 已缓存 
                  {persistentCacheAge !== null && persistentCacheAge > 0 && (
                    <span className="ml-1">({persistentCacheAge}分钟前)</span>
                  )}
                </span>
              ) : cachedMatrixData ? (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  ⚡ 会话缓存
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  📥 加载中
                </span>
              )}
            </dd>
          </div>
        </div>

        {/* 任务列表 */}
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">包含的任务:</h4>
          <div className="flex flex-wrap gap-2">
            {config.taskNames.map((taskName, index) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700"
              >
                {taskName}
              </span>
            ))}
          </div>
        </div>

        {/* 兼容性信息 */}
        {config.compatibility && (
          <div className="mt-6">
            <h4 className="text-sm font-medium text-gray-900 mb-3">兼容性分析:</h4>
            <div className="space-y-2 text-sm">
              {config.compatibility.canVertical && (
                <div className="text-green-600">
                  ✓ 支持纵向聚合: {config.compatibility.verticalReason}
                </div>
              )}
              {config.compatibility.canHorizontal && (
                <div className="text-green-600">
                  ✓ 支持横向聚合: {config.compatibility.horizontalReason}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 聚合矩阵 */}
      <AggregatedMatrix
        aggregationId={config.id}
        type={config.type}
        models={config.models || []}
        dimensions={config.dimensions || []}
        tasksInfo={config.tasksInfo || []}
        onDataReady={handleMatrixDataReady}
        preloadedMatrixData={cachedMatrixData}
        preloadedRankingData={cachedRankingData}
        preloadedOverallRankingData={cachedOverallRankingData}
      />
    </div>
  );
}