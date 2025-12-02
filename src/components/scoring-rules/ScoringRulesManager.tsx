'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeScoringRules, SCORING_TEMPLATES } from '@/lib/e2b/scoring-rules';
import { Save, RotateCcw, Eye, AlertTriangle, CheckCircle } from 'lucide-react';

interface ScoringRulesManagerProps {
  evaluatorId: string;
  onRulesChange?: (rules: CodeScoringRules) => void;
}

export function ScoringRulesManager({ evaluatorId, onRulesChange }: ScoringRulesManagerProps) {
  const [rules, setRules] = useState<CodeScoringRules | null>(null);
  const [originalRules, setOriginalRules] = useState<CodeScoringRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState<string | null>(null);
  const [evaluatorType, setEvaluatorType] = useState<string | null>(null);

  useEffect(() => {
    loadScoringRules();
  }, [evaluatorId]);

  useEffect(() => {
    if (rules && originalRules) {
      setHasChanges(JSON.stringify(rules) !== JSON.stringify(originalRules));
    }
  }, [rules, originalRules]);

  const loadScoringRules = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 直接加载评分规则，让API处理验证
      const response = await fetch(`/api/scoring-rules?evaluator_id=${evaluatorId}`);
      const data = await response.json();
      
      if (data.success) {
        setRules(data.data.rules);
        setOriginalRules(data.data.rules);
      } else {
        // 根据错误信息提供更好的用户体验
        if (data.error === '获取评分器配置失败') {
          // 检查评分器是否存在
          const evaluatorResponse = await fetch(`/api/evaluators`);
          const evaluatorData = await evaluatorResponse.json();
          
          if (evaluatorData.evaluators) {
            const evaluator = evaluatorData.evaluators.find((e: any) => e.id === evaluatorId);
            if (!evaluator) {
              setError('未找到指定的评分器，请确认评分器ID是否正确。');
            } else {
              setEvaluatorType(evaluator.type);
              if (evaluator.type !== 'CODE') {
                setError(`此评分器类型为 ${evaluator.type}，评分规则配置仅适用于 CODE 类型的评分器。`);
              } else {
                setError('评分器配置存在问题，请联系系统管理员。');
              }
            }
          } else {
            setError('无法验证评分器信息，请稍后重试。');
          }
        } else {
          setError(data.error || '获取评分规则失败，请稍后重试。');
        }
      }
    } catch (error) {
      console.error('加载评分规则失败:', error);
      setError('网络请求失败，请检查网络连接后重试。');
    } finally {
      setLoading(false);
    }
  };

  const saveRules = async () => {
    if (!rules) return;

    try {
      setSaving(true);
      const response = await fetch('/api/scoring-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluatorId,
          rules
        })
      });

      const data = await response.json();
      if (data.success) {
        setOriginalRules(rules);
        setHasChanges(false);
        onRulesChange?.(rules);
      }
    } catch (error) {
      console.error('保存评分规则失败:', error);
    } finally {
      setSaving(false);
    }
  };

  const resetRules = () => {
    if (originalRules) {
      setRules({ ...originalRules });
    }
  };

  const applyTemplate = (templateName: string) => {
    const template = SCORING_TEMPLATES[templateName];
    if (template) {
      setRules({ ...template });
    }
  };

  const previewChanges = async () => {
    if (!rules) return;

    try {
      const response = await fetch('/api/scoring-rules/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluatorId,
          newRules: rules,
          limit: 5
        })
      });

      const data = await response.json();
      if (data.success) {
        setPreviewData(data.data);
      }
    } catch (error) {
      console.error('预览变更失败:', error);
    }
  };

  const updateRuleField = (category: keyof CodeScoringRules, field: string, value: any) => {
    if (!rules) return;

    setRules(prev => {
      if (!prev) return prev;
      
      const updated = { ...prev };
      if (category === 'totalMaxScore' || category === 'normalizationEnabled') {
        (updated as any)[category] = value;
      } else {
        const rule = updated[category] as any;
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          rule[parent] = { ...rule[parent], [child]: value };
        } else {
          rule[field] = value;
        }
      }
      
      return updated;
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">加载中...</div>;
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
          <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-red-800 mb-2">评分规则配置不可用</h3>
          <p className="text-red-600 mb-4">{error}</p>
          {evaluatorType && evaluatorType !== 'CODE' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
              <p className="text-sm text-blue-800">
                <strong>提示：</strong>如需配置评分规则，请创建或选择一个 CODE 类型的评分器。
              </p>
            </div>
          )}
          <button
            onClick={loadScoringRules}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!rules) {
    return <div className="text-center p-8 text-red-500">评分规则未加载</div>;
  }

  return (
    <div className="space-y-6">
      {/* 头部操作区 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">CODE评分器配置</h3>
          <p className="text-sm text-gray-600">
            配置代码执行的多维度评分规则
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-orange-600">
              <AlertTriangle className="w-3 h-3 mr-1" />
              有未保存的更改
            </Badge>
          )}

          <select
            onChange={(e) => applyTemplate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            defaultValue=""
          >
            <option value="" disabled>应用模板</option>
            <option value="strict">严格模式</option>
            <option value="balanced">平衡模式</option>
            <option value="lenient">宽松模式</option>
          </select>

          <Button variant="outline" onClick={previewChanges} disabled={!hasChanges}>
            <Eye className="w-4 h-4 mr-2" />
            预览影响
          </Button>

          <Button variant="outline" onClick={resetRules} disabled={!hasChanges}>
            <RotateCcw className="w-4 h-4 mr-2" />
            重置
          </Button>

          <Button onClick={saveRules} disabled={!hasChanges || saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* 全局设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">全局设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">总分上限</label>
              <input
                type="number"
                value={rules.totalMaxScore}
                onChange={(e) => updateRuleField('totalMaxScore', '', parseInt(e.target.value))}
                min={1}
                max={200}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={rules.normalizationEnabled}
                onChange={(e) => updateRuleField('normalizationEnabled', '', e.target.checked)}
                className="rounded"
              />
              <label className="text-sm font-medium">启用分数归一化</label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 评分规则配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">评分规则概览</CardTitle>
          <CardDescription>
            当前评分规则的权重分配和配置概览
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 语法正确性 */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">语法正确性</h4>
                <Badge variant={rules.syntax.enabled ? 'default' : 'secondary'}>
                  {rules.syntax.enabled ? '启用' : '禁用'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">权重:</span>
                  <span className="ml-2 font-mono">{(rules.syntax.weight * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-gray-600">最大分值:</span>
                  <span className="ml-2 font-mono">{rules.syntax.maxScore}分</span>
                </div>
              </div>
            </div>

            {/* 功能正确性 */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">功能正确性</h4>
                <Badge variant={rules.functional.enabled ? 'default' : 'secondary'}>
                  {rules.functional.enabled ? '启用' : '禁用'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">权重:</span>
                  <span className="ml-2 font-mono">{(rules.functional.weight * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-gray-600">最大分值:</span>
                  <span className="ml-2 font-mono">{rules.functional.maxScore}分</span>
                </div>
              </div>
            </div>

            {/* 执行效率 */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">执行效率</h4>
                <Badge variant={rules.performance.enabled ? 'default' : 'secondary'}>
                  {rules.performance.enabled ? '启用' : '禁用'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">权重:</span>
                  <span className="ml-2 font-mono">{(rules.performance.weight * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-gray-600">最大分值:</span>
                  <span className="ml-2 font-mono">{rules.performance.maxScore}分</span>
                </div>
              </div>
            </div>

            {/* 内存使用 */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">内存使用</h4>
                <Badge variant={rules.memory.enabled ? 'default' : 'secondary'}>
                  {rules.memory.enabled ? '启用' : '禁用'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">权重:</span>
                  <span className="ml-2 font-mono">{(rules.memory.weight * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-gray-600">最大分值:</span>
                  <span className="ml-2 font-mono">{rules.memory.maxScore}分</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>



      {/* 预览结果 */}
      {previewData && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span>
                预览完成：影响 {previewData.summary?.totalAffected || 0} 个结果，
                平均分数变化 {(previewData.summary?.averageScoreDiff || 0) > 0 ? '+' : ''}{(previewData.summary?.averageScoreDiff || 0).toFixed(1)} 分
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
