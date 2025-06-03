import { auth } from '@/app/(auth)/auth';
import { redirect } from 'next/navigation';
import { SessionProvider } from 'next-auth/react';
import ClientLayout from '@/components/ClientLayout';
import TimezoneDetector from '@/components/timezone/TimezoneDetector';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <SessionProvider session={session}>
      <TimezoneDetector
        onTimezoneDetected={(timezone) => {
          console.log('App timezone detected:', timezone);
          // Store in a global context or send to server if needed
        }}
      >
        <ClientLayout>{children}</ClientLayout>
      </TimezoneDetector>
    </SessionProvider>
  );
}
