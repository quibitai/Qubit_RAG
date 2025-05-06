'use client';
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';
import React from 'react';

import { ModelSelector } from '@/components/model-selector';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon, ChevronDown, CheckIcon } from 'lucide-react';
import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { type VisibilityType, VisibilitySelector } from './visibility-selector';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChatPane } from '@/context/ChatPaneContext';

function PureChatHeader({
  chatId,
  selectedModelId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedModelId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open } = useSidebar();
  const { setActiveBitContextId, activeBitContextId } = useChatPane();

  const { width: windowWidth } = useWindowSize();

  return (
    <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2">
      <SidebarToggle />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="md:px-2 px-2 md:h-fit"
            onClick={() => {
              router.push('/');
              router.refresh();
            }}
          >
            <PlusIcon />
            <span className="md:sr-only">New Chat</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>New Chat</TooltipContent>
      </Tooltip>

      {!isReadonly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1">
              Echo Tango Bit
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuItem
              onClick={() => setActiveBitContextId('chat-model')}
              className="flex items-center justify-between"
            >
              <div className="flex flex-col">
                <span>Echo Tango Bit</span>
                <span className="text-xs text-muted-foreground">
                  Primary model for all-purpose chat
                </span>
              </div>
              {(activeBitContextId === 'chat-model' || !activeBitContextId) && (
                <CheckIcon className="h-4 w-4" />
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          selectedVisibilityType={selectedVisibilityType}
          className="order-1 md:order-3"
        />
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return prevProps.selectedModelId === nextProps.selectedModelId;
});
