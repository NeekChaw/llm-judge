'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { setGlobalPageLoading } from './page-loading';
import {
  Database,
  Play,
  BarChart3,
  Settings,
  Layers,
  Bot,
  FileText,
  TestTube,
  Server,
  Plus
} from 'lucide-react';

// 统一的导航分组 - 所有菜单项使用一致的布局
const navigation = [
  {
    name: '知识库',
    items: [
      { name: '维度管理', href: '/library/dimensions', icon: Layers },
      { name: '评分器管理', href: '/library/evaluators', icon: Bot },
      { name: '测试用例管理', href: '/library/test-cases', icon: TestTube },
      { name: '模板管理', href: '/library/templates', icon: FileText },
      { name: '模型管理', href: '/library/models', icon: Database },
    ],
  },
  {
    name: '工作台',
    items: [
      { name: '任务列表', href: '/workbench/tasks', icon: Play },
      { name: '新建评测', href: '/workbench/tasks/new', icon: Plus },
    ],
  },
  {
    name: '分析台',
    items: [
      { name: '统一分析台', href: '/analytics', icon: BarChart3 },
    ],
  },
  {
    name: '系统设置',
    items: [
      { name: '运行时配置', href: '/settings/system', icon: Settings },
      { name: 'API 管理', href: '/settings/api-management', icon: Server },
    ],
  },
];

// 渲染导航分组的通用组件
function NavigationGroup({
  group,
  pathname,
  onNavigate
}: {
  group: any;
  pathname: string;
  onNavigate: (href: string, e: React.MouseEvent) => void;
}) {
  return (
    <div className="!bg-transparent">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 !text-gray-400">
        {group.name}
      </h3>
      <div className="mt-2 space-y-1 !bg-transparent">
        {group.items.map((item: any) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={(e) => onNavigate(item.href, e)}
              className={cn(
                // 基础样式 - 确保所有菜单项完全一致
                'group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-all duration-150',
                // 状态样式 - 使用!important确保不被覆盖
                isActive
                  ? '!bg-gray-800 !text-white shadow-sm [&>*]:!text-white'
                  : '!text-gray-300 hover:!bg-gray-700 hover:!text-white [&>*]:!text-gray-300 hover:[&>*]:!text-white',
                // 额外的强制样式确保背景不被覆盖
                '!no-underline !border-0 !outline-0'
              )}
            >
              <Icon className="mr-3 h-5 w-5 shrink-0 transition-colors duration-150" />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // 🆕 处理导航点击 - 直接导航，不显示加载状态
  const handleNavigation = (href: string, e: React.MouseEvent) => {
    // 如果已经在当前页面，阻止导航
    if (pathname === href) {
      e.preventDefault();
      return;
    }

    // 添加导航计时器以检测阻塞
    const navigationStart = performance.now();
    console.log(`🔄 导航开始: ${href} (${navigationStart.toFixed(2)}ms)`);

    // 设置一个检测器来监控导航是否被阻塞
    setTimeout(() => {
      const navigationDuration = performance.now() - navigationStart;
      if (navigationDuration > 100) { // 如果超过100ms还没完成导航，可能存在阻塞
        console.warn(`⚠️ 导航可能被阻塞: ${href}, 已耗时: ${navigationDuration.toFixed(2)}ms`);
      }
    }, 100);

    // 让Next.js Link自然处理导航，不使用e.preventDefault()
  };

  return (
    <div className="flex h-full w-64 flex-col bg-gray-900 !bg-gray-900 fixed left-0 top-0 z-40 shadow-lg">
      {/* 顶部标题 */}
      <div className="flex h-16 shrink-0 items-center px-6">
        <h1 className="text-xl font-bold text-white">AI Benchmark V2</h1>
      </div>

      {/* 统一的导航区域 - 所有菜单项使用一致的布局和间距 */}
      <nav className="flex-1 px-6 py-4 !bg-transparent overflow-y-auto custom-scrollbar">
        <div className="space-y-8 !bg-transparent">
          {navigation.map((group) => (
            <NavigationGroup
              key={group.name}
              group={group}
              pathname={pathname}
              onNavigate={handleNavigation}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}