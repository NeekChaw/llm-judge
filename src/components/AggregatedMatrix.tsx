'use client';

import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ModelData {
  id: string;
  name: string;
  provider?: string;
}

interface DimensionData {
  id: string;
  name: string;
  description?: string;
}

interface ScoreCell {
  score?: number;
  status: 'completed' | 'running' | 'failed' | 'pending';
  taskId: string;
  taskName: string;
  createdAt: string;
}

interface ChangeIndicator {
  scoreChange?: number;
  rankChange?: number;
  previousScore?: number;
  previousRank?: number;
}

interface AggregatedMatrixProps {
  aggregationId: string;
  type: 'vertical' | 'horizontal';
  models: ModelData[];
  dimensions: DimensionData[];
  tasksInfo: any[];
  onLoadScores?: (modelId: string, dimensionId: string) => Promise<ScoreCell[]>;
  onDataReady?: (matrixData: Map<string, Map<string, ScoreCell[]>>, rankingData: Map<string, Map<string, number>>, overallRankingData: Map<string, number>) => void;
  
  // 🎯 预加载缓存数据支持 - 实现真正的秒级加载
  preloadedMatrixData?: Map<string, Map<string, any[]>>;
  preloadedRankingData?: Map<string, Map<string, number>>;
  preloadedOverallRankingData?: Map<string, number>;
}

