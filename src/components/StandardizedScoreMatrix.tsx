'use client';

import { useMemo, useState, useEffect } from 'react';

interface StandardizedScoreData {
  task_id: string;
  scoring_method: string;
  matrix_data: Record<string, Record<string, {
    average_percentage_score: number;
    average_raw_score: number;
    average_max_score: number;
    question_count: number;
    all_scores: number[];
  }>>;
  statistics: {
    total_results: number;
    unique_models: number;
    unique_dimensions: number;
    average_percentage_score: number;
  };
}

interface StandardizedScoreMatrixProps {
  taskId: string;
  className?: string;
}

export default function StandardizedScoreMatrix({ taskId, className = '' }: StandardizedScoreMatrixProps) {
  const [data, setData] = useState<StandardizedScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawScores, setShowRawScores] = useState(false);

  // 获取标准化评分数据
  useEffect(() => {
    const fetchStandardizedScores = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/tasks/${taskId}/standardized-scores`);
        
        if (!response.ok) {
          throw new Error('获取标准化评分数据失败');
        }
        
        const result = await response.json();
        setData(result);
        setError(null);
      } catch (err) {
        console.error('获取标准化评分失败:', err);
        setError(err instanceof Error ? err.message : '未知错误');
      } finally {
        setLoading(false);
      }
    };

    if (taskId) {
      fetchStandardizedScores();
    }
  }, [taskId]);

  // 计算显示数据
  const { models, dimensions, matrixData } = useMemo(() => {
    if (!data || !data.matrix_data) {
      return { models: [], dimensions: [], matrixData: {} };
    }

    const modelsSet = new Set<string>();
    const dimensionsSet = new Set<string>();
    
    Object.keys(data.matrix_data).forEach(model => {
      modelsSet.add(model);
      Object.keys(data.matrix_data[model]).forEach(dimension => {
        dimensionsSet.add(dimension);
      });
    });

    return {
      models: Array.from(modelsSet).sort(),
      dimensions: Array.from(dimensionsSet).sort(),
      matrixData: data.matrix_data
    };
  }, [data]);

  // 根据标准化得分获取颜色类
  const getScoreColor = (score: number | undefined) => {
    if (score === undefined) return 'bg-gray-50 text-gray-400';
    
    // 基于百分制的颜色分级
    if (score >= 90) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 80) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (score >= 70) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (score >= 60) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (score >= 50) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  // 格式化分数显示
  const formatScore = (score: number | undefined): string => {
    if (score === undefined) return '-';
    return score.toFixed(1);
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border p-6 ${className}`}>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">加载标准化评分数据...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-lg border p-6 ${className}`}>
        <div className="text-center text-red-600">
          <p className="font-medium">加载失败</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || models.length === 0 || dimensions.length === 0) {
    return (
      <div className={`bg-white rounded-lg border p-6 ${className}`}>
        <div className="text-center text-gray-500">
          <p>暂无评分数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border ${className}`}>
      {/* 头部信息 */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-medium text-gray-900">标准化评分矩阵</h3>
            <p className="text-sm text-gray-500 mt-1">
              基于得分点的标准化评分体系 | 横轴：评测维度 | 纵轴：参与模型 | 数值：标准化百分制得分 (0-100)
            </p>
            <div className="mt-2 text-xs text-gray-400">
              评分方法：{data.scoring_method} | 总计：{data.statistics.total_results}个评分结果 | 
              平均分：{data.statistics.average_percentage_score.toFixed(1)}分
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRawScores(!showRawScores)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                showRawScores 
                  ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                  : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              {showRawScores ? '显示标准化分数' : '显示原始分数'}
            </button>
          </div>
        </div>
      </div>

      {/* 评分矩阵表格 */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[160px] sticky left-0 bg-gray-50 border-r">
                模型名称
              </th>
              {dimensions.map(dimension => (
                <th
                  key={dimension}
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[100px]"
                >
                  <div className="flex flex-col items-center">
                    <span className="mb-1">{dimension}</span>
                    {/* 显示该维度的平均分 */}
                    <span className="text-xs text-gray-400 font-normal">
                      avg: {(() => {
                        const dimensionScores = models
                          .map(model => matrixData[model]?.[dimension]?.average_percentage_score)
                          .filter((score): score is number => score !== undefined);
                        const avg = dimensionScores.length > 0 
                          ? dimensionScores.reduce((sum, score) => sum + score, 0) / dimensionScores.length
                          : 0;
                        return formatScore(avg);
                      })()}
                    </span>
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                模型平均
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {models.map((model, modelIndex) => {
              // 计算该模型的平均分
              const modelScores = dimensions
                .map(dimension => matrixData[model]?.[dimension]?.average_percentage_score)
                .filter((score): score is number => score !== undefined);
              const modelAvg = modelScores.length > 0 
                ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length
                : undefined;

              return (
                <tr key={model} className={modelIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {/* 模型名称列 */}
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 sticky left-0 bg-inherit border-r">
                    <div className="flex flex-col">
                      <span>{model}</span>
                      {modelAvg !== undefined && (
                        <span className="text-xs text-gray-500">
                          平均: {formatScore(modelAvg)}
                        </span>
                      )}
                    </div>
                  </td>
                  
                  {/* 分数单元格 */}
                  {dimensions.map(dimension => {
                    const cellData = matrixData[model]?.[dimension];
                    const displayScore = showRawScores 
                      ? cellData?.average_raw_score 
                      : cellData?.average_percentage_score;
                    const colorClass = getScoreColor(displayScore);

                    return (
                      <td
                        key={dimension}
                        className={`px-2 py-3 text-center text-sm border ${colorClass}`}
                        title={cellData ? `
题目数量: ${cellData.question_count}
${showRawScores 
  ? `原始平均分: ${formatScore(cellData.average_raw_score)}/${formatScore(cellData.average_max_score)}` 
  : `标准化得分: ${formatScore(cellData.average_percentage_score)}%`}
分数范围: ${Math.min(...cellData.all_scores).toFixed(1)} - ${Math.max(...cellData.all_scores).toFixed(1)}
                        `.trim() : '暂无数据'}
                      >
                        <div className="flex flex-col items-center">
                          <span className="font-semibold">
                            {formatScore(displayScore)}
                            {!showRawScores && displayScore !== undefined && '%'}
                          </span>
                          {cellData && (
                            <span className="text-xs text-gray-500">
                              {showRawScores 
                                ? `/${formatScore(cellData.average_max_score)}`
                                : `${cellData.question_count}题`
                              }
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  
                  {/* 模型平均分列 */}
                  <td className="px-4 py-3 text-center text-sm font-bold bg-blue-50 border-l border-blue-200">
                    {modelAvg !== undefined ? (
                      <div className="flex flex-col items-center">
                        <span className="text-blue-800">
                          {formatScore(modelAvg)}%
                        </span>
                        <span className="text-xs text-blue-600">
                          {modelScores.length}维度
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 评分说明 */}
      <div className="p-4 border-t bg-gray-50 text-xs text-gray-600">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-700 mb-2">标准化评分说明</h4>
            <ul className="space-y-1">
              <li>• 每道题目可设置不同的满分（得分点数）</li>
              <li>• 题目得分率 = 实际得分 ÷ 题目满分</li>
              <li>• 维度得分 = 所有题目得分率的算术平均</li>
              <li>• 最终显示 = 维度得分 × 100（百分制）</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-2">颜色编码</h4>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-800 border border-green-200 rounded text-xs">90+ 优秀</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded text-xs">80+ 良好</span>
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 border border-yellow-200 rounded text-xs">70+ 一般</span>
              <span className="px-2 py-1 bg-orange-100 text-orange-800 border border-orange-200 rounded text-xs">60+ 偏低</span>
              <span className="px-2 py-1 bg-red-100 text-red-800 border border-red-200 rounded text-xs">50+ 较差</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}