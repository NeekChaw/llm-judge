'use client';

import { Layout } from '@/components/layout/layout';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { ChevronLeft, Plus, Trash2, Settings, Layers, Target, Users, FileText, Filter, Check, Shield, Search, X } from 'lucide-react';
import { apiClient, CreateTaskRequest } from '@/lib/api-client';
import { getAllSystemPromptTemplates } from '@/lib/system-prompt-compatibility';
import SystemPromptFlowExplanation from '@/components/SystemPromptFlowExplanation';
import { templateService } from '@/lib/template-service';
import type { Template, TemplateType } from '@/lib/template-types';
import PreFlightCheck from '@/components/PreFlightCheck';
import { enhancedPost } from '@/lib/enhanced-fetch';
import { ModelList } from '@/components/ui/model-display';
import { extractLogicalName, getDisplayName } from '@/lib/model-utils';

interface Model {
  id: string;
  name: string;
  provider: string;
  tags: string[];
  // 新增：被测评时的默认配置
  default_max_tokens?: number;
  default_temperature?: number;
  default_thinking_budget?: number;
  // 模型分组支持（用于failover）
  model_group_id?: string;
  logical_name?: string;
  priority?: number;
}

// 使用Template类型从template-types.ts

interface TestCaseSet {
  id: string;
  name: string;
  description?: string;
  test_cases_count: number;
  category?: string;
  tags?: string[];
  // 🆕 CODE配置标识
  has_code_config?: boolean;
}

