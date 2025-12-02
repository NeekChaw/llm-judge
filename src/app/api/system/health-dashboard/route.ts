import { NextRequest, NextResponse } from 'next/server';
import { enhancedLLMClient } from '@/lib/enhanced-llm-client';
import { createClient } from '@/lib/supabase';

/**
 * GET /api/system/health-dashboard
 * 系统健康状态监控面板API
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    
    // 1. 获取最近24小时的任务统计
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: recentTasks, error: tasksError } = await supabase
      .from('evaluation_tasks')
      .select('id, status, created_at, finished_at')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });
    
    if (tasksError) {
      console.error('获取任务统计失败:', tasksError);
    }
    
    // 2. 获取最近的失败子任务统计
    const { data: recentFailures, error: failuresError } = await supabase
      .from('evaluation_results')
      .select('id, status, error_message, model_id, created_at')
      .eq('status', 'failed')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (failuresError) {
      console.error('获取失败统计失败:', failuresError);
    }
    
    // 3. 获取提供商健康状态
    const providerHealth = enhancedLLMClient.getProviderHealthStatus();
    const performanceStats = enhancedLLMClient.getPerformanceStats();
    
    // 4. 分析失败模式
    const failureAnalysis = analyzeFailures(recentFailures || []);
    
    // 5. 计算任务成功率
    const taskStats = calculateTaskStats(recentTasks || []);
    
    // 6. 生成健康建议
    const recommendations = generateHealthRecommendations(
      taskStats,
      failureAnalysis,
      providerHealth
    );
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      period: '24小时',
      overview: {
        task_success_rate: taskStats.successRate,
        total_tasks: taskStats.totalTasks,
        completed_tasks: taskStats.completedTasks,
        failed_tasks: taskStats.failedTasks,
        avg_execution_time: taskStats.avgExecutionTime
      },
      provider_health: {
        summary: performanceStats.overall,
        details: performanceStats.providers
      },
      failure_analysis: failureAnalysis,
      recommendations: recommendations,
      last_updated: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('健康监控面板数据获取失败:', error);
    
    return NextResponse.json({
      error: '健康监控数据获取失败',
      details: error.message
    }, { status: 500 });
  }
}

/**
 * 分析失败模式
 */
function analyzeFailures(failures: any[]) {
  const failuresByType = new Map<string, number>();
  const failuresByModel = new Map<string, number>();
  const failuresByHour = new Map<number, number>();
  
  failures.forEach(failure => {
    // 分析错误类型
    const errorMessage = failure.error_message || '';
    const errorType = categorizeError(errorMessage);
    failuresByType.set(errorType, (failuresByType.get(errorType) || 0) + 1);
    
    // 分析模型失败
    if (failure.model_id) {
      failuresByModel.set(failure.model_id, (failuresByModel.get(failure.model_id) || 0) + 1);
    }
    
    // 分析时间分布
    const hour = new Date(failure.created_at).getHours();
    failuresByHour.set(hour, (failuresByHour.get(hour) || 0) + 1);
  });
  
  return {
    total_failures: failures.length,
    by_type: Array.from(failuresByType.entries()).map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / failures.length) * 100)
    })).sort((a, b) => b.count - a.count),
    by_model: Array.from(failuresByModel.entries()).map(([model, count]) => ({
      model_id: model,
      count,
      percentage: Math.round((count / failures.length) * 100)
    })).sort((a, b) => b.count - a.count).slice(0, 10),
    by_hour: Array.from(failuresByHour.entries()).map(([hour, count]) => ({
      hour,
      count
    })).sort((a, b) => a.hour - b.hour)
  };
}

/**
 * 错误分类
 */
function categorizeError(errorMessage: string): string {
  const message = errorMessage.toLowerCase();
  
  if (message.includes('timeout') || message.includes('aborted')) {
    return '超时错误';
  }
  if (message.includes('fetch failed') || message.includes('network')) {
    return '网络错误';
  }
  if (message.includes('500') || message.includes('502') || message.includes('503')) {
    return '服务器错误';
  }
  if (message.includes('401') || message.includes('403')) {
    return '认证错误';
  }
  if (message.includes('400') || message.includes('invalid')) {
    return '请求错误';
  }
  if (message.includes('空响应') || message.includes('empty')) {
    return '空响应错误';
  }
  if (message.includes('rate limit') || message.includes('quota')) {
    return '限额错误';
  }
  
  return '其他错误';
}

/**
 * 计算任务统计
 */
function calculateTaskStats(tasks: any[]) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const failedTasks = tasks.filter(t => t.status === 'failed').length;
  const successRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  // 计算平均执行时间（仅完成的任务）
  const completedTasksWithTime = tasks.filter(t => 
    t.status === 'completed' && t.created_at && t.finished_at
  );
  
  let avgExecutionTime = 0;
  if (completedTasksWithTime.length > 0) {
    const totalExecutionTime = completedTasksWithTime.reduce((sum, task) => {
      const start = new Date(task.created_at).getTime();
      const end = new Date(task.finished_at).getTime();
      return sum + (end - start);
    }, 0);
    avgExecutionTime = Math.round(totalExecutionTime / completedTasksWithTime.length / 1000); // 转换为秒
  }
  
  return {
    totalTasks,
    completedTasks,
    failedTasks,
    successRate,
    avgExecutionTime
  };
}

/**
 * 生成健康建议
 */
function generateHealthRecommendations(
  taskStats: any,
  failureAnalysis: any,
  providerHealth: any[]
): string[] {
  const recommendations: string[] = [];
  
  // 基于成功率的建议
  if (taskStats.successRate < 70) {
    recommendations.push('🚨 任务成功率过低，建议启用预检查功能并调整重试策略');
  } else if (taskStats.successRate < 85) {
    recommendations.push('⚠️ 任务成功率偏低，建议检查模型配置和网络状况');
  }
  
  // 基于失败分析的建议
  const topFailureType = failureAnalysis.by_type[0];
  if (topFailureType) {
    switch (topFailureType.type) {
      case '超时错误':
        recommendations.push('⏱️ 超时错误较多，建议增加API超时时间或选择响应更快的模型');
        break;
      case '网络错误':
        recommendations.push('🌐 网络错误较多，建议检查网络连接稳定性和DNS配置');
        break;
      case '服务器错误':
        recommendations.push('🖥️ 服务器错误较多，建议检查API提供商状态并启用电路熔断');
        break;
      case '限额错误':
        recommendations.push('💳 限额错误较多，建议检查API配额或分散到多个提供商');
        break;
    }
  }
  
  // 基于提供商健康状态的建议
  const unhealthyProviders = providerHealth.filter(p => p.consecutiveFailures > 3);
  if (unhealthyProviders.length > 0) {
    recommendations.push(`🔌 ${unhealthyProviders.length} 个提供商状态异常，建议暂时禁用或检查配置`);
  }
  
  // 基于执行时间的建议
  if (taskStats.avgExecutionTime > 300) { // 5分钟
    recommendations.push('🐌 任务执行时间较长，建议优化并发配置或选择更快的模型');
  }
  
  // 如果没有问题，给出积极建议
  if (recommendations.length === 0) {
    recommendations.push('✅ 系统运行良好，建议继续监控并定期优化配置');
  }
  
  return recommendations;
}