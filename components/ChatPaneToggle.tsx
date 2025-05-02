'use client';

import React from 'react';
import { PanelRightOpen } from 'lucide-react';
import { useChatPane } from '@/context/ChatPaneContext';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Component that toggles the chat pane visibility
 */
export function ChatPaneToggle() {
  const { isPaneOpen, setIsPaneOpen } = useChatPane();

  const togglePane = () => {
    // Toggle the pane state
    const newState = !isPaneOpen;
    setIsPaneOpen(newState);

    // Store preference in localStorage
    try {
      localStorage.setItem('chat-pane-open', String(newState));
    } catch (error) {
      console.error('Error saving chat pane state to localStorage:', error);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-md p-0"
          onClick={togglePane}
          aria-label={isPaneOpen ? 'Close chat pane' : 'Open chat pane'}
        >
          <PanelRightOpen className="h-5 w-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent align="end">
        {isPaneOpen ? 'Close chat pane' : 'Open chat pane'}
      </TooltipContent>
    </Tooltip>
  );
}
