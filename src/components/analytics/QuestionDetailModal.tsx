'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  TrendingUp,
  Users,
  Target,
  Clock,
  Award,
  BarChart3,
  Calendar
} from 'lucide-react';

interface QuestionDetail {
  id: string;
  title: string;
  content: string;
  reference_answer: string;
  template_name: string;
  difficulty_level: 'easy' | 'medium' | 'hard';
  overall_stats: {
    total_tests: number;
    avg_score: number;
    best_score: number;
    worst_score: number;
    std_dev: number;
  };
  model_performance: Array<{
    name: string;
    logical_name: string;
    provider: string;
    avg_score: number;
    best_score: number;
    worst_score: number;
    test_count: number;
    latest_test: string;
  }>;
  trends: Array<{
    date: string;
    score: number;
    count: number;
  }>;
  latest_tests: Array<{
    model_name: string;
    score: number;
    created_at: string;
  }>;
}

interface QuestionDetailModalProps {
  questionId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function QuestionDetailModal({
  questionId,
  isOpen,
  onClose
}: QuestionDetailModalProps) {
  const [data, setData] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取题目详情数据
  const fetchQuestionDetail = async (id: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/analytics/questions/${id}`);

      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        throw new Error(result.error || '获取数据失败');
      }
    } catch (error) {
      console.error('获取题目详情失败:', error);
      setError(error instanceof Error ? error.message : '获取数据失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // 当questionId变化时重新获取数据
  useEffect(() => {
    if (isOpen && questionId) {
      fetchQuestionDetail(questionId);
    }
  }, [isOpen, questionId]);

  // 获取难度颜色
  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'easy': return 'text-green-600 bg-green-50 border-green-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'hard': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getDifficultyLabel = (level: string) => {
    switch (level) {
      case 'easy': return '简单';
      case 'medium': return '中等';
      case 'hard': return '困难';
      default: return '未知';
    }
  };

  // 渲染趋势图（简化版）
  const renderTrendChart = (trends: QuestionDetail['trends']) => {
    if (!trends || trends.length === 0) return null;

    const maxScore = Math.max(...trends.map(t => t.score));
    const minScore = Math.min(...trends.map(t => t.score));
    const range = maxScore - minScore || 1;

    return (
      <div className="h-32 flex items-end justify-between px-2">
        {trends.slice(-10).map((point, index) => {
          const height = ((point.score - minScore) / range) * 100;
          return (
            <div key={index} className="flex flex-col items-center space-y-1">
              <div className="text-xs text-gray-500">{Math.round(point.score)}</div>
              <div
                className="w-6 bg-blue-500 rounded-t"
                style={{ height: `${Math.max(height, 5)}%` }}
              ></div>
              <div className="text-xs text-gray-400 transform rotate-45">
                {point.date.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-auto">
        {/* 头部 */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-bold text-gray-900">
              题目详情分析
            </h2>
            {data && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getDifficultyColor(data.difficulty_level)}`}>
                {getDifficultyLabel(data.difficulty_level)}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">加载题目详情...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-red-800 mb-2">加载失败</h3>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => questionId && fetchQuestionDetail(questionId)}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                重试
              </button>
            </div>
          )}

          {data && (
            <div className="space-y-8">
              {/* 基本信息 */}
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      #{data.id.slice(0, 8)} - {data.title}
                    </h3>
                    <p className="text-sm text-gray-600 bg-gray-50 px-3 py-1 rounded inline-block">
                      {data.template_name}
                    </p>
                  </div>
                </div>

                {/* 核心指标 */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <Users className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-blue-900">{data.overall_stats.total_tests}</div>
                    <div className="text-sm text-blue-600">总测试次数</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <TrendingUp className="h-6 w-6 text-green-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-green-900">{data.overall_stats.avg_score}%</div>
                    <div className="text-sm text-green-600">平均得分</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4 text-center">
                    <Award className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-yellow-900">{data.overall_stats.best_score}%</div>
                    <div className="text-sm text-yellow-600">最高得分</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <Target className="h-6 w-6 text-red-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-red-900">{data.overall_stats.worst_score}%</div>
                    <div className="text-sm text-red-600">最低得分</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4 text-center">
                    <BarChart3 className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-purple-900">±{data.overall_stats.std_dev}</div>
                    <div className="text-sm text-purple-600">标准差</div>
                  </div>
                </div>
              </div>

              {/* 趋势分析和模型排行并排显示 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 趋势分析 */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                    📈 正确率趋势 (最近10天)
                  </h4>
                  {data.trends.length > 0 ? (
                    renderTrendChart(data.trends)
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      暂无趋势数据
                    </div>
                  )}
                </div>

                {/* 模型排行榜 */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                    🏆 模型表现排行
                  </h4>
                  <div className="space-y-3">
                    {data.model_performance.slice(0, 5).map((model, index) => (
                      <div key={model.name} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`
                            w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                            ${index === 0 ? 'bg-yellow-500 text-white' :
                              index === 1 ? 'bg-gray-400 text-white' :
                              index === 2 ? 'bg-amber-600 text-white' :
                              'bg-gray-200 text-gray-600'}
                          `}>
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{model.name}</div>
                            <div className="text-xs text-gray-500">{model.test_count}次测试</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-900">{model.avg_score.toFixed(1)}%</div>
                          <div className="text-xs text-gray-500">最高: {model.best_score}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 题目内容 */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h4 className="font-semibold text-gray-900 mb-4">📝 题目内容</h4>
                <div className="bg-white rounded border p-4">
                  <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">题目ID: {data.id}</div>
                    <div className="text-gray-900 whitespace-pre-wrap">
                      {data.content.length > 500
                        ? data.content.slice(0, 500) + '...'
                        : data.content}
                    </div>
                  </div>

                  {data.reference_answer && (
                    <div className="border-t pt-4">
                      <div className="text-sm font-medium text-gray-700 mb-2">参考答案/标准输出:</div>
                      <div className="text-gray-900 whitespace-pre-wrap bg-gray-50 p-3 rounded">
                        {data.reference_answer.length > 200
                          ? data.reference_answer.slice(0, 200) + '...'
                          : data.reference_answer}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 最近测试记录 */}
              {data.latest_tests.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-semibold text-gray-900 mb-4">⏱️ 最近测试记录</h4>
                  <div className="space-y-2">
                    {data.latest_tests.slice(0, 5).map((test, index) => (
                      <div key={index} className="flex items-center justify-between py-2 px-3 bg-white rounded">
                        <div className="flex items-center space-x-3">
                          <div className="font-medium text-gray-900">{test.model_name}</div>
                          <div className="text-sm text-gray-500">
                            {new Date(test.created_at).toLocaleDateString('zh-CN')} {new Date(test.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="font-bold text-gray-900">{test.score}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}