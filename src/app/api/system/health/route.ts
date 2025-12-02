import { NextRequest, NextResponse } from 'next/server';
import { getHealthCheck, getMonitoringData } from '@/lib/monitoring';

// GET /api/system/health - 系统健康检查
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    if (type === 'monitoring') {
      return await getMonitoringData(request);
    } else {
      return await getHealthCheck();
    }
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      { 
        status: 'error',
        message: 'Health check failed',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}