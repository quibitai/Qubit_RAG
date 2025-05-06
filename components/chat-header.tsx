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
import { cleanupEmptyMessages } from '@/app/(chat)/actions';
import { toast } from 'sonner';

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
  const { currentActiveSpecialistId, setCurrentActiveSpecialistId } =
    useChatPane();

  const { width: windowWidth } = useWindowSize();

  // Define the available specialists
  const availableSpecialists = [
    {
      id: 'echo-tango-specialist',
      name: 'Echo Tango Bit',
      description: 'Primary model for all-purpose chat',
    },
    {
      id: null,
      name: 'General Chat',
      description: 'Standard chat without specialist persona',
    },
    // Add more specialists here as they become available
  ];

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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={async () => {
                try {
                  const result = await cleanupEmptyMessages({ chatId });
                  if (result.success) {
                    if (result.cleanedCount > 0) {
                      toast(
                        `Cleaned up ${result.cleanedCount} empty duplicate messages`,
                      );
                    } else {
                      toast('No empty duplicate messages found to clean up');
                    }
                  } else {
                    toast(`Error: ${result.error}`);
                  }
                } catch (error) {
                  console.error('Error cleaning up messages:', error);
                  toast('Failed to clean up messages');
                }
              }}
            >
              Clean Up
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove empty duplicate messages</TooltipContent>
        </Tooltip>
      )}

      {!isReadonly && selectedModelId === 'chat-model' && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1">
              {currentActiveSpecialistId
                ? availableSpecialists.find(
                    (s) => s.id === currentActiveSpecialistId,
                  )?.name || 'Select Specialist'
                : 'General Chat'}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            {availableSpecialists.map((specialist) => (
              <DropdownMenuItem
                key={specialist.id || 'general'}
                onClick={() => setCurrentActiveSpecialistId(specialist.id)}
                className="flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <span>{specialist.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {specialist.description}
                  </span>
                </div>
                {currentActiveSpecialistId === specialist.id && (
                  <CheckIcon className="h-4 w-4" />
                )}
              </DropdownMenuItem>
            ))}
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
