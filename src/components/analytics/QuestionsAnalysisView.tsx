'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  TrendingUp,
  Clock,
  Target,
  Filter,
  ChevronDown,
  Search,
  Eye
} from 'lucide-react';
import QuestionDetailModal from './QuestionDetailModal';

interface QuestionData {
  id: string;
  title: string;
  template_name: string;
  accuracy: number;
  test_count: number;
  avg_score: number;
  max_score: number;
  std_dev: number;
  difficulty_level: 'easy' | 'medium' | 'hard';
  avg_time: number;
  latest_test: string;
}

interface Overview {
  total_questions: number;
  avg_accuracy: number;
  difficult_count: number;
  total_tests: number;
}

interface ApiResponse {
  success: boolean;
  data: {
    overview: Overview;
    questions: QuestionData[];
    filters: {
      time_range: string;
      template_id: string | null;
      sort_by: string;
      sort_order: string;
      difficulty: string | null;
    };
  };
}

export default function QuestionsAnalysisView() {
  const [data, setData] = useState<ApiResponse['data'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 过滤器状态
  const [timeRange, setTimeRange] = useState('30d');
  const [templateId, setTemplateId] = useState<string>('');
  const [sortBy, setSortBy] = useState('accuracy');
  const [sortOrder, setSortOrder] = useState('desc');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  // 模态框状态
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 获取数据
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (timeRange) params.append('timeRange', timeRange);
      if (templateId) params.append('templateId', templateId);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);
      if (difficultyFilter) params.append('difficulty', difficultyFilter);

      const response = await fetch(`/api/analytics/questions?${params.toString()}`);

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
      console.error('获取考题分析数据失败:', error);
      setError(error instanceof Error ? error.message : '获取数据失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载和过滤器变化时重新获取数据
  useEffect(() => {
    fetchData();
  }, [timeRange, templateId, sortBy, sortOrder, difficultyFilter]);

  // 搜索过滤
  const filteredQuestions = data?.questions.filter(question =>
    searchTerm === '' ||
    question.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    question.template_name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // 处理题目详情查看
  const handleViewDetails = (questionId: string) => {
    setSelectedQuestionId(questionId);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedQuestionId(null);
  };

  // 获取难度颜色和图标
  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'easy': return 'text-green-600 bg-green-50 border-green-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'hard': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getDifficultyIcon = (level: string) => {
    switch (level) {
      case 'easy': return '🟢';
      case 'medium': return '🟡';
      case 'hard': return '🔴';
      default: return '⚪';
    }
  };

  // 渲染紧凑的进度条
  const renderAccuracyBar = (accuracy: number) => {
    const percentage = Math.min(100, Math.max(0, accuracy));

    // 根据准确率决定颜色
    const getColor = () => {
      if (percentage >= 80) return 'green';
      if (percentage >= 50) return 'yellow';
      return 'red';
    };

    const color = getColor();

    const colorClasses = {
      green: {
        bg: 'bg-green-100',
        bar: 'bg-green-500',
        text: 'text-green-700'
      },
      yellow: {
        bg: 'bg-yellow-100',
        bar: 'bg-yellow-500',
        text: 'text-yellow-700'
      },
      red: {
        bg: 'bg-red-100',
        bar: 'bg-red-500',
        text: 'text-red-700'
      }
    };

    const styles = colorClasses[color];

    return (
      <div className="flex items-center space-x-3">
        {/* 紧凑的进度条 - 固定宽度 */}
        <div className="relative w-32">
          <div className={`w-full h-2 rounded-full ${styles.bg}`}>
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${styles.bar}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
        {/* 百分比数字 */}
        <span className={`text-sm font-semibold ${styles.text} min-w-[45px]`}>
          {Math.round(percentage)}%
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载考题分析数据...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-red-800 mb-2">数据加载失败</h3>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">暂无数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 概览统计 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <Target className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">总题目数</p>
              <p className="text-2xl font-bold text-gray-900">{data.overview.total_questions}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <TrendingUp className="h-8 w-8 text-green-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">平均正确率</p>
              <p className="text-2xl font-bold text-gray-900">{data.overview.avg_accuracy}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-red-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">困难题目</p>
              <p className="text-2xl font-bold text-gray-900">
                {data.overview.difficult_count}
                <span className="text-sm text-gray-500 ml-1">
                  ({Math.round((data.overview.difficult_count / data.overview.total_questions) * 100)}%)
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600">总测试次数</p>
              <p className="text-2xl font-bold text-gray-900">{data.overview.total_tests.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 筛选器 */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* 时间范围 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">时间范围</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="1d">最近1天</option>
              <option value="7d">最近7天</option>
              <option value="30d">最近30天</option>
              <option value="all">全部时间</option>
            </select>
          </div>

          {/* 难度 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">难度</label>
            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="easy">简单 (≥80%)</option>
              <option value="medium">中等 (50-80%)</option>
              <option value="hard">困难 (&lt;50%)</option>
            </select>
          </div>

          {/* 排序字段 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">排序</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="accuracy">正确率</option>
              <option value="test_count">测试次数</option>
              <option value="title">题目名称</option>
            </select>
          </div>

          {/* 排序方向 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">方向</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </div>

          {/* 搜索 */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">搜索题目</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索题目标题或模板..."
                className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 题目列表 */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            📋 题目列表 ({filteredQuestions.length})
          </h3>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredQuestions.map((question) => (
            <div key={question.id} className="p-6 hover:bg-gray-50 transition-all duration-200">
              <div className="flex items-start justify-between">
                <div className="flex-1 pr-6">
                  {/* 标题行 */}
                  <div className="flex items-center mb-3">
                    <span className="text-lg mr-3">
                      {getDifficultyIcon(question.difficulty_level)}
                    </span>
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-gray-900 mb-1">
                        #{question.id.slice(0, 8)} - {question.title}
                      </h4>
                      <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                        {question.template_name}
                      </span>
                    </div>
                  </div>

                  {/* 进度条 */}
                  <div className="mb-4">
                    {renderAccuracyBar(question.accuracy)}
                  </div>

                  {/* 统计信息 */}
                  <div className="flex items-center space-x-6 text-sm text-gray-600">
                    <div className="flex items-center space-x-1">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span>{question.test_count}次测试</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-4 w-4 text-green-500" />
                      <span>平均{question.avg_time}s</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Target className="h-4 w-4 text-purple-500" />
                      <span>标准差: ±{question.std_dev}</span>
                    </div>
                  </div>
                </div>

                {/* 右侧操作区 */}
                <div className="flex flex-col items-end space-y-3">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900 mb-1">
                      {question.accuracy}%
                    </div>
                    <div className={`text-xs px-2 py-1 rounded-full ${getDifficultyColor(question.difficulty_level)}`}>
                      {question.difficulty_level === 'easy' ? '简单' :
                       question.difficulty_level === 'medium' ? '中等' : '困难'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleViewDetails(question.id)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center transition-colors shadow-sm"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    查看详情
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredQuestions.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">没有找到符合条件的题目</p>
          </div>
        )}
      </div>

      {/* 题目详情模态框 */}
      <QuestionDetailModal
        questionId={selectedQuestionId}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
}