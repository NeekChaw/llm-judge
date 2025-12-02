'use client';

import { Layout } from '@/components/layout/layout';

interface SettingsLayoutProps {
  children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <Layout>
      {children}
    </Layout>
  );
}
