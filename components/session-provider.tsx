'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  // session?: any; // Optional if pre-fetching session on server
}

export default function NextAuthProvider({ children }: Props) {
  // Consistent with NextAuth best practices for client components
  // The SessionProvider will handle authentication state for the entire app
  // This helps ensure session state is properly shared across all components
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
