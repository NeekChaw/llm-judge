import { createClient } from '@/lib/supabase';
import { llmClient } from '@/lib/llm-client';

interface HealthCheckResult {
  success: boolean;
  model_id: string;
  model_name: string;
  provider: string;
  response_time: number;
  error?: string;
  test_score?: number;
}

interface PreFlightCheckResult {
  overall_success: boolean;
  healthy_models: string[];
  unhealthy_models: string[];
  detailed_results: HealthCheckResult[];
  recommendations: string[];
}

/**
 * 任务创建前的健康检查系统
 * 解决25%失败率问题的核心组件
 */
export class TaskHealthChecker {
  // 懒加载 Supabase 客户端，避免构建时初始化
  private get supabase() {
    return createClient();
  }

  /**
   * 执行完整的预检查
   */
  async performPreFlightCheck(
    modelIds: string[], 
    timeoutMs: number = 30000
  ): Promise<PreFlightCheckResult> {
    console.log(`🔍 开始预检查 ${modelIds.length} 个模型...`);
    
    const results: HealthCheckResult[] = [];
    const healthyModels: string[] = [];
    const unhealthyModels: string[] = [];
    
    // 并发检查所有模型（限制并发数避免压垮API）
    const concurrencyLimit = 5;
    const batches = this.createBatches(modelIds, concurrencyLimit);
    
    for (const batch of batches) {
      const batchPromises = batch.map(modelId => 
        this.checkSingleModel(modelId, timeoutMs)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.success) {
            healthyModels.push(result.value.model_id);
          } else {
            unhealthyModels.push(result.value.model_id);
          }
        } else {
          const modelId = batch[index];
          results.push({
            success: false,
            model_id: modelId,
            model_name: 'Unknown',
            provider: 'Unknown',
            response_time: 0,
            error: `预检查失败: ${result.reason}`
          });
          unhealthyModels.push(modelId);
        }
      });
    }
    
    const recommendations = this.generateRecommendations(results);
    
    return {
      overall_success: healthyModels.length > 0,
      healthy_models: healthyModels,
      unhealthy_models: unhealthyModels,
      detailed_results: results,
      recommendations
    };
  }
  
  /**
   * 检查单个模型的健康状态
   */
  private async checkSingleModel(
    modelId: string, 
    timeoutMs: number
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let model: any = null;
    
    try {
      // 1. 获取模型配置
      const { data: modelData, error } = await this.supabase
        .from('models')
        .select('*')
        .eq('id', modelId)
        .single();
        
      if (error || !modelData) {
        return {
          success: false,
          model_id: modelId,
          model_name: 'Unknown',
          provider: 'Unknown',
          response_time: 0,
          error: '模型配置不存在'
        };
      }
      
      model = modelData; // 保存模型信息以备后用
      
      // 2. 执行简单测试调用
      const testPrompt = "请回复'健康检查通过'，不要添加任何其他内容。";
      
      const response = await Promise.race([
        llmClient.callLLM({
          model_id: modelId,
          user_prompt: testPrompt,
          max_tokens: 50,
          temperature: 0.1
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
        )
      ]);
      
      const responseTime = Date.now() - startTime;
      
      // 3. 验证响应质量
      const responseText = (response as any)?.content || '';
      const isValidResponse = responseText.length > 0 && responseText.length < 1000; // 放宽长度限制
      
      // 详细的错误信息
      let errorDetail = '';
      if (responseText.length === 0) {
        errorDetail = '模型返回空响应';
      } else if (responseText.length >= 1000) {
        errorDetail = `响应过长(${responseText.length}字符): ${responseText.slice(0, 200)}...`;
      } else {
        errorDetail = `响应内容: "${responseText}"`;
      }
      
      return {
        success: isValidResponse,
        model_id: modelId,
        model_name: model.name,
        provider: model.provider || 'Unknown',
        response_time: responseTime,
        test_score: isValidResponse ? 100 : 0,
        error: isValidResponse ? undefined : `无效响应 - ${errorDetail}`
      };
      
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        model_id: modelId,
        model_name: model?.name || 'Unknown',
        provider: model?.provider || 'Unknown',
        response_time: responseTime,
        error: `健康检查失败: ${error.message}`
      };
    }
  }
  
  /**
   * 生成改进建议
   */
  private generateRecommendations(results: HealthCheckResult[]): string[] {
    const recommendations: string[] = [];
    const failedResults = results.filter(r => !r.success);
    
    if (failedResults.length === 0) {
      recommendations.push('✅ 所有模型健康状态良好，可以正常创建任务');
      return recommendations;
    }
    
    // 分析失败模式
    const timeoutFailures = failedResults.filter(r => 
      r.error?.includes('timeout') || r.response_time > 25000
    );
    const networkFailures = failedResults.filter(r => 
      r.error?.includes('fetch failed') || r.error?.includes('502') || r.error?.includes('500')
    );
    const emptyResponseFailures = failedResults.filter(r => 
      r.error?.includes('无效响应') || r.error?.includes('空响应')
    );
    
    if (timeoutFailures.length > 0) {
      recommendations.push(`⚠️ ${timeoutFailures.length} 个模型响应超时，建议增加超时时间或选择更快的模型`);
    }
    
    if (networkFailures.length > 0) {
      recommendations.push(`🌐 ${networkFailures.length} 个模型网络连接失败，建议检查网络状况或稍后重试`);
    }
    
    if (emptyResponseFailures.length > 0) {
      recommendations.push(`📝 ${emptyResponseFailures.length} 个模型返回无效响应，建议检查模型配置`);
    }
    
    // 提供具体建议
    const healthyCount = results.filter(r => r.success).length;
    if (healthyCount > 0) {
      recommendations.push(`💡 建议仅使用 ${healthyCount} 个健康的模型进行评测，可显著提高成功率`);
    } else {
      recommendations.push(`🚨 所有模型都存在问题，建议稍后重试或检查系统配置`);
    }
    
    return recommendations;
  }
  
  /**
   * 创建并发批次
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}

/**
 * 快速健康检查（用于UI显示）
 */
export async function quickHealthCheck(modelIds: string[]): Promise<{
  healthy: number;
  total: number;
  percentage: number;
}> {
  const checker = new TaskHealthChecker();
  
  try {
    const result = await checker.performPreFlightCheck(modelIds, 10000); // 10秒超时
    
    return {
      healthy: result.healthy_models.length,
      total: modelIds.length,
      percentage: Math.round((result.healthy_models.length / modelIds.length) * 100)
    };
  } catch (error) {
    console.error('快速健康检查失败:', error);
    return {
      healthy: 0,
      total: modelIds.length,
      percentage: 0
    };
  }
}