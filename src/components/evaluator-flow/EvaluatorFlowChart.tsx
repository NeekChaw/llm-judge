'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, 
  Play, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  RefreshCw,
  Code,
  MessageSquare,
  Search,
  User
} from 'lucide-react';

interface EvaluatorNode {
  id: string;
  name: string;
  type: 'CODE' | 'PROMPT' | 'REGEX' | 'HUMAN';
  priority: number;
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
  dependsOn: string[];
}

interface FlowGroup {
  groupId: string;
  testCaseName: string;
  modelName: string;
  nodes: EvaluatorNode[];
  executionOrder: string[];
}

interface EvaluatorFlowChartProps {
  templateId?: string;
  taskId?: string;
  className?: string;
}

export function EvaluatorFlowChart({ templateId, taskId, className = '' }: EvaluatorFlowChartProps) {
  const [flowGroups, setFlowGroups] = useState<FlowGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFlowData = async () => {
    if (!templateId && !taskId) return;

    setLoading(true);
    setError(null);

    try {
      const endpoint = taskId 
        ? `/api/evaluator-flow/task/${taskId}`
        : `/api/evaluator-flow/template/${templateId}`;
      
      const response = await fetch(endpoint);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '获取流程数据失败');
      }

      setFlowGroups(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取流程数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlowData();
  }, [templateId, taskId]);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'CODE': return Code;
      case 'PROMPT': return MessageSquare;
      case 'REGEX': return Search;
      case 'HUMAN': return User;
      default: return Play;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50 border-green-200';
      case 'running': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'failed': return 'text-red-600 bg-red-50 border-red-200';
      case 'ready': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return CheckCircle;
      case 'running': return Play;
      case 'failed': return AlertTriangle;
      case 'ready': return Clock;
      default: return Clock;
    }
  };

  const renderNode = (node: EvaluatorNode, isFirst: boolean, isLast: boolean) => {
    const Icon = getNodeIcon(node.type);
    const StatusIcon = getStatusIcon(node.status);
    const statusColor = getStatusColor(node.status);

    return (
      <div key={node.id} className="flex items-center">
        <div className={`relative border-2 rounded-lg p-3 min-w-[120px] ${statusColor}`}>
          <div className="flex items-center space-x-2 mb-1">
            <Icon className="h-4 w-4" />
            <span className="text-xs font-medium">{node.type}</span>
          </div>
          <div className="text-sm font-medium mb-1">{node.name}</div>
          <div className="flex items-center space-x-1">
            <StatusIcon className="h-3 w-3" />
            <span className="text-xs capitalize">{node.status}</span>
          </div>
          
          {/* 优先级标识 */}
          <div className="absolute -top-2 -right-2">
            <Badge variant="outline" className="text-xs px-1 py-0">
              P{node.priority}
            </Badge>
          </div>
        </div>
        
        {/* 连接箭头 */}
        {!isLast && (
          <div className="flex items-center mx-2">
            <ArrowRight className="h-4 w-4 text-gray-400" />
          </div>
        )}
      </div>
    );
  };

  const renderFlowGroup = (group: FlowGroup) => {
    // 按执行顺序排列节点
    const orderedNodes = group.executionOrder
      .map(nodeId => group.nodes.find(n => n.id === nodeId))
      .filter(Boolean) as EvaluatorNode[];

    return (
      <Card key={group.groupId} className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            {group.testCaseName} × {group.modelName}
          </CardTitle>
          <CardDescription className="text-xs">
            执行组 {group.groupId} - {orderedNodes.length} 个评分器
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center overflow-x-auto pb-2">
            {orderedNodes.map((node, index) => 
              renderNode(node, index === 0, index === orderedNodes.length - 1)
            )}
          </div>
          
          {/* 依赖关系说明 */}
          <div className="mt-3 text-xs text-gray-600">
            <div className="font-medium mb-1">依赖关系:</div>
            {orderedNodes.map(node => {
              if (node.dependsOn.length === 0) {
                return (
                  <div key={node.id} className="ml-2">
                    • {node.name}: 无依赖
                  </div>
                );
              } else {
                const dependencyNames = node.dependsOn
                  .map(depId => orderedNodes.find(n => n.id === depId)?.name)
                  .filter(Boolean);
                return (
                  <div key={node.id} className="ml-2">
                    • {node.name}: 依赖于 {dependencyNames.join(', ')}
                  </div>
                );
              }
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">评分器执行流程</h3>
          <p className="text-sm text-gray-600">
            显示评分器的执行顺序和依赖关系
          </p>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={fetchFlowData}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 加载状态 */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>加载流程数据...</span>
          </CardContent>
        </Card>
      )}

      {/* 错误状态 */}
      {error && (
        <Card>
          <CardContent className="flex items-center justify-center py-8 text-red-600">
            <AlertTriangle className="h-6 w-6 mr-2" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {/* 流程图 */}
      {!loading && !error && flowGroups.length > 0 && (
        <div>
          {flowGroups.map(renderFlowGroup)}
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && flowGroups.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-center py-8 text-gray-500">
            <MessageSquare className="h-6 w-6 mr-2 opacity-50" />
            <span>暂无流程数据</span>
          </CardContent>
        </Card>
      )}

      {/* 图例 */}
      {!loading && !error && flowGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">图例</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="flex items-center space-x-2">
                <Code className="h-4 w-4 text-blue-600" />
                <span>CODE评分器</span>
              </div>
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4 text-green-600" />
                <span>PROMPT评分器</span>
              </div>
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-purple-600" />
                <span>REGEX评分器</span>
              </div>
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-orange-600" />
                <span>HUMAN评分器</span>
              </div>
            </div>
            
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>已完成</span>
              </div>
              <div className="flex items-center space-x-2">
                <Play className="h-4 w-4 text-blue-600" />
                <span>执行中</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <span>等待中</span>
              </div>
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span>失败</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
