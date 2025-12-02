import { Layout } from '@/components/layout/layout';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function HomePage() {
  return (
    <Layout>
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            AI Benchmark V2
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            专业的AI模型评测平台，提供全面的模型性能分析和对比功能
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link href="/workbench/tasks/new">
              <Button size="lg">开始评测</Button>
            </Link>
            <Link href="/library/dimensions">
              <Button variant="outline" size="lg">管理知识库</Button>
            </Link>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-semibold">知识库管理</h3>
            <p className="mt-2 text-gray-600">
              管理评测维度、评分器、模板和测试用例，构建可复用的评测资产
            </p>
            <Link href="/library/dimensions" className="mt-4 inline-block">
              <Button variant="outline">进入知识库</Button>
            </Link>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-semibold">评测工作台</h3>
            <p className="mt-2 text-gray-600">
              创建和管理评测任务，实时监控评测进度和结果
            </p>
            <Link href="/workbench/tasks" className="mt-4 inline-block">
              <Button variant="outline">进入工作台</Button>
            </Link>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-semibold">结果分析</h3>
            <p className="mt-2 text-gray-600">
              深度分析评测结果，生成可视化报告和洞察
            </p>
            <Link href="/dashboard/results" className="mt-4 inline-block">
              <Button variant="outline">查看分析</Button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}