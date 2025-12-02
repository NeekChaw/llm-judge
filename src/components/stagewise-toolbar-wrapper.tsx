'use client';

import dynamic from 'next/dynamic';
import ReactPlugin from '@stagewise-plugins/react';

// Stagewise Toolbar integration (dev only) - Client Component
const StagewiseToolbar = dynamic(
  () => import('@stagewise/toolbar-next').then(mod => mod.StagewiseToolbar),
  { ssr: false }
);

export function StagewiseToolbarWrapper() {
  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return <StagewiseToolbar config={{ plugins: [ReactPlugin] }} />;
}
