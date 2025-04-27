'use client';

import React from 'react';
import { Button } from './ui/button';
import { MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useChatPane } from '@/context/ChatPaneContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function ChatPaneToggle() {
  const { togglePane, isPaneOpen } = useChatPane();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          onClick={togglePane}
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label={isPaneOpen ? 'Close chat' : 'Open chat'}
        >
          {isPaneOpen ? (
            <PanelRightClose className="h-5 w-5" />
          ) : (
            <PanelRightOpen className="h-5 w-5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isPaneOpen ? 'Close chat panel' : 'Open chat panel'}
      </TooltipContent>
    </Tooltip>
  );
}
