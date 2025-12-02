'use client';

import { useEffect } from 'react';

/**
 * 系统初始化组件
 * 负责启动任务队列系统和其他后台服务
 */
export function SystemInitializer() {
  useEffect(() => {
    // 初始化任务队列系统
    const initializeSystem = async () => {
      try {
        console.log('🚀 Initializing task queue system...');
        
        // 调用系统初始化API
        const response = await fetch('/api/system/init', {
          method: 'POST',
        });
        
        if (response.ok) {
          console.log('✅ Task queue system initialized successfully');
        } else {
          console.warn('⚠️ Failed to initialize task queue system:', response.statusText);
        }
      } catch (error) {
        console.error('❌ Error initializing system:', error);
      }
    };

    initializeSystem();
  }, []);

  return null; // 这个组件不渲染任何内容
}
