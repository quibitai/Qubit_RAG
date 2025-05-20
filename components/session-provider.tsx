'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  // session?: any; // Optional if pre-fetching session on server
}

export default function NextAuthProvider({ children }: Props) {
  // Configure the SessionProvider with settings that ensure
  // session state is properly synchronized across the application
  return (
    <SessionProvider
      // Check for session updates every 5 minutes
      refetchInterval={5 * 60}
      // Enable refetch on window focus to keep session fresh
      refetchOnWindowFocus={true}
    >
      {children}
    </SessionProvider>
  );
}
