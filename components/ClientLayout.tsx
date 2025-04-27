'use client';

import React from 'react';
import { Toaster } from 'sonner';
import { useChatPane } from '@/context/ChatPaneContext';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { GlobalChatPane } from '@/components/GlobalChatPane';
import { TooltipProvider } from '@/components/ui/tooltip';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { isPaneOpen } = useChatPane();

  return (
    <TooltipProvider>
      <div className="flex flex-col h-dvh">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={isPaneOpen ? 75 : 100} minSize={50}>
            {children}
          </ResizablePanel>

          {isPaneOpen && (
            <>
              <ResizableHandle withHandle />

              <ResizablePanel
                defaultSize={25}
                minSize={15}
                maxSize={40}
                collapsible={true}
                collapsedSize={4}
                id="chat-pane"
              >
                <GlobalChatPane />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>

        <Toaster position="top-center" />
      </div>
    </TooltipProvider>
  );
}
