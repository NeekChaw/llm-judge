'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Download, Image, FileSpreadsheet } from 'lucide-react';

interface StandardizedSubTask {
  id: string;
  model_name: string;
  dimension_name: string;
  status: string;
  score: number | null;
  standardized_score: {
    raw_score: number;
    max_score: number;
    normalized_score: number;
    percentage_score: number;
  } | null;
  test_case_max_score: number;
}

interface StandardizedMatrixData {
  task_id: string;
  scoring_method: string;
  subtasks: StandardizedSubTask[];
  matrix_data: Record<string, Record<string, {
    test_case_results: any[];
    standardized_dimension_score: number | null;
    question_count: number;
    completed_count: number;
    average_percentage_score: number | null;
    multiple_runs_display: string;
    dimension_runs: number[];
    run_stats: {
      count: number;
      max: number;
      min: number;
      avg: number;
      std: number;
    } | null;
  }>>;
}

interface StandardizedEvaluationMatrixProps {
  taskId: string;
  className?: string;
}

export default function StandardizedEvaluationMatrix({ taskId, className = '' }: StandardizedEvaluationMatrixProps) {
  const [data, setData] = useState<StandardizedMatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'original' | 'ranking' | 'competition'>('original');
  const [sortBy, setSortBy] = useState<'none' | 'dimension' | 'average'>('none');
  const [sortDimension, setSortDimension] = useState<string>('');
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null);
  const [modelColumnWidth, setModelColumnWidth] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const tableRef = useRef<HTMLDivElement>(null);

  // 获取标准化评分数据
  useEffect(() => {
    const fetchStandardizedData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/tasks/${taskId}/subtasks-with-max-scores`);
        
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
      fetchStandardizedData();
    }
  }, [taskId]);

  // 聚合和分析数据
  const matrixAnalysis = useMemo(() => {
    if (!data || !data.matrix_data) {
      return { models: [], dimensions: [], matrixData: {}, rankingData: null };
    }

    const modelsSet = new Set<string>();
    const dimensionsSet = new Set<string>();
    
    Object.keys(data.matrix_data).forEach(model => {
      modelsSet.add(model);
      Object.keys(data.matrix_data[model]).forEach(dimension => {
        dimensionsSet.add(dimension);
      });
    });

    let models = Array.from(modelsSet);
    const dimensions = Array.from(dimensionsSet).sort();
    const matrixData = data.matrix_data;

    // 应用排序
    if (sortBy === 'average') {
      // 按平均分排序
      const modelStats = models.map(model => {
        const modelScores = dimensions
          .map(dimension => matrixData[model][dimension]?.standardized_dimension_score)
          .filter((score): score is number => score !== null && score !== undefined);
        
        const average = modelScores.length > 0 
          ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length
          : 0;
        
        return { model, average };
      });
      
      models = modelStats.sort((a, b) => b.average - a.average).map(item => item.model);
    } else if (sortBy === 'dimension' && sortDimension) {
      // 按指定维度排序
      models = models.sort((a, b) => {
        const scoreA = matrixData[a][sortDimension]?.standardized_dimension_score || 0;
        const scoreB = matrixData[b][sortDimension]?.standardized_dimension_score || 0;
        return scoreB - scoreA;
      });
    } else {
      // 默认按名称排序
      models = models.sort();
    }

    // 计算排名数据
    const modelStats = models.map(model => {
      const modelScores = dimensions
        .map(dimension => matrixData[model][dimension]?.standardized_dimension_score)
        .filter((score): score is number => score !== null && score !== undefined);
      
      const average = modelScores.length > 0 
        ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length
        : 0;
      
      return { model, average, scores: modelScores };
    });

    const rankedModels = [...modelStats].sort((a, b) => b.average - a.average);
    
    // 计算每个维度的冠军
    const dimensionChampions = dimensions.map(dimension => {
      const scores = models.map(model => ({
        model,
        score: matrixData[model][dimension]?.standardized_dimension_score || 0
      }));
      const champion = scores.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      return { dimension, champion: champion.model, score: champion.score };
    });

    // 计算每个模型的最强维度
    const modelStrengths = models.map(model => {
      const dimensionScores = dimensions.map(dimension => ({
        dimension,
        score: matrixData[model][dimension]?.standardized_dimension_score || 0
      }));
      const strongest = dimensionScores.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      return { model, strongestDimension: strongest.dimension, score: strongest.score };
    });

    const rankingData = { rankedModels, dimensionChampions, modelStrengths };

    return { models, dimensions, matrixData, rankingData };
  }, [data, sortBy, sortDimension]);

  // 拖拽调整列宽
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startWidth = modelColumnWidth;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(120, Math.min(400, startWidth + deltaX));
      setModelColumnWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 导出为图片
  const exportAsImage = async () => {
    if (!tableRef.current) {
      alert('无法获取表格内容，请重试');
      return;
    }
    
    try {
      setIsExporting(true);
      
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        scrollX: 0,
        scrollY: 0,
        logging: false
      });
      
      canvas.toBlob((blob) => {
        if (blob) {
          const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
          const viewName = currentView === 'ranking' ? '排名视图' : 
                          currentView === 'competition' ? '竞争视图' : '标准化评分';
          saveAs(blob, `标准化评测矩阵_${viewName}_${timestamp}.png`);
        }
      });
    } catch (error) {
      console.error('导出图片失败:', error);
      alert('导出图片失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  // 导出为Excel
  const exportAsExcel = () => {
    try {
      setIsExporting(true);
      
      const { models, dimensions, matrixData } = matrixAnalysis;
      const wb = XLSX.utils.book_new();
      
      // 标准化评分工作表
      const wsData: (string | number)[][] = [];
      
      // 表头行
      const headerRow = ['模型/维度', ...dimensions, '模型平均分'];
      wsData.push(headerRow);
      
      // 模型数据行
      models.forEach(model => {
        const row: (string | number)[] = [model];
        
        // 添加各维度标准化得分
        dimensions.forEach(dimension => {
          const cellData = matrixData[model][dimension];
          if (cellData?.standardized_dimension_score !== null && cellData?.standardized_dimension_score !== undefined) {
            // 如果有多次运行数据，显示详细信息
            const multipleRuns = cellData.multiple_runs_display;
            if (multipleRuns && multipleRuns !== '-' && cellData.question_count <= 3) {
              row.push(`${cellData.standardized_dimension_score.toFixed(2)}% (${multipleRuns})`);
            } else {
              row.push(Number(cellData.standardized_dimension_score.toFixed(2)));
            }
          } else {
            row.push('-');
          }
        });
        
        // 计算模型平均分（基于标准化得分）
        const modelScores = dimensions
          .map(dimension => matrixData[model][dimension]?.standardized_dimension_score)
          .filter((score): score is number => score !== null && score !== undefined);
        const modelAvg = modelScores.length > 0 
          ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length
          : '-';
        
        row.push(typeof modelAvg === 'number' ? Number(modelAvg.toFixed(2)) : modelAvg);
        wsData.push(row);
      });

      // 添加多次运行详细工作表
      const multiRunsData: (string | number)[][] = [];
      multiRunsData.push(['模型', '维度', '题目ID', '多次运行分数', '平均分']);
      
      models.forEach(model => {
        dimensions.forEach(dimension => {
          const cellData = matrixData[model][dimension];
          if (cellData && cellData.test_case_results) {
            cellData.test_case_results.forEach((tcr: any) => {
              multiRunsData.push([
                model,
                dimension,
                tcr.test_case_id.slice(-8), // 显示ID后8位
                tcr.multiple_scores.join('/'),
                tcr.average_percentage_score.toFixed(2)
              ]);
            });
          }
        });
      });
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, '标准化评分');
      
      // 多次运行详细数据工作表
      const wsMultiRuns = XLSX.utils.aoa_to_sheet(multiRunsData);
      XLSX.utils.book_append_sheet(wb, wsMultiRuns, '多次运行详情');
      
      // 设置列宽
      const colWidths = [
        { wch: 25 }, // 模型名称列
        ...dimensions.map(() => ({ wch: 20 })), // 维度列（稍微宽一点以容纳多次运行数据）
        { wch: 15 } // 平均分列
      ];
      ws['!cols'] = colWidths;
      
      // 设置多次运行详情表的列宽
      const multiRunsColWidths = [
        { wch: 25 }, // 模型
        { wch: 15 }, // 维度
        { wch: 15 }, // 题目ID
        { wch: 20 }, // 多次运行分数
        { wch: 12 }  // 平均分
      ];
      wsMultiRuns['!cols'] = multiRunsColWidths;
      
      // 导出文件
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      XLSX.writeFile(wb, `标准化评测矩阵_${timestamp}.xlsx`);
      
    } catch (error) {
      console.error('导出Excel失败:', error);
      alert('导出Excel失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  // 获取分数颜色 - 直接单元格背景色
  const getScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'bg-gray-50 text-gray-400';
    
    if (score >= 90) return 'bg-green-200 text-green-900';
    if (score >= 80) return 'bg-blue-200 text-blue-900';
    if (score >= 70) return 'bg-yellow-200 text-yellow-900';
    if (score >= 60) return 'bg-orange-200 text-orange-900';
    if (score >= 50) return 'bg-red-200 text-red-900';
    return 'bg-gray-200 text-gray-700';
  };

  // 格式化分数显示
  const formatScore = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return '-';
    return score.toFixed(2);
  };

  // 渲染原始视图（标准化评分）
  const renderOriginalView = () => {
    const { models, dimensions, matrixData } = matrixAnalysis;
    
    return (
      <table className={`min-w-full ${dimensions.length > 8 ? 'text-xs' : 'text-sm'}`}>
        <thead>
          <tr>
            <th 
              className={`px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-b border-gray-200 relative ${
                isResizing ? 'select-none' : ''
              }`}
              style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
            >
              <span>模型 / 维度</span>
              
              {/* 拖拽手柄 */}
              <div
                className="absolute top-0 right-0 w-2 h-full cursor-col-resize bg-transparent hover:bg-blue-200 opacity-0 hover:opacity-100 transition-opacity"
                onMouseDown={handleMouseDown}
                title={`拖拽调整列宽 (当前: ${Math.round(modelColumnWidth)}px)`}
              >
                <div className="w-0.5 h-full bg-blue-400 ml-0.75"></div>
              </div>
            </th>
            
            {dimensions.map(dimension => (
              <th 
                key={dimension} 
                className={`px-2 py-3 bg-gray-50 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 ${
                  dimensions.length > 8 ? 'min-w-[80px]' : 'min-w-[100px]'
                }`}
                title={dimension}
              >
                <div 
                  className={`text-center ${dimensions.length > 8 ? 'max-w-[60px]' : 'max-w-[80px]'} mx-auto`}
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {dimensions.length > 10 ? dimension.slice(0, 6) + '...' : dimension}
                </div>
              </th>
            ))}
            
            <th className="px-4 py-3 bg-blue-50 text-center text-xs font-medium text-blue-600 uppercase tracking-wider border-b border-l border-gray-200">
              平均分
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((model, modelIndex) => {
            // 计算该模型的平均标准化得分
            const modelScores = dimensions
              .map(dimension => matrixData[model][dimension]?.standardized_dimension_score)
              .filter((score): score is number => score !== null && score !== undefined);
            const modelAvg = modelScores.length > 0 
              ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length
              : undefined;
            
            return (
              <tr key={model} className={modelIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {/* 模型名称 */}
                <td 
                  className="px-4 py-3 text-sm font-medium text-gray-900 border-r border-gray-200 bg-gray-50"
                  style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
                  title={model}
                >
                  <div 
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: `${modelColumnWidth - 32}px`
                    }}
                  >
                    {model}
                  </div>
                </td>

                {/* 分数单元格 */}
                {dimensions.map(dimension => {
                  const cellData = matrixData[model][dimension];
                  const score = cellData?.standardized_dimension_score;
                  const multipleRunsDisplay = cellData?.multiple_runs_display || '-';
                  const runStats = cellData?.run_stats;
                  const colorClass = getScoreColor(score);
                  
                  return (
                    <td 
                      key={`${model}-${dimension}`} 
                      className={`px-3 py-2 text-center border border-gray-300 ${colorClass} cursor-pointer hover:opacity-80 transition-opacity`}
                      onClick={() => setSelectedDimension(`${model}-${dimension}`)}
                      title={cellData ? `
${dimension} 维度详情:
标准化得分: ${formatScore(score)}%
运行次数: ${runStats?.count || 0}
${runStats ? `最高分: ${runStats.max.toFixed(2)}%
最低分: ${runStats.min.toFixed(2)}%
平均分: ${runStats.avg.toFixed(2)}%
标准差: ${runStats.std.toFixed(2)}%` : ''}
多次运行: ${multipleRunsDisplay}
点击查看详细分解
                      `.trim() : '暂无数据'}
                    >
                      {/* 主分数显示 */}
                      <div className="font-bold text-lg">
                        {formatScore(score)}
                        {score !== null && score !== undefined && (
                          <span className="text-sm ml-1">%</span>
                        )}
                      </div>
                      
                      {/* 多次运行分数显示 */}
                      {multipleRunsDisplay !== '-' && runStats && runStats.count <= 6 && (
                        <div className="text-xs mt-1 opacity-80 font-mono leading-tight">
                          {multipleRunsDisplay}
                        </div>
                      )}
                      
                      {/* 运行统计简化显示 */}
                      {runStats && runStats.count > 6 && (
                        <div className="text-xs mt-1 opacity-80">
                          {runStats.count}次运行
                        </div>
                      )}
                    </td>
                  );
                })}

                {/* 平均分单元格 */}
                <td className="px-4 py-3 text-center border-l border-gray-200 bg-blue-50">
                  {modelAvg !== undefined ? (
                    <span 
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border ${getScoreColor(modelAvg)}`}
                    >
                      {formatScore(modelAvg)}%
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">-</span>
                  )}
                </td>
              </tr>
            );
          })}
          
          {/* 维度平均分行 */}
          <tr className="bg-blue-50 border-t-2 border-blue-200">
            <td 
              className="px-4 py-3 text-sm font-bold text-blue-800 border-r border-gray-200"
              style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
            >
              维度平均分
            </td>
            {dimensions.map(dimension => {
              // 计算该维度的平均标准化得分
              const dimensionScores = models
                .map(model => matrixData[model][dimension]?.standardized_dimension_score)
                .filter((score): score is number => score !== null && score !== undefined);
              const dimensionAvg = dimensionScores.length > 0
                ? dimensionScores.reduce((sum, score) => sum + score, 0) / dimensionScores.length
                : undefined;
              
              return (
                <td key={dimension} className="px-4 py-3 text-center">
                  {dimensionAvg !== undefined ? (
                    <span 
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold border ${getScoreColor(dimensionAvg)}`}
                    >
                      {formatScore(dimensionAvg)}%
                    </span>
                  ) : (
                    <span className="text-blue-400 text-sm">-</span>
                  )}
                </td>
              );
            })}
            <td className="px-4 py-3 text-center border-l border-gray-200 bg-blue-100">
              <span className="text-blue-600 text-sm font-bold">-</span>
            </td>
          </tr>
        </tbody>
      </table>
    );
  };

  // 渲染排名视图
  const renderRankingView = () => {
    const { rankedModels, dimensionChampions } = matrixAnalysis.rankingData || {};
    if (!rankedModels) return null;

    return (
      <div className="space-y-6">
        {/* 模型排名 */}
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-3">🏆 模型综合排名</h4>
          <div className="grid gap-2">
            {rankedModels.map((item, index) => (
              <div
                key={item.model}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  index === 0 ? 'bg-yellow-50 border-yellow-200' :
                  index === 1 ? 'bg-gray-50 border-gray-200' :
                  index === 2 ? 'bg-orange-50 border-orange-200' :
                  'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${
                    index === 0 ? 'text-yellow-600' :
                    index === 1 ? 'text-gray-600' :
                    index === 2 ? 'text-orange-600' :
                    'text-gray-500'
                  }`}>
                    #{index + 1}
                  </span>
                  <span className="font-medium">{item.model}</span>
                </div>
                <span className="text-lg font-bold text-blue-600">
                  {item.average.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 维度冠军 */}
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-3">👑 各维度冠军</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dimensionChampions?.map(({ dimension, champion, score }) => (
              <div key={dimension} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-sm font-medium text-green-800">{dimension}</div>
                <div className="text-lg font-bold text-green-600">{champion}</div>
                <div className="text-sm text-green-600">{score.toFixed(2)}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // 渲染竞争视图
  const renderCompetitionView = () => {
    const { models, dimensions, matrixData } = matrixAnalysis;

    return (
      <div className="space-y-6">
        <h4 className="text-lg font-medium text-gray-900">⚔️ 模型竞争分析</h4>
        
        {/* 维度竞争表 */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  维度
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  最强模型
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  最高分
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  竞争激烈程度
                </th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((dimension, index) => {
                const scores = models
                  .map(model => matrixData[model][dimension]?.standardized_dimension_score)
                  .filter((score): score is number => score !== null && score !== undefined)
                  .sort((a, b) => b - a);
                
                const topScore = scores[0] || 0;
                const secondScore = scores[1] || 0;
                const competitiveness = scores.length > 1 ? topScore - secondScore : 0;
                
                const topModel = models.find(model => 
                  matrixData[model][dimension]?.standardized_dimension_score === topScore
                );

                return (
                  <tr key={dimension} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 border-b">
                      {dimension}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-b">
                      <span className="font-medium text-blue-600">{topModel}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-b">
                      <span className="font-bold text-green-600">{topScore.toFixed(2)}%</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-b">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        competitiveness < 5 ? 'bg-red-100 text-red-800' :
                        competitiveness < 15 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {competitiveness < 5 ? '激烈' :
                         competitiveness < 15 ? '中等' : '微弱'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
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

  if (!data || matrixAnalysis.models.length === 0 || matrixAnalysis.dimensions.length === 0) {
    return (
      <div className={`h-64 bg-gray-50 rounded-lg flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="text-gray-500 text-lg font-medium">暂无评分数据</div>
          <div className="text-gray-400 text-sm mt-2">任务执行后将显示标准化评分矩阵</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      {/* 表格标题 */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-medium text-gray-900">评测结果概览矩阵（标准化评分）</h3>
            <p className="text-sm text-gray-500 mt-1">
              横轴：评测维度 | 纵轴：参与模型 | 数值：标准化评分 (0-100%) | 算法：基于得分点的公平评分
            </p>
            <div className="mt-2 text-xs text-gray-400">
              评分方法：{data.scoring_method} | 
              题目得分率 = 实际得分 ÷ 题目满分 | 
              维度得分 = 所有题目得分率的算术平均 × 100
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* 导出按钮组 */}
            <div className="flex items-center gap-2">
              <button
                onClick={exportAsImage}
                disabled={isExporting || matrixAnalysis.models.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="导出为PNG图片"
              >
                <Image className="w-4 h-4" />
                图片
              </button>
              <button
                onClick={exportAsExcel}
                disabled={isExporting || matrixAnalysis.models.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="导出为Excel文件"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel
              </button>
            </div>
          </div>
        </div>
        
        {/* 视图切换和排序控件 */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {/* 视图切换 */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">视图:</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setCurrentView('original')}
                className={`px-3 py-1 text-sm ${currentView === 'original' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                📊 原始分数
              </button>
              <button
                onClick={() => setCurrentView('ranking')}
                className={`px-3 py-1 text-sm border-l border-gray-300 ${currentView === 'ranking' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                🏆 排名视图
              </button>
              <button
                onClick={() => setCurrentView('competition')}
                className={`px-3 py-1 text-sm border-l border-gray-300 ${currentView === 'competition' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                ⚔️ 竞争视图
              </button>
            </div>
          </div>

          {/* 排序控件 */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">排序:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as 'none' | 'dimension' | 'average');
                if (e.target.value !== 'dimension') setSortDimension('');
              }}
              className="text-sm border border-gray-300 rounded-md px-2 py-1"
            >
              <option value="none">默认</option>
              <option value="average">按平均分</option>
              <option value="dimension">按维度</option>
            </select>
            
            {sortBy === 'dimension' && (
              <select
                value={sortDimension}
                onChange={(e) => setSortDimension(e.target.value)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1"
              >
                <option value="">选择维度</option>
                {matrixAnalysis.dimensions.map(dim => (
                  <option key={dim} value={dim}>{dim}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        
        {/* 导出状态提示 */}
        {isExporting && (
          <div className="mt-3 flex items-center gap-2 text-sm text-blue-600">
            <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            正在导出，请稍候...
          </div>
        )}
      </div>
      
      {/* 矩阵表格 */}
      <div className="p-6" ref={tableRef}>
        <div className="overflow-x-auto">
          {currentView === 'original' && renderOriginalView()}
          {currentView === 'ranking' && renderRankingView()}
          {currentView === 'competition' && renderCompetitionView()}
        </div>
        
        {/* 说明 */}
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-100 border border-green-200"></div>
              <span>优秀 (90-100%)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-100 border border-blue-200"></div>
              <span>良好 (80-89%)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-200"></div>
              <span>中等 (70-79%)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-orange-100 border border-orange-200"></div>
              <span>及格 (60-69%)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-100 border border-red-200"></div>
              <span>不及格 (&lt;60%)</span>
            </div>
          </div>
          
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="text-sm font-medium text-gray-700 mb-2">标准化评分说明</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-600">
              <div>
                <span className="font-medium">🎯 公平性保障：</span>
                <span>每道题目可设置不同的满分（得分点数），确保不同难度题目的评分公平性</span>
              </div>
              <div>
                <span className="font-medium">📊 计算方法：</span>
                <span>题目得分率 = 实际得分 ÷ 题目满分，维度得分 = 所有题目得分率的算术平均</span>
              </div>
              <div>
                <span className="font-medium">🔢 百分制显示：</span>
                <span>最终显示 = 维度得分 × 100，便于直观理解和比较</span>
              </div>
              <div>
                <span className="font-medium">💡 应用场景：</span>
                <span>适用于包含不同难度级别题目的综合性评测任务</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 维度详细分解模态框 */}
      {selectedDimension && (
        <DimensionDetailModal
          selectedDimension={selectedDimension}
          matrixData={matrixAnalysis.matrixData}
          onClose={() => setSelectedDimension(null)}
        />
      )}
    </div>
  );
}

// 维度详细分解模态框组件
interface DimensionDetailModalProps {
  selectedDimension: string;
  matrixData: any;
  onClose: () => void;
}

function DimensionDetailModal({ selectedDimension, matrixData, onClose }: DimensionDetailModalProps) {
  const [modelName, dimensionName] = selectedDimension.split('-');
  const cellData = matrixData[modelName]?.[dimensionName];
  
  if (!cellData) return null;

  // 计算所有模型在该维度的表现，用于排名
  const allModelsInDimension = Object.keys(matrixData)
    .map(model => ({
      model,
      score: matrixData[model][dimensionName]?.standardized_dimension_score || 0,
      runStats: matrixData[model][dimensionName]?.run_stats
    }))
    .sort((a, b) => b.score - a.score);

  const currentModelRank = allModelsInDimension.findIndex(item => item.model === modelName) + 1;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* 标题 */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {dimensionName} 维度详细分解
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                模型: {modelName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          {/* 详细统计表格 */}
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    排名
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    模型
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    最高分
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    最低分
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    平均分
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    标准差
                  </th>
                </tr>
              </thead>
              <tbody>
                {allModelsInDimension.map((item, index) => {
                  const isCurrentModel = item.model === modelName;
                  const isTop3 = index < 3;
                  
                  return (
                    <tr 
                      key={item.model} 
                      className={`
                        ${isCurrentModel ? 'bg-blue-50 border-l-4 border-blue-400' : 'bg-white'}
                        ${isTop3 ? `bg-gradient-to-r ${
                          index === 0 ? 'from-red-50 to-red-100' :
                          index === 1 ? 'from-red-25 to-red-75' :
                          'from-red-10 to-red-50'
                        }` : ''}
                        border-b border-gray-200
                      `}
                    >
                      <td className="px-4 py-3 text-sm font-bold">
                        <span className={`
                          ${index === 0 ? 'text-yellow-600' :
                            index === 1 ? 'text-gray-600' :
                            index === 2 ? 'text-orange-600' :
                            'text-gray-500'}
                        `}>
                          #{index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {item.model}
                        {isCurrentModel && (
                          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            当前
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className={`font-bold ${isTop3 ? 'text-red-700' : 'text-gray-700'}`}>
                          {item.runStats?.max.toFixed(2) || '-'}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-600">
                        {item.runStats?.min.toFixed(2) || '-'}%
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className="font-bold text-blue-600">
                          {item.score.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className={`font-medium ${
                          (item.runStats?.std || 0) > 10 ? 'text-orange-600' :
                          (item.runStats?.std || 0) > 5 ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>
                          {item.runStats?.std.toFixed(2) || '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 说明 */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">说明</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
              <div>
                <span className="font-medium">🔴 最高分高亮：</span>
                <span>前3名模型的最高分以红色系渐变背景突出显示</span>
              </div>
              <div>
                <span className="font-medium">📊 标准差含义：</span>
                <span>数值越小表示运行结果越稳定，越大表示波动越大</span>
              </div>
              <div>
                <span className="font-medium">🎯 当前模型排名：</span>
                <span>{modelName} 在 {dimensionName} 维度排名第 {currentModelRank} 位</span>
              </div>
              <div>
                <span className="font-medium">📈 数据来源：</span>
                <span>基于该维度所有完整运行的平均值统计</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}