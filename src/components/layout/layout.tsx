'use client';

import { Sidebar } from './sidebar';
import { PageLoadingIndicator, setGlobalPageLoading } from './page-loading';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const pathname = usePathname();

  // 路由变化监听（保留用于未来扩展）
  useEffect(() => {
    // 可以在这里添加路由变化的处理逻辑
  }, [pathname]);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden ml-64 relative">
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
        {/* 全局加载指示器已移除，使用页面级骨架动画 */}
      </div>
    </div>
  );
}