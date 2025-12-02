'use client';

/**
 * 厂商管理页面 - Phase 2: 动态厂商选择器
 * 
 * 提供厂商策略配置和性能监控功能
 */

import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, Clock, Zap, TrendingUp, Settings, RefreshCw } from 'lucide-react';
import { getSmartLLMClient } from '@/lib/smart-llm-client';
import { groupModelsByLogicalName } from '@/lib/model-utils';
import { apiClient } from '@/lib/api-client';

interface VendorHealthData {
  vendor_id: string;
  logical_name: string;
  vendor_name: string;
  is_healthy: boolean;
  current_load: number;
  success_rate: number;
  issues: string[];
}

interface VendorStrategy {
  strategy_name: 'priority_first' | 'load_balancing' | 'fail_over' | 'cost_optimal';
  display_name: string;
  description: string;
  icon: React.ReactNode;
}

const VENDOR_STRATEGIES: VendorStrategy[] = [
  {
    strategy_name: 'priority_first',
    display_name: '优先级优先',
    description: '根据设定的厂商优先级选择，优先级高的厂商优先使用',
    icon: <TrendingUp className="w-4 h-4" />
  },
  {
    strategy_name: 'load_balancing',
    display_name: '负载均衡',
    description: '动态选择负载最低的厂商，实现负载均衡',
    icon: <Zap className="w-4 h-4" />
  },
  {
    strategy_name: 'fail_over',
    display_name: '故障转移',
    description: '优先选择成功率最高的厂商，自动故障转移',
    icon: <CheckCircle className="w-4 h-4" />
  },
  {
    strategy_name: 'cost_optimal',
    display_name: '成本感知模式',
    description: '模型选择不受成本影响，但准确记录每次调用的真实提供商成本',
    icon: <Clock className="w-4 h-4" />
  }
];

