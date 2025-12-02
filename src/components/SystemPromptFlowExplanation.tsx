'use client';

import React from 'react';
import { ArrowRight, User, Bot, Target } from 'lucide-react';

export default function SystemPromptFlowExplanation() {
  return (
    <div className="bg-gray-50 border rounded-lg p-4 mt-4">
      <h4 className="text-sm font-medium text-gray-900 mb-3">
        📋 评测流程说明
      </h4>
      
      <div className="flex items-center justify-between text-xs">
        {/* 第一步：角色设定 */}
        <div className="flex-1 text-center">
          <div className="mx-auto w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mb-2">
            <User className="w-4 h-4 text-blue-600" />
          </div>
          <div className="font-medium text-gray-900">1. 角色设定</div>
          <div className="text-gray-600 mt-1">系统提示词</div>
          <div className="text-gray-500">影响模型回答</div>
        </div>
        
        <ArrowRight className="w-4 h-4 text-gray-400 mx-2" />
        
        {/* 第二步：模型回答 */}
        <div className="flex-1 text-center">
          <div className="mx-auto w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mb-2">
            <Bot className="w-4 h-4 text-green-600" />
          </div>
          <div className="font-medium text-gray-900">2. 模型回答</div>
          <div className="text-gray-600 mt-1">测评题目</div>
          <div className="text-gray-500">生成答案</div>
        </div>
        
        <ArrowRight className="w-4 h-4 text-gray-400 mx-2" />
        
        {/* 第三步：评分 */}
        <div className="flex-1 text-center">
          <div className="mx-auto w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mb-2">
            <Target className="w-4 h-4 text-purple-600" />
          </div>
          <div className="font-medium text-gray-900">3. 评分</div>
          <div className="text-gray-600 mt-1">评分器</div>
          <div className="text-gray-500">评价答案</div>
        </div>
      </div>
      
      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
        <div className="text-xs text-yellow-800">
          <strong>重要：</strong>系统提示词只影响第1步和第2步，不影响第3步的评分过程。
          评分标准完全由评分器的评分提示词控制。
        </div>
      </div>
    </div>
  );
}