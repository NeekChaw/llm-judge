import { Metadata } from 'next';
import { Layout } from '@/components/layout/layout';
import ClientOnly from '@/components/ClientOnly';
import ModelsContent from './ModelsContent';
import { ModelsPageSkeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: '模型管理 - AI Benchmark V2',
  description: '管理AI评测系统的模型配置',
};

export default function ModelsPage() {
  return (
    <Layout>
      <ClientOnly fallback={<ModelsPageSkeleton />}>
        <ModelsContent />
      </ClientOnly>
    </Layout>
  );
}