'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * 导航守护组件 - 检测和防止导航阻塞
 */
export function NavigationGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let navigationTimeout: NodeJS.Timeout | null = null;
    let navigationInProgress = false;

    // 监听路由变化开始
    const handleRouteChangeStart = () => {
      if (navigationInProgress) {
        console.warn('⚠️ 检测到并发导航，可能存在阻塞');
        return;
      }

      navigationInProgress = true;
      console.log('🚀 路由变化开始:', pathname);

      // 设置超时检测
      navigationTimeout = setTimeout(() => {
        if (navigationInProgress) {
          console.error('❌ 导航超时！可能存在阻塞问题');
          navigationInProgress = false;
        }
      }, 5000); // 5秒超时
    };

    // 监听路由变化完成
    const handleRouteChangeComplete = () => {
      if (navigationTimeout) {
        clearTimeout(navigationTimeout);
        navigationTimeout = null;
      }
      navigationInProgress = false;
      console.log('✅ 路由变化完成:', pathname);
    };

    // 路径变化时重置状态
    handleRouteChangeComplete();

    return () => {
      if (navigationTimeout) {
        clearTimeout(navigationTimeout);
      }
    };
  }, [pathname]);

  return null; // 这个组件不渲染任何内容
}