export default function AggregatedMatrix({
  aggregationId,
  type,
  models,
  dimensions,
  tasksInfo,
  onLoadScores,
  onDataReady,
  preloadedMatrixData,
  preloadedRankingData,
  preloadedOverallRankingData
}: AggregatedMatrixProps) {
  const [matrixData, setMatrixData] = useState<Map<string, Map<string, ScoreCell[]>>>(new Map());
  const [changeData, setChangeData] = useState<Map<string, Map<string, ChangeIndicator>>>(new Map());
  const [rankingData, setRankingData] = useState<Map<string, Map<string, number>>>(new Map());
  const [overallRankingData, setOverallRankingData] = useState<Map<string, number>>(new Map()); // 🆕 整体排名数据
  const [loading, setLoading] = useState(true);
  const [showChanges, setShowChanges] = useState(true);
  const [showRanking, setShowRanking] = useState(true);
  const [showOverallRanking, setShowOverallRanking] = useState(true); // 🆕 显示整体排名开关

  // 🎯 独立处理预加载缓存数据的 useEffect
  useEffect(() => {
    if (preloadedMatrixData && preloadedRankingData && preloadedOverallRankingData) {
      console.log('🚀 检测到预加载缓存数据，立即使用 - 真正实现秒级加载！');
      
      // 🔧 转换预加载数据格式为ScoreCell[]格式
      const convertedMatrixData = new Map<string, Map<string, ScoreCell[]>>();
      
      for (const [modelId, dimensionMap] of preloadedMatrixData.entries()) {
        const convertedDimensionMap = new Map<string, ScoreCell[]>();
        
        for (const [dimensionId, scores] of dimensionMap.entries()) {
          // 将缓存的any[]数据转换为ScoreCell[]格式
          const convertedScores: ScoreCell[] = Array.isArray(scores) ? scores.map((score: any) => ({
            score: typeof score.score === 'number' ? score.score : undefined,
            status: score.status || 'completed',
            taskId: score.taskId || '',
            taskName: score.taskName || '',
            createdAt: score.createdAt || new Date().toISOString()
          })) : [];
          
          convertedDimensionMap.set(dimensionId, convertedScores);
        }
        
        convertedMatrixData.set(modelId, convertedDimensionMap);
      }
      
      console.log('🔧 预加载数据格式转换完成:', {
        originalModels: preloadedMatrixData.size,
        convertedModels: convertedMatrixData.size,
        sampleData: Array.from(convertedMatrixData.entries()).slice(0, 1)
      });
      
      // 设置转换后的数据
      setMatrixData(convertedMatrixData);
      setRankingData(preloadedRankingData);
      setOverallRankingData(preloadedOverallRankingData);
      setLoading(false);
      
      // 立即触发回调，让父组件知道数据已准备就绪
      if (onDataReady) {
        console.log('⚡ 预加载数据就绪，立即通知父组件');
        onDataReady(convertedMatrixData, preloadedRankingData, preloadedOverallRankingData);
      }
      
      console.log('✅ 预加载缓存数据已应用，跳过网络请求');
    }
  }, [preloadedMatrixData?.size, preloadedRankingData?.size, preloadedOverallRankingData?.size]);

  // 🔧 标准数据加载流程
  useEffect(() => {
    // 如果已经有预加载数据，跳过标准加载
    if (preloadedMatrixData && preloadedRankingData && preloadedOverallRankingData) {
      console.log('⏩ 已有预加载数据，跳过标准加载流程');
      return;
    }
    
    console.log('📡 未检测到预加载数据，使用标准加载流程');
    const loadDataSequentially = async () => {
      const maxScoresMap = await fetchTestCaseMaxScores();
      loadAggregatedData(maxScoresMap);
    };
    
    loadDataSequentially();
  }, [aggregationId, models, dimensions, tasksInfo]);

  // 🆕 获取测试用例max_score数据
  const fetchTestCaseMaxScores = async (): Promise<Map<string, number>> => {
    if (!tasksInfo || tasksInfo.length === 0) {
      const emptyMap = new Map<string, number>();
      setTestCaseMaxScores(emptyMap);
      return emptyMap;
    }
    
    try {
      setIsLoadingMaxScores(true);
      const maxScoresMap = new Map<string, number>();
      
      // 为每个任务获取测试用例max_score信息
      for (const taskInfo of tasksInfo) {
        try {
          // 🔧 修复：使用正确的API端点
          const response = await fetch(`/api/tasks/${taskInfo.id}/subtasks`);
          
          if (response.ok) {
            const data = await response.json();
            
            // 🔧 修复：从subtasks的runs.raw_results中提取test_case_max_score信息
            data.subtasks?.forEach((subtask: any) => {
              if (subtask.runs && Array.isArray(subtask.runs)) {
                // 多运行任务：从raw_results中提取
                subtask.runs.forEach((run: any) => {
                  if (run.raw_results && Array.isArray(run.raw_results)) {
                    run.raw_results.forEach((result: any) => {
                      if (result.test_case_id && result.test_case_max_score) {
                        maxScoresMap.set(result.test_case_id, result.test_case_max_score);
                      }
                    });
                  }
                });
              } else if (subtask._raw_results && Array.isArray(subtask._raw_results)) {
                // 单运行任务：从_raw_results中提取
                subtask._raw_results.forEach((result: any) => {
                  if (result.test_case_id && result.test_case_max_score) {
                    maxScoresMap.set(result.test_case_id, result.test_case_max_score);
                  }
                });
              }
            });
            
            console.log('📋 从任务', taskInfo.id, '提取max_score:', {
              subtaskCount: data.subtasks?.length || 0,
              maxScoresFound: Array.from(maxScoresMap.entries()).filter(([k, v]) => k && v).length
            });
          }
        } catch (error) {
          console.warn(`获取任务${taskInfo.id}的测试用例max_score失败:`, error);
        }
      }
      
      console.log('📋 最终testCaseMaxScores:', {
        totalScores: maxScoresMap.size,
        sampleScores: Array.from(maxScoresMap.entries()).slice(0, 5)
      });
      
      setTestCaseMaxScores(maxScoresMap);
      return maxScoresMap; // 🔧 修复：直接返回数据而不依赖状态
    } catch (error) {
      console.error('获取测试用例max_score数据失败:', error);
      const emptyMap = new Map<string, number>();
      setTestCaseMaxScores(emptyMap);
      return emptyMap;
    } finally {
      setIsLoadingMaxScores(false);
    }
  };

  const loadAggregatedData = async (maxScoresMap?: Map<string, number>) => {
    setLoading(true);
    
    try {
      const newMatrixData = new Map<string, Map<string, ScoreCell[]>>();
      const newChangeData = new Map<string, Map<string, ChangeIndicator>>();

      // 为每个模型-维度组合获取评分数据
      for (const model of models) {
        const modelMap = new Map<string, ScoreCell[]>();
        const modelChangeMap = new Map<string, ChangeIndicator>();
        
        for (const dimension of dimensions) {
          try {
            // 获取该模型在该维度的所有评分（来自不同任务）
            const scores = await fetchScoresForModelDimension(model.id, dimension.id, maxScoresMap);
            modelMap.set(dimension.id, scores);
            
            // 计算变化指标
            const changeIndicator = calculateChangeIndicator(scores);
            if (changeIndicator) {
              modelChangeMap.set(dimension.id, changeIndicator);
            }
          } catch (error) {
            console.error(`获取${model.name}-${dimension.name}评分失败:`, error);
            modelMap.set(dimension.id, []);
          }
        }
        
        newMatrixData.set(model.id, modelMap);
        newChangeData.set(model.id, modelChangeMap);
      }

      setMatrixData(newMatrixData);
      setChangeData(newChangeData);
      
      // 计算排名数据
      const newRankingData = calculateRankings(newMatrixData);
      setRankingData(newRankingData);
      
      // 🆕 计算整体排名
      const newOverallRankingData = calculateOverallRankings(newMatrixData, maxScoresMap || new Map());
      setOverallRankingData(newOverallRankingData);
      
      // 🚀 数据加载完成，触发回调提供给父组件用于快速导出
      if (onDataReady) {
        console.log('🎯 矩阵数据加载完成，提供数据给父组件进行快速导出');
        onDataReady(newMatrixData, newRankingData, newOverallRankingData);
      }
      
    } catch (error) {
      console.error('加载聚合数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchScoresForModelDimension = async (modelId: string, dimensionId: string, maxScoresMap?: Map<string, number>): Promise<ScoreCell[]> => {
    // 如果提供了自定义加载函数，使用它
    if (onLoadScores) {
      return await onLoadScores(modelId, dimensionId);
    }

    // 默认实现：从各个任务中提取评分数据
    const scores: ScoreCell[] = [];
    
    for (const taskInfo of tasksInfo) {
      try {
        const response = await fetch(`/api/tasks/${taskInfo.id}/subtasks?model_id=${modelId}&dimension_id=${dimensionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.subtasks && data.subtasks.length > 0) {
            const subtasks = data.subtasks;
            
            if (subtasks.length > 0) {
              const firstSubtask = subtasks[0];
              let taskPercentage = 0;
              
              if (firstSubtask.runs && Array.isArray(firstSubtask.runs)) {
                // 🔧 修复：多运行任务 - 对每个run分别计算百分比，然后求平均值
                const runPercentages: number[] = [];
                
                for (const run of firstSubtask.runs) {
                  if (run.raw_results && Array.isArray(run.raw_results)) {
                    const runRawResults = run.raw_results.map((result: any) => ({
                      score: result.score,
                      status: result.status,
                      test_case_id: result.test_case_id
                    }));
                    
                    const runPercentage = calculateCorrectPercentage(runRawResults, maxScoresMap || testCaseMaxScores);
                    runPercentages.push(runPercentage);
                    
                    console.log(`🔍 任务${taskInfo.id} Run ${run.run_index}:`, {
                      rawResultsCount: runRawResults.length,
                      runPercentage: runPercentage
                    });
                  }
                }
                
                // 计算所有运行的平均百分比
                taskPercentage = runPercentages.length > 0 
                  ? runPercentages.reduce((sum, p) => sum + p, 0) / runPercentages.length
                  : 0;
                  
                console.log(`📊 任务${taskInfo.id}最终百分比:`, {
                  runCount: runPercentages.length,
                  runPercentages: runPercentages,
                  taskPercentage: taskPercentage
                });
                
              } else {
                // 单运行任务：直接使用subtasks数据
                const rawResults = subtasks.map((st: any) => ({
                  score: st.score,
                  status: st.status,
                  test_case_id: st.test_case_id
                }));
                
                taskPercentage = calculateCorrectPercentage(rawResults, maxScoresMap || testCaseMaxScores);
              }
              
              scores.push({
                score: taskPercentage,
                status: firstSubtask.status as any,
                taskId: taskInfo.id,
                taskName: taskInfo.name,
                createdAt: taskInfo.created_at
              });
            }
          }
        }
      } catch (error) {
        console.warn(`获取任务${taskInfo.id}评分失败:`, error);
      }
    }

    // 按创建时间排序
    return scores.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  };

  // 🆕 添加与EvaluationResultsMatrix相同的formatPercentage函数
  const formatPercentage = (score: number): string => {
    return Number.isInteger(score) ? `${score}%` : `${score.toFixed(1)}%`;
  };

  // 🆕 排名颜色样式函数
  const getRankingColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-600 bg-yellow-50';
    if (rank === 2) return 'text-gray-600 bg-gray-50';  
    if (rank === 3) return 'text-orange-600 bg-orange-50';
    return 'text-blue-600 bg-blue-50';
  };

  // 🆕 根据整体排名对模型进行排序
  const getSortedModels = () => {
    if (!showOverallRanking || overallRankingData.size === 0) {
      // 如果不显示整体排名或没有排名数据，保持原有顺序
      return models;
    }

    return [...models].sort((a, b) => {
      const rankA = overallRankingData.get(a.id) || Number.MAX_SAFE_INTEGER;
      const rankB = overallRankingData.get(b.id) || Number.MAX_SAFE_INTEGER;
      return rankA - rankB; // 升序排序：排名1的在前面
    });
  };

  // 🆕 测试用例max_score数据状态
  const [testCaseMaxScores, setTestCaseMaxScores] = useState<Map<string, number>>(new Map());
  const [isLoadingMaxScores, setIsLoadingMaxScores] = useState(false);

  // 🆕 计算整体排名数据
  const calculateOverallRankings = (matrixData: Map<string, Map<string, ScoreCell[]>>, maxScoresMap: Map<string, number>): Map<string, number> => {
    const overallRankings = new Map<string, number>();
    
    // 收集所有模型的整体平均分数
    const modelOverallScores: { modelId: string, avgScore: number }[] = [];
    
    models.forEach(model => {
      const modelScores: number[] = [];
      
      // 收集该模型在所有维度的最新分数
      dimensions.forEach(dimension => {
        const scores = matrixData.get(model.id)?.get(dimension.id) || [];
        const completedScores = scores.filter(s => s.status === 'completed' && s.score !== undefined);
        const latestScore = completedScores[completedScores.length - 1];
        
        if (latestScore && latestScore.score !== undefined) {
          modelScores.push(latestScore.score);
        }
      });
      
      // 计算该模型的整体平均分数
      if (modelScores.length > 0) {
        const avgScore = modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length;
        modelOverallScores.push({ modelId: model.id, avgScore });
      }
    });
    
    // 按平均分数降序排序，然后分配排名
    modelOverallScores.sort((a, b) => b.avgScore - a.avgScore);
    
    let currentRank = 1;
    for (let i = 0; i < modelOverallScores.length; i++) {
      if (i > 0 && modelOverallScores[i].avgScore < modelOverallScores[i - 1].avgScore) {
        currentRank = i + 1;
      }
      overallRankings.set(modelOverallScores[i].modelId, currentRank);
    }
    
    console.log('📊 整体排名计算结果:', {
      totalModels: modelOverallScores.length,
      rankings: Array.from(overallRankings.entries())
    });
    
    return overallRankings;
  };

  // 🆕 计算排名数据
  const calculateRankings = (matrixData: Map<string, Map<string, ScoreCell[]>>): Map<string, Map<string, number>> => {
    const rankings = new Map<string, Map<string, number>>();
    
    // 为每个维度计算排名
    dimensions.forEach(dimension => {
      const dimensionRankings = new Map<string, number>();
      
      // 收集所有模型在这个维度的最新分数
      const modelScores: { modelId: string, score: number }[] = [];
      
      models.forEach(model => {
        const scores = matrixData.get(model.id)?.get(dimension.id) || [];
        // 🔧 修复：获取最新的完成评分（按创建时间）
        const completedScores = scores.filter(s => s.status === 'completed' && s.score !== undefined);
        const latestScore = completedScores[completedScores.length - 1]; // 最后一个就是最新的
        if (latestScore && latestScore.score !== undefined) {
          modelScores.push({ modelId: model.id, score: latestScore.score });
        }
      });
      
      // 按分数降序排序，然后分配排名
      modelScores.sort((a, b) => b.score - a.score);
      
      let currentRank = 1;
      for (let i = 0; i < modelScores.length; i++) {
        if (i > 0 && modelScores[i].score < modelScores[i - 1].score) {
          currentRank = i + 1;
        }
        dimensionRankings.set(modelScores[i].modelId, currentRank);
      }
      
      rankings.set(dimension.id, dimensionRankings);
    });
    
    return rankings;
  };

  // 🆕 API返回的是错误的简单平均分，需要重新计算正确的百分制分数
  const calculateCorrectPercentage = (rawResults: any[], maxScoresMap: Map<string, number>): number => {
    console.log('🔍 AggregatedMatrix calculateCorrectPercentage 被调用:', {
      rawResultsLength: rawResults?.length || 0,
      maxScoresMapSize: maxScoresMap?.size || 0,
      firstResult: rawResults?.[0]
    });
    
    if (!rawResults || rawResults.length === 0) return 0;
    
    let totalScore = 0;
    let totalMaxScore = 0;
    
    rawResults.forEach(result => {
      if (result.status === 'completed' && result.score !== null) {
        totalScore += result.score;
        // 使用实际的max_score，如果没有则默认5分（0-5量表）
        const maxScore = result.test_case_id ? maxScoresMap.get(result.test_case_id) || 5 : 5;
        totalMaxScore += maxScore;
      }
    });
    
    if (totalMaxScore === 0) return 0;
    
    // 正确的百分制计算：(总得分/总满分) × 100
    const percentage = Math.round((totalScore / totalMaxScore) * 100 * 10) / 10; // 保留1位小数
    
    console.log('📊 AggregatedMatrix calculateCorrectPercentage 计算结果:', {
      totalScore,
      totalMaxScore,
      percentage,
      resultCount: rawResults.length
    });
    
    return percentage;
  };

  const calculateChangeIndicator = (scores: ScoreCell[]): ChangeIndicator | null => {
    if (scores.length < 2) return null;

    const completedScores = scores.filter(s => s.status === 'completed' && s.score !== undefined);
    if (completedScores.length < 2) return null;

    const latest = completedScores[completedScores.length - 1];
    const previous = completedScores[completedScores.length - 2];

    const scoreChange = (latest.score || 0) - (previous.score || 0);
    
    return {
      scoreChange,
      previousScore: previous.score,
      // TODO: 计算排名变化需要全局排名信息
      rankChange: undefined,
      previousRank: undefined
    };
  };

  const renderScoreCell = (modelId: string, dimensionId: string) => {
    const scores = matrixData.get(modelId)?.get(dimensionId) || [];
    const change = changeData.get(modelId)?.get(dimensionId);
    const ranking = rankingData.get(dimensionId)?.get(modelId);
    
    if (scores.length === 0) {
      return (
        <td key={`${modelId}-${dimensionId}`} className="px-3 py-2 text-center border border-gray-200">
          <span className="text-gray-400">-</span>
        </td>
      );
    }

    // 🔧 修复：使用最新的评分（按创建时间）- 获取数组中最后一个完成的评分
    const completedScores = scores.filter(s => s.status === 'completed' && s.score !== undefined);
    const latestScore = completedScores[completedScores.length - 1]; // 最后一个就是最新的
    const currentScore = latestScore?.score;

    return (
      <td key={`${modelId}-${dimensionId}`} className="px-3 py-2 text-center border border-gray-200 relative">
        <div className="flex flex-col items-center">
          {/* 当前分数 */}
          <div className="font-medium">
            {currentScore !== undefined ? formatPercentage(currentScore) : '-'}
          </div>
          
          {/* 排名信息 */}
          {showRanking && ranking && (
            <div className={`text-xs px-2 py-0.5 rounded-full mt-1 font-medium ${getRankingColor(ranking)}`}>
              #{ranking}
            </div>
          )}
          
          {/* 变化指示器 */}
          {showChanges && change && change.scoreChange !== undefined && (
            <div className={`text-xs flex items-center mt-1 ${
              change.scoreChange > 0 ? 'text-green-600' : 
              change.scoreChange < 0 ? 'text-red-600' : 
              'text-gray-500'
            }`}>
              {change.scoreChange > 0 && <TrendingUp className="w-3 h-3 mr-1" />}
              {change.scoreChange < 0 && <TrendingDown className="w-3 h-3 mr-1" />}
              {change.scoreChange === 0 && <Minus className="w-3 h-3 mr-1" />}
              
              <span>
                {change.scoreChange > 0 ? '+' : ''}{change.scoreChange.toFixed(1)}
              </span>
            </div>
          )}
          
          {/* 数据来源提示 */}
          <div className="text-xs text-gray-400 mt-1">
            {scores.length > 1 ? `${scores.length}个任务` : scores[0]?.taskName}
          </div>
        </div>
      </td>
    );
  };

  // 🆕 渲染整体排名单元格
  const renderOverallRankingCell = (modelId: string) => {
    const overallRanking = overallRankingData.get(modelId);
    
    // 计算该模型的整体平均分数
    const modelScores: number[] = [];
    dimensions.forEach(dimension => {
      const scores = matrixData.get(modelId)?.get(dimension.id) || [];
      const completedScores = scores.filter(s => s.status === 'completed' && s.score !== undefined);
      const latestScore = completedScores[completedScores.length - 1];
      
      if (latestScore && latestScore.score !== undefined) {
        modelScores.push(latestScore.score);
      }
    });
    
    const avgScore = modelScores.length > 0 
      ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length 
      : 0;

    return (
      <td key={`overall-${modelId}`} className="px-3 py-2 text-center border border-gray-200 bg-yellow-50">
        <div className="flex flex-col items-center">
          {/* 整体平均分数 */}
          <div className="font-medium text-lg">
            {avgScore > 0 ? formatPercentage(avgScore) : '-'}
          </div>
          
          {/* 整体排名 */}
          {overallRanking && (
            <div className={`text-sm px-3 py-1 rounded-full mt-1 font-bold ${getRankingColor(overallRanking)}`}>
              #{overallRanking}
            </div>
          )}
          
          {/* 参与维度数量提示 */}
          <div className="text-xs text-gray-500 mt-1">
            {modelScores.length}/{dimensions.length} 维度
          </div>
        </div>
      </td>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-lg shadow">
        <div className="text-gray-600">正在加载聚合数据...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* 表格标题和控制 */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <BarChart3 className="mr-2 h-5 w-5" />
            {type === 'vertical' ? '纵向聚合矩阵' : '横向聚合矩阵'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {type === 'vertical' 
              ? `${models.length} 个模型 × ${dimensions.length} 个维度`
              : `${models.length} 个模型 × ${dimensions.length} 个维度（扩展）`
            }
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={showOverallRanking}
              onChange={(e) => setShowOverallRanking(e.target.checked)}
              className="mr-2"
            />
            整体排名
          </label>
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={showRanking}
              onChange={(e) => setShowRanking(e.target.checked)}
              className="mr-2"
            />
            显示排名
          </label>
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={showChanges}
              onChange={(e) => setShowChanges(e.target.checked)}
              className="mr-2"
            />
            显示变化
          </label>
        </div>
      </div>

      {/* 聚合矩阵表格 */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-200">
                模型
              </th>
              {/* 🆕 整体排名列 */}
              {showOverallRanking && (
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-200 bg-yellow-50">
                  整体排名
                </th>
              )}
              {dimensions.map(dimension => (
                <th key={dimension.id} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border border-gray-200">
                  {dimension.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {getSortedModels().map(model => (
              <tr key={model.id}>
                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 border border-gray-200">
                  <div>
                    <div>{model.name}</div>
                  </div>
                </td>
                {/* 🆕 整体排名单元格 */}
                {showOverallRanking && renderOverallRankingCell(model.id)}
                {dimensions.map(dimension => renderScoreCell(model.id, dimension.id))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 图例说明 */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
        <div className="text-sm text-gray-600">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center">
              <TrendingUp className="w-4 h-4 text-green-600 mr-1" />
              <span>分数提升</span>
            </div>
            <div className="flex items-center">
              <TrendingDown className="w-4 h-4 text-red-600 mr-1" />
              <span>分数下降</span>
            </div>
            <div className="flex items-center">
              <Minus className="w-4 h-4 text-gray-500 mr-1" />
              <span>分数无变化</span>
            </div>
            <div className="text-gray-500">
              数据来源于 {tasksInfo.length} 个任务的聚合结果
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}