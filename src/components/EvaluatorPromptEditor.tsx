'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';
import VariableSelector from './VariableSelector';
import { validateTemplateVariables, detectUsedVariables } from '@/lib/evaluator-variables';

interface EvaluatorPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  evaluatorType?: 'PROMPT' | 'REGEX' | 'CODE' | 'HUMAN';
  placeholder?: string;
  className?: string;
  // 新增：混合评估配置状态（仅PROMPT类型需要）
  hybridEvaluationEnabled?: boolean;
  onEnableHybridEvaluation?: () => void;
}

export default function EvaluatorPromptEditor({
  value,
  onChange,
  evaluatorType = 'PROMPT',
  placeholder = '请输入评分器Prompt模板...',
  className = '',
  hybridEvaluationEnabled = false,
  onEnableHybridEvaluation
}: EvaluatorPromptEditorProps) {
  const [showVariableSelector, setShowVariableSelector] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 验证模板变量
  const validation = validateTemplateVariables(value);
  const usedVariables = detectUsedVariables(value);
  
  // 检测是否使用了代码执行变量
  const codeExecutionVariables = [
    'EXECUTION_OUTPUT', 'EXECUTION_SUCCESS', 'EXECUTION_ERROR', 'EXECUTION_TIME',
    'EXTRACTED_CODE', 'CODE_LANGUAGE', 'PERFORMANCE_LEVEL', 'MEMORY_USAGE',
    'EXIT_CODE', 'SUCCESS_MESSAGE', 'FAILURE_MESSAGE', 'ERROR_TYPE',
    'CODE_LENGTH', 'CODE_LINES', 'HAS_FUNCTIONS', 'HAS_COMMENTS',
    'EXTRACTION_METHOD', 'EXTRACTION_CONFIDENCE', 'EXTRACTION_QUALITY',
    'HAS_OUTPUT', 'OUTPUT_JSON', 'IS_VALID_JSON', 'HYBRID_EVALUATION_SUCCESS',
    'code_execution_result' // 传统变量
  ];
  
  const usesCodeVariables = value.includes('{{') && codeExecutionVariables.some(variable => 
    value.includes(`{{${variable}}}`) || value.includes(`{{${variable}.`)
  );
  
  const needsHybridEvaluationPrompt = evaluatorType === 'PROMPT' && 
                                     usesCodeVariables && 
                                     !hybridEvaluationEnabled;

  // 插入变量到光标位置
  const handleVariableSelect = (variable: string) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      const newValue = value.substring(0, start) + variable + value.substring(end);
      onChange(newValue);
      
      // 设置光标位置到插入变量之后
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  };

  // 更新光标位置
  const handleTextareaClick = () => {
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart);
    }
  };

  // 自动调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 编辑器头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileText className="h-5 w-5 text-blue-600" />
          <span className="font-medium text-gray-900">Prompt模板编辑器</span>
          {evaluatorType === 'CODE' && (
            <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
              支持代码执行变量
            </span>
          )}
        </div>
        
        <button
          type="button"
          onClick={() => setShowVariableSelector(!showVariableSelector)}
          className={`flex items-center space-x-1 px-3 py-1 text-sm rounded-lg transition-colors ${
            showVariableSelector
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {showVariableSelector ? (
            <>
              <EyeOff className="h-4 w-4" />
              <span>隐藏变量</span>
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              <span>显示变量</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 文本编辑区域 */}
        <div className={`${showVariableSelector ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-3`}>
          {/* 主编辑器 */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onClick={handleTextareaClick}
              onKeyUp={handleTextareaClick}
              placeholder={placeholder}
              className="w-full min-h-[200px] p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none font-mono text-sm"
              style={{ 
                lineHeight: '1.5',
                tabSize: 2
              }}
            />
            
            {/* 字符计数 */}
            <div className="absolute bottom-2 right-2 text-xs text-gray-500 bg-white px-2 py-1 rounded">
              {value.length} 字符
            </div>
          </div>

          {/* 验证结果 */}
          {value && (
            <div className="space-y-2">
              {/* 验证状态 */}
              <div className={`flex items-start space-x-2 p-3 rounded-lg ${
                validation.valid 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                {validation.valid ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                )}
                
                <div className="flex-1">
                  <div className={`font-medium ${validation.valid ? 'text-green-800' : 'text-red-800'}`}>
                    {validation.valid ? '模板验证通过' : '模板验证失败'}
                  </div>
                  
                  {validation.errors.length > 0 && (
                    <ul className="mt-1 text-sm text-red-700 space-y-1">
                      {validation.errors.map((error, index) => (
                        <li key={index}>• {error}</li>
                      ))}
                    </ul>
                  )}
                  
                  {validation.warnings.length > 0 && (
                    <ul className="mt-1 text-sm text-yellow-700 space-y-1">
                      {validation.warnings.map((warning, index) => (
                        <li key={index}>⚠️ {warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* 使用的变量 */}
              {usedVariables.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="font-medium text-blue-800 mb-2">使用的系统变量:</div>
                  <div className="flex flex-wrap gap-2">
                    {usedVariables.map(variable => (
                      <span
                        key={variable}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-mono rounded"
                      >
                        {`{{${variable}}}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 混合评估提示 */}
              {needsHybridEvaluationPrompt && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium text-orange-800 mb-1">
                        🔧 需要启用混合评估
                      </div>
                      <div className="text-sm text-orange-700 mb-3">
                        您使用了代码执行相关变量（如 EXECUTION_OUTPUT），但尚未启用混合评估功能。
                        启用后系统将自动提取并执行模型响应中的代码，为您提供执行结果。
                      </div>
                      {onEnableHybridEvaluation && (
                        <button
                          type="button"
                          onClick={onEnableHybridEvaluation}
                          className="px-3 py-1 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
                        >
                          启用混合评估
                        </button>
                      )}
                      {!onEnableHybridEvaluation && (
                        <div className="text-xs text-orange-600">
                          请在评分器配置中手动启用"混合评估（代码执行 + AI评分）"选项
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 使用提示 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-gray-600 mr-2 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <div className="font-medium mb-1">使用提示:</div>
                <ul className="space-y-1">
                  <li>• 使用 <code className="bg-gray-200 px-1 rounded">{'{{变量名}}'}</code> 格式插入系统变量</li>
                  <li>• 点击右侧"显示变量"按钮查看完整变量列表</li>
                  <li>• 部分传统变量支持对象属性访问，如 <code className="bg-gray-200 px-1 rounded">{'{{code_execution_result.stdout}}'}</code></li>
                  <li>• 混合评估变量为扁平化结构，如 <code className="bg-gray-200 px-1 rounded">{'{{EXECUTION_OUTPUT}}'}</code></li>
                  <li>• 代码执行输出推荐使用 <code className="bg-gray-200 px-1 rounded">{'{{EXECUTION_OUTPUT}}'}</code> 获取E2B沙箱结果</li>
                  <li>• 变量会在评分器执行时自动替换为实际数据</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 变量选择器 */}
        {showVariableSelector && (
          <div className="lg:col-span-1">
            <VariableSelector
              onVariableSelect={handleVariableSelect}
              evaluatorType={evaluatorType}
              className="sticky top-4"
            />
          </div>
        )}
      </div>
    </div>
  );
}
