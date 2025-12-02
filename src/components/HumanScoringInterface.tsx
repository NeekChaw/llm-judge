'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { User, Save, Star, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface HumanScoringInterfaceProps {
  evaluationResultId: number;
  evaluatorConfig?: {
    guidelines: string;
    scoring_criteria: Array<{
      criterion: string;
      weight: number;
      description?: string;
    }>;
    required_qualifications?: string[];
  };
  maxScore?: number; // 题目级别的最高分
  currentScore?: number;
  currentReasoning?: string;
  status?: string;
  className?: string;
  onScoreSubmitted?: (score: number, reasoning: string) => void;
}

export default function HumanScoringInterface({
  evaluationResultId,
  evaluatorConfig,
  maxScore = 100,
  currentScore,
  currentReasoning,
  status,
  className = '',
  onScoreSubmitted
}: HumanScoringInterfaceProps) {
  const [score, setScore] = useState<number>(currentScore || 0);
  const [reasoning, setReasoning] = useState<string>(currentReasoning || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAlreadyScored = status === 'completed' && currentScore !== undefined && currentScore !== -1;
  const isPending = status === 'pending_human_review' || currentScore === -1;

  // 重置保存状态
  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saved]);

  const handleScoreSubmit = async () => {
    if (saving) return;

    // 验证输入
    if (!reasoning.trim()) {
      setError('请提供评分理由');
      return;
    }

    if (score < 0 || score > maxScore) {
      setError(`评分必须在 0-${maxScore} 范围内`);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // 调用API提交人工评分
      const response = await fetch(`/api/evaluations/${evaluationResultId}/human-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          score: score,
          reasoning: reasoning.trim(),
          evaluator_id: evaluationResultId // 临时使用，实际应该传递正确的evaluator_id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '提交评分失败');
      }

      const result = await response.json();
      
      setSaved(true);
      onScoreSubmitted?.(score, reasoning);

      console.log('人工评分提交成功:', result);
      
    } catch (error) {
      console.error('提交人工评分失败:', error);
      setError(error instanceof Error ? error.message : '提交失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const getStatusIcon = () => {
    if (saved || isAlreadyScored) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (isPending) {
      return <Clock className="w-5 h-5 text-orange-500" />;
    }
    return <User className="w-5 h-5 text-blue-500" />;
  };

  const getStatusText = () => {
    if (saved) return '评分已保存';
    if (isAlreadyScored) return '已完成人工评分';
    if (isPending) return '等待人工评分';
    return '人工评分';
  };

  return (
    <div className={`border border-blue-200 rounded-lg bg-blue-50 ${className}`}>
      <div className="p-4 space-y-4">
        {/* 头部状态 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <h4 className="text-sm font-medium text-gray-900">
              {getStatusText()}
            </h4>
            {isPending && !saved && (
              <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                需要人工介入
              </span>
            )}
          </div>
          {currentScore !== undefined && currentScore !== -1 && (
            <div className="text-lg font-bold text-blue-600">
              {currentScore}/{maxScore}
            </div>
          )}
        </div>

        {/* 评分指南 */}
        {evaluatorConfig?.guidelines && !isAlreadyScored && (
          <div className="bg-white border border-blue-200 rounded-lg p-3">
            <h5 className="text-sm font-medium text-gray-900 mb-2">评分指南</h5>
            <p className="text-sm text-gray-600">
              {evaluatorConfig.guidelines}
            </p>
          </div>
        )}

        {/* 评分标准 */}
        {evaluatorConfig?.scoring_criteria && evaluatorConfig.scoring_criteria.length > 0 && !isAlreadyScored && (
          <div className="bg-white border border-blue-200 rounded-lg p-3">
            <h5 className="text-sm font-medium text-gray-900 mb-2">评分标准</h5>
            <div className="space-y-2">
              {evaluatorConfig.scoring_criteria.map((criterion, index) => (
                <div key={index} className="text-sm">
                  <div className="flex justify-between items-start">
                    <span className="text-gray-900 font-medium">{criterion.criterion}</span>
                    <span className="text-gray-500 text-xs">权重: {(criterion.weight * 100).toFixed(0)}%</span>
                  </div>
                  {criterion.description && (
                    <p className="text-gray-600 text-xs mt-1">{criterion.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 已完成的评分显示 */}
        {isAlreadyScored && currentReasoning && (
          <div className="bg-white border border-green-200 rounded-lg p-3">
            <h5 className="text-sm font-medium text-gray-900 mb-2">评分理由</h5>
            <p className="text-sm text-gray-700">{currentReasoning}</p>
          </div>
        )}

        {/* 评分输入区域 - 只有待评分状态显示 */}
        {(isPending || !isAlreadyScored) && (
          <div className="bg-white border border-blue-200 rounded-lg p-3 space-y-4">
            {/* 评分输入 */}
            <div>
              <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
                <span>评分</span>
                <span className="text-xs text-gray-500">
                  范围: 0 - {maxScore}
                </span>
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="number"
                  min={0}
                  max={maxScore}
                  step={1}
                  value={score}
                  onChange={(e) => setScore(parseFloat(e.target.value))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={saving || isAlreadyScored}
                />
                <div className="flex items-center space-x-1">
                  {Array.from({ length: 5 }, (_, i) => {
                    const starValue = ((i + 1) / 5) * maxScore;
                    const isActive = score >= starValue;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setScore(starValue)}
                        disabled={saving || isAlreadyScored}
                        className="focus:outline-none"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            isActive ? 'text-yellow-400 fill-current' : 'text-gray-300'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 评分理由输入 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                评分理由 *
              </label>
              <textarea
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                rows={4}
                placeholder="请详细说明评分理由，包括优点、缺点和改进建议..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={saving || isAlreadyScored}
              />
            </div>

            {/* 错误信息 */}
            {error && (
              <div className="flex items-center space-x-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            {/* 提交按钮 */}
            <div className="flex justify-end space-x-2">
              <Button
                onClick={handleScoreSubmit}
                disabled={saving || isAlreadyScored || !reasoning.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    保存中...
                  </>
                ) : saved ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    已保存
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    提交评分
                  </>
                )}
              </Button>
            </div>

            {/* 成功提示 */}
            {saved && (
              <div className="flex items-center space-x-2 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" />
                <span>评分已成功保存！</span>
              </div>
            )}
          </div>
        )}

        {/* 资格要求提示 */}
        {evaluatorConfig?.required_qualifications && evaluatorConfig.required_qualifications.length > 0 && !isAlreadyScored && (
          <div className="text-xs text-gray-500">
            <span className="font-medium">评分要求:</span> {evaluatorConfig.required_qualifications.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}