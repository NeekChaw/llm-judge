import { Metadata } from 'next';
import { Layout } from '@/components/layout/layout';
import ClientOnly from '@/components/ClientOnly';
import TestCasesContent from './TestCasesContent';
import { TestCasesPageSkeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: '测试用例管理 - AI Benchmark V2',
  description: '管理AI评测系统的测试问题和参考答案',
};

export default function TestCasesPage() {
  return (
    <Layout>
      <ClientOnly fallback={<TestCasesPageSkeleton />}>
        <TestCasesContent />
      </ClientOnly>
    </Layout>
  );
}