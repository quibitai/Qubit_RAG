'use client';

import type { User } from 'next-auth';
import { useRouter, usePathname } from 'next/navigation';

import { SidebarHistory } from '@/components/sidebar-history';
import { SidebarUserNav } from '@/components/sidebar-user-nav';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { PanelLeft, MessageSquare, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { memo, useCallback, useMemo } from 'react';

// Memoize the sidebar toggle button to prevent unnecessary re-renders
const SidebarToggleButton = memo(
  ({
    toggleSidebar,
  }: {
    toggleSidebar: () => void;
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          type="button"
          className="p-2 h-fit"
          onClick={toggleSidebar}
          aria-label="Toggle Sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent align="end">Toggle Sidebar</TooltipContent>
    </Tooltip>
  ),
);
SidebarToggleButton.displayName = 'SidebarToggleButton';

// Memoize navigation links to prevent unnecessary re-renders
const NavLink = memo(
  ({
    href,
    setOpenMobile,
    isActive,
    icon: Icon,
    label,
    sidebarState,
  }: {
    href: string;
    setOpenMobile: (open: boolean) => void;
    isActive: boolean;
    icon: React.ElementType;
    label: string;
    sidebarState: 'expanded' | 'collapsed';
  }) => (
    <div className="flex justify-center">
      <Link
        href={href}
        onClick={() => {
          setOpenMobile(false);
        }}
        className={
          sidebarState === 'collapsed'
            ? 'flex justify-center w-full'
            : 'w-full px-2'
        }
      >
        {sidebarState === 'expanded' ? (
          <Button
            variant={isActive ? 'secondary' : 'ghost'}
            className={cn(
              'w-full justify-start gap-2',
              isActive && 'bg-secondary text-secondary-foreground',
            )}
          >
            <Icon size={18} />
            <span>{label}</span>
          </Button>
        ) : (
          <div className="flex justify-center w-full">
            <SidebarMenuButton
              tooltip={label}
              isActive={isActive}
              variant="default"
              className="w-8 h-8 flex items-center justify-center"
            >
              <Icon className="h-5 w-5" />
            </SidebarMenuButton>
          </div>
        )}
      </Link>
    </div>
  ),
);
NavLink.displayName = 'NavLink';

// Create a memoized sidebar history component to prevent render cycles
const MemoizedSidebarHistory = memo(SidebarHistory);

// Create a memoized sidebar user nav component
const MemoizedSidebarUserNav = memo(SidebarUserNav);

// Memoize the header content to prevent unnecessary re-renders
const SidebarHeaderContent = memo(
  ({
    state,
    setOpenMobile,
    toggleSidebar,
    isChatActive,
    pathname,
  }: {
    state: 'expanded' | 'collapsed';
    setOpenMobile: (open: boolean) => void;
    toggleSidebar: () => void;
    isChatActive: boolean;
    pathname: string;
  }) => (
    <SidebarMenu>
      <div className="flex flex-row justify-between items-center">
        <Link
          href="/"
          onClick={() => {
            setOpenMobile(false);
          }}
          className="flex flex-row gap-3 items-center"
        >
          {state === 'expanded' && (
            <span className="text-lg font-semibold px-2 hover:bg-muted rounded-md cursor-pointer">
              {/* Empty span, previously had "Chatbot" text */}
            </span>
          )}
        </Link>
        <SidebarToggleButton toggleSidebar={toggleSidebar} />
      </div>

      {/* Chat Section */}
      <div className="mt-2">
        <NavLink
          href="/"
          setOpenMobile={setOpenMobile}
          isActive={isChatActive}
          icon={MessageSquare}
          label="Chat"
          sidebarState={state}
        />
      </div>

      {/* Dashboard */}
      <div className="mt-2">
        <NavLink
          href="/dashboard"
          setOpenMobile={setOpenMobile}
          isActive={pathname === '/dashboard'}
          icon={LayoutDashboard}
          label="Dashboard"
          sidebarState={state}
        />
      </div>
    </SidebarMenu>
  ),
);
SidebarHeaderContent.displayName = 'SidebarHeaderContent';

export const AppSidebar = memo(function AppSidebar({
  user,
}: {
  user: User | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { setOpenMobile, state, toggleSidebar } = useSidebar();

  // Memoize the active state calculations to prevent unnecessary recalculations
  const activeStates = useMemo(() => {
    const isChatActive = pathname === '/' || pathname.startsWith('/chat');

    return {
      isChatActive,
    };
  }, [pathname]);

  // Create a memoized callback for setOpenMobile to prevent unnecessary re-renders
  const handleSetOpenMobile = useCallback(
    (open: boolean) => {
      setOpenMobile(open);
    },
    [setOpenMobile],
  );

  return (
    <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarHeaderContent
          state={state}
          setOpenMobile={handleSetOpenMobile}
          toggleSidebar={toggleSidebar}
          isChatActive={activeStates.isChatActive}
          pathname={pathname}
        />
      </SidebarHeader>
      {state === 'expanded' && (
        <SidebarContent>
          <MemoizedSidebarHistory user={user} />
        </SidebarContent>
      )}
      <SidebarFooter className="mt-auto">
        {user && <MemoizedSidebarUserNav user={user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
});
