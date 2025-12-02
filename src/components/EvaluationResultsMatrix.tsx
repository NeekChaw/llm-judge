'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Download, Image, FileSpreadsheet, DollarSign, Maximize2 } from 'lucide-react';
import {
  calculateTaskCost,
  aggregateTasksCost,
  formatCost,
  formatTokens,
  extractTokenUsageFromResponse,
  CostCalculationResult,
  USD_TO_CNY_RATE
} from '@/lib/cost-calculator';
import { useUserPreferences } from '@/lib/user-preferences';

interface SubTask {
  id: string;
  model_name: string;
  dimension_name: string;
  score?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'success' | 'partial';
  // 🆕 评分失败检测支持
  justification?: string;      // 评分结果或错误信息
  reasoning?: string;          // 推理过程或错误信息
  model_response?: any;        // 模型回答
  // 🆕 标准化评分支持
  raw_score?: number;         // 原始分数
  max_score?: number;         // 题目满分
  standardized_score?: {      // 标准化分数对象
    raw_score: number;
    max_score: number;
    normalized_score: number;
    percentage_score: number;  // 百分制分数 (0-100)
  } | null;
  test_case_id?: string;      // 测试用例ID
  created_at?: string;        // 创建时间，用于确定运行顺序
  repetition_index?: number;  // 🔥 多次运行索引 (从数据库获取，用于正确分组)
  // 🆕 多次运行支持 - 来自 /api/tasks/{id}/subtasks
  is_multi_run?: boolean;
  run_count?: number;
  runs?: Array<{
    run_index: number;
    dimension_average: number;
    status: string;
    individual_scores?: number[];
    raw_results?: any[];
  }>;
  // 🆕 Token 和成本相关字段
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  multi_run_stats?: {
    run_averages: number[];    // 每次运行的维度平均分
    overall_average: number;   // 所有运行的总平均分
    best_run: number;
    worst_run: number;
    completed_runs: number;
    total_runs: number;
  };
}

interface EvaluationResultsMatrixProps {
  subTasks: SubTask[];
  className?: string;
  expectedModels?: string[];  // 预期的模型列表
  expectedDimensions?: string[];  // 预期的维度列表
  models?: Array<{  // 模型定价信息
    id: string;
    name: string;
    input_cost_per_1k_tokens?: number;
    output_cost_per_1k_tokens?: number;
    cost_currency?: 'USD' | 'CNY';
  }>;
  taskId?: string;  // 任务ID用于获取测试用例数据
}

