/**
 * E2B代码执行API端点
 * 提供代码执行和评估的HTTP接口
 */

import { NextRequest, NextResponse } from 'next/server';
import { codeExecutor, sandboxManager } from '@/lib/e2b';
import { logger } from '@/lib/monitoring';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, language = 'python', testCases, setupCode, teardownCode, context } = body;

    // 验证必需参数
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: '缺少必需参数: code' },
        { status: 400 }
      );
    }

    // 验证语言类型
    const supportedLanguages = ['python', 'javascript', 'typescript', 'bash'];
    if (!supportedLanguages.includes(language)) {
      return NextResponse.json(
        { error: `不支持的语言: ${language}。支持的语言: ${supportedLanguages.join(', ')}` },
        { status: 400 }
      );
    }

    logger.info('收到代码执行请求', {
      language,
      codeLength: code.length,
      testCasesCount: testCases?.length || 0,
      hasSetupCode: !!setupCode,
      hasTeardownCode: !!teardownCode,
      context
    });

    // 执行代码评估
    const result = await codeExecutor.executeAndEvaluate({
      code,
      language,
      testCases,
      setupCode,
      teardownCode,
      context
    });

    logger.info('代码执行完成', {
      success: result.success,
      score: result.score,
      executionTime: result.metrics.totalExecutionTime,
      testsPassed: result.metrics.testsPassed,
      testsTotal: result.metrics.testsTotal
    });

    return NextResponse.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('代码执行API错误', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'stats':
        // 获取沙盒统计信息
        const stats = sandboxManager.getStats();
        return NextResponse.json({
          success: true,
          data: stats
        });

      case 'health':
        // 健康检查
        return NextResponse.json({
          success: true,
          data: {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            activeSessions: sandboxManager.getStats().totalSessions
          }
        });

      default:
        return NextResponse.json(
          { error: '无效的action参数。支持的action: stats, health' },
          { status: 400 }
        );
    }

  } catch (error) {
    logger.error('代码执行API GET错误', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
