import { createClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 预检查分析接口 - 分析失败子任务，识别全提供商失败的情况
 */

interface PreRetryAnalysis {
  total_failed_subtasks: number;
  all_vendors_failed_count: number;
  timeout_failed_count: number;
  other_failed_count: number;
  all_vendors_failed_details: Array<{
    subtask_id: string;
    model_logical_name: string;
    model_display_name: string;
    failed_vendors: Array<{
      vendor_name: string;
      failure_reason: string;
      failure_time: Date;
      is_timeout: boolean;
    }>;
    vendor_count: number;
    all_vendors_exhausted: boolean;
  }>;
  recommendation: "proceed" | "user_choice" | "skip_problematic";
  analysis_summary: {
    safe_to_retry: number;      // 安全重试的子任务数（超时或部分失败）
    needs_user_choice: number;  // 需要用户决定的子任务数（全提供商失败）
    skip_recommended: number;   // 建议跳过的子任务数
  };
}

interface FailureRecord {
  subtask_id: string;
  model_id: string;
  model_name: string;
  logical_name?: string;
  vendor_name?: string;
  error_message: string;
  created_at: string;
  is_timeout_error: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const taskId = params.id;
    
    // 🆕 获取查询参数，支持按特定模型-维度组合筛选
    const { searchParams } = new URL(request.url);
    const modelName = searchParams.get('model_name');
    const dimensionName = searchParams.get('dimension_name');

    // 1. 🆕 获取失败的子任务（支持按模型-维度筛选）
    let query = supabase
      .from('evaluation_results')
      .select(`
        id,
        status,
        model_id,
        dimension_id,
        error_message,
        created_at,
        models (
          id,
          name,
          logical_name,
          vendor_name
        ),
        dimensions (
          id,
          name
        )
      `)
      .eq('task_id', taskId)
      .in('status', ['failed', 'error']);
    
    // 🆕 添加特定模型-维度组合筛选
    if (modelName && dimensionName) {
      // 需要通过 JOIN 来筛选模型名和维度名
      query = query
        .eq('models.name', modelName)
        .eq('dimensions.name', dimensionName);
    }
    
    const { data: failedSubtasks, error: subtasksError } = await query;

    if (subtasksError) {
      throw new Error(`Failed to fetch failed subtasks: ${subtasksError.message}`);
    }

    if (!failedSubtasks || failedSubtasks.length === 0) {
      // 没有失败的子任务，可以直接重试
      return NextResponse.json({
        total_failed_subtasks: 0,
        all_vendors_failed_count: 0,
        timeout_failed_count: 0,
        other_failed_count: 0,
        all_vendors_failed_details: [],
        recommendation: "proceed",
        analysis_summary: {
          safe_to_retry: 0,
          needs_user_choice: 0,
          skip_recommended: 0
        }
      } as PreRetryAnalysis);
    }

    // 2. 按照逻辑模型名分组分析失败记录
    const failureByLogicalModel = new Map<string, FailureRecord[]>();
    
    failedSubtasks.forEach(subtask => {
      const model = subtask.models as any;
      const logicalName = model?.logical_name || model?.name || 'Unknown';
      const isTimeoutError = subtask.error_message?.toLowerCase().includes('timeout') || 
                           subtask.error_message?.toLowerCase().includes('aborted') ||
                           subtask.error_message?.includes('SmartLLMTimeoutError');
      
      const failureRecord: FailureRecord = {
        subtask_id: subtask.id,
        model_id: subtask.model_id,
        model_name: model?.name || 'Unknown',
        logical_name: logicalName,
        vendor_name: model?.vendor_name || 'Unknown',
        error_message: subtask.error_message || 'Unknown error',
        created_at: subtask.created_at,
        is_timeout_error: isTimeoutError
      };

      if (!failureByLogicalModel.has(logicalName)) {
        failureByLogicalModel.set(logicalName, []);
      }
      failureByLogicalModel.get(logicalName)!.push(failureRecord);
    });

    // 3. 获取每个逻辑模型的可用提供商总数
    const logicalModelNames = Array.from(failureByLogicalModel.keys());
    const vendorCounts = new Map<string, number>();
    
    for (const logicalName of logicalModelNames) {
      const { data: modelCount, error: countError } = await supabase
        .from('models')
        .select('id')
        .or(`logical_name.eq.${logicalName},name.eq.${logicalName}`)
        .eq('status', 'active');
      
      if (!countError && modelCount) {
        vendorCounts.set(logicalName, modelCount.length);
      }
    }

    // 4. 分析每个逻辑模型的失败情况
    const analysis: PreRetryAnalysis = {
      total_failed_subtasks: failedSubtasks.length,
      all_vendors_failed_count: 0,
      timeout_failed_count: 0,
      other_failed_count: 0,
      all_vendors_failed_details: [],
      recommendation: "proceed",
      analysis_summary: {
        safe_to_retry: 0,
        needs_user_choice: 0,
        skip_recommended: 0
      }
    };

    for (const [logicalName, failures] of failureByLogicalModel) {
      const totalVendorsForModel = vendorCounts.get(logicalName) || 1;
      const uniqueFailedVendors = new Set(failures.map(f => f.vendor_name));
      const allVendorsExhausted = uniqueFailedVendors.size >= totalVendorsForModel;
      
      // 检查是否有超时失败
      const hasTimeoutFailures = failures.some(f => f.is_timeout_error);
      const hasNonTimeoutFailures = failures.some(f => !f.is_timeout_error);
      
      if (allVendorsExhausted && hasNonTimeoutFailures && !hasTimeoutFailures) {
        // 全提供商都非超时失败 - 需要用户选择
        analysis.all_vendors_failed_count++;
        analysis.analysis_summary.needs_user_choice++;
        
        analysis.all_vendors_failed_details.push({
          subtask_id: failures[0].subtask_id, // 代表性子任务ID
          model_logical_name: logicalName,
          model_display_name: failures[0].model_name,
          failed_vendors: failures.map(f => ({
            vendor_name: f.vendor_name,
            failure_reason: f.error_message,
            failure_time: new Date(f.created_at),
            is_timeout: f.is_timeout_error
          })),
          vendor_count: totalVendorsForModel,
          all_vendors_exhausted: true
        });
      } else if (hasTimeoutFailures) {
        // 包含超时失败 - 安全重试
        analysis.timeout_failed_count++;
        analysis.analysis_summary.safe_to_retry++;
      } else {
        // 其他失败情况 - 部分提供商失败
        analysis.other_failed_count++;
        analysis.analysis_summary.safe_to_retry++;
      }
    }

    // 5. 生成推荐策略
    if (analysis.all_vendors_failed_count === 0) {
      analysis.recommendation = "proceed"; // 可以直接重试
    } else if (analysis.analysis_summary.safe_to_retry > 0) {
      analysis.recommendation = "user_choice"; // 混合情况，让用户选择
    } else {
      analysis.recommendation = "skip_problematic"; // 建议跳过所有问题子任务
    }

    console.log(`🔍 预检查分析完成: 任务${taskId}, 全提供商失败${analysis.all_vendors_failed_count}个, 推荐策略: ${analysis.recommendation}`);

    return NextResponse.json(analysis);

  } catch (error) {
    console.error('Pre-retry analysis failed:', error);
    return NextResponse.json(
      { error: 'Failed to analyze retry conditions' },
      { status: 500 }
    );
  }
}