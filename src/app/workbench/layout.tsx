'use client';

import { Layout } from '@/components/layout/layout';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Play, BarChart3, PlusCircle } from 'lucide-react';

interface WorkbenchLayoutProps {
  children: React.ReactNode;
}

export default function WorkbenchLayout({ children }: WorkbenchLayoutProps) {
  const pathname = usePathname();

  // 🔧 优化：根据当前路径决定是否显示tab导航
  const isTaskDetailPage = pathname.match(/^\/workbench\/tasks\/[^\/]+$/) && pathname !== '/workbench/tasks/new';
  const isNewTaskPage = pathname === '/workbench/tasks/new';
  
  // 🆕 新建评测页面直接返回children，不包裹额外的Layout
  if (isNewTaskPage) {
    return <>{children}</>;
  }
  
  // 🆕 任务详情页不显示tab导航
  const tabs = isTaskDetailPage ? [] : [
    // 🆕 聚合分析相关页面
    ...(pathname.startsWith('/workbench/aggregation') ? [{
      name: '聚合分析',
      href: '/workbench/aggregation',
      icon: BarChart3,
      current: true
    }] : [])
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">评测工作台</h1>
        </div>

        {/* 🆕 Tab 导航 - 只在有tab时显示 */}
        {tabs.length > 0 && (
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.name}
                    href={tab.href}
                    className={`${
                      tab.current
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center`}
                    aria-current={tab.current ? 'page' : undefined}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {tab.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* 页面内容 */}
        {children}
      </div>
    </Layout>
  );
}