'use client';

import { ReactNode, useEffect } from 'react';
import { useChatPane } from '@/context/ChatPaneContext';

/**
 * ChatPageWrapper
 *
 * This component automatically sets the currentActiveSpecialistId to 'chat-model'
 * when the chat page loads, ensuring proper context for the Chat Bit.
 */
export function ChatPageWrapper({ children }: { children: ReactNode }) {
  const { setCurrentActiveSpecialistId } = useChatPane();

  // Set the currentActiveSpecialistId to 'chat-model' when this component mounts
  useEffect(() => {
    console.log(
      '[ChatPageWrapper] Setting currentActiveSpecialistId to chat-model',
    );
    setCurrentActiveSpecialistId('chat-model');
  }, [setCurrentActiveSpecialistId]);

  return <>{children}</>;
}
