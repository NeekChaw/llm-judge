'use client';

import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';

// 🆕 CODE测试用例引用组件 - 在PROMPT评分器中展示可复用的CODE测试用例
export function CodeTestCaseReference() {
  const [codeTestCases, setCodeTestCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // 加载具有CODE配置的测试用例
  const loadCodeTestCases = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/test-cases?limit=100');
      if (!response.ok) {
        throw new Error('加载测试用例失败');
      }
      
      const data = await response.json();
      // 筛选出具有code_test_config的测试用例
      const codeTestCases = (data.test_cases || []).filter((tc: any) => tc.code_test_config);
      setCodeTestCases(codeTestCases);
    } catch (error) {
      console.error('加载 CODE 测试用例失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 组件初始化时加载
  useEffect(() => {
    if (expanded && codeTestCases.length === 0) {
      loadCodeTestCases();
    }
  }, [expanded]);

  return (
    <div className="border-t pt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-green-600" />
          <h4 className="text-lg font-medium text-gray-900">可复用的CODE测试用例</h4>
          {codeTestCases.length > 0 && (
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
              {codeTestCases.length} 个
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`flex items-center gap-2 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            expanded
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {expanded ? '隐藏' : '查看'}
          <span className={`transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}>▼</span>
        </button>
      </div>

      {expanded && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="mb-3">
            <p className="text-sm text-gray-700 mb-2">
              以下是系统中已配置了CODE测试环境的测试用例。
              PROMPT评分器可以在任务创建时选择这些测试用例，
              实现结构化数据和代码执行的混合评估。
            </p>
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <span>💡 提示:</span>
              <span>在评估提示词中可使用 {`{{CODE_TEST_DATA}}, {{EXPECTED_OUTPUT}}`} 等变量引用CODE测试数据</span>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto mb-2"></div>
              加载中...
            </div>
          ) : codeTestCases.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Settings className="w-8 h-8 mx-auto mb-2 text-gray-400" />
              <p>暂无可用的CODE测试用例</p>
              <p className="text-xs mt-1">请先在测试用例管理中创建带有CODE配置的测试用例</p>
            </div>
          ) : (
            <div className="space-y-3">
              {codeTestCases.slice(0, 5).map((testCase) => (
                <div key={testCase.id} className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h5 className="font-medium text-sm text-gray-900">
                          {testCase.input.length > 60 
                            ? testCase.input.substring(0, 60) + '...' 
                            : testCase.input
                          }
                        </h5>
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                          {testCase.execution_environment || 'python'}
                        </span>
                      </div>
                      
                      {testCase.code_test_config?.test_data && (
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">测试数据:</span>
                          <div className="mt-1 bg-gray-50 rounded p-2 font-mono text-xs">
                            {testCase.code_test_config.test_data.slice(0, 2).map((data: any, idx: number) => (
                              <div key={idx} className="mb-1">
                                <span className="text-green-700">输入:</span> {JSON.stringify(data.input)} 
                                <span className="text-blue-700 ml-2">期望:</span> {JSON.stringify(data.expected)}
                              </div>
                            ))}
                            {testCase.code_test_config.test_data.length > 2 && (
                              <div className="text-gray-500">
                                ... 还有 {testCase.code_test_config.test_data.length - 2} 个测试用例
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col items-end gap-1 text-xs text-gray-500">
                      <span>执行超时: {testCase.code_test_config?.execution_config?.timeout_ms || 30000}ms</span>
                      <span>内存限制: {testCase.code_test_config?.execution_config?.memory_limit_mb || 256}MB</span>
                      {testCase.validation_rules && (
                        <span className="text-green-600">
                          验证规则: {testCase.validation_rules.strict_output_match ? '严格' : '灵活'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {codeTestCases.length > 5 && (
                <div className="text-center py-2">
                  <span className="text-sm text-gray-500">
                    还有 {codeTestCases.length - 5} 个 CODE 测试用例，请在任务创建时查看全部
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}