'use client';

import { Header } from '@/components/layout/Header';
import { AiChatPanel } from '@/components/ai/AiChatPanel';

export default function AssistantPage() {
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="AI Assistant" />
      <div className="flex-1 flex flex-col min-h-0 pb-[10vh]">
        <AiChatPanel fullScreen />
      </div>
    </div>
  );
}
