'use client';

import dynamic from 'next/dynamic';

// 客户端动态导入StagewiseToolbarWrapper以避免服务端渲染问题
const StagewiseToolbarWrapper = dynamic(
  () => import('@/components/stagewise-toolbar-wrapper').then(mod => ({ default: mod.StagewiseToolbarWrapper })),
  { ssr: false }
);

export function ClientLayoutWrapper() {
  return <StagewiseToolbarWrapper />;
}