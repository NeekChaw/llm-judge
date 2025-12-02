import { Metadata } from 'next';
import { Layout } from '@/components/layout/layout';
import ClientOnly from '@/components/ClientOnly';
import EvaluatorsContent from './EvaluatorsContent';
import { EvaluatorsPageSkeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: '评分器管理 - AI Benchmark V2',
  description: '管理AI评测系统的评分器配置',
};

export default function EvaluatorsPage() {
  return (
    <Layout>
      <ClientOnly fallback={<EvaluatorsPageSkeleton />}>
        <EvaluatorsContent />
      </ClientOnly>
    </Layout>
  );
}