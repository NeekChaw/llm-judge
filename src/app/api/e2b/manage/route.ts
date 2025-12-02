/**
 * E2B沙盒管理API端点
 * 提供沙盒会话管理的HTTP接口
 */

import { NextRequest, NextResponse } from 'next/server';
import { sandboxManager } from '@/lib/e2b';
import { getCodeEvaluationStats } from '@/lib/e2b/task-processor-integration';
import { logger } from '@/lib/monitoring';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, config } = body;

    switch (action) {
      case 'create':
        // 创建新的沙盒会话
        const newSessionId = await sandboxManager.createSession(config || {});
        
        logger.info('通过API创建沙盒会话', {
          sessionId: newSessionId,
          config
        });

        return NextResponse.json({
          success: true,
          data: { sessionId: newSessionId }
        });

      case 'destroy':
        // 销毁指定的沙盒会话
        if (!sessionId) {
          return NextResponse.json(
            { error: '缺少必需参数: sessionId' },
            { status: 400 }
          );
        }

        await sandboxManager.destroySession(sessionId);
        
        logger.info('通过API销毁沙盒会话', { sessionId });

        return NextResponse.json({
          success: true,
          data: { message: '沙盒会话已销毁' }
        });

      case 'destroy_all':
        // 销毁所有沙盒会话
        await sandboxManager.destroyAll();
        
        logger.info('通过API销毁所有沙盒会话');

        return NextResponse.json({
          success: true,
          data: { message: '所有沙盒会话已销毁' }
        });

      case 'execute':
        // 在指定会话中执行代码
        if (!sessionId) {
          return NextResponse.json(
            { error: '缺少必需参数: sessionId' },
            { status: 400 }
          );
        }

        const { code, language = 'python', timeout } = body;
        if (!code) {
          return NextResponse.json(
            { error: '缺少必需参数: code' },
            { status: 400 }
          );
        }

        const result = await sandboxManager.executeCode(sessionId, {
          code,
          language,
          timeout
        });

        logger.info('通过API执行代码', {
          sessionId,
          language,
          success: result.success,
          executionTime: result.executionTime
        });

        return NextResponse.json({
          success: true,
          data: result
        });

      default:
        return NextResponse.json(
          { error: `无效的action: ${action}。支持的action: create, destroy, destroy_all, execute` },
          { status: 400 }
        );
    }

  } catch (error) {
    logger.error('沙盒管理API错误', error);
    
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
    const sessionId = searchParams.get('sessionId');
    const timeRange = searchParams.get('timeRange') as 'hour' | 'day' | 'week' || 'day';

    switch (action) {
      case 'sessions':
        // 获取所有活跃会话信息
        const stats = sandboxManager.getStats();
        
        return NextResponse.json({
          success: true,
          data: {
            totalSessions: stats.totalSessions,
            totalExecutions: stats.totalExecutions,
            oldestSession: stats.oldestSession ? new Date(stats.oldestSession).toISOString() : null,
            newestSession: stats.newestSession ? new Date(stats.newestSession).toISOString() : null
          }
        });

      case 'session_info':
        // 获取指定会话信息
        if (!sessionId) {
          return NextResponse.json(
            { error: '缺少必需参数: sessionId' },
            { status: 400 }
          );
        }

        const sessionInfo = sandboxManager.getSessionInfo(sessionId);
        if (!sessionInfo) {
          return NextResponse.json(
            { error: '会话不存在' },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          data: {
            id: sessionInfo.id,
            createdAt: sessionInfo.createdAt.toISOString(),
            lastUsed: sessionInfo.lastUsed.toISOString(),
            executionCount: sessionInfo.executionCount
          }
        });

      case 'evaluation_stats':
        // 获取代码评测统计信息
        const evaluationStats = await getCodeEvaluationStats(timeRange);
        
        return NextResponse.json({
          success: true,
          data: evaluationStats
        });

      case 'system_status':
        // 获取系统状态
        const systemStats = sandboxManager.getStats();
        const evaluationStatsData = await getCodeEvaluationStats(timeRange);
        
        return NextResponse.json({
          success: true,
          data: {
            sandbox: {
              activeSessions: systemStats.totalSessions,
              totalExecutions: systemStats.totalExecutions
            },
            evaluation: evaluationStatsData,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage()
          }
        });

      default:
        return NextResponse.json(
          { error: `无效的action: ${action}。支持的action: sessions, session_info, evaluation_stats, system_status` },
          { status: 400 }
        );
    }

  } catch (error) {
    logger.error('沙盒管理API GET错误', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (sessionId) {
      // 删除指定会话
      await sandboxManager.destroySession(sessionId);
      
      logger.info('通过DELETE API销毁沙盒会话', { sessionId });

      return NextResponse.json({
        success: true,
        data: { message: `会话 ${sessionId} 已销毁` }
      });
    } else {
      // 删除所有会话
      await sandboxManager.destroyAll();
      
      logger.info('通过DELETE API销毁所有沙盒会话');

      return NextResponse.json({
        success: true,
        data: { message: '所有沙盒会话已销毁' }
      });
    }

  } catch (error) {
    logger.error('沙盒管理DELETE API错误', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
