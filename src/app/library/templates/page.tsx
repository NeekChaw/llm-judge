import { Metadata } from 'next'
import { Layout } from '@/components/layout/layout'
import TemplatesContent from './TemplatesContent'

export const metadata: Metadata = {
  title: '模板管理 - AI Benchmark V2',
  description: '管理评测模板，配置维度-评分器组合'
}

export default function TemplatesPage() {
  return (
    <Layout>
      <TemplatesContent />
    </Layout>
  )
}