export default function EvaluationResultsMatrix({ subTasks, className = '', expectedModels, expectedDimensions, models: modelPricingData, taskId }: EvaluationResultsMatrixProps) {
  // 用户偏好设置
  const { currency } = useUserPreferences();
  // 测试用例max_score数据状态
  const [testCaseMaxScores, setTestCaseMaxScores] = useState<Map<string, number>>(new Map());
  const [isLoadingMaxScores, setIsLoadingMaxScores] = useState(false);
  // 维度统计模态框状态
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null);
  const [dimensionModalOpen, setDimensionModalOpen] = useState(false);

  // 维度统计模态框独立的列宽状态
  const [dimensionModalColumnWidth, setDimensionModalColumnWidth] = useState(220);
  const [isDimensionModalResizing, setIsDimensionModalResizing] = useState(false);

  // API返回的是错误的简单平均分，需要重新计算正确的百分制分数
  const calculateCorrectPercentage = (rawResults: any[], maxScoresMap: Map<string, number>): number => {
    console.log('🔍 calculateCorrectPercentage 被调用:', {
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
        // 使用实际的max_score，如果没有则默认100分
        const maxScore = result.test_case_id ? maxScoresMap.get(result.test_case_id) || 100 : 100;
        totalMaxScore += maxScore;
      }
    });
    
    if (totalMaxScore === 0) return 0;
    
    // 正确的百分制计算：(总得分/总满分) × 100
    const percentage = Math.round((totalScore / totalMaxScore) * 100 * 10) / 10; // 保留1位小数
    
    console.log('📊 calculateCorrectPercentage 计算结果:', {
      totalScore,
      totalMaxScore,
      percentage,
      resultCount: rawResults.length
    });
    
    return percentage;
  };

  const formatPercentage = (score: number): string => {
    return Number.isInteger(score) ? `${score}%` : `${score.toFixed(1)}%`;
  };

  // 🆕 获取测试用例max_score数据
  useEffect(() => {
    const fetchTestCaseMaxScores = async () => {
      try {
        setIsLoadingMaxScores(true);
        
        // 提取所有相关的测试用例ID
        const allTestCaseIds = new Set<string>();
        subTasks.forEach(subTask => {
          if (subTask.runs) {
            subTask.runs.forEach(run => {
              if (run.raw_results) {
                run.raw_results.forEach((result: any) => {
                  if (result.test_case_id) {
                    allTestCaseIds.add(result.test_case_id);
                  }
                });
              }
            });
          }
        });
        
        if (allTestCaseIds.size === 0) {
          setTestCaseMaxScores(new Map());
          return;
        }
        
        // 获取任务子任务及测试用例max_score
        if (!taskId) {
          console.warn('无法获取taskId，跳过测试用例max_score获取');
          setTestCaseMaxScores(new Map());
          return;
        }
        
        const response = await fetch(`/api/tasks/${taskId}/subtasks-with-max-scores`);
        
        if (response.ok) {
          const data = await response.json();
          const maxScoresMap = new Map<string, number>();
          
          // 从subtasks中提取test_case_max_score信息
          data.subtasks?.forEach((subtask: any) => {
            if (subtask.test_case_id && subtask.test_case_max_score) {
              maxScoresMap.set(subtask.test_case_id, subtask.test_case_max_score);
            }
          });
          
          console.log('📋 testCaseMaxScores 加载成功:', {
            testCaseCount: data.testCases?.length || 0,
            mapSize: maxScoresMap.size,
            sampleScores: Array.from(maxScoresMap.entries()).slice(0, 3)
          });
          
          setTestCaseMaxScores(maxScoresMap);
        } else {
          console.warn('无法获取测试用例max_score数据，使用默认值');
          setTestCaseMaxScores(new Map());
        }
      } catch (error) {
        console.error('获取测试用例max_score数据失败:', error);
        setTestCaseMaxScores(new Map());
      } finally {
        setIsLoadingMaxScores(false);
      }
    };
    
    if (subTasks.length > 0) {
      fetchTestCaseMaxScores();
    }
  }, [subTasks]);

  // 🆕 视图状态管理
  const [currentView, setCurrentView] = useState<'original' | 'ranking' | 'competition'>('original');
  // 控制模型列宽度的状态
  const [modelColumnWidth, setModelColumnWidth] = useState(200); // 默认200px
  const [isResizing, setIsResizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);

  // 用于导出的ref
  const tableRef = useRef<HTMLDivElement>(null);
  
  // 拖拽调整列宽的处理函数
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = modelColumnWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(120, Math.min(400, startWidth + deltaX)); // 限制在120-400px之间
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

  // 维度统计模态框独立的拖拽处理函数
  const handleDimensionModalMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDimensionModalResizing(true);

    const startX = e.clientX;
    const startWidth = dimensionModalColumnWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(120, Math.min(400, startWidth + deltaX)); // 限制在120-400px之间
      setDimensionModalColumnWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDimensionModalResizing(false);
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
      
      // 直接导出当前显示的表格内容
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#ffffff',
        scale: 2, // 提高清晰度
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
                          currentView === 'competition' ? '竞争视图' : '原始分数';
          saveAs(blob, `评测结果矩阵_${viewName}_${timestamp}.png`);
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
      
      const { models, dimensions, scoreMatrix } = matrixData;
      const wb = XLSX.utils.book_new();
      
      // 根据当前视图模式导出不同的工作表
      if (currentView === 'ranking') {
        // 排名视图工作表
        const rankingWsData: (string | number)[][] = [];
        
        // 模型排名表头
        rankingWsData.push(['排名', '模型', '平均分', '已完成维度', '最强维度']);
        
        // 模型排名数据
        rankingData.rankedModels.forEach((model, index) => {
          const strongestDim = rankingData.modelStrengths.find(ms => ms.model === model.model);
          rankingWsData.push([
            index + 1,
            model.model,
            formatPercentage(model.average),
            model.scores.length,
            strongestDim?.strongestDimension || '-'
          ]);
        });
        
        // 空行
        rankingWsData.push([]);
        
        // 维度冠军表头
        rankingWsData.push(['维度冠军分析']);
        rankingWsData.push(['维度', '冠军模型', '最高分']);
        
        // 维度冠军数据
        rankingData.dimensionChampions.forEach(champion => {
          rankingWsData.push([
            champion.dimension,
            champion.champion,
            formatPercentage(champion.score)
          ]);
        });
        
        const rankingWs = XLSX.utils.aoa_to_sheet(rankingWsData);
        XLSX.utils.book_append_sheet(wb, rankingWs, '排名视图');
      } else if (currentView === 'competition') {
        // 竞争视图工作表
        const competitionWsData: (string | number)[][] = [];
        
        // 竞争分析表头
        competitionWsData.push(['模型', '获奖情况', '最强维度', '平均分', '竞争力分析']);
        
        // 竞争分析数据
        rankingData.rankedModels.forEach((model, index) => {
          const medal = index === 0 ? '🥇 冠军' : index === 1 ? '🥈 亚军' : index === 2 ? '🥉 季军' : '';
          const strongestDim = rankingData.modelStrengths.find(ms => ms.model === model.model);
          const champCount = rankingData.dimensionChampions.filter(dc => dc.champion === model.model).length;
          const competitiveness = champCount > 0 ? `${champCount}个维度领先` : '待提升';
          
          competitionWsData.push([
            model.model,
            medal,
            strongestDim?.strongestDimension || '-',
            formatPercentage(model.average),
            competitiveness
          ]);
        });
        
        const competitionWs = XLSX.utils.aoa_to_sheet(competitionWsData);
        XLSX.utils.book_append_sheet(wb, competitionWs, '竞争视图');
      }
      
      // 原始数据工作表（总是包含）
      const originalWsData: (string | number)[][] = [];
      
      // 表头行
      const headerRow = ['模型/维度', ...dimensions, '模型平均分', `成本(${currency})`];
      originalWsData.push(headerRow);
      
      // 模型数据行
      models.forEach(model => {
        const row: (string | number)[] = [model];
        
        // 添加各维度分数
        dimensions.forEach(dimension => {
          const cellData = scoreMatrix[model][dimension];
          if (cellData?.is_multi_run && cellData?.runs) {
            // 多次运行数据：显示所有运行的维度平均分
            const completedRuns = cellData.runs.filter(run => run.status === 'completed' && run.dimension_average !== null);
            const dimensionAverages = completedRuns.map(run => run.dimension_average).sort((a, b) => a - b);
            if (dimensionAverages.length > 0) {
              const formattedAverages = dimensionAverages.map(avg => {
                return formatPercentage(avg);
              }).join('/');
              row.push(formattedAverages);
            } else {
              row.push('-');
            }
          } else if (cellData?.score !== undefined) {
            row.push(formatPercentage(cellData.score));
          } else if (cellData?.status === 'failed') {
            row.push('失败');
          } else if (cellData?.status === 'running') {
            row.push('执行中');
          } else if (cellData?.status === 'pending') {
            row.push('等待');
          } else {
            row.push('-');
          }
        });
        
        // 计算模型平均分
        const modelScores = dimensions
          .map(dimension => scoreMatrix[model][dimension]?.score)
          .filter((score): score is number => score !== undefined);
        const modelAvg = modelScores.length > 0 
          ? (() => {
              const avg = modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length;
              return formatPercentage(avg);
            })()
          : '-';
        row.push(modelAvg);
        
        // 🆕 添加成本数据
        const modelCost = costMatrix[model] 
          ? formatCost(currency === 'USD' ? costMatrix[model].total_cost_usd : costMatrix[model].total_cost_cny, currency, 6)
          : '-';
        row.push(modelCost);
        
        originalWsData.push(row);
      });
      
      const originalWs = XLSX.utils.aoa_to_sheet(originalWsData);
      XLSX.utils.book_append_sheet(wb, originalWs, '原始数据');
      
      // 设置列宽
      const colWidths = [
        { wch: 25 }, // 模型名称列
        ...dimensions.map(() => ({ wch: 18 })), // 维度列（宽一点支持多次运行数据）
        { wch: 15 }, // 平均分列
        { wch: 18 }  // 🆕 成本列
      ];
      originalWs['!cols'] = colWidths;
      
      // 导出文件
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const viewName = currentView === 'ranking' ? '排名视图' : 
                      currentView === 'competition' ? '竞争视图' : '原始分数';
      XLSX.writeFile(wb, `评测结果矩阵_${viewName}_${timestamp}.xlsx`);
      
    } catch (error) {
      console.error('导出Excel失败:', error);
      alert('导出Excel失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };
  // 创建模型定价映射，包含提供商成本信息和名称匹配逻辑
  const modelPricingMap = useMemo(() => {
    if (!modelPricingData) return {};
    const map: Record<string, { input_cost_per_1k_tokens: number; output_cost_per_1k_tokens: number; cost_currency: 'USD' | 'CNY' }> = {};
    
    modelPricingData.forEach(model => {
      // 优先使用提供商成本，fallback到基础成本
      const inputCost = model.provider_input_cost_per_1k_tokens ?? model.input_cost_per_1k_tokens ?? 0;
      const outputCost = model.provider_output_cost_per_1k_tokens ?? model.output_cost_per_1k_tokens ?? 0;
      const currency = model.provider_cost_currency ?? model.cost_currency ?? 'USD';
      
      const pricingData = {
        input_cost_per_1k_tokens: inputCost,
        output_cost_per_1k_tokens: outputCost,
        cost_currency: currency
      };
      
      // 添加完整名称映射
      map[model.name] = pricingData;
      
      // 添加名称变体映射（用于处理子任务中的简化名称）
      // 例如：openai/gpt-oss-120b -> gpt-oss-120b
      if (model.name.includes('/')) {
        const shortName = model.name.split('/').pop();
        if (shortName) {
          map[shortName] = pricingData;
        }
      }
      
      // 特殊处理一些常见的名称映射
      if (model.name === 'Pro/deepseek-ai/DeepSeek-R1') {
        map['DeepSeek-R1'] = pricingData;
      }
      if (model.name === 'deepseek-ai/DeepSeek-V3') {
        map['DeepSeek-V3'] = pricingData;
      }
      if (model.name === 'Pro/deepseek-ai/DeepSeek-V3') {
        map['DeepSeek-V3'] = pricingData;
      }
    });
    
    console.log('🔍 Created modelPricingMap with keys:', Object.keys(map));
    return map;
  }, [modelPricingData]);

  // 聚合和分析数据
  const matrixData = useMemo(() => {
    // 提取所有唯一的模型和维度，如果子任务为空则使用预期列表
    const uniqueModels = subTasks.length > 0 
      ? Array.from(new Set(subTasks.map(st => st.model_name))).sort()
      : (expectedModels || []).sort();
    const uniqueDimensions = subTasks.length > 0
      ? Array.from(new Set(subTasks.map(st => st.dimension_name))).sort()
      : (expectedDimensions || []).sort();
    
    // 🆕 创建支持多次运行的分数矩阵映射
    const scoreMatrix: Record<string, Record<string, {
      score?: number;
      status: string;
      is_multi_run?: boolean;
      multi_run_stats?: any;
      runs?: any[];
      cost?: CostCalculationResult;
    }>> = {};

    // 🆕 创建成本矩阵映射（每个模型在所有任务中的总成本）
    const costMatrix: Record<string, CostCalculationResult> = {};

    // 初始化矩阵
    uniqueModels.forEach(model => {
      scoreMatrix[model] = {};
      uniqueDimensions.forEach(dimension => {
        scoreMatrix[model][dimension] = { score: undefined, status: 'pending' };
      });
    });

    // 🆕 按维度分组子任务，用于计算标准化评分
    const tasksByModelDimension: Record<string, Record<string, SubTask[]>> = {};
    subTasks.forEach(subTask => {
      if (!tasksByModelDimension[subTask.model_name]) {
        tasksByModelDimension[subTask.model_name] = {};
      }
      if (!tasksByModelDimension[subTask.model_name][subTask.dimension_name]) {
        tasksByModelDimension[subTask.model_name][subTask.dimension_name] = [];
      }
      tasksByModelDimension[subTask.model_name][subTask.dimension_name].push(subTask);
    });

    // 🆕 填充实际数据 - 使用repetition_index进行正确的多次运行分组
    Object.keys(tasksByModelDimension).forEach(modelName => {
      Object.keys(tasksByModelDimension[modelName]).forEach(dimensionName => {
        const dimensionTasks = tasksByModelDimension[modelName][dimensionName];
        
        if (scoreMatrix[modelName] && scoreMatrix[modelName][dimensionName]) {
          // 🎯 使用第一个任务来检测是否为多次运行（每个model-dimension组合应该只有一个subtask）
          const task = dimensionTasks[0];
          const isMultiRun = task?.is_multi_run || false;
          
          let displayScore: number | undefined = undefined;
          let status = 'pending';
          let runs: any[] = [];
          
          if (isMultiRun && task?.runs) {
            // 🎯 多次运行：使用后端已计算好的加权百分制分数
            // 后端已经为每次运行计算了加权平均：(总得分 / 总满分) * 100
            const runScores = task.runs
              .filter(run => run.status === 'completed' && run.dimension_average !== null)
              .map(run => run.dimension_average);

            // 计算所有运行的平均值（用于显示在矩阵中）
            displayScore = runScores.length > 0
              ? Math.round(runScores.reduce((sum, score) => sum + score, 0) / runScores.length * 10) / 10
              : undefined;
            status = task.status;

            // 直接使用后端计算的dimension_average，已经是加权百分制分数
            runs = task.runs.map(run => ({
              run_index: run.run_index,
              status: run.status,
              score: run.dimension_average, // 后端已计算的加权百分制分数
              dimension_average: run.dimension_average, // 后端已计算的加权百分制分数
              raw_results: run.raw_results
            }));
            
          } else {
            // 🔥 单次运行或没有多次运行数据 - 计算加权百分制分数
            if (dimensionTasks.length > 0) {
              // 计算该维度所有已完成题目的加权百分制分数
              const completedTasks = dimensionTasks.filter(t => t.status === 'completed' && t.score !== null);

              if (completedTasks.length > 0) {
                let totalScore = 0;
                let totalMaxScore = 0;

                completedTasks.forEach(t => {
                  totalScore += t.score || 0;
                  // 优先使用后端提供的 test_case_max_score
                  const maxScore = (t as any).test_case_max_score ||
                                   testCaseMaxScores.get(t.test_case_id || '') ||
                                   100;
                  totalMaxScore += maxScore;
                });

                // 加权百分制分数：(总得分 / 总满分) × 100
                displayScore = totalMaxScore > 0
                  ? Math.round((totalScore / totalMaxScore) * 100 * 10) / 10
                  : 0;
                status = 'completed';
              } else if (dimensionTasks.some(t => t.status === 'running')) {
                status = 'running';
              } else if (dimensionTasks.some(t => t.status === 'failed')) {
                status = 'failed';
              } else {
                status = 'pending';
              }
            }
          }
          
          // 🆕 计算该model-dimension组合的成本
          let combinationCost: CostCalculationResult | undefined = undefined;
          if (modelPricingMap[modelName]) {
            const modelPricing = modelPricingMap[modelName];
            const taskCosts: CostCalculationResult[] = [];
            
            dimensionTasks.forEach(task => {
              // 从子任务中提取token使用信息
              const tokenUsage = {
                prompt_tokens: task.prompt_tokens || 0,
                completion_tokens: task.completion_tokens || 0,
                reasoning_tokens: task.reasoning_tokens || 
                  (task.model_response?.usage?.completion_tokens_details?.reasoning_tokens) || 0
              };
              
              if (tokenUsage.prompt_tokens > 0 || tokenUsage.completion_tokens > 0) {
                const cost = calculateTaskCost(tokenUsage, modelPricing);
                taskCosts.push(cost);
              }
            });
            
            if (taskCosts.length > 0) {
              combinationCost = aggregateTasksCost(taskCosts);
            }
          }

          scoreMatrix[modelName][dimensionName] = {
            score: displayScore,
            status: status,
            is_multi_run: isMultiRun,
            runs: isMultiRun ? runs : undefined,
            cost: combinationCost
          };
        }
      });
    });
    
    // 🆕 计算每个模型的总成本（跨所有维度）
    uniqueModels.forEach(model => {
      const modelTasks = subTasks.filter(st => st.model_name === model);
      console.log(`🔍 Processing model: ${model}, tasks: ${modelTasks.length}, has pricing: ${!!modelPricingMap[model]}`);
      
      if (modelTasks.length > 0) {
        let totalCostUSD = 0;
        let totalCostCNY = 0;
        let totalTokens = 0;
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let totalReasoningTokens = 0;
        
        modelTasks.forEach(task => {
          // 优先使用已计算的成本
          if (task.cost && typeof task.cost === 'number' && task.cost > 0) {
            // 成本数据已经以USD计算，需要根据货币单位转换
            const modelPricing = modelPricingMap[model];
            const currency = modelPricing?.cost_currency || 'USD';
            
            if (currency === 'CNY') {
              totalCostCNY += task.cost;
              totalCostUSD += task.cost / USD_TO_CNY_RATE;
            } else {
              totalCostUSD += task.cost;
              totalCostCNY += task.cost * USD_TO_CNY_RATE;
            }
          }
          
          // 聚合token数据
          if (task.tokens_used) {
            totalTokens += task.tokens_used;
          }
          
          // 如果有详细的runs数据，使用它们
          if (task.runs && Array.isArray(task.runs)) {
            task.runs.forEach(run => {
              if (run.tokens_used) {
                // 这里不再累加tokens_used，因为上面已经累加了
                // totalTokens += run.tokens_used; 
              }
            });
          }
        });
        
        if (totalCostUSD > 0 || totalCostCNY > 0) {
          costMatrix[model] = {
            input_cost_usd: totalCostUSD * 0.3,  // 估算30%为输入成本
            output_cost_usd: totalCostUSD * 0.7, // 估算70%为输出成本
            total_cost_usd: totalCostUSD,
            input_cost_cny: totalCostCNY * 0.3,
            output_cost_cny: totalCostCNY * 0.7,
            total_cost_cny: totalCostCNY,
            model_currency: 'USD',
            token_breakdown: {
              prompt_tokens: totalPromptTokens,
              completion_tokens: totalCompletionTokens,
              reasoning_tokens: totalReasoningTokens,
              total_tokens: totalTokens
            }
          };
        }
      }
    });

    return { models: uniqueModels, dimensions: uniqueDimensions, scoreMatrix, costMatrix };
  }, [subTasks, expectedModels, expectedDimensions, testCaseMaxScores, modelPricingMap]);

  // 🆕 计算排名和统计数据
  const rankingData = useMemo(() => {
    const { models, dimensions, scoreMatrix } = matrixData;
    
    // 防护：如果没有模型或维度数据，返回空结果
    if (!models || models.length === 0 || !dimensions || dimensions.length === 0) {
      return { 
        rankedModels: [], 
        dimensionChampions: [], 
        modelStrengths: [] 
      };
    }
    
    // 计算每个模型的总体平均分
    const modelStats = models.map(model => {
      const modelScores = dimensions
        .map(dimension => scoreMatrix[model][dimension]?.score)
        .filter((score): score is number => score !== undefined);
      
      const average = modelScores.length > 0 
        ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length
        : 0;
      
      return { model, average, scores: modelScores };
    });

    // 按平均分排序
    const rankedModels = modelStats.sort((a, b) => b.average - a.average);
    
    // 计算每个维度的冠军
    const dimensionChampions = dimensions.map(dimension => {
      const scores = models.map(model => ({
        model,
        score: scoreMatrix[model][dimension]?.score || 0
      }));
      
      // 防护：如果没有模型数据，返回默认值
      if (scores.length === 0) {
        return { dimension, champion: '无模型', score: 0 };
      }
      
      const champion = scores.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      return { dimension, champion: champion.model, score: champion.score };
    });

    // 计算每个模型的最强维度
    const modelStrengths = models.map(model => {
      const dimensionScores = dimensions.map(dimension => ({
        dimension,
        score: scoreMatrix[model][dimension]?.score || 0
      }));
      
      // 防护：如果没有维度数据，返回默认值
      if (dimensionScores.length === 0) {
        return { model, strongestDimension: '无维度', score: 0 };
      }
      
      const strongest = dimensionScores.reduce((best, current) => 
        current.score > best.score ? current : best
      );
      return { model, strongestDimension: strongest.dimension, score: strongest.score };
    });

    return { rankedModels, dimensionChampions, modelStrengths };
  }, [matrixData]);

  // 解构matrixData以便在视图中使用  
  const { models, dimensions, scoreMatrix, costMatrix } = matrixData || { 
    models: [], 
    dimensions: [], 
    scoreMatrix: {}, 
    costMatrix: {} 
  };

  // 计算维度统计数据 - 直接使用scoreMatrix中已有的分数
  const getDimensionStats = (dimension: string) => {
    // 获取该维度下所有模型的分数（直接从scoreMatrix获取）
    const validScores = models
      .map(model => scoreMatrix[model][dimension]?.score)
      .filter((score): score is number => score !== undefined);
    
    if (validScores.length === 0) {
      return { 
        globalStats: { min: null, median: null, max: null },
        modelStats: []
      };
    }

    // 计算全局统计数据
    const sortedScores = [...validScores].sort((a, b) => a - b);
    const globalMin = sortedScores[0];
    const globalMax = sortedScores[sortedScores.length - 1];
    const globalMedian = sortedScores.length % 2 === 0
      ? (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2
      : sortedScores[Math.floor(sortedScores.length / 2)];

    // 为每个模型生成统计数据（基于多次运行或单次运行）
    const modelStats = models
      .map(model => {
        const cellData = scoreMatrix[model][dimension];
        if (!cellData || cellData.score === undefined) return null;
        
        // 检查是否有多次运行数据
        if (cellData.is_multi_run && cellData.runs && cellData.runs.length > 1) {
          // 多次运行：使用runs数组计算统计数据
          const runScores = cellData.runs.map(run => run.score).filter(score => score !== undefined);
          if (runScores.length === 0) return null;
          
          const sortedRunScores = [...runScores].sort((a, b) => a - b);
          const min = sortedRunScores[0];
          const max = sortedRunScores[sortedRunScores.length - 1];
          const median = sortedRunScores.length % 2 === 0
            ? (sortedRunScores[sortedRunScores.length / 2 - 1] + sortedRunScores[sortedRunScores.length / 2]) / 2
            : sortedRunScores[Math.floor(sortedRunScores.length / 2)];
          
          return {
            name: model,
            score: cellData.score,
            min: min,
            median: median,
            max: max
          };
        } else {
          // 单次运行：三个值都是相同的分数
          return {
            name: model,
            score: cellData.score,
            min: cellData.score,
            median: cellData.score,
            max: cellData.score
          };
        }
      })
      .filter((stat): stat is NonNullable<typeof stat> => stat !== null);

    return { 
      globalStats: { min: globalMin, median: globalMedian, max: globalMax },
      modelStats
    };
  };

  // 处理维度点击
  const handleDimensionClick = (dimension: string) => {
    setSelectedDimension(dimension);
    setDimensionModalOpen(true);
  };

  // 🆕 渲染不同视图的函数
  const renderTableContent = () => {
    switch (currentView) {
      case 'ranking':
        return renderRankingView();
      case 'competition':
        return renderCompetitionView();
      default:
        return renderOriginalView();
    }
  };

  // 🔧 新增：为模态框渲染适配的表格内容
  const renderModalTableContent = () => {
    console.log('🔍 Modal Debug:', {
      currentView,
      hasRankingData: !!rankingData?.modelRankings,
      hasDimensionChampions: !!rankingData?.dimensionChampions,
      rankedModelsCount: rankingData?.rankedModels?.length || 0
    });

    switch (currentView) {
      case 'ranking':
        // 只有在有排名数据时才显示排名视图，否则fallback到原始视图
        return rankingData?.rankedModels?.length > 0 ? renderModalRankingView() : renderModalOriginalView();
      case 'competition':
        // 只有在有排名数据时才显示竞争视图，否则fallback到原始视图
        return rankingData?.rankedModels?.length > 0 ? renderModalCompetitionView() : renderModalOriginalView();
      default:
        return renderModalOriginalView();
    }
  };

  // 🔧 模态框专用：原始分数视图
  const renderModalOriginalView = () => (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className="sticky left-0 bg-gray-50 border border-gray-300 p-3 text-left font-medium text-gray-700 z-10 min-w-[200px]">
            模型
          </th>
          {dimensions.map((dimension) => (
            <th key={dimension} className="border border-gray-300 p-3 text-center font-medium text-gray-700 min-w-[120px] whitespace-nowrap">
              {dimension}
            </th>
          ))}
          <th className="border border-gray-300 p-3 text-center font-medium text-gray-700 min-w-[100px]">
            平均分
          </th>
        </tr>
      </thead>
      <tbody>
        {models.map((model, modelIndex) => {
          // 计算该模型的平均分
          const modelScores = dimensions
            .map(dimension => scoreMatrix[model][dimension]?.score)
            .filter((score): score is number => score !== undefined);
          const averageScore = modelScores.length > 0
            ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length
            : 0;

          return (
            <tr key={model} className={modelIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="sticky left-0 bg-inherit border border-gray-300 p-3 font-medium text-gray-900 z-10">
                {model}
              </td>
              {dimensions.map((dimension) => {
                const cellData = scoreMatrix[model][dimension];
                const score = cellData?.score;
                const cost = cellData?.cost || 0;

                return (
                  <td key={dimension} className="border border-gray-300 p-3 text-center">
                    {score !== undefined ? (
                      <div className="space-y-1">
                        <div className="font-medium text-gray-900">
                          {score.toFixed(1)}
                        </div>
                        {cost > 0 && (
                          <div className="text-xs text-green-600">
                            ${cost.toFixed(4)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                );
              })}
              <td className="border border-gray-300 p-3 text-center font-medium">
                {averageScore > 0 ? averageScore.toFixed(1) : '-'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // 🔧 模态框专用：排名视图
  const renderModalRankingView = () => (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th
            className={`sticky left-0 bg-gray-50 border border-gray-300 p-3 text-left font-medium text-gray-700 z-10 relative ${
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
          <th className="border border-gray-300 p-3 text-center font-medium bg-blue-50 text-blue-600 min-w-[100px]">
            📊 平均分
          </th>
          {dimensions.map((dimension) => (
            <th key={dimension} className="border border-gray-300 p-3 text-center font-medium text-gray-700 min-w-[120px] whitespace-nowrap">
              {dimension}
            </th>
          ))}
          <th className="border border-gray-300 p-3 text-center font-medium bg-green-50 text-green-600 min-w-[100px]">
            💰 成本 ({currency})
          </th>
        </tr>
      </thead>
      <tbody>
        {rankingData.rankedModels.map((modelData, index) => {
          const model = modelData.model;
          const modelRankingData = rankingData?.modelRankings?.find(r => r.model === model);

          // 计算平均分
          const modelScores = dimensions
            .map(dimension => scoreMatrix[model][dimension]?.score)
            .filter((score): score is number => score !== undefined);
          const averageScore = modelScores.length > 0
            ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length
            : 0;

          // 计算总成本 - 使用与主视图相同的逻辑
          const totalCost = costMatrix && costMatrix[model]
            ? (currency === 'USD' ? costMatrix[model].total_cost_usd : costMatrix[model].total_cost_cny)
            : 0;

          return (
            <tr key={model} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {/* 模型名称 + 排名徽章 */}
              <td
                className="sticky left-0 bg-gray-50 border border-gray-300 p-3 font-medium text-gray-900 z-10"
                style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="truncate"
                    title={model}
                    style={{
                      maxWidth: `${modelColumnWidth - 60}px`
                    }}
                  >
                    {model}
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ml-2 ${
                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                    index === 1 ? 'bg-gray-100 text-gray-800' :
                    index === 2 ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    #{index + 1}
                  </span>
                </div>
              </td>

              {/* 平均分 */}
              <td className="border border-gray-300 p-3 text-center bg-blue-50">
                {averageScore > 0 ? (
                  <div className={`inline-flex items-center justify-center px-2 py-1 rounded text-sm font-bold ${
                    averageScore >= 80 ? 'bg-green-100 text-green-800' :
                    averageScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {averageScore.toFixed(1)}
                  </div>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>

              {/* 维度分数（与主视图一致） */}
              {dimensions.map((dimension) => {
                const cellData = scoreMatrix[model][dimension];
                const colorClass = getScoreColor(cellData);
                const displayText = getDisplayText(cellData, false);

                return (
                  <td key={dimension} className="border border-gray-300 p-3 text-center">
                    {cellData ? (
                      <div className={`inline-flex items-center justify-center px-3 py-2 rounded-full ${colorClass} min-w-[80px]`}>
                        <div className="text-sm font-medium">{displayText}</div>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                );
              })}

              {/* 成本 */}
              <td className="border border-gray-300 p-3 text-center bg-green-50">
                {totalCost > 0 ? (
                  <span className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-green-100 text-green-800">
                    {formatCost(totalCost, currency, 4)}
                  </span>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // 🔧 模态框专用：竞争视图
  const renderModalCompetitionView = () => (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th
            className={`sticky left-0 bg-gray-50 border border-gray-300 p-3 text-left font-medium text-gray-700 z-10 relative ${
              isResizing ? 'select-none' : ''
            }`}
            style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
          >
            <span>模型</span>

            {/* 拖拽手柄 */}
            <div
              className="absolute top-0 right-0 w-2 h-full cursor-col-resize bg-transparent hover:bg-blue-200 opacity-0 hover:opacity-100 transition-opacity"
              onMouseDown={handleMouseDown}
              title={`拖拽调整列宽 (当前: ${Math.round(modelColumnWidth)}px)`}
            >
              <div className="w-0.5 h-full bg-blue-400 ml-0.75"></div>
            </div>
          </th>
          <th className="border border-gray-300 p-3 text-center font-medium bg-blue-50 text-blue-600 min-w-[100px]">
            📊 平均分
          </th>
          {dimensions.map(dimension => {
            const champion = rankingData?.dimensionChampions?.find(c => c.dimension === dimension);
            return (
              <th
                key={dimension}
                className="border border-gray-300 p-3 text-center font-medium text-gray-700 min-w-[120px] whitespace-nowrap"
                title={`${dimension} - 最强: ${champion?.champion} (${champion?.score}分)`}
              >
                <div className="flex flex-col items-center">
                  <div>{dimension}</div>
                  {champion && (
                    <div className="text-xs text-yellow-600 mt-1">
                      👑 {champion.champion}
                    </div>
                  )}
                </div>
              </th>
            );
          })}
          <th className="border border-gray-300 p-3 text-center font-medium bg-green-50 text-green-600 min-w-[100px]">
            💰 成本 ({currency})
          </th>
        </tr>
      </thead>
      <tbody>
        {rankingData.rankedModels.map((modelData, modelIndex) => {
          const model = modelData.model;

          // 计算平均分
          const modelScores = dimensions
            .map(dimension => scoreMatrix[model][dimension]?.score)
            .filter((score): score is number => score !== undefined);
          const averageScore = modelScores.length > 0
            ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length
            : 0;

          // 计算总成本
          const totalCost = costMatrix && costMatrix[model]
            ? (currency === 'USD' ? costMatrix[model].total_cost_usd : costMatrix[model].total_cost_cny)
            : 0;


          return (
            <tr key={model} className={modelIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td
                className="sticky left-0 bg-inherit border border-gray-300 p-3 font-medium text-gray-900 z-10"
                style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
              >
                <div
                  className="truncate"
                  title={model}
                  style={{
                    maxWidth: `${modelColumnWidth - 20}px`
                  }}
                >
                  {model}
                </div>
              </td>

              {/* 平均分 */}
              <td className="border border-gray-300 p-3 text-center bg-blue-50">
                {averageScore > 0 ? (
                  <div className={`inline-flex items-center justify-center px-2 py-1 rounded text-sm font-bold ${
                    averageScore >= 80 ? 'bg-green-100 text-green-800' :
                    averageScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {averageScore.toFixed(1)}
                  </div>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
              {dimensions.map((dimension) => {
                const champion = rankingData?.dimensionChampions?.find(c => c.dimension === dimension);
                const isChampion = champion?.champion === model;
                const cellData = scoreMatrix[model][dimension];
                const score = cellData?.score;

                return (
                  <td key={dimension} className="border border-gray-300 p-3 text-center">
                    {score !== undefined ? (
                      <div className="space-y-1">
                        <div className={`font-medium ${isChampion ? 'text-yellow-600' : 'text-gray-900'}`}>
                          {isChampion && '👑 '}
                          {score.toFixed(1)}
                          {isChampion && ' 🥇'}
                        </div>
                        {isChampion && (
                          <div className="text-xs text-yellow-600">
                            领先优势
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                );
              })}
              {/* 成本 */}
              <td className="border border-gray-300 p-3 text-center bg-green-50">
                {totalCost > 0 ? (
                  <span className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-green-100 text-green-800">
                    {formatCost(totalCost, currency, 4)}
                  </span>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </td>
            </tr>
          );
        })}

        {/* 竞争激烈度行 */}
        <tr className="bg-purple-50 border-t-2 border-purple-200">
          <td
            className="sticky left-0 bg-purple-50 border border-gray-300 p-3 font-bold text-purple-800 z-10"
            style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
          >
            ⚔️ 竞争激烈度
          </td>
          <td className="border border-gray-300 p-3 text-center bg-purple-50">
            <span className="text-xs text-purple-600">
              总体竞争
            </span>
          </td>
          {dimensions.map(dimension => {
            // 计算该维度的分数差距
            const dimensionScores = rankingData.rankedModels
              .map(modelData => scoreMatrix[modelData.model][dimension]?.score || 0)
              .filter(score => score > 0)
              .sort((a, b) => b - a);

            const gap = dimensionScores.length >= 2 ? dimensionScores[0] - dimensionScores[dimensionScores.length - 1] : 0;
            const intensity = gap < 10 ? '🔥激烈' : gap < 20 ? '⚡中等' : '😌温和';

            return (
              <td key={dimension} className="border border-gray-300 p-3 text-center">
                <div className="flex flex-col items-center">
                  <span className="text-sm font-medium text-purple-700">
                    {intensity}
                  </span>
                  <span className="text-xs text-gray-600">
                    差距 {gap.toFixed(1)}
                  </span>
                </div>
              </td>
            );
          })}
          <td className="border border-gray-300 p-3 text-center bg-purple-50">
            <span className="text-xs text-purple-600">
              整体成本
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );

  // 🆕 原始视图 (当前实现)
  const renderOriginalView = () => (
    <table className={`min-w-full ${dimensions.length > 8 ? 'text-xs' : 'text-sm'}`}>
      <thead>
        <tr>
          {/* 左上角空白单元格 - 可调节宽度 */}
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
          
          {/* 维度列标题 */}
          {dimensions.map(dimension => (
            <th 
              key={dimension} 
              className={`px-2 py-3 bg-gray-50 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors ${
                dimensions.length > 8 ? 'min-w-[80px]' : 'min-w-[100px]'
              }`}
              title={`点击查看 ${dimension} 维度统计`}
              onClick={() => handleDimensionClick(dimension)}
            >
              <div 
                className={`text-center ${dimensions.length > 8 ? 'max-w-[60px]' : 'max-w-[80px]'} mx-auto hover:text-blue-600 transition-colors`}
                title={`点击查看 ${dimension} 维度统计`}
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
          
          {/* 平均分列 */}
          <th className="px-4 py-3 bg-blue-50 text-center text-xs font-medium text-blue-600 uppercase tracking-wider border-b border-l border-gray-200">
            平均分
          </th>
          
          {/* 🆕 成本列 */}
          <th className="px-4 py-3 bg-green-50 text-center text-xs font-medium text-green-600 uppercase tracking-wider border-b border-l border-gray-200">
            <div className="flex items-center justify-center gap-1">
              <DollarSign className="w-3 h-3" />
              成本 ({currency})
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {models.map((model, modelIndex) => {
          // 计算该模型的平均分
          const modelScores = dimensions
            .map(dimension => scoreMatrix[model][dimension]?.score)
            .filter((score): score is number => score !== undefined);
          const modelAvg = modelScores.length > 0 
            ? modelScores.reduce((sum, score) => sum + score, 0) / modelScores.length
            : undefined;
          
          return (
            <tr key={model} className={modelIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {/* 模型名称行标题 - 使用动态宽度 */}
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
                const cellData = scoreMatrix[model][dimension];
                const colorClass = getScoreColor(cellData);
                const multiRunDisplay = getMultiRunDisplayComponent(cellData);
                const displayText = getDisplayText(cellData, false);
                
                return (
                  <td 
                    key={`${model}-${dimension}`} 
                    className="px-4 py-3 text-center border-gray-200"
                  >
                    <div 
                      className={`inline-flex items-center justify-center px-3 py-2 rounded-full ${colorClass} cursor-help min-w-[80px]`}
                      title={getTooltipText(model, dimension, cellData)}
                    >
                      {multiRunDisplay ? multiRunDisplay : (
                        <div className="text-sm font-medium">{displayText}</div>
                      )}
                    </div>
                  </td>
                );
              })}

              {/* 平均分单元格 */}
              <td className="px-4 py-3 text-center border-l border-gray-200 bg-blue-50">
                {modelAvg !== undefined ? (
                  <span 
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(modelAvg, 'completed')}`}
                  >
                    {formatPercentage(modelAvg)}
                  </span>
                ) : (
                  <span className="text-gray-400 text-sm">-</span>
                )}
              </td>
              
              {/* 🆕 成本单元格 */}
              <td className="px-4 py-3 text-center border-l border-gray-200 bg-green-50">
                {costMatrix[model] ? (
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-green-700">
                      {formatCost(currency === 'USD' ? costMatrix[model].total_cost_usd : costMatrix[model].total_cost_cny, currency, 4)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {costMatrix[model].token_breakdown.total_tokens > 0 ? `${formatTokens(costMatrix[model].token_breakdown.total_tokens)} tokens` : '-'}
                    </span>
                  </div>
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
            // 计算该维度的平均分
            const dimensionScores = models
              .map(model => scoreMatrix[model][dimension]?.score)
              .filter((score): score is number => score !== undefined);
            const dimensionAvg = dimensionScores.length > 0
              ? dimensionScores.reduce((sum, score) => sum + score, 0) / dimensionScores.length
              : undefined;
            
            return (
              <td key={dimension} className="px-4 py-3 text-center">
                {dimensionAvg !== undefined ? (
                  <span 
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(dimensionAvg, 'completed')}`}
                  >
                    {formatPercentage(dimensionAvg)}
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
          
          {/* 🆕 总成本单元格 */}
          <td className="px-4 py-3 text-center border-l border-gray-200 bg-green-100">
            {Object.keys(costMatrix).length > 0 ? (
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-green-700">
                  {(() => {
                    const totalCost = Object.values(costMatrix).reduce(
                      (sum, cost) => sum + (currency === 'USD' ? cost.total_cost_usd : cost.total_cost_cny), 0
                    );
                    return formatCost(totalCost, currency, 4);
                  })()}
                </span>
                <span className="text-xs text-gray-500">
                  总计
                </span>
              </div>
            ) : (
              <span className="text-green-600 text-sm font-bold">-</span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );

  // 🆕 排名视图 (方案1)
  const renderRankingView = () => (
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
          
          {/* 维度列标题 */}
          {dimensions.map(dimension => (
            <th 
              key={dimension} 
              className={`px-2 py-3 bg-gray-50 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors ${
                dimensions.length > 8 ? 'min-w-[80px]' : 'min-w-[100px]'
              }`}
              title={`点击查看 ${dimension} 维度统计`}
              onClick={() => handleDimensionClick(dimension)}
            >
              <div 
                className={`text-center ${dimensions.length > 8 ? 'max-w-[60px]' : 'max-w-[80px]'} mx-auto hover:text-blue-600 transition-colors`}
                title={`点击查看 ${dimension} 维度统计`}
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
          
          {/* 总体排名列 */}
          <th className="px-4 py-3 bg-yellow-50 text-center text-xs font-medium text-yellow-600 uppercase tracking-wider border-b border-l border-gray-200">
            🏆 总体排名
          </th>
          
          {/* 🆕 成本列 */}
          <th className="px-4 py-3 bg-green-50 text-center text-xs font-medium text-green-600 uppercase tracking-wider border-b border-l border-gray-200">
            <div className="flex items-center justify-center gap-1">
              <DollarSign className="w-3 h-3" />
              成本 ({currency})
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {rankingData.rankedModels.map((modelData, index) => (
          <tr key={modelData.model} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
            {/* 模型名称 + 排名徽章 */}
            <td 
              className="px-4 py-3 text-sm font-medium text-gray-900 border-r border-gray-200 bg-gray-50"
              style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
              title={modelData.model}
            >
              <div className="flex items-center justify-between">
                <div 
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: `${modelColumnWidth - 60}px`
                  }}
                >
                  {modelData.model}
                </div>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${
                  index === 0 ? 'bg-yellow-100 text-yellow-800' :
                  index === 1 ? 'bg-gray-100 text-gray-800' :
                  index === 2 ? 'bg-orange-100 text-orange-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  #{index + 1}
                </span>
              </div>
            </td>

            {/* 分数单元格 */}
            {dimensions.map(dimension => {
              const cellData = scoreMatrix[modelData.model][dimension];
              const colorClass = getScoreColor(cellData);
              const multiRunDisplay = getMultiRunDisplayComponent(cellData);
              const displayText = getDisplayText(cellData, false);
              
              return (
                <td 
                  key={`${modelData.model}-${dimension}`} 
                  className="px-4 py-3 text-center border-gray-200"
                >
                  <div 
                    className={`inline-flex items-center justify-center px-3 py-2 rounded-full ${colorClass} cursor-help min-w-[80px]`}
                    title={getTooltipText(modelData.model, dimension, cellData)}
                  >
                    {multiRunDisplay ? multiRunDisplay : (
                      <div className="text-sm font-medium">{displayText}</div>
                    )}
                  </div>
                </td>
              );
            })}

            {/* 总体排名单元格 */}
            <td className="px-4 py-3 text-center border-l border-gray-200 bg-yellow-50">
              <div className="flex flex-col items-center">
                <span className={`text-2xl font-bold ${
                  index === 0 ? 'text-yellow-600' :
                  index === 1 ? 'text-gray-600' :
                  index === 2 ? 'text-orange-600' :
                  'text-blue-600'
                }`}>
                  #{index + 1}
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  平均 {formatPercentage(modelData.average)}
                </span>
              </div>
            </td>
            
            {/* 🆕 成本单元格 */}
            <td className="px-4 py-3 text-center border-l border-gray-200 bg-green-50">
              {costMatrix[modelData.model] ? (
                <div className="flex flex-col items-center">
                  <span className="text-sm font-bold text-green-700">
                    {formatCost(currency === 'USD' ? costMatrix[modelData.model].total_cost_usd : costMatrix[modelData.model].total_cost_cny, currency, 4)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {costMatrix[modelData.model].token_breakdown.total_tokens > 0 ? `${formatTokens(costMatrix[modelData.model].token_breakdown.total_tokens)} tokens` : '-'}
                  </span>
                </div>
              ) : (
                <span className="text-gray-400 text-sm">-</span>
              )}
            </td>
          </tr>
        ))}
        
        {/* 维度冠军行 */}
        <tr className="bg-yellow-50 border-t-2 border-yellow-200">
          <td 
            className="px-4 py-3 text-sm font-bold text-yellow-800 border-r border-gray-200"
            style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
          >
            🏆 维度冠军
          </td>
          {rankingData.dimensionChampions.map(({ dimension, champion, score }) => (
            <td key={dimension} className="px-4 py-3 text-center">
              <div className="flex flex-col items-center">
                <span className="text-lg">🏆</span>
                <span className="text-xs font-medium text-yellow-800 mt-1">
                  {champion.length > 8 ? champion.slice(0, 8) + '...' : champion}
                </span>
                <span className="text-xs text-gray-600">
                  {formatPercentage(score)}
                </span>
              </div>
            </td>
          ))}
          <td className="px-4 py-3 text-center border-l border-gray-200 bg-yellow-100">
            <span className="text-yellow-600 text-sm font-bold">-</span>
          </td>
          
          {/* 🆕 成本列总计 */}
          <td className="px-4 py-3 text-center border-l border-gray-200 bg-green-100">
            {Object.keys(costMatrix).length > 0 ? (
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-green-700">
                  {(() => {
                    const totalCost = Object.values(costMatrix).reduce(
                      (sum, cost) => sum + (currency === 'USD' ? cost.total_cost_usd : cost.total_cost_cny), 0
                    );
                    return formatCost(totalCost, currency, 4);
                  })()}
                </span>
                <span className="text-xs text-gray-500">
                  总计
                </span>
              </div>
            ) : (
              <span className="text-yellow-600 text-sm font-bold">-</span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );

  // 🆕 竞争视图 (方案3+5结合：优势标识 + 最佳表现)
  const renderCompetitionView = () => (
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
          
          {/* 维度列标题 + 最强模型标识 */}
          {dimensions.map(dimension => {
            const champion = rankingData?.dimensionChampions?.find(c => c.dimension === dimension);
            return (
              <th 
                key={dimension} 
                className={`px-2 py-3 bg-gray-50 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200 ${
                  dimensions.length > 8 ? 'min-w-[80px]' : 'min-w-[100px]'
                }`}
                title={`${dimension} - 最强: ${champion?.champion} (${champion?.score}分)`}
              >
                <div className="flex flex-col items-center">
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
                  <div className="text-xs text-yellow-600 mt-1">
                    👑 {champion ? champion.champion.slice(0, 6) : ''}
                  </div>
                </div>
              </th>
            );
          })}
          
          {/* 🆕 成本列 */}
          <th className="px-4 py-3 bg-green-50 text-center text-xs font-medium text-green-600 uppercase tracking-wider border-b border-l border-gray-200">
            <div className="flex items-center justify-center gap-1">
              <DollarSign className="w-3 h-3" />
              成本 ({currency})
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {models.map((model, modelIndex) => {
          const modelStrength = rankingData.modelStrengths.find(s => s.model === model);
          return (
            <tr key={model} className={modelIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {/* 模型名称 + 专长标识 */}
              <td 
                className="px-4 py-3 text-sm font-medium text-gray-900 border-r border-gray-200 bg-gray-50"
                style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
                title={`${model} - 最强维度: ${modelStrength?.strongestDimension} (${modelStrength?.score}分)`}
              >
                <div className="flex flex-col">
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
                  <div className="text-xs text-blue-600 mt-1">
                    💪 {modelStrength ? modelStrength.strongestDimension.slice(0, 8) : ''}
                  </div>
                </div>
              </td>

              {/* 分数单元格带奖牌标识 */}
              {dimensions.map(dimension => {
                const cellData = scoreMatrix[model][dimension];
                const colorClass = getScoreColor(cellData);
                const multiRunDisplay = getMultiRunDisplayComponent(cellData);
                const displayText = getDisplayText(cellData, false);
                
                // 获取该维度所有分数并排序
                const dimensionScores = models
                  .map(m => ({ model: m, score: scoreMatrix[m][dimension]?.score || 0 }))
                  .sort((a, b) => b.score - a.score);
                
                const modelRank = dimensionScores.findIndex(s => s.model === model) + 1;
                
                return (
                  <td 
                    key={`${model}-${dimension}`} 
                    className="px-4 py-3 text-center border-gray-200"
                  >
                    <div className="flex flex-col items-center">
                      <div 
                        className={`inline-flex items-center justify-center px-3 py-2 rounded-full ${colorClass} cursor-help relative min-w-[80px]`}
                        title={getTooltipText(model, dimension, cellData)}
                      >
                        {multiRunDisplay ? multiRunDisplay : (
                          <div className="text-sm font-medium">{displayText}</div>
                        )}
                        {/* 奖牌标识 */}
                        {modelRank === 1 && (
                          <span className="absolute -top-1 -right-1 text-xs">🥇</span>
                        )}
                        {modelRank === 2 && (
                          <span className="absolute -top-1 -right-1 text-xs">🥈</span>
                        )}
                        {modelRank === 3 && (
                          <span className="absolute -top-1 -right-1 text-xs">🥉</span>
                        )}
                      </div>
                    </div>
                  </td>
                );
              })}
              
              {/* 🆕 成本单元格 */}
              <td className="px-4 py-3 text-center border-l border-gray-200 bg-green-50">
                {costMatrix[model] ? (
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-bold text-green-700">
                      {formatCost(currency === 'USD' ? costMatrix[model].total_cost_usd : costMatrix[model].total_cost_cny, currency, 4)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {costMatrix[model].token_breakdown.total_tokens > 0 ? `${formatTokens(costMatrix[model].token_breakdown.total_tokens)} tokens` : '-'}
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm">-</span>
                )}
              </td>
            </tr>
          );
        })}
        
        {/* 竞争激烈度分析行 */}
        <tr className="bg-purple-50 border-t-2 border-purple-200">
          <td 
            className="px-4 py-3 text-sm font-bold text-purple-800 border-r border-gray-200"
            style={{ width: `${modelColumnWidth}px`, minWidth: `${modelColumnWidth}px`, maxWidth: `${modelColumnWidth}px` }}
            title="竞争激烈度说明：基于各模型在该维度的分数差距计算。🔥激烈(<10分差距)表示模型表现接近，竞争激烈；⚡中等(10-20分差距)表示有明显差异但仍有竞争；😌温和(>20分差距)表示存在明显的领先者"
          >
            ⚔️ 竞争激烈度
          </td>
          {dimensions.map(dimension => {
            // 计算该维度的分数差距
            const dimensionScores = models
              .map(model => scoreMatrix[model][dimension]?.score || 0)
              .filter(score => score > 0)
              .sort((a, b) => b - a);
            
            const gap = dimensionScores.length >= 2 ? dimensionScores[0] - dimensionScores[dimensionScores.length - 1] : 0;
            const intensity = gap < 10 ? '🔥激烈' : gap < 20 ? '⚡中等' : '😌温和';
            
            // 生成详细的tooltip说明
            const tooltipText = `${dimension} - 竞争激烈度分析：
            
• 最高分：${dimensionScores[0]?.toFixed(1) || 0}分
• 最低分：${dimensionScores[dimensionScores.length - 1]?.toFixed(1) || 0}分
• 分数差距：${gap.toFixed(1)}分
• 激烈程度：${intensity}

📊 指标说明：
🔥 激烈(<10分差距)：模型表现接近，竞争白热化
⚡ 中等(10-20分差距)：有明显差异但仍有竞争空间
😌 温和(>20分差距)：存在明显的领先者，差距较大

💡 应用价值：
• 激烈竞争的维度适合做精细化评测
• 温和竞争的维度可能存在技术壁垒或优势护城河`;
            
            return (
              <td key={dimension} className="px-4 py-3 text-center">
                <div className="flex flex-col items-center cursor-help" title={tooltipText}>
                  <span className="text-sm font-medium text-purple-700">
                    {intensity}
                  </span>
                  <span className="text-xs text-gray-600">
                    差距 {gap.toFixed(1)}
                  </span>
                </div>
              </td>
            );
          })}
          
          {/* 🆕 成本列总计 */}
          <td className="px-4 py-3 text-center border-l border-gray-200 bg-green-100">
            {Object.keys(costMatrix).length > 0 ? (
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-green-700">
                  {(() => {
                    const totalCost = Object.values(costMatrix).reduce(
                      (sum, cost) => sum + (currency === 'USD' ? cost.total_cost_usd : cost.total_cost_cny), 0
                    );
                    return formatCost(totalCost, currency, 4);
                  })()}
                </span>
                <span className="text-xs text-gray-500">
                  总计
                </span>
              </div>
            ) : (
              <span className="text-purple-600 text-sm font-bold">-</span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
  
  // 🆕 智能颜色策略（基于平均分 + 稳定性）
  const getScoreColor = (cellData?: {
    score?: number;
    status: string;
    is_multi_run?: boolean;
    multi_run_stats?: any;
    runs?: any[];
  } | number, status?: string) => {
    // 处理直接传入数字的情况（用于平均分显示）
    if (typeof cellData === 'number') {
      const score = cellData;
      if (score >= 90) return 'bg-green-100 text-green-800';
      if (score >= 80) return 'bg-blue-100 text-blue-800';
      if (score >= 70) return 'bg-yellow-100 text-yellow-800';
      if (score >= 60) return 'bg-orange-100 text-orange-800';
      return 'bg-red-100 text-red-800';
    }
    
    if (!cellData) return 'bg-gray-50 text-gray-400';

    if (cellData.status === 'failed') return 'bg-red-100 text-red-800';
    if (cellData.status === 'running') return 'bg-yellow-100 text-yellow-800';
    if (cellData.status === 'pending') return 'bg-gray-100 text-gray-500';

    // 🆕 优先检测评分失败：有模型回答但评分失败（不限制状态）
    if ((cellData as any).model_response && (cellData as any).model_response.trim().length > 0 &&
        ((cellData as any).score === 0 || (cellData as any).score === null)) {
      // 1. 明确的错误信息
      const hasExplicitError = (cellData as any).reasoning?.includes('评分失败') ||
                               (cellData as any).reasoning?.includes('Evaluator execution failed');

      // 2. 无AI评分反馈（reasoning字段为空）
      const hasNoFeedback = !(cellData as any).reasoning || (cellData as any).reasoning.trim() === '';

      // 3. 其他失败情况
      const hasFailedKeyword = (cellData as any).reasoning?.includes('failed');

      if (hasExplicitError || hasNoFeedback || hasFailedKeyword) {
        return 'bg-orange-100 text-orange-800'; // 评分失败：橙色警告
      }
    }

    // 🆕 多次运行：智能颜色策略（基于维度平均分）
    if (cellData.is_multi_run && cellData.runs) {
      const completedRuns = cellData.runs.filter(run => run.status === 'completed' && run.dimension_average !== null);

      if (completedRuns.length === 0) return 'bg-gray-100 text-gray-500';

      const dimensionAverages = completedRuns.map(run => run.dimension_average);
      const overallAverage = dimensionAverages.reduce((sum, score) => sum + score, 0) / dimensionAverages.length;
      const highest = Math.max(...dimensionAverages);
      const lowest = Math.min(...dimensionAverages);

      // 计算稳定性指标
      const scoreRange = highest - lowest;
      const isUnstable = scoreRange > 30 || (dimensionAverages.length > 1 && calculateStandardDeviation(dimensionAverages) > 20);

      // 主色调基于平均分
      let baseColor = '';
      if (overallAverage >= 90) baseColor = 'bg-green-100 text-green-800';
      else if (overallAverage >= 80) baseColor = 'bg-blue-100 text-blue-800';
      else if (overallAverage >= 70) baseColor = 'bg-yellow-100 text-yellow-800';
      else if (overallAverage >= 60) baseColor = 'bg-orange-100 text-orange-800';
      else baseColor = 'bg-red-100 text-red-800';

      // 添加稳定性指标
      if (isUnstable) {
        // 不稳定：添加虚线边框，保持同色系
        const borderColor = overallAverage >= 90 ? 'border-green-400' :
                           overallAverage >= 80 ? 'border-blue-400' :
                           overallAverage >= 70 ? 'border-yellow-400' :
                           overallAverage >= 60 ? 'border-orange-400' : 'border-red-400';
        baseColor += ` border-2 border-dashed ${borderColor}`;
      } else if (highest >= 90 && overallAverage >= 85) {
        // 高分且稳定：添加同色系的深色边框
        if (overallAverage >= 90) {
          baseColor += ' ring-2 ring-green-500'; // 绿色背景配深绿色边框
        } else {
          baseColor += ' ring-2 ring-blue-500'; // 蓝色背景配深蓝色边框
        }
      }

      return baseColor;
    }

    // 单次运行：保持原有逻辑
    const score = cellData.score;
    if (score === undefined) return 'bg-gray-50 text-gray-400';

    if (score >= 90) return 'bg-green-100 text-green-800';
    if (score >= 80) return 'bg-blue-100 text-blue-800';
    if (score >= 70) return 'bg-yellow-100 text-yellow-800';
    if (score >= 60) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  // 🆕 计算标准差的辅助函数
  const calculateStandardDeviation = (scores: number[]) => {
    if (scores.length <= 1) return 0;
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    return Math.sqrt(variance);
  };
  
  // 🆕 获取多次运行的显示组件
  const getMultiRunDisplayComponent = (cellData?: {
    score?: number;
    status: string;
    is_multi_run?: boolean;
    multi_run_stats?: any;
    runs?: any[];
  }) => {
    if (!cellData) return null;

    // 🆕 多次运行显示逻辑
    if (cellData.is_multi_run && cellData.runs && cellData.runs.length > 0) {
      const completedRuns = cellData.runs.filter(run => run.status === 'completed' && run.dimension_average !== null);
      
      // 🔥 重新计算每次运行的正确百分制分数
      const runsDisplay = cellData.runs
        .sort((a, b) => a.run_index - b.run_index) // 按运行次序排序
        .map(run => {
          if (run.status === 'failed') {
            return '❌';
          } else if (run.status === 'running') {
            return '⏳';
          } else if (run.status === 'completed' && run.raw_results) {
            // 🎯 使用正确的百分制计算公式
            const correctPercentage = calculateCorrectPercentage(run.raw_results, testCaseMaxScores);
            return formatPercentage(correctPercentage);
          } else {
            return '⏸️';
          }
        }).join('/');
      
      if (completedRuns.length > 0) {
        // 🎯 重新计算每次运行的正确百分制分数并计算总平均分
        const correctRunPercentages = completedRuns
          .filter(run => run.raw_results)
          .map(run => calculateCorrectPercentage(run.raw_results, testCaseMaxScores));
        
        const overallAverage = correctRunPercentages.length > 0
          ? correctRunPercentages.reduce((sum, score) => sum + score, 0) / correctRunPercentages.length
          : 0;
        
        return (
          <div className="flex flex-col items-center">
            {/* 上方大字号：所有已完成运行的总平均分（正确的百分制） */}
            <div className="text-base font-bold leading-tight">
              {formatPercentage(overallAverage)}
            </div>
            {/* 下方小字号：各次运行的维度平均分 */}
            <div className="text-xs opacity-75 leading-tight mt-0.5">
              ({runsDisplay})
            </div>
          </div>
        );
      } else {
        // 没有完成的运行：只显示状态
        return (
          <div className="flex flex-col items-center">
            <div className="text-sm font-medium">
              {runsDisplay}
            </div>
          </div>
        );
      }
    }

    return null;
  };

  // 🆕 获取显示文本（支持多次运行，主要用于导出）
  const getDisplayText = (cellData?: {
    score?: number;
    status: string;
    is_multi_run?: boolean;
    multi_run_stats?: any;
    runs?: any[];
    justification?: string;
    reasoning?: string;
    model_response?: any;
  }, forExport: boolean = false) => {
    if (!cellData) return '-';

    // 🆕 多次运行显示逻辑（基于repetition_index的正确分组）
    if (cellData.is_multi_run && cellData.runs && cellData.runs.length > 0) {
      const completedRuns = cellData.runs.filter(run => run.status === 'completed' && run.dimension_average !== null);
      
      if (forExport) {
        // 导出模式：按运行次序显示所有运行的维度平均分
        const allRunsDisplay = cellData.runs
          .sort((a, b) => a.run_index - b.run_index)
          .map(run => {
            if (run.status === 'failed') {
              return '失败';
            } else if (run.status === 'running') {
              return '执行中';
            } else if (run.status === 'completed' && run.dimension_average !== null) {
              return Number.isInteger(run.dimension_average) ? run.dimension_average.toString() : run.dimension_average.toFixed(2);
            } else {
              return '等待';
            }
          }).join('/');
        return allRunsDisplay;
      } else {
        // 正常显示模式：返回已完成运行的总平均分
        if (completedRuns.length > 0) {
          const runAverages = completedRuns.map(run => run.dimension_average);
          const overallAverage = runAverages.reduce((sum, avg) => sum + avg, 0) / runAverages.length;
          return formatPercentage(overallAverage);
        } else if (cellData.runs.some(run => run.status === 'running')) {
          return '⏳';
        } else if (cellData.runs.some(run => run.status === 'failed')) {
          return '❌';
        } else {
          return '⏸️';
        }
      }
    }

    // 单次运行显示逻辑（API已返回百分制）
    if (forExport) {
      if (cellData.score !== undefined) {
        return formatPercentage(cellData.score);
      }
      return '-';
    }

    // 🆕 优先检测评分失败：有模型回答但评分失败（不限制状态）
    if (cellData.model_response && cellData.model_response.trim().length > 0 &&
        (cellData.score === 0 || cellData.score === null)) {
      // 1. 明确的错误信息
      const hasExplicitError = cellData.reasoning?.includes('评分失败') ||
                               cellData.reasoning?.includes('Evaluator execution failed');

      // 2. 无AI评分反馈（reasoning字段为空）
      const hasNoFeedback = !cellData.reasoning || cellData.reasoning.trim() === '';

      // 3. 其他失败情况
      const hasFailedKeyword = cellData.reasoning?.includes('failed');

      if (hasExplicitError || hasNoFeedback || hasFailedKeyword) {
        return '⚠️'; // 评分失败：警告符号
      }
    }

    // 正常显示模式
    if (cellData.status === 'failed') return '❌';
    if (cellData.status === 'running') return '⏳';
    if (cellData.status === 'pending') return '⏸️';

    if (cellData.score !== undefined) {
      return formatPercentage(cellData.score);
    }
    return '-';
  };

  // 🆕 获取tooltip文本（支持多次运行详细信息）
  const getTooltipText = (model: string, dimension: string, cellData?: {
    score?: number;
    status: string;
    is_multi_run?: boolean;
    multi_run_stats?: any;
    runs?: any[];
  }) => {
    if (!cellData) return `${model} - ${dimension}: 暂无数据`;

    // 🆕 多次运行tooltip（基于repetition_index的正确分组）
    if (cellData.is_multi_run && cellData.runs) {
      const completedRuns = cellData.runs.filter(run => run.status === 'completed' && run.dimension_average !== null);
      const totalRuns = cellData.runs.length;

      if (completedRuns.length === 0) {
        return `${model} - ${dimension}: 多次运行中...\n` +
               `进度: 0/${totalRuns} 已完成`;
      }

      const runAverages = completedRuns.map(run => run.dimension_average);
      const overallAverage = runAverages.reduce((sum, score) => sum + score, 0) / runAverages.length;
      // API已返回百分制分数，直接使用进行数值计算
      const highest = Math.max(...runAverages);
      const lowest = Math.min(...runAverages);
      const scoreRange = highest - lowest;
      const stdDev = calculateStandardDeviation(runAverages);

      // 稳定性评估
      let stabilityText = '';
      if (scoreRange > 30 || stdDev > 20) {
        stabilityText = ' ⚠️ 不稳定';
      } else if (scoreRange < 10) {
        stabilityText = ' ✅ 很稳定';
      } else {
        stabilityText = ' 📊 较稳定';
      }

      // 性能评估（基于百分制分数）
      let performanceText = '';
      if (highest >= 90 && overallAverage >= 85) {
        performanceText = ' 🌟 优秀';
      } else if (lowest <= 30) {
        performanceText = ' ⚠️ 有风险';
      }

      // 显示每次运行的维度平均分（按运行次序）
      const runsDetail = cellData.runs
        .sort((a, b) => a.run_index - b.run_index)
        .map(run => {
          if (run.status === 'completed' && run.dimension_average !== null) {
            return `第${run.run_index}次: ${Math.round(run.dimension_average)}%`;
          } else {
            return `第${run.run_index}次: ${run.status === 'failed' ? '失败' : run.status === 'running' ? '执行中' : '等待'}`;
          }
        })
        .join(', ');

      return `${model} - ${dimension}: 多次运行结果${stabilityText}${performanceText}\n` +
             `总体平均: ${overallAverage.toFixed(1)}%\n` +
             `最高分: ${Math.round(highest)}% 🏆\n` +
             `最低分: ${Math.round(lowest)}%\n` +
             `分数范围: ${Math.round(scoreRange)}% (标准差: ${stdDev.toFixed(1)})\n` +
             `各次运行: ${runsDetail}\n` +
             `完成进度: ${completedRuns.length}/${totalRuns}`;
    }

    // 单次运行tooltip（转换为百分制）
    if (cellData.status === 'failed') return `${model} - ${dimension}: 执行失败`;
    if (cellData.status === 'running') return `${model} - ${dimension}: 正在执行中`;
    if (cellData.status === 'pending') return `${model} - ${dimension}: 等待执行`;

    // 🆕 优先检测评分失败并显示详细错误信息（不限制状态）
    if (cellData.model_response && cellData.model_response.trim().length > 0 &&
        (cellData.score === 0 || cellData.score === null)) {
      // 1. 明确的错误信息
      const hasExplicitError = cellData.reasoning?.includes('评分失败') ||
                               cellData.reasoning?.includes('Evaluator execution failed');

      // 2. 无AI评分反馈（reasoning字段为空）
      const hasNoFeedback = !cellData.reasoning || cellData.reasoning.trim() === '';

      // 3. 其他失败情况
      const hasFailedKeyword = cellData.reasoning?.includes('failed');

      if (hasExplicitError) {
        const errorMsg = cellData.reasoning || '未知评分错误';
        return `${model} - ${dimension}: 评分失败\n错误详情: ${errorMsg.substring(0, 100)}...`;
      } else if (hasNoFeedback) {
        return `${model} - ${dimension}: 评分失败\n原因: 暂无AI评分反馈 - 可能存在评分问题`;
      } else if (hasFailedKeyword) {
        const errorMsg = cellData.reasoning || '未知评分错误';
        return `${model} - ${dimension}: 评分失败\n错误详情: ${errorMsg.substring(0, 100)}...`;
      }
    }

    if (cellData.score !== undefined) {
      return `${model} - ${dimension}: ${formatPercentage(cellData.score)}`;
    }
    return `${model} - ${dimension}: 暂无分数`;
  };
  
  if (models.length === 0 || dimensions.length === 0) {
    return (
      <div className={`h-64 bg-gray-50 rounded-lg flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="text-gray-500 text-lg font-medium">暂无评测数据</div>
          <div className="text-gray-400 text-sm mt-2">任务执行后将显示评测结果矩阵</div>
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
            <h3 className="text-lg font-medium text-gray-900">评测结果概览矩阵</h3>
            <p className="text-sm text-gray-500 mt-1">
              横轴：评测维度 | 纵轴：参与模型 | 数值：评测分数 (0-100)
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* 🆕 视图切换按钮组 */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setCurrentView('original')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  currentView === 'original'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📊 原始分数
              </button>
              <button
                onClick={() => setCurrentView('ranking')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  currentView === 'ranking'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🏆 排名视图
              </button>
              <button
                onClick={() => setCurrentView('competition')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  currentView === 'competition'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                ⚔️ 竞争视图
              </button>
            </div>
            
            {/* 导出按钮组 */}
            <div className="flex items-center gap-2">
              <button
                onClick={exportAsImage}
                disabled={isExporting || models.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="导出为PNG图片"
              >
                <Image className="w-4 h-4" />
                图片
              </button>
              <button
                onClick={exportAsExcel}
                disabled={isExporting || models.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="导出为Excel文件"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Excel
              </button>
            </div>
            
            {/* 维度过多提示 */}
            {dimensions.length > 6 && (
              <div className="text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-lg">
                ⚠️ {dimensions.length} 个维度，建议横向滚动查看
              </div>
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
      <div className="p-6 relative" ref={tableRef}>
        {/* 优雅的浮动放大按钮 */}
        {models.length > 0 && (
          <button
            onClick={() => setIsZoomModalOpen(true)}
            className="absolute top-2 right-2 z-10 flex items-center justify-center w-10 h-10 bg-white/90 backdrop-blur-sm hover:bg-white border border-gray-200 hover:border-gray-300 rounded-full shadow-sm hover:shadow-md transition-all duration-200 group"
            title="放大表格查看"
          >
            <Maximize2 className="w-4 h-4 text-gray-600 group-hover:text-gray-800 transition-colors" />
          </button>
        )}

        <div className="overflow-x-auto">
          {renderTableContent()}
        </div>
        
        {/* 图例说明 */}
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-100 border border-green-200"></div>
              <span>优秀 (90-100)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-blue-100 border border-blue-200"></div>
              <span>良好 (80-89)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-200"></div>
              <span>中等 (70-79)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-orange-100 border border-orange-200"></div>
              <span>及格 (60-69)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-100 border border-red-200"></div>
              <span>不及格 (&lt;60)</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            <span>❌ 执行失败</span>
            <span>⚠️ 评分失败</span>
            <span>⏳ 正在执行</span>
            <span>⏸️ 等待执行</span>
            <span className="text-gray-400">💡 鼠标悬停查看详情</span>
            <span className="text-blue-600">↔️ 拖拽首列边缘调整宽度</span>
            <span className="text-green-600">📊 支持导出图片和Excel</span>
          </div>
          
          {/* 竞争视图特定说明 */}
          {currentView === 'competition' && (
            <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-sm font-medium text-purple-800 mb-2">⚔️ 竞争视图说明</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-700">
                <div>
                  <span className="font-medium">🥇🥈🥉 奖牌标识：</span>
                  <span>各维度前三名模型</span>
                </div>
                <div>
                  <span className="font-medium">👑 维度冠军：</span>
                  <span>该维度表现最佳的模型</span>
                </div>
                <div>
                  <span className="font-medium">💪 模型专长：</span>
                  <span>每个模型的最强维度</span>
                </div>
                <div>
                  <span className="font-medium">⚔️ 竞争激烈度：</span>
                  <span>🔥激烈(&lt;10分差) ⚡中等(10-20分差) 😌温和(&gt;20分差)</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-purple-600">
                💡 提示：点击"⚔️ 竞争激烈度"行标题或悬停各维度单元格可查看详细算法说明
              </div>
            </div>
          )}
          
          {dimensions.length > 6 && (
            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              📱 提示：当维度较多时，表格会自动调整布局并支持横向滚动。维度名称过长时会自动截断，完整名称可通过鼠标悬停查看。
            </div>
          )}
        </div>
      </div>

      {/* 维度统计模态框 */}
      {dimensionModalOpen && selectedDimension && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              {/* 模态框标题 */}
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  📊 {selectedDimension} 维度统计
                </h3>
                <button
                  onClick={() => setDimensionModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <span className="text-2xl">×</span>
                </button>
              </div>

              {(() => {
                const stats = getDimensionStats(selectedDimension);
                
                if (stats.modelStats.length === 0) {
                  return (
                    <div className="text-center text-gray-500 py-8">
                      该维度暂无完成的评测结果
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {(() => {
                      // 计算最佳和最差模型
                      const validModels = stats.modelStats
                        .filter(model => model.score !== null)
                        .sort((a, b) => (b.score || 0) - (a.score || 0));

                      const bestModel = validModels[0];
                      const worstModel = validModels[validModels.length - 1];

                      return (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="grid grid-cols-2 gap-6">
                            {/* 最佳模型 */}
                            <div className="text-center">
                              <div className="text-xs text-gray-500 mb-1">🏆 最佳模型</div>
                              <div className="bg-white rounded-lg p-3 border border-green-200">
                                <div className="text-sm font-medium text-gray-900 mb-1 truncate" title={bestModel?.name}>
                                  {bestModel?.name || '-'}
                                </div>
                                <div className="text-lg font-semibold text-green-600">
                                  {bestModel?.score !== null ? formatPercentage(bestModel.score) : '-'}
                                </div>
                              </div>
                            </div>

                            {/* 最差模型 */}
                            <div className="text-center">
                              <div className="text-xs text-gray-500 mb-1">📉 最差模型</div>
                              <div className="bg-white rounded-lg p-3 border border-red-200">
                                <div className="text-sm font-medium text-gray-900 mb-1 truncate" title={worstModel?.name}>
                                  {worstModel?.name || '-'}
                                </div>
                                <div className="text-lg font-semibold text-red-600">
                                  {worstModel?.score !== null ? formatPercentage(worstModel.score) : '-'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 模型得分表格 */}
                    <div className="overflow-hidden">
                      <table className="min-w-full text-sm border border-gray-200">
                        <thead>
                          <tr className="bg-gray-50">
                            <th
                              className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 relative ${
                                isDimensionModalResizing ? 'select-none' : ''
                              }`}
                              style={{ width: `${dimensionModalColumnWidth}px`, minWidth: `${dimensionModalColumnWidth}px`, maxWidth: `${dimensionModalColumnWidth}px` }}
                            >
                              <span>模型名称</span>

                              {/* 拖拽手柄 */}
                              <div
                                className="absolute top-0 right-0 w-2 h-full cursor-col-resize bg-transparent hover:bg-blue-200 opacity-0 hover:opacity-100 transition-opacity"
                                onMouseDown={handleDimensionModalMouseDown}
                                title={`拖拽调整列宽 (当前: ${Math.round(dimensionModalColumnWidth)}px)`}
                              >
                                <div className="w-0.5 h-full bg-blue-400 ml-0.75"></div>
                              </div>
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 bg-blue-50">
                              📊 平均分
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                              最高分数
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                              中位数
                            </th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              最低分数
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {stats.modelStats
                            .filter(model => model.score !== null) // 只显示有分数的模型
                            .sort((a, b) => (b.score || 0) - (a.score || 0)) // 按分数降序排列
                            .map((model, index) => (
                            <tr key={model.name} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td
                                className="px-4 py-3 text-sm font-medium text-gray-900 border-r border-gray-200"
                                style={{ width: `${dimensionModalColumnWidth}px`, minWidth: `${dimensionModalColumnWidth}px`, maxWidth: `${dimensionModalColumnWidth}px` }}
                              >
                                <div className="flex items-center justify-between">
                                  <div
                                    className="truncate"
                                    title={model.name}
                                    style={{
                                      maxWidth: `${dimensionModalColumnWidth - 60}px`
                                    }}
                                  >
                                    {model.name}
                                  </div>
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ml-2 ${
                                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                                    index === 1 ? 'bg-gray-100 text-gray-800' :
                                    index === 2 ? 'bg-orange-100 text-orange-800' :
                                    'bg-blue-100 text-blue-800'
                                  }`}>
                                    #{index + 1}
                                  </span>
                                </div>
                              </td>

                              {/* 平均分列 */}
                              <td className="px-4 py-3 text-center border-r border-gray-200 bg-blue-50">
                                {model.score !== null ? (
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                                    model.score >= 80 ? 'bg-green-100 text-green-800' :
                                    model.score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {formatPercentage(model.score)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>

                              <td className="px-4 py-3 text-center border-r border-gray-200">
                                {model.max !== null ? (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800">
                                    {formatPercentage(model.max)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center border-r border-gray-200">
                                {model.median !== null ? (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800">
                                    {formatPercentage(model.median)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {model.min !== null ? (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">
                                    {formatPercentage(model.min)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 放大表格模态框 */}
      {isZoomModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-7xl max-h-[90vh] flex flex-col">
            {/* 模态框头部 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                评测结果矩阵 - 放大视图 ({
                  currentView === 'original' ? '📊 原始分数' :
                  currentView === 'ranking' ? '🏆 排名视图' :
                  '⚔️ 竞争视图'
                })
              </h3>
              <button
                onClick={() => setIsZoomModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 模态框内容 */}
            <div className="flex-1 overflow-auto p-4">
              <div className="w-full">
                <div className="overflow-x-auto">
                  {renderModalTableContent()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}