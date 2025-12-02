'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, Download, Clock, CheckCircle, XCircle, AlertCircle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModelSelectorDialog } from '@/components/ModelSelectorDialog';
import { MultimodalResponseRenderer } from '@/components/MultimodalResponseRenderer';

interface SubTask {
  id?: string | number;
  test_case_id?: string;
  test_case_input?: string;
  test_case_reference?: string;
  test_case_attachments?: Array<{  // 🖼️ 测试用例附件字段
    type: 'image' | 'audio' | 'video' | 'file';
    url: string;
    metadata?: {
      filename?: string;
      alt_text?: string;
      [key: string]: any;
    };
  }>;
  // 🖼️ 模型回答可以是字符串或多模态对象
  model_response?: string | {
    content?: string;
    text?: string;
    response?: string;
    attachments?: Array<{
      type: 'image' | 'audio' | 'video' | 'file';
      url?: string;
      base64?: string;
      metadata?: {
        mime_type?: string;
        filename?: string;
        alt_text?: string;
      };
    }>;
  };
  score?: number;
  max_score?: number;
  status: 'completed' | 'failed' | 'pending' | 'processing';
  execution_time?: number;
  evaluation_feedback?: string;
  created_at?: string;
  repetition_index?: number;
  // 新增字段用于处理多运行数据
  reasoning?: string;
  test_case_max_score?: number;
  // 评分器相关信息
  evaluator_type?: 'HUMAN' | 'PROMPT' | 'REGEX' | 'CODE';
  evaluator_config?: {
    scoring_scale?: {
      min: number;
      max: number;
      step?: number;
    };
    guidelines?: string;
    scoring_criteria?: (string | {
      criterion?: string;
      weight?: number;
      description?: string;
    })[]; // 🔧 修复：支持字符串或对象格式的评分标准
    template_id?: string; // 🆕 CODE类型评分器的模板ID
  };
  // 可能的其他字段
  runs?: any[];
  [key: string]: any; // 允许其他动态字段
}

interface TestCaseListProps {
  subtasks: SubTask[];
  runIndex: number;
  className?: string;
  currentModelId?: string; // 当前使用的模型ID，用于重新评分默认选择
}

interface TestCaseDetailProps {
  subtask: SubTask;
  onClose: () => void;
  currentModelId?: string; // 当前使用的模型ID
}

