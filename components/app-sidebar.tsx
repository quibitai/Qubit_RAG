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
import { LayoutGrid, PanelLeft, FileEdit, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setOpenMobile, state, toggleSidebar } = useSidebar();

  const isDashboardActive = pathname === '/dashboard';
  const isEditorActive = pathname.startsWith('/editor');
  const isChatActive = pathname === '/' || pathname.startsWith('/chat');

  return (
    <Sidebar collapsible="icon" className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
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
          </div>

          <div className="mt-4 flex justify-center">
            <Link
              href="/dashboard"
              onClick={() => {
                setOpenMobile(false);
              }}
              className={
                state === 'collapsed' ? 'flex justify-center w-full' : 'w-full'
              }
            >
              {state === 'expanded' ? (
                <Button
                  variant={isDashboardActive ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start gap-2',
                    isDashboardActive &&
                      'bg-secondary text-secondary-foreground',
                  )}
                >
                  <LayoutGrid size={18} />
                  <span>Dashboard</span>
                </Button>
              ) : (
                <div className="flex justify-center w-full">
                  <SidebarMenuButton
                    tooltip="Dashboard"
                    isActive={isDashboardActive}
                    variant="default"
                    className="w-8 h-8 flex items-center justify-center"
                  >
                    <LayoutGrid className="h-5 w-5" />
                  </SidebarMenuButton>
                </div>
              )}
            </Link>
          </div>

          {/* Bits Section */}
          {state === 'expanded' && (
            <div className="mt-6 px-2">
              <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
                Bits
              </div>
            </div>
          )}

          {/* Chat Bit */}
          <div className="mt-2 flex justify-center">
            <Link
              href="/"
              onClick={() => {
                setOpenMobile(false);
              }}
              className={
                state === 'collapsed'
                  ? 'flex justify-center w-full'
                  : 'w-full px-2'
              }
            >
              {state === 'expanded' ? (
                <Button
                  variant={isChatActive ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start gap-2',
                    isChatActive && 'bg-secondary text-secondary-foreground',
                  )}
                >
                  <MessageSquare size={18} />
                  <span>Chat Bit</span>
                </Button>
              ) : (
                <div className="flex justify-center w-full">
                  <SidebarMenuButton
                    tooltip="Chat Bit"
                    isActive={isChatActive}
                    variant="default"
                    className="w-8 h-8 flex items-center justify-center"
                  >
                    <MessageSquare className="h-5 w-5" />
                  </SidebarMenuButton>
                </div>
              )}
            </Link>
          </div>

          {/* Document Bit */}
          <div className="mt-2 flex justify-center">
            <Link
              href="/editor/new"
              onClick={() => {
                setOpenMobile(false);
              }}
              className={
                state === 'collapsed'
                  ? 'flex justify-center w-full'
                  : 'w-full px-2'
              }
            >
              {state === 'expanded' ? (
                <Button
                  variant={isEditorActive ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start gap-2',
                    isEditorActive && 'bg-secondary text-secondary-foreground',
                  )}
                >
                  <FileEdit size={18} />
                  <span>Document Bit</span>
                </Button>
              ) : (
                <div className="flex justify-center w-full">
                  <SidebarMenuButton
                    tooltip="Document Bit"
                    isActive={isEditorActive}
                    variant="default"
                    className="w-8 h-8 flex items-center justify-center"
                  >
                    <FileEdit className="h-5 w-5" />
                  </SidebarMenuButton>
                </div>
              )}
            </Link>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      {state === 'expanded' && (
        <SidebarContent>
          <SidebarHistory user={user} />
        </SidebarContent>
      )}
      <SidebarFooter className="mt-auto">
        {user && <SidebarUserNav user={user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
