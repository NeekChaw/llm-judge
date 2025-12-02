import { NextRequest, NextResponse } from 'next/server';
import { resetVendorSelector } from '@/lib/vendor-selector';

/**
 * 重置VendorSelector缓存API端点
 * 用于模型配置更新后强制重新加载模型组
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📝 接收到重置VendorSelector缓存请求');
    
    // 重置全局VendorSelector缓存
    resetVendorSelector();
    
    return NextResponse.json({
      success: true,
      message: 'VendorSelector缓存已重置，下次调用时将重新加载所有模型配置',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ 重置VendorSelector缓存失败:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * 获取当前VendorSelector状态（调试用）
 */
export async function GET(request: NextRequest) {
  try {
    const { getVendorSelector } = await import('@/lib/vendor-selector');
    const selector = await getVendorSelector();
    
    // 获取健康状态报告
    const healthReport = await selector.getVendorHealthReport();
    
    return NextResponse.json({
      success: true,
      data: {
        initialized: true,
        health_report: healthReport,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ 获取VendorSelector状态失败:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}