export default function VendorsPage() {
  const [healthData, setHealthData] = useState<{
    healthy_vendors: number;
    total_vendors: number;
    availability_rate: number;
    vendor_details: VendorHealthData[];
  } | null>(null);
  
  const [selectedStrategy, setSelectedStrategy] = useState<string>('priority_first');
  const [autoFailover, setAutoFailover] = useState<boolean>(true);
  const [circuitBreakerEnabled, setCircuitBreakerEnabled] = useState<boolean>(true);
  const [failureThreshold, setFailureThreshold] = useState<number>(0.7);
  const [maxRetries, setMaxRetries] = useState<number>(2);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // 加载厂商健康数据
  const loadVendorHealth = async () => {
    try {
      const client = getSmartLLMClient();
      const health = await client.getVendorHealth();
      setHealthData(health);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to load vendor health:', error);
    }
  };

  // 初始化数据
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        await loadVendorHealth();
        // 这里可以加载用户的厂商策略配置
        // const config = await apiClient.getVendorConfig();
      } catch (error) {
        console.error('Failed to initialize vendor page:', error);
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, []);

  // 保存配置
  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      // 保存厂商策略配置到后端
      const config = {
        default_strategy: selectedStrategy,
        auto_failover_enabled: autoFailover,
        circuit_breaker_enabled: circuitBreakerEnabled,
        failure_threshold: failureThreshold,
        max_retries: maxRetries,
      };
      
      // await apiClient.saveVendorConfig(config);
      console.log('Saving vendor config:', config);
      
      // 这里应该调用API保存配置
      alert('配置保存成功！');
    } catch (error) {
      console.error('Failed to save vendor config:', error);
      alert('配置保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // 手动刷新健康数据
  const handleRefresh = async () => {
    await loadVendorHealth();
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-600">加载厂商信息中...</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">厂商管理</h1>
            <p className="mt-2 text-gray-600">
              配置厂商选择策略和监控厂商健康状态
            </p>
          </div>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新数据
          </Button>
        </div>

        {/* 健康状态概览 */}
        {healthData && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">健康厂商</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {healthData.healthy_vendors}
                </div>
                <p className="text-xs text-gray-600">
                  / {healthData.total_vendors} 总厂商
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">可用性</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {(healthData.availability_rate * 100).toFixed(1)}%
                </div>
                <p className="text-xs text-gray-600">
                  系统整体可用性
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">最近更新</CardTitle>
                <Clock className="h-4 w-4 text-gray-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-700">
                  {lastRefresh.toLocaleTimeString()}
                </div>
                <p className="text-xs text-gray-600">
                  {lastRefresh.toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="strategy" className="space-y-4">
          <TabsList>
            <TabsTrigger value="strategy">厂商策略</TabsTrigger>
            <TabsTrigger value="health">健康监控</TabsTrigger>
            <TabsTrigger value="models">模型分组</TabsTrigger>
          </TabsList>

          {/* 厂商策略配置 */}
          <TabsContent value="strategy" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  厂商选择策略
                </CardTitle>
                <CardDescription>
                  配置系统如何在多个厂商之间选择最优的服务提供商
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {VENDOR_STRATEGIES.map((strategy) => (
                    <div
                      key={strategy.strategy_name}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedStrategy === strategy.strategy_name
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedStrategy(strategy.strategy_name)}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          checked={selectedStrategy === strategy.strategy_name}
                          onChange={() => setSelectedStrategy(strategy.strategy_name)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {strategy.icon}
                            <h3 className="font-medium">{strategy.display_name}</h3>
                          </div>
                          <p className="text-sm text-gray-600">{strategy.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 高级配置 */}
                <div className="border-t pt-6 space-y-4">
                  <h4 className="font-medium">高级配置</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="auto-failover">自动故障转移</Label>
                        <p className="text-sm text-gray-600">
                          当首选厂商失败时自动切换到备选厂商
                        </p>
                      </div>
                      <Switch
                        id="auto-failover"
                        checked={autoFailover}
                        onCheckedChange={setAutoFailover}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="circuit-breaker">熔断保护</Label>
                        <p className="text-sm text-gray-600">
                          当厂商连续失败时暂时停用该厂商
                        </p>
                      </div>
                      <Switch
                        id="circuit-breaker"
                        checked={circuitBreakerEnabled}
                        onCheckedChange={setCircuitBreakerEnabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="failure-threshold">失败阈值</Label>
                      <Input
                        id="failure-threshold"
                        type="number"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={failureThreshold}
                        onChange={(e) => setFailureThreshold(parseFloat(e.target.value))}
                      />
                      <p className="text-xs text-gray-600">
                        成功率低于此阈值时触发故障转移
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max-retries">最大重试次数</Label>
                      <Input
                        id="max-retries"
                        type="number"
                        min="0"
                        max="10"
                        value={maxRetries}
                        onChange={(e) => setMaxRetries(parseInt(e.target.value))}
                      />
                      <p className="text-xs text-gray-600">
                        单次请求的最大重试次数
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveConfig} disabled={saving}>
                    {saving ? '保存中...' : '保存配置'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 健康监控 */}
          <TabsContent value="health" className="space-y-4">
            {healthData && (
              <div className="space-y-4">
                {healthData.vendor_details.map((vendor) => (
                  <Card key={vendor.vendor_id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{vendor.logical_name}</CardTitle>
                          <CardDescription>{vendor.vendor_name}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {vendor.is_healthy ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              健康
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              异常
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-sm text-gray-600">当前负载</div>
                          <div className="text-lg font-semibold">{vendor.current_load}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">成功率</div>
                          <div className="text-lg font-semibold">
                            {(vendor.success_rate * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">状态</div>
                          <div className={`text-lg font-semibold ${vendor.is_healthy ? 'text-green-600' : 'text-red-600'}`}>
                            {vendor.is_healthy ? '正常' : '异常'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">问题数量</div>
                          <div className="text-lg font-semibold">{vendor.issues.length}</div>
                        </div>
                      </div>

                      {vendor.issues.length > 0 && (
                        <div className="mt-4 p-3 bg-red-50 rounded-lg">
                          <div className="text-sm font-medium text-red-800 mb-2">检测到的问题：</div>
                          <ul className="text-sm text-red-700 list-disc list-inside">
                            {vendor.issues.map((issue, index) => (
                              <li key={index}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* 模型分组 */}
          <TabsContent value="models" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>逻辑模型分组</CardTitle>
                <CardDescription>
                  查看系统中的逻辑模型及其对应的厂商实现
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600">
                  此功能正在开发中，将显示逻辑模型的分组信息和厂商映射关系。
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}