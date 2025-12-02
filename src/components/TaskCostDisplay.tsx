'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Calculator, Settings } from 'lucide-react';
import {
  calculateTaskCost,
  aggregateTasksCost,
  formatCost,
  formatTokens,
  extractTokenUsageFromResponse,
  CostCalculationResult,
  USD_TO_CNY_RATE
} from '@/lib/cost-calculator';
import { useUserPreferences } from '@/lib/user-preferences';

interface SubTask {
  id: string;
  model_name: string;
  model_provider?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  model_response?: any;
  reasoning_tokens?: number; // 思维链token
}

interface Model {
  id: string;
  name: string;
  input_cost_per_1k_tokens?: number;
  output_cost_per_1k_tokens?: number;
  cost_currency?: 'USD' | 'CNY'; // 模型自身的成本货币单位
}

interface TaskCostDisplayProps {
  subTasks: SubTask[];
  models: Model[];
  taskId: string;
}

export default function TaskCostDisplay({ subTasks, models, taskId }: TaskCostDisplayProps) {
  const { currency, setCurrency } = useUserPreferences();
  const [showDetails, setShowDetails] = useState(false);
  const [costByModel, setCostByModel] = useState<Record<string, CostCalculationResult>>({});
  const [totalCost, setTotalCost] = useState<CostCalculationResult | null>(null);

  // 创建模型定价映射
  const modelPricingMap = models.reduce((acc, model) => {
    acc[model.name] = {
      input_cost_per_1k_tokens: model.input_cost_per_1k_tokens || 0,
      output_cost_per_1k_tokens: model.output_cost_per_1k_tokens || 0,
      cost_currency: model.cost_currency || 'USD'
    };
    return acc;
  }, {} as Record<string, { input_cost_per_1k_tokens: number; output_cost_per_1k_tokens: number; cost_currency: 'USD' | 'CNY' }>);

  // 计算成本
  useEffect(() => {
    const modelCosts: Record<string, CostCalculationResult> = {};
    const allCosts: CostCalculationResult[] = [];

    // 按模型聚合计算
    const modelGroups = subTasks.reduce((acc, task) => {
      const modelName = task.model_name;
      if (!acc[modelName]) {
        acc[modelName] = [];
      }
      acc[modelName].push(task);
      return acc;
    }, {} as Record<string, SubTask[]>);

    Object.entries(modelGroups).forEach(([modelName, tasks]) => {
      const modelPricing = modelPricingMap[modelName];
      if (!modelPricing) return;

      const taskCosts = tasks.map(task => {
        // 提取token使用信息
        const tokenUsage = {
          prompt_tokens: task.prompt_tokens || 0,
          completion_tokens: task.completion_tokens || 0,
          reasoning_tokens: task.reasoning_tokens || 
            (task.model_response?.usage?.completion_tokens_details?.reasoning_tokens) || 0
        };

        return calculateTaskCost(tokenUsage, modelPricing);
      });

      const modelTotalCost = aggregateTasksCost(taskCosts);
      modelCosts[modelName] = modelTotalCost;
      allCosts.push(modelTotalCost);
    });

    setCostByModel(modelCosts);
    
    if (allCosts.length > 0) {
      setTotalCost(aggregateTasksCost(allCosts));
    }
  }, [subTasks, models]);

  const handleCurrencyToggle = () => {
    setCurrency(currency === 'USD' ? 'CNY' : 'USD');
  };

  if (!totalCost) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <Calculator className="w-5 h-5" />
          <span>暂无成本数据</span>
        </div>
      </div>
    );
  }

  const displayCost = currency === 'USD' ? totalCost.total_cost_usd : totalCost.total_cost_cny;
  const inputCost = currency === 'USD' ? totalCost.input_cost_usd : totalCost.input_cost_cny;
  const outputCost = currency === 'USD' ? totalCost.output_cost_usd : totalCost.output_cost_cny;

  return (
    <div className="bg-white rounded-lg border">
      {/* 头部 */}
      <div className="p-4 border-b bg-gradient-to-r from-green-50 to-blue-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">任务成本统计</h3>
              <p className="text-sm text-gray-600">
                包含输入输出token成本，思维链消耗已计入输出成本
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCurrencyToggle}
              className="flex items-center gap-1 px-3 py-1 text-sm border rounded-md hover:bg-gray-50"
            >
              <Settings className="w-4 h-4" />
              {currency}
            </button>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
            >
              {showDetails ? '隐藏详情' : '显示详情'}
            </button>
          </div>
        </div>
      </div>

      {/* 总成本显示 */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 总成本 */}
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">
              {formatCost(displayCost, currency, 6)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              总成本
              {currency === 'CNY' && (
                <span className="block text-xs text-gray-400">
                  约 {formatCost(totalCost.total_cost_usd, 'USD', 6)}
                </span>
              )}
            </div>
          </div>

          {/* 输入成本 */}
          <div className="text-center">
            <div className="text-xl font-semibold text-blue-600">
              {formatCost(inputCost, currency, 6)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              输入成本
              <div className="text-xs text-gray-400">
                {formatTokens(totalCost.token_breakdown.prompt_tokens)} tokens
              </div>
            </div>
          </div>

          {/* 输出成本 */}
          <div className="text-center">
            <div className="text-xl font-semibold text-green-600">
              {formatCost(outputCost, currency, 6)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              输出成本
              <div className="text-xs text-gray-400">
                {formatTokens(totalCost.token_breakdown.completion_tokens + totalCost.token_breakdown.reasoning_tokens)} tokens
                {totalCost.token_breakdown.reasoning_tokens > 0 && (
                  <span className="text-orange-500 ml-1">
                    (含思维链 {formatTokens(totalCost.token_breakdown.reasoning_tokens)})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Token统计 */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-lg font-semibold text-gray-700">
                {formatTokens(totalCost.token_breakdown.total_tokens)}
              </div>
              <div className="text-xs text-gray-500">总Token</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-blue-600">
                {formatTokens(totalCost.token_breakdown.prompt_tokens)}
              </div>
              <div className="text-xs text-gray-500">输入Token</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-green-600">
                {formatTokens(totalCost.token_breakdown.completion_tokens)}
              </div>
              <div className="text-xs text-gray-500">输出Token</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-orange-600">
                {formatTokens(totalCost.token_breakdown.reasoning_tokens)}
              </div>
              <div className="text-xs text-gray-500">思维链Token</div>
            </div>
          </div>
        </div>

        {/* 汇率提示 */}
        <div className="mt-4 text-center text-xs text-gray-400">
          汇率：1 USD = {USD_TO_CNY_RATE} CNY (固定汇率)
        </div>
      </div>

      {/* 详细成本分解 */}
      {showDetails && (
        <div className="border-t">
          <div className="p-4">
            <h4 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              按模型成本分解
            </h4>
            <div className="space-y-3">
              {Object.entries(costByModel).map(([modelName, cost]) => {
                const modelDisplayCost = currency === 'USD' ? cost.total_cost_usd : cost.total_cost_cny;
                const percentage = totalCost.total_cost_usd > 0 ? 
                  (cost.total_cost_usd / totalCost.total_cost_usd * 100) : 0;

                // 获取模型原始货币信息
                const modelInfo = models.find(m => m.name === modelName);
                const modelCurrency = modelInfo?.cost_currency || 'USD';
                const modelOriginalCost = modelCurrency === 'USD' ? cost.total_cost_usd : cost.total_cost_cny;

                return (
                  <div key={modelName} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {modelName}
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                            原始: {modelCurrency}
                          </span>
                          {/* 成本准确度指示 */}
                          {modelInfo && (modelInfo.provider_input_cost_per_1k_tokens !== undefined || modelInfo.provider_output_cost_per_1k_tokens !== undefined) ? (
                            <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                              精确成本
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                              基础成本
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          输入: {formatTokens(cost.token_breakdown.prompt_tokens)} | 
                          输出: {formatTokens(cost.token_breakdown.completion_tokens)}
                          {cost.token_breakdown.reasoning_tokens > 0 && (
                            <span className="text-orange-500">
                              {' '}| 思维链: {formatTokens(cost.token_breakdown.reasoning_tokens)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">
                          {formatCost(modelDisplayCost, currency, 6)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    
                    {/* 成本明细和提供商成本比较 */}
                    <div className="space-y-3">
                      {/* 当前使用的成本 */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white p-2 rounded">
                          <div className="text-xs text-gray-500">原始成本 ({modelCurrency})</div>
                          <div className="font-medium">
                            {formatCost(modelOriginalCost, modelCurrency, 6)}
                          </div>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <div className="text-xs text-gray-500">
                            {currency === 'USD' ? '转换美元' : '转换人民币'}
                          </div>
                          <div className="font-medium">
                            {formatCost(modelDisplayCost, currency, 6)}
                          </div>
                        </div>
                      </div>

                      {/* 成本准确性信息 */}
                      {modelInfo && (modelInfo.provider_input_cost_per_1k_tokens !== undefined || modelInfo.provider_output_cost_per_1k_tokens !== undefined) ? (
                        <div className="mt-3 p-3 bg-green-50 rounded border border-green-200">
                          <div className="text-xs font-medium text-green-700 mb-2">✅ 使用精确提供商成本</div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <div className="text-gray-600">精确输入成本:</div>
                              <div className="font-medium">
                                {formatCost(modelInfo.provider_input_cost_per_1k_tokens, modelInfo.provider_cost_currency || 'USD', 6)}/1K
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-600">精确输出成本:</div>
                              <div className="font-medium">
                                {formatCost(modelInfo.provider_output_cost_per_1k_tokens, modelInfo.provider_cost_currency || 'USD', 6)}/1K
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-green-600 mt-2">
                            ✓ 此成本记录反映真实的提供商定价，确保统计准确性
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
                          <div className="text-xs font-medium text-yellow-700 mb-2">⚠️ 使用基础成本估算</div>
                          <div className="text-xs text-yellow-600">
                            建议配置精确的提供商成本以提高统计准确性
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 详细成本分解 */}
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-500">输入成本: </span>
                        <span className="font-medium">
                          {formatCost(currency === 'USD' ? cost.input_cost_usd : cost.input_cost_cny, currency, 6)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">输出成本: </span>
                        <span className="font-medium">
                          {formatCost(currency === 'USD' ? cost.output_cost_usd : cost.output_cost_cny, currency, 6)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}