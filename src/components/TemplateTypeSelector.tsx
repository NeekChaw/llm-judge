'use client';

import { Layers, Target, ArrowRight } from 'lucide-react';
import type { TemplateType } from '@/lib/template-types';

interface TemplateTypeSelectorProps {
  selectedType: TemplateType;
  onTypeChange: (type: TemplateType) => void;
  disabled?: boolean;
}

export default function TemplateTypeSelector({
  selectedType,
  onTypeChange,
  disabled = false
}: TemplateTypeSelectorProps) {
  return (
    <div className="space-y-4">
      <h4 className="font-medium text-gray-900">选择模板类型</h4>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 统一模板 */}
        <div
          className={`
            relative border-2 rounded-lg p-4 cursor-pointer transition-all
            ${selectedType === 'unified' 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-200 bg-white hover:border-gray-300'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onClick={() => !disabled && onTypeChange('unified')}
        >
          <div className="flex items-start gap-3">
            <div className={`
              p-2 rounded-lg 
              ${selectedType === 'unified' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}
            `}>
              <Layers className="w-6 h-6" />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h5 className="font-medium text-gray-900">统一模板</h5>
                {selectedType === 'unified' && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
              </div>
              
              <p className="text-sm text-gray-600 mb-3">
                所有测试用例使用相同的维度-评分器组合进行评测
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center text-xs text-gray-500">
                  <ArrowRight className="w-3 h-3 mr-1" />
                  适用于标准化评测场景
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <ArrowRight className="w-3 h-3 mr-1" />
                  配置简单，执行高效
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <ArrowRight className="w-3 h-3 mr-1" />
                  所有题目统一角色设定
                </div>
              </div>
            </div>
          </div>
          
          {/* 示例流程 */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 mb-2">评测流程:</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-gray-100 px-2 py-1 rounded">所有题目</span>
              <ArrowRight className="w-3 h-3" />
              <span className="bg-blue-100 px-2 py-1 rounded">统一维度组合</span>
              <ArrowRight className="w-3 h-3" />
              <span className="bg-green-100 px-2 py-1 rounded">评测结果</span>
            </div>
          </div>
        </div>

        {/* 自定义模板 */}
        <div
          className={`
            relative border-2 rounded-lg p-4 cursor-pointer transition-all
            ${selectedType === 'custom' 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-200 bg-white hover:border-gray-300'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onClick={() => !disabled && onTypeChange('custom')}
        >
          <div className="flex items-start gap-3">
            <div className={`
              p-2 rounded-lg 
              ${selectedType === 'custom' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}
            `}>
              <Target className="w-6 h-6" />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h5 className="font-medium text-gray-900">自定义模板</h5>
                {selectedType === 'custom' && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
              </div>
              
              <p className="text-sm text-gray-600 mb-3">
                每个维度可以设置专属的测试用例集和角色
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center text-xs text-gray-500">
                  <ArrowRight className="w-3 h-3 mr-1" />
                  适用于复杂评测场景
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <ArrowRight className="w-3 h-3 mr-1" />
                  维度-题目精确匹配
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  <ArrowRight className="w-3 h-3 mr-1" />
                  每个维度独立角色
                </div>
              </div>
            </div>
          </div>
          
          {/* 示例流程 */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs text-gray-500 mb-2">评测流程:</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-gray-100 px-2 py-1 rounded">专属题目</span>
              <ArrowRight className="w-3 h-3" />
              <span className="bg-blue-100 px-2 py-1 rounded">专属维度</span>
              <ArrowRight className="w-3 h-3" />
              <span className="bg-green-100 px-2 py-1 rounded">精确评测</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* 选择说明 */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="text-sm">
          <strong>如何选择？</strong>
          <ul className="mt-2 space-y-1 text-gray-600">
            <li>• <strong>统一模板</strong>：当所有测试用例都应该用相同标准评测时选择</li>
            <li>• <strong>自定义模板</strong>：当需要针对不同类型的题目使用不同评测标准时选择</li>
          </ul>
        </div>
      </div>
    </div>
  );
}