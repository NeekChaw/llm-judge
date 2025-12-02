'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface MultiRunStats {
  overall_average: number;
  best_run: number;
  worst_run: number;
  completed_runs: number;
  total_runs: number;
}

interface RunData {
  run_index: number;
  status: string;
  score: number | null;
  reasoning?: string;
  model_response?: string;
  created_at?: string;
  completed_at?: string;
  // 🆕 多次运行的额外字段
  model_responses?: string[];
  reasoning_details?: string[];
  individual_scores?: number[];
}

interface MultiRunScoreDisplayProps {
  stats: MultiRunStats;
  runs: RunData[];
  isExpanded?: boolean;
  onToggle?: () => void;
  testCaseId?: string; // 🆕 添加测试用例ID用于跳转
  testCaseInput?: string; // 🆕 添加测试用例内容用于展示
  testCaseReference?: string; // 🆕 添加参考答案
}

/**
 * 多次运行分数展示组件
 * 显示格式：{90/100} {70/100} {60/100}
 * 点击展开显示详细信息
 */
export function MultiRunScoreDisplay({
  stats,
  runs,
  isExpanded = false,
  onToggle,
  testCaseId,
  testCaseInput,
  testCaseReference
}: MultiRunScoreDisplayProps) {
  const [localExpanded, setLocalExpanded] = useState(isExpanded);
  const [selectedRunIndex, setSelectedRunIndex] = useState<number | null>(0); // 默认选择第一次运行
  const [showTestCase, setShowTestCase] = useState(false); // 🆕 控制测试用例模态框
  const [currentPage, setCurrentPage] = useState(1); // 🆕 分页状态
  const runsPerPage = 5; // 🆕 每页显示的运行数量
  const [copySuccess, setCopySuccess] = useState<'response' | 'reasoning' | 'current' | 'all' | null>(null); // 🆕 复制状态

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setLocalExpanded(!localExpanded);
    }
  };

  const expanded = onToggle ? isExpanded : localExpanded;

  // 🔧 智能分数获取helper函数
  const getRunScore = (run: RunData): number | null => {
    let score = run.score;
    
    // 尝试 dimension_average 字段
    if (score === null || score === undefined || isNaN(score)) {
      score = (run as any).dimension_average;
    }
    
    // 尝试从 individual_scores 计算平均值
    if ((score === null || score === undefined || isNaN(score)) && 
        run.individual_scores && run.individual_scores.length > 0) {
      const validScores = run.individual_scores.filter(s => s !== null && s !== undefined && !isNaN(s));
      if (validScores.length > 0) {
        score = validScores.reduce((sum, s) => sum + s, 0) / validScores.length;
      }
    }
    
    return (score !== null && score !== undefined && !isNaN(score)) ? score : null;
  };

  // 🔧 安全检查：确保stats存在
  if (!stats) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border bg-gray-100 text-gray-600 border-gray-300">
            {runs.length}个运行中...
          </span>
          <span className="text-sm text-gray-500">正在执行中，请稍候</span>
        </div>
      </div>
    );
  }

  // 🔧 获取完成的运行分数（使用helper函数）
  const completedRuns = runs.filter(run => run.status === 'completed' && getRunScore(run) !== null);
  const scores = completedRuns.map(run => getRunScore(run)!).filter(score => !isNaN(score));

  // 🆕 复制当前运行的模型回复
  const handleCopyCurrentResponse = async () => {
    if (selectedRunIndex === null || !runs[selectedRunIndex]) return;
    const selectedRun = runs[selectedRunIndex];
    
    let content = '';
    if (selectedRun.model_responses && selectedRun.model_responses.length > 0) {
      // 多题目情况
      content = selectedRun.model_responses.map((response, index) => 
        `题目${index + 1}模型回复：\n${response || '暂无回复'}`
      ).join('\n\n');
    } else {
      // 单题目情况
      content = selectedRun.model_response || '暂无模型回复';
    }
    
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess('response');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 🆕 复制当前运行的评分详情
  const handleCopyCurrentReasoning = async () => {
    if (selectedRunIndex === null || !runs[selectedRunIndex]) return;
    const selectedRun = runs[selectedRunIndex];
    
    let content = '';
    if (selectedRun.reasoning_details && selectedRun.reasoning_details.length > 0) {
      // 多题目情况
      content = selectedRun.reasoning_details.map((reasoning, index) => 
        `题目${index + 1}评分详情：\n${reasoning || '暂无评分详情'}`
      ).join('\n\n');
    } else {
      // 单题目情况
      content = selectedRun.reasoning || '暂无评分详情';
    }
    
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess('reasoning');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 🆕 复制当前选中运行的完整结果
  const handleCopyCurrentRun = async () => {
    if (selectedRunIndex === null || !runs[selectedRunIndex]) return;

    const selectedRun = runs[selectedRunIndex];
    let content = `第${selectedRunIndex + 1}次运行结果：\n\n`;
    
    if (selectedRun.model_responses && selectedRun.model_responses.length > 0) {
      // 多题目情况
      content += `该次运行包含 ${selectedRun.model_responses.length} 个题目：\n\n`;
      selectedRun.model_responses.forEach((response, index) => {
        content += `--- 题目 ${index + 1} ---\n`;
        content += `模型回复：\n${response || '暂无回复'}\n\n`;
        if (selectedRun.reasoning_details && selectedRun.reasoning_details[index]) {
          content += `评分详情：\n${selectedRun.reasoning_details[index]}\n\n`;
        }
        if (selectedRun.individual_scores && selectedRun.individual_scores[index] !== undefined) {
          content += `分数：${selectedRun.individual_scores[index]}/100\n\n`;
        }
      });
      content += `该次运行平均分：${selectedRun.score || '暂无'}/100`;
    } else {
      // 单题目情况
      content += `模型回复：\n${selectedRun.model_response || '暂无回复'}\n\n`;
      content += `评分详情：\n${selectedRun.reasoning || '暂无评分详情'}\n\n`;
      content += `分数：${selectedRun.score || '暂无分数'}/100`;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess('current');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 🆕 一键复制所有运行的汇总结果
  const handleCopyAllRuns = async () => {
    let content = `多次运行汇总结果：

统计信息：
- 平均分：${stats.overall_average.toFixed(2)}
- 最高分：${stats.best_run} 🏆
- 最低分：${stats.worst_run}
- 完成率：${stats.completed_runs}/${stats.total_runs}

详细结果：
`;

    runs.forEach((run, index) => {
      content += `\n=== 第${index + 1}次运行 (${run.score || '未完成'}/100) ===\n`;
      
      if (run.model_responses && run.model_responses.length > 0) {
        // 多题目情况
        content += `该次运行包含 ${run.model_responses.length} 个题目：\n\n`;
        run.model_responses.forEach((response, testIndex) => {
          content += `--- 题目 ${testIndex + 1} ---\n`;
          content += `模型回复：${response || '暂无回复'}\n`;
          if (run.reasoning_details && run.reasoning_details[testIndex]) {
            content += `评分详情：${run.reasoning_details[testIndex]}\n`;
          }
          if (run.individual_scores && run.individual_scores[testIndex] !== undefined) {
            content += `分数：${run.individual_scores[testIndex]}/100\n`;
          }
          content += '\n';
        });
      } else {
        // 单题目情况
        content += `模型回复：${run.model_response || '暂无回复'}\n`;
        content += `评分详情：${run.reasoning || '暂无评分详情'}\n`;
      }
      content += '\n';
    });

    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess('all');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 🆕 分数标签样式（高亮最高分）
  const getScoreStyle = (score: number) => {
    if (score === stats.best_run) {
      return 'bg-green-100 text-green-800 border-green-300 ring-2 ring-green-400 font-bold'; // 🏆 最高分高亮
    } else if (score === stats.worst_run) {
      return 'bg-red-100 text-red-800 border-red-300'; // 最低分
    } else {
      return 'bg-blue-100 text-blue-800 border-blue-300'; // 普通分数
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* 🎨 优雅的概览卡片 */}
      <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50">
        {/* 🆕 统计概览 - 五个指标同行展示 */}
        <div className="flex items-center justify-center space-x-8 mb-4">
          {/* 最高分 */}
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 mb-1">🏆 {stats.best_run}</div>
            <div className="text-sm text-gray-600 font-medium">最高分</div>
          </div>

          {/* 平均分 */}
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-1">📊 {stats.overall_average?.toFixed(2) || '--'}</div>
            <div className="text-sm text-gray-600 font-medium">平均分</div>
          </div>

          {/* 最低分 */}
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600 mb-1">📉 {stats.worst_run}</div>
            <div className="text-sm text-gray-600 font-medium">最低分</div>
          </div>

          {/* 波动范围 */}
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600 mb-1">📈 {stats.best_run - stats.worst_run}</div>
            <div className="text-sm text-gray-600 font-medium">波动范围</div>
          </div>

          {/* 标准差 */}
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600 mb-1">📊 {Math.sqrt(scores.reduce((sum, score) => {
              const diff = score - stats.overall_average;
              return sum + diff * diff;
            }, 0) / scores.length).toFixed(1)}</div>
            <div className="text-sm text-gray-600 font-medium">标准差</div>
          </div>
        </div>

        {/* 🆕 操作按钮区域 */}
        <div className="flex justify-center items-center space-x-3">
          {/* 🆕 测试用例模态框按钮 */}
          {(testCaseInput || testCaseReference) && (
            <button
              onClick={() => setShowTestCase(true)}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-white/50 rounded-lg transition-all duration-200 border border-gray-300 hover:border-blue-300"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              查看测试用例
            </button>
          )}

          {/* 展开/收起按钮 */}
          <button
            onClick={handleToggle}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-white/50 rounded-lg transition-all duration-200 border border-blue-200 hover:border-blue-300"
          >
            {expanded ? (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                收起详细记录
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                查看详细记录
              </>
            )}
          </button>

          {/* 🆕 复制汇总结果按钮 */}
          <button
            onClick={handleCopyAllRuns}
            className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 border ${
              copySuccess === 'all'
                ? 'bg-green-50 text-green-700 border-green-300'
                : 'text-gray-600 hover:text-green-600 hover:bg-green-50 border-gray-300 hover:border-green-300'
            }`}
          >
            {copySuccess === 'all' ? (
              <>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                已复制
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 002 2z" />
                </svg>
                复制汇总
              </>
            )}
          </button>
        </div>
      </div>

      {/* 🎨 优雅的详细记录展示 */}
      {expanded && (
        <div className="border-t border-gray-200">
          {/* 🆕 带分页的标签页导航 */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-700">
                详细运行记录 - 点击切换查看
              </div>

              <div className="flex items-center space-x-3">
                {/* 🆕 复制当前运行按钮 */}
                {selectedRunIndex !== null && runs[selectedRunIndex] && (
                  <button
                    onClick={handleCopyCurrentRun}
                    className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded transition-all duration-200 border ${
                      copySuccess === 'current'
                        ? 'bg-green-50 text-green-700 border-green-300'
                        : 'text-gray-600 hover:text-green-600 hover:bg-green-50 border-gray-300 hover:border-green-300'
                    }`}
                  >
                    {copySuccess === 'current' ? (
                      <>
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        已复制
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 002 2z" />
                        </svg>
                        复制当前
                      </>
                    )}
                  </button>
                )}

                {/* 🆕 分页信息 */}
                {runs.length > runsPerPage && (
                  <div className="text-xs text-gray-500">
                    第 {(currentPage - 1) * runsPerPage + 1}-{Math.min(currentPage * runsPerPage, runs.length)} 项，共 {runs.length} 项
                  </div>
                )}
              </div>
            </div>

            {/* 🆕 分页的运行选择器 */}
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {runs
                  .slice((currentPage - 1) * runsPerPage, currentPage * runsPerPage)
                  .map((run, pageIndex) => {
                    const actualIndex = (currentPage - 1) * runsPerPage + pageIndex;
                    return (
                      <button
                        key={`run-${actualIndex}-${run.run_index}`}
                        className={`px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex flex-col items-center space-y-1 min-w-[80px] ${
                          selectedRunIndex === actualIndex
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-white text-gray-700 hover:bg-blue-50 border border-gray-200 hover:border-blue-300'
                        }`}
                        onClick={() => setSelectedRunIndex(actualIndex)}
                      >
                        <span className={`text-xs ${
                          selectedRunIndex === actualIndex
                            ? 'text-blue-200'
                            : 'text-gray-500'
                        }`}>第{actualIndex + 1}次</span>
                        {(() => {
                          const displayScore = getRunScore(run);
                          
                          return displayScore !== null ? (
                            <div className="flex items-center space-x-1">
                              <span className={`text-lg font-bold ${
                                selectedRunIndex === actualIndex
                                  ? 'text-white'
                                  : displayScore === stats.best_run
                                  ? 'text-green-600'
                                  : displayScore === stats.worst_run
                                  ? 'text-red-600'
                                  : 'text-blue-600'
                              }`}>
                                {Math.round(displayScore)}
                              </span>
                              {displayScore === stats.best_run && (
                                <span className="text-sm">🏆</span>
                              )}
                            </div>
                          ) : (
                            <span className={`text-lg font-bold ${
                              selectedRunIndex === actualIndex
                                ? 'text-white'
                                : 'text-gray-400'
                            }`}>
                              -
                            </span>
                          );
                        })()}
                      </button>
                    );
                  })}
              </div>

              {/* 🆕 分页控制器 */}
              {runs.length > runsPerPage && (
                <div className="flex items-center justify-center space-x-2">
                  <button
                    onClick={() => {
                      const newPage = Math.max(1, currentPage - 1);
                      setCurrentPage(newPage);
                      // 如果当前选中的运行不在新页面中，选择新页面的第一个
                      const newPageStart = (newPage - 1) * runsPerPage;
                      if (selectedRunIndex !== null && (selectedRunIndex < newPageStart || selectedRunIndex >= newPageStart + runsPerPage)) {
                        setSelectedRunIndex(newPageStart);
                      }
                    }}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm font-medium text-gray-600 hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    ← 上一页
                  </button>

                  <div className="flex space-x-1">
                    {Array.from({ length: Math.ceil(runs.length / runsPerPage) }, (_, i) => i + 1).map(page => (
                      <button
                        key={page}
                        onClick={() => {
                          setCurrentPage(page);
                          // 选择新页面的第一个运行
                          const newPageStart = (page - 1) * runsPerPage;
                          setSelectedRunIndex(newPageStart);
                        }}
                        className={`px-2 py-1 text-sm font-medium rounded transition-colors ${
                          currentPage === page
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      const newPage = Math.min(Math.ceil(runs.length / runsPerPage), currentPage + 1);
                      setCurrentPage(newPage);
                      // 如果当前选中的运行不在新页面中，选择新页面的第一个
                      const newPageStart = (newPage - 1) * runsPerPage;
                      if (selectedRunIndex !== null && (selectedRunIndex < newPageStart || selectedRunIndex >= newPageStart + runsPerPage)) {
                        setSelectedRunIndex(newPageStart);
                      }
                    }}
                    disabled={currentPage === Math.ceil(runs.length / runsPerPage)}
                    className="px-3 py-1 text-sm font-medium text-gray-600 hover:text-blue-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    下一页 →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 选中运行的详细内容 */}
          {selectedRunIndex !== null && runs[selectedRunIndex] && (
            <div className="p-6 space-y-6">
              {(() => {
                const selectedRun = runs[selectedRunIndex];
                return (
                  <>
                    {/* 运行概要 */}
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">
                          第{selectedRunIndex + 1}次运行
                          {selectedRun.score === stats.best_run && (
                            <span className="ml-2 text-sm bg-green-100 text-green-800 px-2 py-1 rounded-full">
                              🏆 最高分
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {selectedRun.completed_at
                            ? `完成于 ${new Date(selectedRun.completed_at).toLocaleString('zh-CN')}`
                            : '运行中...'}
                        </p>
                      </div>

                      {(() => {
                        const displayScore = getRunScore(selectedRun);
                        
                        return displayScore !== null ? (
                          <div className="text-right">
                            <div className={`text-3xl font-bold ${
                              displayScore === stats.best_run ? 'text-green-600' :
                              displayScore === stats.worst_run ? 'text-red-600' : 'text-blue-600'
                            }`}>
                              {Math.round(displayScore)}
                            </div>
                            <div className="text-sm text-gray-500">/ 100分</div>
                          </div>
                        ) : null;
                      })()}
                    </div>

                    {/* 🆕 多次运行的详细结果展示 */}
                    {selectedRun.model_responses && selectedRun.model_responses.length > 0 ? (
                      // 多题目情况：显示每个题目的结果
                      <div className="space-y-6">
                        <h4 className="text-base font-semibold text-gray-800 flex items-center">
                          <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                          该次运行详细结果 ({selectedRun.model_responses.length} 个题目)
                        </h4>
                        
                        {selectedRun.model_responses.map((response, testIndex) => (
                          <div key={testIndex} className="border border-gray-200 rounded-lg overflow-hidden">
                            {/* 题目头部 */}
                            <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">
                                  题目 {testIndex + 1}
                                </span>
                                {selectedRun.individual_scores && selectedRun.individual_scores[testIndex] !== undefined && (
                                  <span className="text-sm font-bold text-blue-600">
                                    {selectedRun.individual_scores[testIndex]}/100
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* 题目内容 */}
                            <div className="p-4 space-y-4">
                              {/* 模型回复 */}
                              <div>
                                <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-2"></span>
                                  模型回复
                                </h5>
                                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                  <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                                    {response || '暂无模型回复'}
                                  </div>
                                </div>
                              </div>
                              
                              {/* 评分详情 */}
                              {selectedRun.reasoning_details && selectedRun.reasoning_details[testIndex] && (
                                <div>
                                  <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2"></span>
                                    评分详情
                                  </h5>
                                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                                    <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                                      {selectedRun.reasoning_details[testIndex]}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      // 单题目情况：兼容原有显示方式
                      <>
                        {/* 模型回复 */}
                        <div className="space-y-3">
                          <h4 className="text-base font-semibold text-gray-800 flex items-center">
                            <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                            模型回复
                          </h4>
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {selectedRun.model_response || '暂无模型回复'}
                            </div>
                          </div>
                        </div>

                        {/* 评分详情 */}
                        <div className="space-y-3">
                          <h4 className="text-base font-semibold text-gray-800 flex items-center">
                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                            评分详情
                          </h4>
                          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {selectedRun.reasoning || '暂无评分详情'}
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {/* 执行信息 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="text-center">
                        <div className="text-sm text-gray-500">执行时长</div>
                        <div className="text-lg font-semibold text-gray-800">
                          {selectedRun.execution_time ? `${(selectedRun.execution_time / 1000).toFixed(1)}s` : '-'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-gray-500">Token使用</div>
                        <div className="text-lg font-semibold text-gray-800">
                          {selectedRun.total_tokens || selectedRun.prompt_tokens + selectedRun.completion_tokens || '-'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-gray-500">费用</div>
                        <div className="text-lg font-semibold text-gray-800">
                          {selectedRun.cost ? `$${selectedRun.cost.toFixed(4)}` : '-'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm text-gray-500">状态</div>
                        <div className={`text-lg font-semibold ${
                          selectedRun.status === 'completed' ? 'text-green-600' :
                          selectedRun.status === 'failed' ? 'text-red-600' :
                          selectedRun.status === 'running' ? 'text-blue-600' : 'text-gray-600'
                        }`}>
                          {selectedRun.status === 'completed' ? '已完成' :
                           selectedRun.status === 'failed' ? '失败' :
                           selectedRun.status === 'running' ? '运行中' : '待处理'}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* 🆕 测试用例模态框 - 更大尺寸 */}
      {showTestCase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
            {/* 模态框头部 */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">测试用例详情</h3>
              <button
                onClick={() => setShowTestCase(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 模态框内容 */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* 测试用例输入 */}
              {testCaseInput && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                    测试用例输入
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {testCaseInput}
                    </div>
                  </div>
                </div>
              )}

              {/* 参考答案 */}
              {testCaseReference && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    参考答案
                  </h4>
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {testCaseReference}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 简化版多次运行分数展示（用于表格等紧凑场景）
 */
export function CompactMultiRunScoreDisplay({ stats, runs }: MultiRunScoreDisplayProps) {
  const completedRuns = runs.filter(run => run.status === 'completed' && run.score !== null);
  const scores = completedRuns.map(run => run.score!);

  return (
    <div className="flex items-center gap-1">
      {scores.map((score, index) => (
        <span
          key={index}
          className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
            score === stats.best_run 
              ? 'bg-green-100 text-green-800' 
              : score === stats.worst_run 
              ? 'bg-red-100 text-red-800' 
              : 'bg-blue-100 text-blue-800'
          }`}
          title={`第${index + 1}次运行: ${score}/100`}
        >
          {score}
        </span>
      ))}
      
      {runs.length > completedRuns.length && (
        <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
          +{runs.length - completedRuns.length}
        </span>
      )}
    </div>
  );
}
