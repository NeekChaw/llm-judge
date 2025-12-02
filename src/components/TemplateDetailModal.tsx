'use client';

import { X, Layers, Target, Users, FileText, Activity, Scale, CheckCircle } from 'lucide-react';
import type { TemplateDetail } from '@/lib/template-types';

interface TemplateDetailModalProps {
  template: TemplateDetail;
  onClose: () => void;
}

export default function TemplateDetailModal({
  template,
  onClose
}: TemplateDetailModalProps) {
  const getTypeIcon = () => {
    return template.template_type === 'unified' 
      ? <Layers className="w-5 h-5" />
      : <Target className="w-5 h-5" />;
  };

  const getTypeText = () => {
    return template.template_type === 'unified' ? '统一模板' : '自定义模板';
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-screen overflow-y-auto">
        {/* 头部 */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="text-blue-600">
              {getTypeIcon()}
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{template.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusStyle(template.status)}`}>
                  {template.status === 'active' ? '活跃' : template.status === 'draft' ? '草稿' : '非活跃'}
                </span>
                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                  {getTypeText()}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 描述 */}
        {template.description && (
          <div className="mb-6">
            <p className="text-gray-600">{template.description}</p>
          </div>
        )}

        {/* 基本信息 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-400" />
            <div>
              <div className="text-sm text-gray-500">维度数</div>
              <div className="font-medium">{template.dimensions_count}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <div>
              <div className="text-sm text-gray-500">评分器数</div>
              <div className="font-medium">{template.evaluators_count}</div>
            </div>
          </div>
          
          {template.template_type === 'custom' && (
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <div>
                <div className="text-sm text-gray-500">题目数</div>
                <div className="font-medium">{template.total_test_cases || 0}</div>
              </div>
            </div>
          )}
          
          <div>
            <div className="text-sm text-gray-500">创建时间</div>
            <div className="font-medium">{new Date(template.created_at).toLocaleDateString()}</div>
          </div>
        </div>

        {/* 配置详情 */}
        <div className="space-y-6">
          {template.template_type === 'unified' ? (
            // 统一模板配置
            <div>
              <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Scale className="w-4 h-4" />
                维度-评分器映射
              </h4>
              
              <div className="space-y-3">
                {template.mappings?.map((mapping, index) => {
                  const dimension = template.dimensions?.find(d => d.id === mapping.dimension_id);
                  const evaluator = template.evaluators?.find(e => e.id === mapping.evaluator_id);
                  
                  return (
                    <div key={mapping.id} className="border rounded-lg p-4 bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm text-gray-500 mb-1">维度</div>
                          <div className="font-medium">{dimension?.name || '未知维度'}</div>
                          {dimension?.description && (
                            <div className="text-xs text-gray-500 mt-1">{dimension.description}</div>
                          )}
                        </div>
                        
                        <div>
                          <div className="text-sm text-gray-500 mb-1">评分器</div>
                          <div className="font-medium">{evaluator?.name || '未知评分器'}</div>
                          {evaluator?.type && (
                            <div className="text-xs text-gray-500 mt-1">{evaluator.type}</div>
                          )}
                        </div>
                        
                        <div>
                          <div className="text-sm text-gray-500 mb-1">权重</div>
                          <div className="font-medium">{(mapping.weight * 100).toFixed(1)}%</div>
                          <div className="text-xs text-gray-500 mt-1">值: {mapping.weight}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* 权重总和 */}
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-800">权重总和:</span>
                  <span className="text-sm font-medium text-green-700">
                    {(template.mappings?.reduce((sum, m) => sum + m.weight, 0) || 0).toFixed(3)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            // 自定义模板配置
            <div>
              <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                <Target className="w-4 h-4" />
                自定义维度配置
              </h4>
              
              <div className="space-y-4">
                {template.custom_mappings?.map((mapping, index) => {
                  const dimension = template.dimensions?.find(d => d.id === mapping.dimension_id);
                  const evaluator = template.evaluators?.find(e => e.id === mapping.evaluator_id);
                  const mappingTestCases = template.test_cases?.filter(tc => 
                    mapping.test_case_ids.includes(tc.id)
                  ) || [];
                  
                  return (
                    <div key={mapping.id} className="border rounded-lg p-6 bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <div className="text-sm text-gray-500 mb-1">维度</div>
                          <div className="font-medium">{dimension?.name || '未知维度'}</div>
                          {dimension?.description && (
                            <div className="text-xs text-gray-500 mt-1">{dimension.description}</div>
                          )}
                        </div>
                        
                        <div>
                          <div className="text-sm text-gray-500 mb-1">评分器</div>
                          <div className="font-medium">{evaluator?.name || '未知评分器'}</div>
                          {evaluator?.type && (
                            <div className="text-xs text-gray-500 mt-1">{evaluator.type}</div>
                          )}
                        </div>
                        
                        <div>
                          <div className="text-sm text-gray-500 mb-1">权重</div>
                          <div className="font-medium">{(mapping.weight * 100).toFixed(1)}%</div>
                          <div className="text-xs text-gray-500 mt-1">值: {mapping.weight}</div>
                        </div>
                      </div>
                      
                      {/* 角色设定 */}
                      {mapping.system_prompt && (
                        <div className="mb-4">
                          <div className="text-sm text-gray-500 mb-2 flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            角色设定
                          </div>
                          <div className="bg-gray-50 p-3 rounded-md text-sm">
                            {mapping.system_prompt}
                          </div>
                        </div>
                      )}
                      
                      {/* 测试用例 */}
                      <div>
                        <div className="text-sm text-gray-500 mb-2 flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          测试用例 ({mappingTestCases.length}个)
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {mappingTestCases.map(testCase => (
                            <div key={testCase.id} className="bg-gray-50 p-2 rounded text-sm">
                              <div className="font-medium mb-1">
                                {testCase.input.substring(0, 100)}
                                {testCase.input.length > 100 && '...'}
                              </div>
                              {testCase.category && (
                                <div className="text-xs text-gray-500">
                                  {testCase.category}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* 权重总和 */}
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-blue-800">权重总和:</span>
                  <span className="text-sm font-medium text-green-700">
                    {(template.custom_mappings?.reduce((sum, m) => sum + m.weight, 0) || 0).toFixed(3)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 关联资源 */}
        <div className="mt-8 pt-6 border-t">
          <h4 className="font-medium text-gray-900 mb-4">关联资源</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 维度列表 */}
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">使用的维度</h5>
              <div className="space-y-2">
                {template.dimensions?.map(dimension => (
                  <div key={dimension.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>{dimension.name}</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* 评分器列表 */}
            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">使用的评分器</h5>
              <div className="space-y-2">
                {template.evaluators?.map(evaluator => (
                  <div key={evaluator.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>{evaluator.name}</span>
                    <span className="text-xs text-gray-500">({evaluator.type})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 关闭按钮 */}
        <div className="flex justify-end mt-8 pt-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}