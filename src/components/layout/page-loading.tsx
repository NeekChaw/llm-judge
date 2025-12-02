'use client';

import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

// 全局页面加载状态管理
let globalSetLoading: ((loading: boolean) => void) | null = null;

export function usePageLoading() {
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    globalSetLoading = setLoading;
    return () => {
      globalSetLoading = null;
    };
  }, []);

  return loading;
}

// 导出全局设置函数
export function setGlobalPageLoading(loading: boolean) {
  if (globalSetLoading) {
    globalSetLoading(loading);
  }
}

// 页面加载完成时自动清除加载状态的 hook
export function usePageLoadComplete() {
  useEffect(() => {
    // 页面组件挂载时清除加载状态
    setGlobalPageLoading(false);
  }, []);
}

// 主内容区域顶部加载条 - 不覆盖页面内容，只显示导航反馈
export function MainContentLoadingIndicator() {
  const loading = usePageLoading();

  if (!loading) return null;

  return (
    <div className="absolute top-0 left-0 right-0 bg-blue-600 h-1 z-50">
      <div className="h-full bg-blue-400 animate-pulse"></div>
      <div className="absolute top-0 left-0 h-full bg-blue-200 animate-ping w-8"></div>
    </div>
  );
}

// 保持向后兼容性的别名
export function PageLoadingIndicator() {
  return <MainContentLoadingIndicator />;
}