export default function NewTaskPage() {
  const [step, setStep] = useState(1);
  const [taskName, setTaskName] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [systemPromptMode, setSystemPromptMode] = useState<'default' | 'template' | 'custom'>('default');
  const [systemPromptTemplate, setSystemPromptTemplate] = useState('');
  const [customSystemPrompt, setCustomSystemPrompt] = useState('');
  // 🆕 模型配置选择
  const [useModelDefaults, setUseModelDefaults] = useState<boolean>(true); // 是否使用模型默认配置
  const [maxTokens, setMaxTokens] = useState<number>(4000); // 自定义最大token配置
  const [temperature, setTemperature] = useState<number>(0.7); // 自定义温度配置
  // 🆕 多次运行配置
  const [runCount, setRunCount] = useState<number>(1); // 运行次数
  const [humanEvaluationMode, setHumanEvaluationMode] = useState<'independent' | 'shared'>('independent'); // 人工评分模式
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [modelTagFilter, setModelTagFilter] = useState<string>('');
  const [modelSearchQuery, setModelSearchQuery] = useState<string>('');
  // 分页状态
  const [modelPagination, setModelPagination] = useState({
    page: 1,
    pageSize: 12, // 每页12个模型组
    total: 0
  });
  const [templatePagination, setTemplatePagination] = useState({
    page: 1,
    pageSize: 8, // 每页8个模板（双列布局每行2个，共4行）
    total: 0
  });
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedTestCases, setSelectedTestCases] = useState<string[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateDetail, setSelectedTemplateDetail] = useState<Template | null>(null);
  const [testCaseSets, setTestCaseSets] = useState<TestCaseSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [systemConfig, setSystemConfig] = useState<{task_default_concurrent_limit: number} | null>(null);
  
  // 🆕 预检查相关状态
  const [preFlightResult, setPreFlightResult] = useState<any>(null);
  const [isPreFlightChecking, setIsPreFlightChecking] = useState(false);
  const [preFlightError, setPreFlightError] = useState<string | null>(null);
  
  // 🆕 运行时配置
  const [runtimeConfig, setRuntimeConfig] = useState({
    health_check_timeout: 30000,  // 健康检查超时时间
    retry_max_attempts: 5,         // 最大重试次数
    retry_timeout: 600000,         // 单次调用超时 (600秒)
    concurrent_limit: 15,          // 推荐并发限制
    enable_circuit_breaker: true   // 启用电路熔断
  });

  // 加载数据
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // 并行加载所有数据
        const [modelsResponse, testCaseSetsResponse, systemConfigResponse] = await Promise.all([
          apiClient.getModels(),
          apiClient.getTestCaseSets(),
          fetch('/api/system/config').then(r => r.json()).catch(() => ({ config: { task_default_concurrent_limit: 15 } }))
        ]);

        if (modelsResponse.error) {
          console.error('加载模型失败:', modelsResponse.error);
        } else if (modelsResponse.data) {
          // 兼容性处理：如果模型没有status字段，则认为是active状态
          // 🔧 修复：加载所有活跃模型，让ModelList组件处理多提供商分组
          const activeModels = modelsResponse.data.models.filter(model =>
            !model.status || model.status === 'active'
          );
          setModels(activeModels);
        }

        // 使用新的模板服务加载模板
        try {
          const allTemplates = await templateService.getTemplates();
          const activeTemplates = allTemplates.filter(template => 
            template.status === 'active'
          );
          setTemplates(activeTemplates);
        } catch (error) {
          console.error('加载模板失败:', error);
        }

        if (testCaseSetsResponse.error) {
          console.error('加载测试用例失败:', testCaseSetsResponse.error);
        } else if (testCaseSetsResponse.data) {
          // API客户端已经处理了数据转换，直接使用
          const testCaseSets = testCaseSetsResponse.data.test_case_sets || [];
          setTestCaseSets(testCaseSets);
        }

        // 设置系统配置
        if (systemConfigResponse && systemConfigResponse.config) {
          setSystemConfig(systemConfigResponse.config);
          // 🔧 动态更新运行时配置的超时值，消除硬编码
          if (systemConfigResponse.config.api_request_timeout) {
            setRuntimeConfig(prev => ({
              ...prev,
              retry_timeout: systemConfigResponse.config.api_request_timeout
            }));
          }
        } else {
          // 如果无法加载系统配置，使用默认值
          setSystemConfig({ task_default_concurrent_limit: 15 });
        }
      } catch (error) {
        console.error('加载数据失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleModelToggle = (modelId: string) => {
    setSelectedModels(prev => {
      // 注意：由于ModelList组件已经处理了分组逻辑，
      // 这里的modelId实际上是分组中的某个模型ID
      // 我们需要确保选择的是整个逻辑模型组

      const targetModel = models.find(m => m.id === modelId);
      if (!targetModel) return prev;

      // 获取与该模型相同logical_name的所有模型，使用和ModelList相同的逻辑
      const logicalName = targetModel.logical_name || extractLogicalName(targetModel.name);
      const sameGroupModels = models.filter(m =>
        (m.logical_name || extractLogicalName(m.name)) === logicalName
      );
      const sameGroupModelIds = sameGroupModels.map(m => m.id);

      // 检查是否所有同组模型都已选中
      const allSelected = sameGroupModelIds.every(id => prev.includes(id));

      if (allSelected) {
        // 如果全选了，则取消选择整个组
        return prev.filter(id => !sameGroupModelIds.includes(id));
      } else {
        // 否则选择整个组
        const newSelection = [...prev];
        sameGroupModelIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      }
    });
  };

  const handleTestCaseToggle = (testCaseId: string) => {
    setSelectedTestCases(prev => 
      prev.includes(testCaseId) 
        ? prev.filter(id => id !== testCaseId)
        : [...prev, testCaseId]
    );
  };

  // 处理模板选择
  const handleTemplateSelect = async (templateId: string) => {
    setSelectedTemplate(templateId);
    
    // 加载模板详情
    try {
      const templateDetail = await templateService.getTemplateDetail(templateId);
      setSelectedTemplateDetail(templateDetail);
      
      // 如果是自定义模板，清空测试用例选择（因为自定义模板已经预定义了测试用例）
      if (templateDetail?.template_type === 'custom') {
        setSelectedTestCases([]);
      }
    } catch (error) {
      console.error('加载模板详情失败:', error);
    }
  };

  // 验证模型默认配置
  const validateModelConfigs = () => {
    if (!useModelDefaults) return true; // 如果不使用默认配置，跳过验证

    const selectedModelObjs = models.filter(m => selectedModels.includes(m.id));

    // 🔧 修复：支持系统默认值，不再强制要求每个模型都有配置
    // 定义系统级默认值
    const SYSTEM_DEFAULTS = {
      max_tokens: 4000,
      temperature: 0.7,
      thinking_budget: 20000 // 推理模型默认思考预算
    };

    // 检查是否有模型能够正常工作（有配置或能使用系统默认值）
    const problematicModels = selectedModelObjs.filter(m => {
      // 只有当模型配置显式设置为无效值时才认为有问题
      // null 或 undefined 会使用系统默认值，这是正常的
      const hasInvalidMaxTokens = m.default_max_tokens !== null &&
                                  m.default_max_tokens !== undefined &&
                                  (m.default_max_tokens <= 0 || m.default_max_tokens > 100000);

      const hasInvalidTemperature = m.default_temperature !== null &&
                                    m.default_temperature !== undefined &&
                                    (m.default_temperature < 0 || m.default_temperature > 2);

      return hasInvalidMaxTokens || hasInvalidTemperature;
    });

    if (problematicModels.length > 0) {
      const modelNames = problematicModels.map(m => m.name).join('、');
      alert(`以下模型的默认配置值无效，请先到模型管理页面修正：${modelNames}`);
      return false;
    }

    // 🆕 提供用户友好的信息提示
    const modelsWithoutConfig = selectedModelObjs.filter(m =>
      m.default_max_tokens == null || m.default_temperature == null
    );

    if (modelsWithoutConfig.length > 0) {
      const modelNames = modelsWithoutConfig.map(m => m.name).join('、');
      console.log(`ℹ️ 以下模型将使用系统默认配置 (max_tokens: ${SYSTEM_DEFAULTS.max_tokens}, temperature: ${SYSTEM_DEFAULTS.temperature})：${modelNames}`);
    }

    return true;
  };

  // 🆕 执行预检查
  const performPreFlightCheck = async () => {
    if (selectedModels.length === 0) {
      setPreFlightError('请先选择要检查的模型');
      return;
    }

    setIsPreFlightChecking(true);
    setPreFlightError(null);
    setPreFlightResult(null);

    try {
      const response = await enhancedPost('/api/tasks/pre-flight-check', {
        model_ids: selectedModels,
        timeout_ms: runtimeConfig.health_check_timeout,
        include_detailed_results: true
      }, {
        retry_config: {
          max_attempts: 3,
          timeout_ms: 60000, // 预检查本身60秒超时
          enable_circuit_breaker: true
        },
        context: {
          operation_type: 'pre_flight_check',
          service_name: 'api-server'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '预检查失败');
      }

      setPreFlightResult(data);
    } catch (err: any) {
      const errorMessage = err.message || '预检查执行失败';
      setPreFlightError(errorMessage);
      console.error('预检查失败:', err);
    } finally {
      setIsPreFlightChecking(false);
    }
  };

  // 🆕 处理预检查完成
  const handlePreFlightComplete = (result: any) => {
    setPreFlightResult(result);
    
    // 如果有模型失败，过滤掉失败的模型
    if (result && !result.success && result.unhealthy_models.length > 0) {
      const healthyModels = selectedModels.filter(modelId => 
        result.healthy_models.includes(modelId)
      );
      
      if (healthyModels.length > 0) {
        setSelectedModels(healthyModels);
        console.log(`已自动排除 ${result.unhealthy_models.length} 个连接异常的模型`);
      }
    }
  };

  const handleSubmit = async () => {
    // 验证基本信息
    if (!taskName || selectedModels.length === 0 || !selectedTemplate) {
      alert('请填写完整的任务信息');
      return;
    }
    
    // 对于统一模板，需要验证测试用例选择
    // 对于自定义模板，测试用例已在模板中预定义
    if (selectedTemplateDetail?.template_type === 'unified' && selectedTestCases.length === 0) {
      alert('请选择测试用例');
      return;
    }

    // 验证模型配置
    if (!validateModelConfigs()) {
      return;
    }

    setLoading(true);
    try {
      // 确定最终的系统提示词
      let finalSystemPrompt = '';
      if (systemPromptMode === 'template' && systemPromptTemplate) {
        const templates = getAllSystemPromptTemplates();
        const template = templates.find(t => t.key === systemPromptTemplate);
        finalSystemPrompt = template?.content || '';
      } else if (systemPromptMode === 'custom') {
        finalSystemPrompt = customSystemPrompt;
      }

      // 构建任务创建请求
      const taskData: CreateTaskRequest = {
        name: taskName,
        description: taskDescription || undefined,
        system_prompt: finalSystemPrompt || undefined,
        model_ids: selectedModels,
        template_id: selectedTemplate,
        test_case_ids: selectedTestCases,
        config: {
          concurrent_limit: systemConfig?.task_default_concurrent_limit || 15,
          timeout: 300,
          retry_count: 3,
          // 🆕 支持模型默认配置选择
          use_model_defaults: useModelDefaults,
          // 如果不使用模型默认配置，则使用用户自定义配置
          ...(!useModelDefaults && {
            max_tokens: maxTokens,
            temperature: temperature
          }),
          // 🆕 多次运行配置
          run_count: runCount,
          human_evaluation_mode: humanEvaluationMode,
        }
      };

      const response = await apiClient.createTask(taskData);
      
      if (response.error) {
        alert(`创建任务失败: ${response.error}`);
        return;
      }

      if (response.data) {
        alert(`任务创建成功！任务ID: ${response.data.task.id}`);
        // 跳转到任务详情页面
        window.location.href = `/workbench/tasks/${response.data.task.id}`;
      }
    } catch (error) {
      console.error('创建任务失败:', error);
      alert('创建任务失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return taskName.trim() !== '';
      case 2:
        return selectedModels.length > 0;
      case 3:
        return selectedTemplate !== '';
      case 4:
        // 对于自定义模板，跳过测试用例选择验证
        if (selectedTemplateDetail?.template_type === 'custom') {
          return true;
        }
        return selectedTestCases.length > 0;
      case 5:
        return false; // 第五步通过预检查后才能进入下一步
      default:
        return false;
    }
  };
  
  // 新增：判断是否可以创建任务
  const canCreateTask = () => {
    return preFlightResult && preFlightResult.success && preFlightResult.healthy_models.length > 0;
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900">基本信息</h2>
              <p className="mt-1 text-sm text-gray-600">
                设置评测任务的基本信息
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  任务名称 *
                </label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入任务名称"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  任务描述
                </label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  rows={4}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="请输入任务描述（可选）"
                />
              </div>

              {/* 模型配置选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  模型配置 *
                </label>
                <div className="space-y-3">
                  {/* 使用模型默认配置选项 */}
                  <label className="flex items-start">
                    <input
                      type="checkbox"
                      checked={useModelDefaults}
                      onChange={(e) => setUseModelDefaults(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                    />
                    <div className="ml-3">
                      <span className="text-sm font-medium text-gray-900">
                        使用模型默认配置
                      </span>
                      <p className="text-xs text-gray-500">
                        使用模型在模型管理中预设的默认Token数、温度值和思维链配置
                      </p>
                    </div>
                  </label>
                  
                  {/* 自定义配置 */}
                  {!useModelDefaults && (
                    <div className="ml-7 space-y-4 pl-4 border-l-2 border-gray-200">
                      <h4 className="text-sm font-medium text-gray-900">自定义配置</h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 最大Token数配置 */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            最大Token数 *
                          </label>
                          <input
                            type="number"
                            min="1000"
                            max="32000"
                            step="1000"
                            value={maxTokens}
                            onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4000)}
                            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="4000"
                            required
                          />
                        </div>
                        
                        {/* 温度值配置 */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            温度值 *
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="1"
                            step="0.1"
                            value={temperature}
                            onChange={(e) => setTemperature(parseFloat(e.target.value) || 0.7)}
                            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="0.7"
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            控制输出的随机性，0-1之间，越高越随机
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* 默认配置说明 */}
                  {useModelDefaults && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 ml-7">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <h4 className="text-sm font-medium text-blue-900">使用模型默认配置</h4>
                          <p className="text-xs text-blue-800 mt-1">
                            系统将使用选中模型在模型管理中预设的默认参数。如果模型未配置默认参数，将自动使用系统默认值 (max_tokens: 4000, temperature: 0.7)。
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 🆕 多次运行配置 */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  运行次数配置
                </label>
                <div className="mt-1 space-y-3">
                  {/* 运行次数选择 */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      运行次数 *
                    </label>
                    <select
                      value={runCount}
                      onChange={(e) => setRunCount(parseInt(e.target.value))}
                      className="block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value={1}>1次运行（标准模式）</option>
                      <option value={2}>2次运行</option>
                      <option value={3}>3次运行</option>
                      <option value={5}>5次运行</option>
                      <option value={10}>10次运行</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      多次运行可以获得更稳定的评测结果，计算平均分、最高分、最低分等统计信息
                    </p>
                  </div>

                  {/* 人工评分模式（仅在多次运行时显示） */}
                  {runCount > 1 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        人工评分模式
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-start">
                          <input
                            type="radio"
                            name="humanEvaluationMode"
                            value="independent"
                            checked={humanEvaluationMode === 'independent'}
                            onChange={(e) => setHumanEvaluationMode(e.target.value as 'independent')}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 mt-0.5"
                          />
                          <div className="ml-3">
                            <span className="text-sm font-medium text-gray-900">
                              独立评分
                            </span>
                            <p className="text-xs text-gray-500 mt-1">
                              每次运行都需要独立的人工评分，可以测量评分一致性
                            </p>
                          </div>
                        </label>
                        <label className="flex items-start">
                          <input
                            type="radio"
                            name="humanEvaluationMode"
                            value="shared"
                            checked={humanEvaluationMode === 'shared'}
                            onChange={(e) => setHumanEvaluationMode(e.target.value as 'shared')}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 mt-0.5"
                          />
                          <div className="ml-3">
                            <span className="text-sm font-medium text-gray-900">
                              共享评分
                            </span>
                            <p className="text-xs text-gray-500 mt-1">
                              人工评分只进行一次，结果应用到所有运行轮次
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* 多次运行说明 */}
                  {runCount > 1 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <h4 className="text-sm font-medium text-blue-900">多次运行模式</h4>
                          <p className="text-xs text-blue-800 mt-1">
                            将执行 {runCount} 次相同的评测，每次都是独立的模型调用。这有助于：
                          </p>
                          <ul className="text-xs text-blue-800 mt-1 ml-4 list-disc">
                            <li>减少随机性对结果的影响</li>
                            <li>获得更可靠的统计数据</li>
                            <li>发现模型输出的稳定性</li>
                          </ul>
                          <p className="text-xs text-blue-800 mt-1">
                            <strong>注意：</strong>多次运行会增加API调用次数和费用。
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 系统提示词配置 */}
              <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-blue-900 mb-2">
                      模型回答角色设定（可选）
                    </h3>
                    <div className="text-xs text-blue-800 space-y-1 mb-4">
                      <p><strong>作用阶段：</strong>模型回答测评题目时</p>
                      <p><strong>作用范围：</strong>本任务中的所有模型和测试用例</p>
                      <p><strong>不影响：</strong>评分过程（评分由评分器控制）</p>
                      <p><strong>目的：</strong>确保所有模型在相同角色设定下回答，保证测试公平性</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {/* 角色选择选项 */}
                  <div className="space-y-3">
                    <label className="flex items-start">
                      <input
                        type="radio"
                        name="systemPromptMode"
                        value="default"
                        checked={systemPromptMode === 'default'}
                        onChange={(e) => setSystemPromptMode(e.target.value as 'default')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 mt-0.5"
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">
                          使用模型默认行为（推荐）
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          模型按照其原生设定回答题目，适合通用评测
                        </p>
                      </div>
                    </label>
                    
                    <label className="flex items-start">
                      <input
                        type="radio"
                        name="systemPromptMode"
                        value="template"
                        checked={systemPromptMode === 'template'}
                        onChange={(e) => setSystemPromptMode(e.target.value as 'template')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 mt-0.5"
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">
                          选择角色模板
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          让模型以特定专家身份回答，如"Python专家"、"算法专家"
                        </p>
                      </div>
                    </label>
                    
                    <label className="flex items-start">
                      <input
                        type="radio"
                        name="systemPromptMode"
                        value="custom"
                        checked={systemPromptMode === 'custom'}
                        onChange={(e) => setSystemPromptMode(e.target.value as 'custom')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 mt-0.5"
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">
                          自定义角色
                        </span>
                        <p className="text-xs text-gray-500 mt-1">
                          自定义系统提示词，精确控制模型的回答风格和角色
                        </p>
                      </div>
                    </label>
                  </div>
                  
                  {/* 模板选择器 */}
                  {systemPromptMode === 'template' && (
                    <div>
                      <select
                        value={systemPromptTemplate}
                        onChange={(e) => setSystemPromptTemplate(e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">请选择角色模板</option>
                        {getAllSystemPromptTemplates().map((template) => (
                          <option key={template.key} value={template.key}>
                            {template.name} - {template.description}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  {/* 自定义输入 */}
                  {systemPromptMode === 'custom' && (
                    <div>
                      <textarea
                        value={customSystemPrompt}
                        onChange={(e) => setCustomSystemPrompt(e.target.value)}
                        rows={3}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="请输入自定义系统提示词，例如：你是一个Python编程专家..."
                      />
                    </div>
                  )}
                </div>
                
                {/* 流程说明 */}
                <SystemPromptFlowExplanation />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900">选择模型</h2>
              <p className="mt-1 text-sm text-gray-600">
                选择要参与评测的AI模型（可多选）
              </p>
            </div>

            {/* 搜索和筛选器 */}
            <div className="flex flex-col sm:flex-row gap-4">
              {/* 搜索框 */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={modelSearchQuery}
                  onChange={(e) => setModelSearchQuery(e.target.value)}
                  placeholder="搜索模型名称..."
                  className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {modelSearchQuery && (
                  <button
                    onClick={() => setModelSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    title="清除搜索"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* 标签筛选器 */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">标签：</label>
                <select
                  value={modelTagFilter}
                  onChange={(e) => setModelTagFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">全部</option>
                  <option value="非推理">非推理</option>
                  <option value="推理">推理</option>
                  <option value="多模态">多模态</option>
                </select>
              </div>
            </div>


            <ModelList
              models={models}
              selectedModels={selectedModels}
              onModelToggle={handleModelToggle}
              tagFilter={modelTagFilter}
              searchQuery={modelSearchQuery}
              showVendor={true}
              showConfig={true}
              useModelDefaults={useModelDefaults}
              pagination={{
                page: modelPagination.page,
                pageSize: modelPagination.pageSize,
                total: models.length
              }}
              onPageChange={(page) => setModelPagination(prev => ({ ...prev, page }))}
            />
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900">选择评测模板</h2>
              <p className="mt-1 text-sm text-gray-600">
                选择一个评测模板来定义评测维度和评分器
              </p>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(() => {
                  // 应用分页
                  const startIndex = (templatePagination.page - 1) * templatePagination.pageSize;
                  const endIndex = startIndex + templatePagination.pageSize;
                  const paginatedTemplates = templates.slice(startIndex, endIndex);

                  return paginatedTemplates.map((template) => {
                const isSelected = selectedTemplate === template.id;
                const typeIcon = template.template_type === 'unified' 
                  ? <Layers className="w-4 h-4" />
                  : <Target className="w-4 h-4" />;
                const typeText = template.template_type === 'unified' ? '统一模板' : '自定义模板';
                const typeColor = template.template_type === 'unified' ? 'blue' : 'purple';
                
                return (
                  <div
                    key={template.id}
                    className={`relative rounded-lg border p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onClick={() => handleTemplateSelect(template.id)}
                  >
                    <div className="flex items-start">
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => handleTemplateSelect(template.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 mt-1"
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-sm font-medium text-gray-900">
                            {template.name}
                          </h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-${typeColor}-100 text-${typeColor}-800`}>
                            {typeIcon}
                            {typeText}
                          </span>
                        </div>
                        
                        {template.description && (
                          <p className="text-sm text-gray-500 mb-2">{template.description}</p>
                        )}
                        
                        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {template.dimensions_count} 个维度
                          </span>
                          <span className="flex items-center gap-1">
                            <Settings className="w-3 h-3" />
                            {template.evaluators_count} 个评分器
                          </span>
                          {template.template_type === 'custom' && (
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {template.total_test_cases || 0} 个预设题目
                            </span>
                          )}
                        </div>
                        
                        {/* 模板类型说明 */}
                        <div className="mt-2 text-xs text-gray-500">
                          {template.template_type === 'unified' 
                            ? '所有测试用例将使用相同的维度-评分器组合进行评测'
                            : '每个维度使用专属的测试用例集和角色设定进行评测'
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                );
                  });
                })()}
              </div>

              {/* 分页控件 */}
              {templates.length > templatePagination.pageSize && (
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setTemplatePagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                    disabled={templatePagination.page === 1}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>

                  <div className="flex items-center gap-2">
                    {Array.from({ length: Math.ceil(templates.length / templatePagination.pageSize) }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => setTemplatePagination(prev => ({ ...prev, page: pageNum }))}
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          pageNum === templatePagination.page
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setTemplatePagination(prev => ({ ...prev, page: Math.min(Math.ceil(templates.length / templatePagination.pageSize), prev.page + 1) }))}
                    disabled={templatePagination.page === Math.ceil(templates.length / templatePagination.pageSize)}
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                </div>
              )}

              {/* 分页信息 */}
              {templates.length > 0 && (
                <div className="flex items-center justify-center text-sm text-gray-600">
                  第 {(templatePagination.page - 1) * templatePagination.pageSize + 1} - {Math.min(templatePagination.page * templatePagination.pageSize, templates.length)} 项，
                  共 {templates.length} 个模板
                </div>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            {selectedTemplateDetail?.template_type === 'custom' ? (
              // 自定义模板：显示预设的测试用例信息
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Target className="w-5 h-5 text-purple-600" />
                  <h2 className="text-lg font-medium text-gray-900">测试用例配置</h2>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="text-purple-600 mt-1">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-purple-900 mb-1">
                        自定义模板已预设测试用例
                      </h3>
                      <p className="text-sm text-purple-800">
                        该模板每个维度都有专属的测试用例集，无需手动选择。
                        系统将根据模板配置自动使用对应的测试用例进行评测。
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* 显示自定义模板的测试用例预览 */}
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-900">模板测试用例预览</h3>
                  {selectedTemplateDetail.custom_mappings?.map((mapping, index) => {
                    const dimension = selectedTemplateDetail.dimensions?.find(d => d.id === mapping.dimension_id);
                    const mappingTestCases = selectedTemplateDetail.test_cases?.filter(tc => 
                      mapping.test_case_ids.includes(tc.id)
                    ) || [];
                    
                    return (
                      <div key={mapping.id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center gap-2 mb-3">
                          <Users className="w-4 h-4 text-blue-600" />
                          <h4 className="font-medium text-gray-900">{dimension?.name || '未知维度'}</h4>
                          <span className="text-sm text-gray-500">({mappingTestCases.length} 个测试用例)</span>
                          {mapping.system_prompt && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">包含角色设定</span>
                          )}
                        </div>
                        
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {mappingTestCases.slice(0, 3).map(testCase => (
                            <div key={testCase.id} className="text-sm text-gray-600 bg-white p-2 rounded">
                              {testCase.input.length > 80 
                                ? `${testCase.input.substring(0, 80)}...` 
                                : testCase.input
                              }
                            </div>
                          ))}
                          {mappingTestCases.length > 3 && (
                            <div className="text-xs text-gray-500 text-center">
                              ...还有 {mappingTestCases.length - 3} 个测试用例
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              // 统一模板：手动选择测试用例
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-medium text-gray-900">选择测试用例</h2>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  选择用于评测的测试用例集（可多选）
                </p>
                
                <TaskTestCaseSelectionWithCategories
                  selectedIds={selectedTestCases}
                  onSelectionChange={(newIds) => setSelectedTestCases(newIds)}
                />
              </div>
            )}
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-medium text-gray-900">模型健康检查</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              检查选定模型的连通性和响应能力，确保任务成功率
            </p>
            
            {/* 运行时配置面板 */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
              <h3 className="text-md font-medium text-gray-900 mb-3">🔧 运行时配置</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    健康检查超时 (秒)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="120"
                    value={runtimeConfig.health_check_timeout / 1000}
                    onChange={(e) => setRuntimeConfig(prev => ({
                      ...prev,
                      health_check_timeout: parseInt(e.target.value) * 1000 || 30000
                    }))}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    最大重试次数
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={runtimeConfig.retry_max_attempts}
                    onChange={(e) => setRuntimeConfig(prev => ({
                      ...prev,
                      retry_max_attempts: parseInt(e.target.value) || 5
                    }))}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    API超时 (秒)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="1800"
                    value={runtimeConfig.retry_timeout / 1000}
                    onChange={(e) => setRuntimeConfig(prev => ({
                      ...prev,
                      retry_timeout: parseInt(e.target.value) * 1000 || 60000
                    }))}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    并发限制
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={runtimeConfig.concurrent_limit}
                    onChange={(e) => setRuntimeConfig(prev => ({
                      ...prev,
                      concurrent_limit: parseInt(e.target.value) || 5
                    }))}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
                <div className="flex items-center">
                  <label className="flex items-center text-xs font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={runtimeConfig.enable_circuit_breaker}
                      onChange={(e) => setRuntimeConfig(prev => ({
                        ...prev,
                        enable_circuit_breaker: e.target.checked
                      }))}
                      className="mr-2"
                    />
                    启用电路熔断
                  </label>
                </div>
              </div>
            </div>
            
            {/* 预检查组件 */}
            <PreFlightCheck
              modelIds={selectedModels}
              onCheckComplete={handlePreFlightComplete}
              disabled={isPreFlightChecking}
              externalChecking={isPreFlightChecking}
              externalResult={preFlightResult}
              externalError={preFlightError}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Layout>
      <div>
        {/* 页面头部 */}
        <div className="mb-8">
          <Link href="/workbench/tasks" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700">
            <ChevronLeft className="mr-1 h-4 w-4" />
            返回任务列表
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">新建评测任务</h1>
        </div>

        {/* 步骤指示器 - 紧凑美观设计 */}
        <div className="mb-8">
          <nav aria-label="Progress">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-center space-x-8">
                {[
                  { num: 1, title: '基本信息', icon: '📝' },
                  { num: 2, title: '选择模型', icon: '🤖' },
                  { num: 3, title: '选择模板', icon: '📋' },
                  { num: 4, title: '测试用例', icon: '🧪' },
                  { num: 5, title: '健康检查', icon: '✅' }
                ].map((stepInfo, index) => (
                  <div key={stepInfo.num} className="flex items-center">
                    {/* 步骤项 */}
                    <div className="flex items-center space-x-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all duration-300 ${
                          step >= stepInfo.num
                            ? 'bg-blue-600 text-white shadow-md scale-110'
                            : step === stepInfo.num - 1
                            ? 'bg-blue-100 border-2 border-blue-400 text-blue-600 shadow-sm'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {step > stepInfo.num ? (
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          stepInfo.num
                        )}
                      </div>

                      <div className="flex flex-col">
                        <div className="flex items-center space-x-1">
                          <span className="text-lg leading-none">{stepInfo.icon}</span>
                          <span className={`text-sm font-medium transition-colors duration-200 ${
                            step >= stepInfo.num ? 'text-blue-600' :
                            step === stepInfo.num ? 'text-gray-900' : 'text-gray-400'
                          }`}>
                            {stepInfo.title}
                          </span>
                        </div>
                        {step === stepInfo.num && (
                          <div className="mt-0.5 h-0.5 bg-blue-600 rounded-full animate-pulse"></div>
                        )}
                      </div>
                    </div>

                    {/* 连接箭头 */}
                    {index < 4 && (
                      <div className="ml-6 mr-2">
                        <svg
                          className={`h-4 w-4 transition-colors duration-200 ${
                            step > stepInfo.num ? 'text-blue-600' : 'text-gray-300'
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </nav>
        </div>

        {/* 表单内容 - 条件式布局 */}
        {step === 2 ? (
          // 步骤2：选择模型 - 使用分栏布局
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
            {/* 主内容区域 */}
            <div className="lg:col-span-3">
              <div className="bg-white shadow rounded-lg p-6">
                {renderStepContent()}
              </div>
            </div>

            {/* 已选模型侧边栏 */}
            <div className="lg:col-span-1">
              {selectedModels.length > 0 && (
                <div className="sticky top-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <h3 className="text-sm font-medium text-blue-900">
                        已选择 {(() => {
                          // 计算逻辑模型组数量
                          const selectedModelObjs = models.filter(m => selectedModels.includes(m.id));
                          const logicalGroups = new Set(selectedModelObjs.map(m =>
                            m.logical_name || extractLogicalName(m.name)
                          ));
                          return logicalGroups.size;
                        })()} 个模型组
                      </h3>
                    </div>

                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {(() => {
                        // 按逻辑名称分组显示已选模型
                        const selectedModelObjs = models.filter(m => selectedModels.includes(m.id));
                        const groupsMap = new Map<string, typeof selectedModelObjs>();

                        selectedModelObjs.forEach(model => {
                          const logicalName = model.logical_name || extractLogicalName(model.name);
                          if (!groupsMap.has(logicalName)) {
                            groupsMap.set(logicalName, []);
                          }
                          groupsMap.get(logicalName)!.push(model);
                        });

                        return Array.from(groupsMap.entries()).map(([logicalName, groupModels]) => (
                          <div key={logicalName} className="flex items-center justify-between bg-white rounded px-2 py-1.5 border border-blue-200 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 truncate">
                                {getDisplayName(groupModels[0])}
                              </div>
                              <div className="text-gray-500">
                                {groupModels.length} 个提供商
                              </div>
                            </div>
                            <button
                              onClick={() => handleModelToggle(groupModels[0].id)}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="移除"
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        ));
                      })()}
                    </div>

                    <button
                      onClick={() => setSelectedModels([])}
                      className="w-full mt-3 flex items-center justify-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zM12 7a1 1 0 012 0v4a1 1 0 11-2 0V7z" clipRule="evenodd" />
                      </svg>
                      清空选择
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          // 其他步骤：使用全宽布局
          <div className="bg-white shadow rounded-lg p-6 mb-8">
            {renderStepContent()}
          </div>
        )}

        {/* 悬浮操作按钮 */}
        <div className="fixed bottom-6 right-6 flex items-center gap-3 z-50">
          {/* 上一步按钮 - 只有在非第一步时显示 */}
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              className="shadow-lg bg-white hover:bg-gray-50 border-gray-300 min-w-[100px]"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              上一步
            </Button>
          )}

          {/* 下一步/创建任务按钮 */}
          {step < 5 ? (
            <Button
              onClick={async () => {
                if (step === 4) {
                  // 第四步完成后立即开始健康检查，然后进入第五步
                  setStep(5);
                  // 立即开始健康检查，不等待页面渲染
                  performPreFlightCheck();
                } else {
                  setStep(step + 1);
                }
              }}
              disabled={!canProceed()}
              className="shadow-lg min-w-[100px]"
            >
              下一步
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canCreateTask() || loading}
              className="shadow-lg min-w-[120px] bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  创建中...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  创建任务
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}

// 任务创建页面的测试用例选择组件（支持按类别选择和分页）
interface TaskTestCaseSelectionWithCategoriesProps {
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
}

function TaskTestCaseSelectionWithCategories({ 
  selectedIds, 
  onSelectionChange 
}: TaskTestCaseSelectionWithCategoriesProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [testCases, setTestCases] = useState<TestCaseSet[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    has_more: false
  });
  
  // 加载测试用例数据（支持分页）
  const loadTestCases = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString()
      });
      
      if (categoryFilter) {
        params.append('category', categoryFilter);
      }

      const response = await fetch(`/api/test-cases?${params}`);
      if (!response.ok) {
        throw new Error('加载测试用例失败');
      }

      const data = await response.json();
      
      // 转换API响应数据为TestCaseSet格式
      const testCaseSets: TestCaseSet[] = data.test_cases.map((tc: any) => ({
        id: tc.id,
        name: tc.input.substring(0, 50) + (tc.input.length > 50 ? '...' : ''),
        description: tc.reference_answer || undefined,
        test_cases_count: 1,
        category: tc.metadata?.category,
        tags: tc.metadata?.tags,
        // 🆕 添加CODE配置标识
        has_code_config: !!tc.code_test_config
      }));
      
      setTestCases(testCaseSets);
      setPagination(data.pagination);
      
      // 如果是第一次加载，同时获取所有可用类别和统计信息
      if (pagination.offset === 0) {
        const statsResponse = await fetch('/api/test-cases/stats');
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          const categoryStatsData = statsData.stats?.by_category || {};
          setAvailableCategories(Object.keys(categoryStatsData));
          setCategoryStats(categoryStatsData);
        }
      }
    } catch (error) {
      console.error('加载测试用例失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 监听分页和过滤条件变化
  useEffect(() => {
    loadTestCases();
  }, [pagination.offset, categoryFilter]);

  // 重置分页（用于过滤条件变化时）
  const resetPagination = () => {
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  // 过滤条件变化时重置分页
  useEffect(() => {
    if (pagination.offset > 0) {
      resetPagination();
    }
  }, [categoryFilter]);
  
  // 获取过滤后的测试用例（仅应用于当前页面显示的内容）
  // 注意：API已经做了服务端过滤，客户端不需要重复过滤
  const filteredTestCases = testCases;

  // 按类别快速选择的辅助函数（需要考虑所有页面的数据）
  const getSelectionStatusForCategory = (category: string) => {
    // 处理"未分类"情况：category为null/undefined的记录
    const categoryTestCases = testCases.filter(tc => {
      if (category === '未分类') {
        return !tc.category; // null, undefined, 或空字符串
      }
      return tc.category === category;
    });
    const selectedCount = categoryTestCases.filter(tc => selectedIds.includes(tc.id)).length;
    
    if (selectedCount === 0) return 'none';
    if (selectedCount === categoryTestCases.length) return 'all';
    return 'partial';
  };
  
  const handleCategoryToggle = async (category: string) => {
    try {
      // 获取该类别的所有测试用例（不分页）
      const response = await fetch(`/api/test-cases?category=${encodeURIComponent(category)}&limit=1000`);
      if (!response.ok) {
        throw new Error('获取类别测试用例失败');
      }
      
      const data = await response.json();
      const categoryTestCases = data.test_cases || [];
      const categoryIds = categoryTestCases.map((tc: any) => tc.id);
      const selectedCount = categoryIds.filter((id: string) => selectedIds.includes(id)).length;
      
      if (selectedCount === categoryTestCases.length) {
        // 全部已选中，取消选择
        onSelectionChange(selectedIds.filter(id => !categoryIds.includes(id)));
      } else {
        // 部分或全部未选中，全部选中
        const newSelectedIds = Array.from(new Set([...selectedIds, ...categoryIds]));
        onSelectionChange(newSelectedIds);
      }
    } catch (error) {
      console.error('切换类别选择失败:', error);
    }
  };
  
  const handleTestCaseToggle = (testCaseId: string) => {
    if (selectedIds.includes(testCaseId)) {
      onSelectionChange(selectedIds.filter(id => id !== testCaseId));
    } else {
      onSelectionChange([...selectedIds, testCaseId]);
    }
  };

  // 分页控制函数
  const handlePreviousPage = () => {
    setPagination(prev => ({
      ...prev,
      offset: Math.max(0, prev.offset - prev.limit)
    }));
  };

  const handleNextPage = () => {
    setPagination(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  };
  
  return (
    <div className="space-y-4">
      {/* 类别管理 */}
      <div className="flex flex-col gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-gray-600" />
            <span className="font-medium text-gray-900">按类别筛选和选择</span>
          </div>
          <div className="text-sm text-gray-600">
            已选择: {selectedIds.length} / {pagination.total} (当前页: {testCases.length})
          </div>
        </div>
        
        {/* 统一的类别操作按钮 */}
        {availableCategories.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium text-gray-700">按类别选择和筛选:</span>
                  <button
                    onClick={() => setCategoryFilter('')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      !categoryFilter 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    显示全部类别
                  </button>
                  {/* 🆕 CODE配置筛选器 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">|专门筛选:</span>
                    <button
                      onClick={() => {
                        // 切换CODE测试用例的选择状态
                        const codeTestCases = testCases.filter(tc => tc.has_code_config);
                        const selectedCodeCases = codeTestCases.filter(tc => selectedIds.includes(tc.id));
                        
                        if (selectedCodeCases.length === codeTestCases.length) {
                          // 全部CODE测试用例已选中，取消选择
                          const codeTestCaseIds = codeTestCases.map(tc => tc.id);
                          onSelectionChange(selectedIds.filter(id => !codeTestCaseIds.includes(id)));
                        } else {
                          // 选中所有CODE测试用例
                          const codeTestCaseIds = codeTestCases.map(tc => tc.id);
                          const newSelectedIds = Array.from(new Set([...selectedIds, ...codeTestCaseIds]));
                          onSelectionChange(newSelectedIds);
                        }
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors bg-green-100 text-green-700 hover:bg-green-200 border border-green-300"
                      title="选择/取消选择所有具有CODE配置的测试用例"
                    >
                      <Settings className="w-3 h-3" />
                      CODE测试用例 ({testCases.filter(tc => tc.has_code_config).length})
                    </button>
                  </div>
                </div>
                
                {/* 操作说明 */}
                <div className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                  💡 左键选择 · 右键筛选
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableCategories.map(category => {
                const status = getSelectionStatusForCategory(category);
                const count = categoryStats[category] || 0;
                const selectedCount = testCases.filter(tc => {
                  const isInCategory = category === '未分类' ? !tc.category : tc.category === category;
                  return isInCategory && selectedIds.includes(tc.id);
                }).length;
                const isFilterActive = categoryFilter === category;
                
                return (
                  <div key={category} className="flex items-center gap-1">
                    {/* 统一的分类操作按钮 - 左键选择，右键筛选 */}
                    <div className="relative group">
                      <button
                        onClick={() => handleCategoryToggle(category)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setCategoryFilter(isFilterActive ? '' : category);
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${
                          isFilterActive
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : status === 'all' 
                            ? 'bg-green-600 text-white border-green-600 shadow-sm' 
                            : status === 'partial'
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300 shadow-sm'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                        }`}
                        title={`点击: 选择/取消选择 ${category} 类别的所有测试用例\n右键: 筛选显示 ${category} 类别`}
                      >
                        {/* 状态指示图标 */}
                        <div className="flex items-center">
                          {isFilterActive ? (
                            <div className="flex items-center gap-1">
                              <Filter className="w-3 h-3" />
                              <div className="w-3 h-3 border border-current rounded-sm bg-current/20" />
                            </div>
                          ) : status === 'all' ? (
                            <Check className="w-4 h-4" />
                          ) : status === 'partial' ? (
                            <div className="w-4 h-4 rounded-sm bg-current opacity-60" style={{ clipPath: 'polygon(0 0, 50% 0, 50% 100%, 0 100%)' }} />
                          ) : (
                            <div className="w-4 h-4 border border-current rounded-sm opacity-60" />
                          )}
                        </div>
                        
                        <span className="font-medium">{category}</span>
                        
                        {/* 计数显示 */}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          isFilterActive || status === 'all'
                            ? 'bg-white/20 text-current'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {selectedCount}/{count}
                        </span>
                        
                        {/* 筛选状态指示器 */}
                        {isFilterActive && (
                          <div className="w-2 h-2 bg-white rounded-full opacity-80" title="当前筛选类别" />
                        )}
                      </button>
                      
                      {/* 操作提示 */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/75 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                        左键: 选择 · 右键: 筛选
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* 当前筛选状态 */}
        {categoryFilter && (
          <div className="text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-md">
            当前显示: {categoryFilter} 类别 (第 {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} 项，共 {pagination.total} 项)
          </div>
        )}
      </div>
      
      {/* 测试用例列表 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filteredTestCases.map((testCaseSet) => (
          <div
            key={testCaseSet.id}
            className={`relative rounded-lg border p-4 cursor-pointer transition-colors ${
              selectedIds.includes(testCaseSet.id)
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onClick={() => handleTestCaseToggle(testCaseSet.id)}
          >
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={selectedIds.includes(testCaseSet.id)}
                onChange={() => handleTestCaseToggle(testCaseSet.id)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-gray-900">
                  {testCaseSet.name}
                </h3>
                {testCaseSet.description && (
                  <p className="mt-1 text-xs text-gray-600 line-clamp-2">
                    {testCaseSet.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                    {testCaseSet.test_cases_count} 个测试用例
                  </span>
                  {/* 🆕 CODE配置指示器 */}
                  {testCaseSet.has_code_config && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium">
                      <Settings className="w-3 h-3 mr-1" />
                      CODE配置
                    </span>
                  )}
                  {testCaseSet.category && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-800">
                      {testCaseSet.category}
                    </span>
                  )}
                  {testCaseSet.tags && testCaseSet.tags.length > 0 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-purple-100 text-purple-800">
                      {testCaseSet.tags.slice(0, 2).join(', ')}
                      {testCaseSet.tags.length > 2 && '...'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {loading && (
        <div className="text-center py-8 text-gray-500">
          <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
          加载中...
        </div>
      )}
      
      {!loading && filteredTestCases.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          {categoryFilter ? `${categoryFilter} 类别下没有测试用例` : '暂无测试用例'}
        </div>
      )}
      
      {/* 分页控件 */}
      {pagination.total > pagination.limit && (
        <div className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg">
          <div className="text-sm text-gray-700">
            显示 {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} 
            / 共 {pagination.total} 个测试用例
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePreviousPage}
              disabled={pagination.offset === 0 || loading}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              上一页
            </button>
            <button
              onClick={handleNextPage}
              disabled={!pagination.has_more || loading}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}