import type { Metadata } from 'next';
import './globals.css';
import { Suspense } from 'react';
import { SystemInitializer } from '@/components/system-initializer';
import { ClientLayoutWrapper } from '@/components/client-layout-wrapper';
import { NavigationGuard } from '@/components/navigation-guard';

export const metadata: Metadata = {
  title: 'AI Benchmark V2',
  description: 'AI 模型评测平台',
};

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-lg">加载中...</div>
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning={true}>
      <body suppressHydrationWarning={true}>
        <SystemInitializer />
        <NavigationGuard />
        <Suspense fallback={<LoadingFallback />}>
          {children}
        </Suspense>
        <ClientLayoutWrapper />
      </body>
    </html>
  );
}