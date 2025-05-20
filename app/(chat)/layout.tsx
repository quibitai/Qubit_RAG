import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { auth } from '../(auth)/auth';
import Script from 'next/script';

export const experimental_ppr = true;

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  console.log('[Chat Layout] Starting to fetch auth session...');
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  console.log('[Chat Layout] Session object received:', session);
  console.log('[Chat Layout] User ID:', session?.user?.id);
  console.log('[Chat Layout] User Email:', session?.user?.email);

  const isCollapsed = cookieStore.get('sidebar:state')?.value !== 'true';

  // Ensure we have a valid session before rendering
  if (!session?.user?.id) {
    console.warn('[Chat Layout] No valid session found, redirecting to login');
    redirect('/login');
  }

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <SidebarProvider defaultOpen={true}>
        <AppSidebar user={session.user} />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </>
  );
}