function TestCaseDetail({ subtask, onClose, currentModelId }: TestCaseDetailProps) {
  const [expandedSection, setExpandedSection] = useState<'question' | 'answer' | null>(null);
  const [humanScore, setHumanScore] = useState<string>(subtask.score?.toString() || '');
  const [humanReasoning, setHumanReasoning] = useState<string>(subtask.evaluation_feedback || '');
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [forceManualMode, setForceManualMode] = useState(false); // 🆕 强制人工评分模式
  const [showModelSelector, setShowModelSelector] = useState(false); // 🆕 显示模型选择对话框
  const [isReEvaluating, setIsReEvaluating] = useState(false); // 🆕 重新评分状态
  const [showCodeReEvaluateDialog, setShowCodeReEvaluateDialog] = useState(false); // 🆕 CODE类型重新评分确认对话框
  const [codeTemplateInfo, setCodeTemplateInfo] = useState<{name: string, description?: string} | null>(null); // 🆕 代码模板信息
  // 🆕 本地状态保存更新后的分数
  const [currentScore, setCurrentScore] = useState<number | undefined>(subtask.score);
  const [currentMaxScore, setCurrentMaxScore] = useState<number | undefined>(subtask.max_score);

  // 🆕 用于动态设置高度
  const scoringColumnRef = React.useRef<HTMLDivElement>(null);
  const [columnHeight, setColumnHeight] = React.useState<number | null>(null);

  // 🆕 监听评分详情列的高度变化
  React.useEffect(() => {
    if (scoringColumnRef.current) {
      const updateHeight = () => {
        setColumnHeight(scoringColumnRef.current?.offsetHeight || null);
      };

      updateHeight();

      // 监听窗口大小变化
      window.addEventListener('resize', updateHeight);

      // 使用 ResizeObserver 监听元素自身大小变化
      const resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(scoringColumnRef.current);

      return () => {
        window.removeEventListener('resize', updateHeight);
        resizeObserver.disconnect();
      };
    }
  }, [subtask, forceManualMode, scoreSubmitted]); // 依赖可能改变高度的状态

  const toggleSection = (section: 'question' | 'answer') => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // 🆕 获取代码模板信息
  const fetchCodeTemplateInfo = async (templateId?: string) => {
    if (!templateId) {
      setCodeTemplateInfo({name: '算法模板'});
      return;
    }
    
    try {
      const response = await fetch(`/api/code-templates/${templateId}`);
      if (response.ok) {
        const data = await response.json();
        const template = data.template; // API返回格式为 {template: {...}}
        setCodeTemplateInfo({
          name: template?.name || '算法模板',
          description: template?.description
        });
      } else {
        setCodeTemplateInfo({name: '算法模板'});
      }
    } catch (error) {
      console.error('获取模板信息失败:', error);
      setCodeTemplateInfo({name: '算法模板'});
    }
  };

  // 🆕 处理重新评分按钮点击 - 智能判断评分器类型
  const handleReEvaluateClick = async () => {
    // 根据评分器类型采用不同的处理方式
    if (subtask.evaluator_type === 'CODE') {
      // 获取代码模板信息
      const templateId = subtask.evaluator_config?.template_id;
      await fetchCodeTemplateInfo(templateId);
      setShowCodeReEvaluateDialog(true);
    } else {
      // PROMPT、REGEX、HUMAN等类型使用模型选择逻辑
      setShowModelSelector(true);
    }
  };

  // 🆕 CODE类型重新评分确认
  const handleCodeReEvaluateConfirm = async () => {
    setShowCodeReEvaluateDialog(false);
    setIsReEvaluating(true);
    
    try {
      // 对于CODE类型，我们需要创建一个专门的重新执行API
      const response = await fetch(`/api/evaluations/${subtask.id}/re-execute-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keep_original_result: true
        })
      });

      const result = await response.json();
      
      if (result.success) {
        alert(`✅ CODE重新执行已开始！\n\n将在E2B环境中重新执行已生成的代码进行评分，请稍等片刻，页面将自动刷新显示新的评分结果。`);
        
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        alert(`❌ 重新执行失败: ${result.error}`);
      }
    } catch (error) {
      console.error('CODE重新执行请求失败:', error);
      alert('❌ 网络错误，请稍后重试');
    } finally {
      setIsReEvaluating(false);
    }
  };

  // 🆕 处理PROMPT类型重新评分
  const handlePromptReEvaluate = async (newModelId: string, modelInfo: any) => {
    setIsReEvaluating(true);
    try {
      // 从URL中获取task_id
      const taskId = window.location.pathname.split('/').pop();

      const response = await fetch(`/api/tasks/${taskId}/retry-subtask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtask_id: subtask.id,
          evaluator_id: newModelId, // 使用新的评分器ID
          reason: '用户手动重新评分',
          force_retry: true, // 强制重试，即使任务已成功
          re_evaluation_only: true // 🆕 仅重新评分，保留现有模型响应
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '重新评分失败');
      }

      // 成功处理由ModelSelectorDialog处理，这里不需要额外的alert

    } catch (error) {
      console.error('重新评分失败:', error);
      alert(`❌ 重新评分失败: ${error.message}`);
    } finally {
      setIsReEvaluating(false);
    }
  };

  // 提交人工评分
  const handleSubmitHumanScore = async () => {
    if (!humanScore.trim() || !humanReasoning.trim()) {
      alert('请填写评分和评分理由');
      return;
    }

    const score = parseFloat(humanScore);
    if (isNaN(score)) {
      alert('评分必须是有效数字');
      return;
    }

    // 检查评分范围
    const minScore = subtask.evaluator_config?.scoring_scale?.min || 0;
    const maxScore = subtask.evaluator_config?.scoring_scale?.max || subtask.max_score || 100;
    
    if (score < minScore || score > maxScore) {
      alert(`评分必须在 ${minScore}-${maxScore} 范围内`);
      return;
    }

    setIsSubmittingScore(true);
    try {
      const response = await fetch(`/api/evaluations/${subtask.id}/human-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          score: score,
          reasoning: humanReasoning.trim(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setScoreSubmitted(true);

        // 🔧 更新本地状态，无需刷新页面
        setCurrentScore(score);
        setHumanScore(score.toString());
        setHumanReasoning(humanReasoning.trim());

        alert('人工评分已成功保存！');
      } else {
        const error = await response.json();
        alert(`保存失败: ${error.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('提交人工评分失败:', error);
      alert('网络错误，请稍后重试');
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const getScoreColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return 'text-green-600';
    if (percentage >= 70) return 'text-blue-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="border border-gray-200 rounded-lg mt-2 overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 flex justify-between items-center border-b">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-gray-900">🎯 测试用例详情: {subtask.test_case_id}</span>
          {currentScore !== undefined && currentMaxScore && (
            <span className={`font-semibold ${getScoreColor(currentScore, currentMaxScore)}`}>
              得分: {currentScore}/{currentMaxScore}分 ({Math.round((currentScore / currentMaxScore) * 100)}%)
            </span>
          )}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          收起
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-gray-200">
        {/* 左栏：测试问题 */}
        <div
          className="bg-white p-4 flex flex-col"
          style={columnHeight ? { maxHeight: `${columnHeight}px` } : undefined}
        >
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <h4 className="font-semibold text-gray-900 text-sm border-b border-gray-200 pb-2">
              📝 测试问题
            </h4>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded-r text-sm leading-relaxed overflow-y-auto"
               style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
            {subtask.test_case_input ? (
              <>
                <pre className="whitespace-pre-wrap">{subtask.test_case_input}</pre>

                {/* 🖼️ 显示附件（图片预览） */}
                {subtask.test_case_attachments && subtask.test_case_attachments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-semibold text-gray-600 mb-2">
                      📎 附件 ({subtask.test_case_attachments.length})
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {subtask.test_case_attachments.map((attachment, idx) => (
                        <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                          {attachment.type === 'image' ? (
                            <>
                              <img
                                src={attachment.url}
                                alt={attachment.metadata?.alt_text || attachment.metadata?.filename || `附件 ${idx + 1}`}
                                className="w-full h-auto max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(attachment.url, '_blank')}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const errorDiv = target.nextElementSibling as HTMLElement;
                                  if (errorDiv) errorDiv.style.display = 'block';
                                }}
                              />
                              <div className="hidden p-2 text-xs text-red-600 bg-red-50">
                                ❌ 图片加载失败
                              </div>
                              {attachment.metadata?.filename && (
                                <div className="px-2 py-1 text-xs text-gray-600 bg-gray-50 border-t">
                                  {attachment.metadata.filename}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="p-3 text-xs">
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                {attachment.metadata?.filename || `附件 ${idx + 1}`}
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <span className="text-gray-400 italic">暂无测试问题</span>
            )}
          </div>
        </div>

        {/* 中栏：AI回答 */}
        <div
          className="bg-white p-4 flex flex-col"
          style={columnHeight ? { maxHeight: `${columnHeight}px` } : undefined}
        >
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <h4 className="font-semibold text-gray-900 text-sm border-b border-gray-200 pb-2">
              🤖 AI回答
            </h4>
          </div>

          <div className="overflow-y-auto" style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
            {subtask.model_response ? (
              <MultimodalResponseRenderer
                response={subtask.model_response}
                maxImageHeight={200}
                showImageControls={true}
              />
            ) : (
              <div className="bg-green-50 border-l-4 border-green-400 p-3 rounded-r text-sm">
                <span className="text-gray-400 italic">暂无AI回答</span>
              </div>
            )}
          </div>
        </div>

        {/* 右栏：评分详情 - 自适应高度，作为其他列的基准 */}
        <div ref={scoringColumnRef} className="bg-white p-4">
          <h4 className="font-semibold text-gray-900 text-sm border-b border-gray-200 pb-2 mb-3">
            📊 评分详情
          </h4>
          
          {/* 评分总览 */}
          {currentScore !== undefined && currentMaxScore && (
            <div className="bg-gray-50 p-3 rounded mb-3">
              <div className="flex items-center justify-between">
                <div className={`text-lg font-bold ${getScoreColor(currentScore, currentMaxScore)}`}>
                  {currentScore}/{currentMaxScore} 分
                </div>
                {/* 🆕 人工评分标识 */}
                {(subtask.metadata && subtask.metadata.is_manual_score) || scoreSubmitted ? (
                  <div className="flex items-center bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                    👤 人工评分
                  </div>
                ) : null}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                加权平均: {Math.round((currentScore / currentMaxScore) * 100)}%
                {subtask.execution_time && (
                  <> • 用时: {(subtask.execution_time / 1000).toFixed(1)}s</>
                )}
                {/* 🆕 显示人工评分时间 */}
                {subtask.metadata && subtask.metadata.is_manual_score && subtask.metadata.manual_scored_at && (
                  <> • 人工评分时间: {new Date(subtask.metadata.manual_scored_at).toLocaleString()}</>
                )}
                {scoreSubmitted && (
                  <> • 刚刚更新</>
                )}
              </div>
            </div>
          )}
          
          {/* 评分反馈或人工评分界面 */}
          {subtask.evaluator_type === 'HUMAN' || 
           forceManualMode || // 🆕 强制人工评分模式
           (subtask.score !== undefined && subtask.max_score !== undefined && (subtask.score / subtask.max_score) > 1.2) || // 异常高分
           !subtask.evaluation_feedback || // 缺少评分反馈
           subtask.status === 'failed' ? ( // 失败状态
            /* 人工评分界面 */
            <div className="mb-4">
              {/* 🆕 对于非HUMAN评分器，先显示AI评分结果 */}
              {subtask.evaluator_type !== 'HUMAN' && (
                <div className="mb-4 border border-yellow-200 rounded p-3 bg-yellow-50">
                  <span className="text-xs text-yellow-700 font-semibold block mb-2">🤖 AI评分结果：</span>
                  <div className="text-xs text-gray-600 mb-2">
                    {subtask.evaluation_feedback ? (
                      <pre className="whitespace-pre-wrap max-h-32 overflow-y-auto">{subtask.evaluation_feedback}</pre>
                    ) : (
                      <span className="text-red-500 italic">⚠️ 暂无AI评分反馈 - 可能存在评分问题</span>
                    )}
                  </div>
                  {subtask.score !== undefined && subtask.max_score !== undefined && (subtask.score / subtask.max_score) > 1.2 && (
                    <div className="text-xs text-red-600 font-semibold bg-red-50 px-2 py-1 rounded">
                      ⚠️ 检测到异常高分 ({Math.round((subtask.score / subtask.max_score) * 100)}%)，建议人工校正
                    </div>
                  )}
                </div>
              )}
              
              <span className="text-xs text-blue-700 font-semibold block mb-2">
                👤 人工评分{subtask.evaluator_type !== 'HUMAN' ? '覆盖' : ''}：
              </span>
              
              {/* 评分指引（如果有） */}
              {subtask.evaluator_config?.guidelines && (
                <div className="bg-blue-50 border border-blue-200 p-2 rounded mb-3 text-xs">
                  <strong>评分指引：</strong>
                  <div className="mt-1 text-gray-600">{subtask.evaluator_config.guidelines}</div>
                </div>
              )}

              <div className="space-y-3">
                {/* 评分输入 */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">
                    评分 ({subtask.evaluator_config?.scoring_scale?.min || 0}-{subtask.evaluator_config?.scoring_scale?.max || subtask.max_score || 100}分)
                  </label>
                  <input
                    type="number"
                    value={humanScore}
                    onChange={(e) => setHumanScore(e.target.value)}
                    min={subtask.evaluator_config?.scoring_scale?.min || 0}
                    max={subtask.evaluator_config?.scoring_scale?.max || subtask.max_score || 100}
                    step={subtask.evaluator_config?.scoring_scale?.step || 1}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="请输入评分"
                    disabled={isSubmittingScore || scoreSubmitted}
                  />
                </div>

                {/* 评分理由输入 */}
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">评分理由</label>
                  <textarea
                    value={humanReasoning}
                    onChange={(e) => setHumanReasoning(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="请详细说明评分理由..."
                    disabled={isSubmittingScore || scoreSubmitted}
                  />
                </div>

                {/* 提交按钮 */}
                <div className="flex gap-2">
                  <Button 
                    onClick={handleSubmitHumanScore}
                    disabled={isSubmittingScore || scoreSubmitted || !humanScore.trim() || !humanReasoning.trim()}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isSubmittingScore ? '保存中...' : scoreSubmitted ? '✅ 已保存' : '💾 保存评分'}
                  </Button>
                  
                  {scoreSubmitted && (
                    <Button 
                      onClick={() => {
                        setScoreSubmitted(false);
                        setHumanScore(subtask.score?.toString() || '');
                        setHumanReasoning(subtask.evaluation_feedback || '');
                      }}
                      variant="outline"
                      size="sm"
                    >
                      🔄 重新评分
                    </Button>
                  )}
                </div>

                {/* 评分标准（如果有） */}
                {subtask.evaluator_config?.scoring_criteria && subtask.evaluator_config.scoring_criteria.length > 0 && (
                  <div className="border-t pt-2 mt-2">
                    <span className="text-xs font-medium text-gray-600 block mb-1">评分标准：</span>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {subtask.evaluator_config.scoring_criteria.map((criterion, index) => {
                        // 🔧 修复：处理criterion可能是对象的情况
                        const renderCriterion = () => {
                          if (typeof criterion === 'string') {
                            return criterion;
                          } else if (typeof criterion === 'object' && criterion !== null) {
                            // 如果是对象，尝试渲染其属性
                            if ('criterion' in criterion && 'weight' in criterion) {
                              return (
                                <span>
                                  <strong>{criterion.criterion}</strong>
                                  {criterion.weight && <span className="text-gray-500"> (权重: {criterion.weight})</span>}
                                  {criterion.description && <span className="text-gray-500"> - {criterion.description}</span>}
                                </span>
                              );
                            } else {
                              // 如果对象结构不明确，尝试序列化显示
                              return JSON.stringify(criterion);
                            }
                          } else {
                            return String(criterion);
                          }
                        };

                        return (
                          <li key={index} className="flex items-start">
                            <span className="text-blue-500 mr-1">•</span>
                            <span>{renderCriterion()}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* AI评分反馈显示 */
            <div className="mb-4">
              <span className="text-xs text-yellow-700 font-semibold block mb-2">🤖 AI评分反馈：</span>
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-xs leading-relaxed max-h-60 overflow-y-auto">
                {subtask.evaluation_feedback ? (
                  <pre className="whitespace-pre-wrap">{subtask.evaluation_feedback}</pre>
                ) : (
                  <span className="text-gray-400 italic">暂无评分反馈</span>
                )}
              </div>
            </div>
          )}
          
          {/* 操作区域 */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex flex-wrap gap-1">
              {/* 🆕 人工评分按钮 - 对于所有非HUMAN评分器都显示 */}
              {subtask.evaluator_type !== 'HUMAN' && !forceManualMode && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-xs bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                  onClick={() => setForceManualMode(true)}
                >
                  👤 启用人工评分
                </Button>
              )}
              {forceManualMode && subtask.evaluator_type !== 'HUMAN' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-xs bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                  onClick={() => setForceManualMode(false)}
                >
                  🔄 返回AI评分显示
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                onClick={handleReEvaluateClick}
                disabled={isReEvaluating}
              >
                {isReEvaluating ? (
                  <>
                    <div className="animate-spin h-3 w-3 mr-1 border border-orange-600 border-t-transparent rounded-full" />
                    重新评分中...
                  </>
                ) : (
                  <>
                    <Zap className="h-3 w-3 mr-1" />
                    重新评分
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" className="text-xs">
                📋 复制结果
              </Button>
              <Button variant="outline" size="sm" className="text-xs">
                💾 导出详情
              </Button>
              <Button variant="outline" size="sm" className="text-xs">
                🏷️ 添加标签
              </Button>
            </div>
            
            <div className="text-xs text-gray-500 pt-2 border-t">
              评分时间: {new Date(subtask.created_at).toLocaleString('zh-CN')}<br/>
              状态: {subtask.status}
            </div>
          </div>
        </div>
      </div>

      {/* 🆕 模型选择对话框 - 用于PROMPT等类型 */}
      <ModelSelectorDialog
        open={showModelSelector}
        onOpenChange={setShowModelSelector}
        onModelSelect={handlePromptReEvaluate}
        currentModelId={currentModelId}
        title="选择评分器模型"
        description={`为测试用例 "${subtask.test_case_id}" 选择评分器模型重新评分（可选择当前评分器或其他评分器）`}
      />

      {/* 🆕 CODE类型重新评分确认对话框 */}
      {showCodeReEvaluateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <div className="bg-orange-100 p-2 rounded-lg mr-3">
                <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">CODE算法重新评分</h3>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-600 mb-3">
                确定要在E2B环境中重新执行代码并使用 <span className="font-semibold text-gray-800">"{codeTemplateInfo?.name || '算法模板'}"</span> 重新评分吗？
              </p>
              {codeTemplateInfo?.description && (
                <div className="bg-gray-50 border border-gray-200 rounded p-2 mb-3 text-xs text-gray-600">
                  <strong>模板说明：</strong> {codeTemplateInfo.description}
                </div>
              )}
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                <div className="font-medium text-blue-800 mb-2">将执行以下操作：</div>
                <ul className="space-y-1 text-blue-700">
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                    保持已生成的代码不变（不重新生成代码）
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                    在安全的E2B沙盒环境中重新执行现有代码
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                    使用 "{codeTemplateInfo?.name || '算法模板'}" 重新评分
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                    生成新的评分结果并保留原始结果作为备份
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <Button 
                variant="outline" 
                onClick={() => setShowCodeReEvaluateDialog(false)}
                disabled={isReEvaluating}
              >
                取消
              </Button>
              <Button 
                onClick={handleCodeReEvaluateConfirm}
                disabled={isReEvaluating}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {isReEvaluating ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                    执行中...
                  </>
                ) : (
                  '确认重新评分'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TestCaseList({ subtasks, runIndex, className = '', currentModelId }: TestCaseListProps) {
  console.log('🚨 TestCaseList 组件已渲染!', { subtasksLength: subtasks?.length, runIndex });

  // 根据 repetition_index 筛选特定运行次数的测试用例
  const processedSubtasks = React.useMemo(() => {
    console.log('TestCaseList: Processing subtasks', {
      subtasksLength: subtasks?.length,
      runIndex,
      firstSubtask: subtasks?.[0],
    });
    
    if (!subtasks || subtasks.length === 0) {
      console.log('TestCaseList: No subtasks available');
      return [];
    }
    
    // 根据实际数据结构：subtasks是直接的评估结果数组，每个包含repetition_index
    // 筛选匹配特定runIndex的subtask记录
    const filteredSubtasks = subtasks.filter(subtask => {
      const repetitionIndex = subtask.repetition_index || 1; // 默认为1如果没有设置
      return repetitionIndex === runIndex;
    });
    
    console.log('TestCaseList: Filtered subtasks by repetition_index', {
      runIndex,
      totalSubtasks: subtasks.length,
      filteredCount: filteredSubtasks.length,
      sampleRepetitionIndexes: subtasks.slice(0, 5).map(s => s.repetition_index || 'null'),
    });
    
    
    // 转换为TestCaseList所需的格式，使用API返回的完整字段
    const processed = filteredSubtasks.map((subtask, index) => ({
      id: subtask.id?.toString() || `${subtask.test_case_id || 'unknown'}-${index}`,
      test_case_id: subtask.test_case_id || `test-case-${index + 1}`,
      test_case_input: subtask.test_case_input || '',
      test_case_reference: subtask.test_case_reference || '',
      test_case_attachments: subtask.test_case_attachments || [],
      // 🖼️ 保留完整的 model_response（可能包含附件）
      model_response: subtask.model_response || '',
      score: subtask.score,
      max_score: subtask.test_case_max_score || subtask.max_score || 5,
      status: (subtask.status || 'completed') as 'completed' | 'failed' | 'pending' | 'processing',
      execution_time: subtask.execution_time,
      evaluation_feedback: subtask.reasoning || subtask.evaluation_feedback || '',
      created_at: subtask.created_at || new Date().toISOString(),
      repetition_index: subtask.repetition_index || runIndex,
      // 评分器信息
      evaluator_type: subtask.evaluator_type,
      evaluator_config: subtask.evaluator_config
    }));
    
    console.log('TestCaseList: Final processed data', {
      processedLength: processed.length,
      firstProcessed: processed[0],
      sampleData: processed.slice(0, 3).map(p => ({
        id: p.id,
        test_case_id: p.test_case_id,
        hasInput: !!p.test_case_input,
        inputLength: p.test_case_input?.length || 0,
        hasAttachments: !!p.test_case_attachments,
        attachmentsCount: p.test_case_attachments?.length || 0,
        hasResponse: !!p.model_response,
        responseLength: p.model_response?.length || 0,
        hasFeedback: !!p.evaluation_feedback,
        feedbackLength: p.evaluation_feedback?.length || 0,
        score: p.score,
        max_score: p.max_score
      }))
    });
    
    return processed;
  }, [subtasks, runIndex]);

  // 由于我们已经从raw_results中获得了完整的数据，不需要额外的获取和合并逻辑
  const enrichedSubtasks = processedSubtasks;

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedTestCase, setSelectedTestCase] = useState<string | null>(null);

  const toggleExpand = (testCaseId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(testCaseId)) {
      newExpanded.delete(testCaseId);
      setSelectedTestCase(null);
    } else {
      newExpanded.add(testCaseId);
      setSelectedTestCase(testCaseId);
    }
    setExpandedItems(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    const statusMap = {
      completed: '已完成',
      failed: '失败',
      pending: '等待中',
      processing: '处理中'
    };
    return statusMap[status as keyof typeof statusMap] || status;
  };

  const getScoreColor = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return 'text-green-600 bg-green-50';
    if (percentage >= 70) return 'text-blue-600 bg-blue-50';
    if (percentage >= 50) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  if (!enrichedSubtasks || enrichedSubtasks.length === 0) {
    return (
      <div className={`p-4 text-center text-gray-500 ${className}`}>
        暂无测试用例数据
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-xs text-gray-500 mb-3 bg-gray-50 px-3 py-2 rounded">
        📋 测试用例列表 • 共 {enrichedSubtasks.length} 个测试用例
      </div>
      
      {enrichedSubtasks.map((subtask) => (
        <div key={subtask.id} className="border border-gray-200 rounded-lg overflow-hidden">
          {/* 测试用例概览行 */}
          <div 
            className="bg-white hover:bg-gray-50 transition-colors cursor-pointer"
            onClick={() => toggleExpand(subtask.test_case_id)}
          >
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1">
                {/* 展开/收起图标 */}
                {expandedItems.has(subtask.test_case_id) ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
                
                {/* 测试用例ID */}
                <div className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                  {subtask.test_case_id}
                </div>
                
                {/* 状态和基本信息 */}
                <div className="flex items-center space-x-2 flex-1">
                  <div className="flex items-center space-x-1">
                    {getStatusIcon(subtask.status)}
                    <span className="text-sm text-gray-600">{getStatusText(subtask.status)}</span>
                  </div>
                  
                  {subtask.execution_time && (
                    <span className="text-xs text-gray-400">
                      • 耗时 {(subtask.execution_time / 1000).toFixed(1)}s
                    </span>
                  )}
                  
                  <span className="text-xs text-gray-400">
                    • {new Date(subtask.created_at).toLocaleTimeString('zh-CN')}
                  </span>
                </div>
              </div>
              
              {/* 得分和操作 */}
              <div className="flex items-center space-x-3">
                {subtask.score !== undefined && subtask.max_score !== undefined ? (
                  <div className={`px-2 py-1 rounded text-sm font-semibold ${getScoreColor(subtask.score, subtask.max_score)}`}>
                    {subtask.score}/{subtask.max_score}分 ({Math.round((subtask.score / subtask.max_score) * 100)}%)
                  </div>
                ) : subtask.score !== undefined ? (
                  <div className="px-2 py-1 rounded text-sm font-semibold text-blue-600 bg-blue-50">
                    {subtask.score}分
                  </div>
                ) : null}
                
                <div className="flex space-x-1">
                  {/* 🆕 人工评分按钮 - 对于所有非HUMAN评分器都显示 */}
                  {subtask.evaluator_type !== 'HUMAN' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs px-2 py-1 h-auto bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        // 触发展开状态，显示详情页面
                        toggleExpand(subtask.test_case_id);
                      }}
                    >
                      👤 人工评分
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs px-2 py-1 h-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(subtask.test_case_id);
                    }}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    查看详情
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-xs px-2 py-1 h-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    导出
                  </Button>
                </div>
              </div>
            </div>
          </div>
          
          {/* 详细内容展示 */}
          {expandedItems.has(subtask.test_case_id) && selectedTestCase === subtask.test_case_id && (
            <TestCaseDetail
              subtask={subtask}
              onClose={() => {
                setExpandedItems(new Set());
                setSelectedTestCase(null);
              }}
              currentModelId={currentModelId}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default TestCaseList;