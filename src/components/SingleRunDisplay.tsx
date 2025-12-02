'use client';

import React, { useState } from 'react';

interface SingleRunDisplayProps {
  score?: number;
  modelResponse?: string;
  reasoning?: string;
  testCaseInput?: string;
  testCaseReference?: string;
  status: string;
  executionTime?: number;
  totalTokens?: number;
  cost?: number;
}

export function SingleRunDisplay({
  score,
  modelResponse,
  reasoning,
  testCaseInput,
  testCaseReference,
  status,
  executionTime,
  totalTokens,
  cost
}: SingleRunDisplayProps) {
  const [showTestCase, setShowTestCase] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [copySuccess, setCopySuccess] = useState<'response' | 'reasoning' | 'all' | null>(null);

  // 🆕 复制模型回复
  const handleCopyResponse = async () => {
    try {
      await navigator.clipboard.writeText(modelResponse || '暂无模型回复');
      setCopySuccess('response');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 🆕 复制评分详情
  const handleCopyReasoning = async () => {
    try {
      await navigator.clipboard.writeText(reasoning || '暂无评分详情');
      setCopySuccess('reasoning');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 🆕 复制全部结果
  const handleCopyAll = async () => {
    const content = `模型回复：
${modelResponse || '暂无回复'}

评分详情：
${reasoning || '暂无评分详情'}`;

    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess('all');
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  const getScoreColor = (score?: number) => {
    if (score === undefined) return 'text-gray-600';
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* 🎨 紧凑的单行布局 */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          {/* 操作按钮组 */}
          <div className="flex items-center space-x-3">
            {/* 测试用例按钮 */}
            {(testCaseInput || testCaseReference) && (
              <button
                onClick={() => setShowTestCase(true)}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 border border-gray-300 hover:border-blue-300"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                查看测试用例
              </button>
            )}

            {/* 详细结果按钮 */}
            {(modelResponse || reasoning) && (
              <button
                onClick={() => setShowDetails(true)}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-all duration-200 border border-blue-200 hover:border-blue-300"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                查看详细结果
              </button>
            )}
          </div>

          {/* 🆕 一键复制按钮 */}
          {(modelResponse || reasoning) && (
            <button
              onClick={handleCopyAll}
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  复制全部
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 🆕 测试用例模态框 */}
      {showTestCase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
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
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(80vh-120px)]">
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

      {/* 🆕 详细结果模态框 - 更大尺寸 */}
      {showDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
            {/* 模态框头部 */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">详细结果</h3>
              <div className="flex items-center space-x-3">
                {/* 🆕 模态框内的复制全部按钮 */}
                <button
                  onClick={handleCopyAll}
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
                      复制全部
                    </>
                  )}
                </button>

                <button
                  onClick={() => setShowDetails(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* 🆕 简化的模态框内容 - 只显示模型回复和评分详情 */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* 模型回复 */}
              {modelResponse && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-gray-800 flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                      模型回复
                    </h4>
                    {/* 🆕 复制模型回复按钮 */}
                    <button
                      onClick={handleCopyResponse}
                      className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded transition-all duration-200 border ${
                        copySuccess === 'response'
                          ? 'bg-green-50 text-green-700 border-green-300'
                          : 'text-gray-600 hover:text-green-600 hover:bg-green-50 border-gray-300 hover:border-green-300'
                      }`}
                    >
                      {copySuccess === 'response' ? (
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
                          复制
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="text-gray-700 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {modelResponse}
                    </div>
                  </div>
                </div>
              )}

              {/* 评分详情 */}
              {reasoning && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-gray-800 flex items-center">
                      <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                      评分详情
                    </h4>
                    {/* 🆕 复制评分详情按钮 */}
                    <button
                      onClick={handleCopyReasoning}
                      className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded transition-all duration-200 border ${
                        copySuccess === 'reasoning'
                          ? 'bg-green-50 text-green-700 border-green-300'
                          : 'text-gray-600 hover:text-green-600 hover:bg-green-50 border-gray-300 hover:border-green-300'
                      }`}
                    >
                      {copySuccess === 'reasoning' ? (
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
                          复制
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="text-gray-700 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {reasoning}
                    </div>
                  </div>
                </div>
              )}

              {/* 如果没有内容，显示提示 */}
              {!modelResponse && !reasoning && (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-lg font-medium">暂无详细结果</div>
                  <div className="text-sm mt-2">模型回复和评分详情尚未生成</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
