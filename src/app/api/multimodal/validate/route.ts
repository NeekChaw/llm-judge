import { NextRequest, NextResponse } from 'next/server';
import { templateService } from '@/lib/template-service';

/**
 * Bug #5修复: 多模态兼容性验证API
 * POST /api/multimodal/validate
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { evaluatorId, testCaseIds, modelId, testCaseId } = body;

    // 场景1: 批量验证评分器与多个测试用例的兼容性
    if (evaluatorId && testCaseIds && Array.isArray(testCaseIds)) {
      const result = await templateService.validateMultimodalCompatibility(
        evaluatorId,
        testCaseIds
      );

      return NextResponse.json({
        success: result.valid,
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        message: result.valid
          ? '所有测试用例与评分器模型兼容'
          : '存在不兼容的测试用例'
      });
    }

    // 场景2: 单个测试用例与模型的兼容性检查
    if (testCaseId && modelId) {
      const result = await templateService.isTestCaseCompatibleWithModel(
        testCaseId,
        modelId
      );

      return NextResponse.json({
        success: true,
        compatible: result.compatible,
        reason: result.reason,
        message: result.compatible
          ? '测试用例与模型兼容'
          : `不兼容: ${result.reason}`
      });
    }

    // 参数不足
    return NextResponse.json(
      {
        error: '缺少必需参数',
        details: '请提供 (evaluatorId + testCaseIds) 或 (testCaseId + modelId)'
      },
      { status: 400 }
    );

  } catch (error) {
    console.error('多模态兼容性验证失败:', error);
    return NextResponse.json(
      {
        error: '验证失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}
