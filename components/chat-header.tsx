'use client';
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';
import React, { useEffect, useState, useMemo } from 'react';

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
import { toast } from 'sonner';
import { getAvailableSpecialists } from '@/lib/ai/prompts/specialists';

// Default option for general chat
const GENERAL_CHAT_OPTION = {
  id: null,
  name: 'General Chat',
  description: 'Standard chat without specialist persona',
};

// Memoize the SpecialistSelector component to prevent unnecessary re-renders
const SpecialistSelector = memo(
  ({
    currentActiveSpecialistId,
    setCurrentActiveSpecialistId,
    availableSpecialists,
  }: {
    currentActiveSpecialistId: string | null;
    setCurrentActiveSpecialistId: (id: string | null) => void;
    availableSpecialists: Array<{
      id: string | null;
      name: string;
      description: string;
    }>;
  }) => (
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
  ),
);
SpecialistSelector.displayName = 'SpecialistSelector';

// Memoize the mobile selector component
const MobileSpecialistSelector = memo(
  ({
    currentActiveSpecialistId,
    setCurrentActiveSpecialistId,
    availableSpecialists,
  }: {
    currentActiveSpecialistId: string | null;
    setCurrentActiveSpecialistId: (id: string | null) => void;
    availableSpecialists: Array<{
      id: string | null;
      name: string;
      description: string;
    }>;
  }) => (
    <div className="flex md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="justify-between items-center w-full text-left"
            size="sm"
          >
            <span className="truncate">Select Specialist</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[200px] max-h-[400px] overflow-y-auto"
        >
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
    </div>
  ),
);
MobileSpecialistSelector.displayName = 'MobileSpecialistSelector';

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

  // Use state to store specialists
  const [specialists, setSpecialists] = useState<
    Array<{
      id: string;
      name: string;
      description: string;
    }>
  >([]);

  // Memoize the available specialists with the General Chat option
  const availableSpecialists = useMemo(() => {
    return [GENERAL_CHAT_OPTION, ...specialists];
  }, [specialists]);

  // Fetch specialists only once on component mount
  useEffect(() => {
    try {
      // Get specialists from the registry
      const registeredSpecialists = getAvailableSpecialists();
      console.log('[ChatHeader] Loaded specialists:', registeredSpecialists);
      setSpecialists(registeredSpecialists);
    } catch (error) {
      console.error('[ChatHeader] Error loading specialists:', error);
      toast.error('Failed to load specialists');
    }
  }, []);

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

      {/* Mobile specialist selector */}
      <MobileSpecialistSelector
        currentActiveSpecialistId={currentActiveSpecialistId}
        setCurrentActiveSpecialistId={setCurrentActiveSpecialistId}
        availableSpecialists={availableSpecialists}
      />

      {/* Desktop specialist selector */}
      {!isReadonly && selectedModelId === 'chat-model' && (
        <SpecialistSelector
          currentActiveSpecialistId={currentActiveSpecialistId}
          setCurrentActiveSpecialistId={setCurrentActiveSpecialistId}
          availableSpecialists={availableSpecialists}
        />
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
