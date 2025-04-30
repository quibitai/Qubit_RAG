import { auth } from '@/app/(auth)/auth';
import type { NextRequest } from 'next/server';
import { getChatsByUserId } from '@/lib/db/queries';

export async function GET(request: NextRequest) {
  console.log('[History API] Starting request handling');
  const { searchParams } = request.nextUrl;

  const limit = Number.parseInt(searchParams.get('limit') || '10');
  const startingAfter = searchParams.get('starting_after');
  const endingBefore = searchParams.get('ending_before');

  if (startingAfter && endingBefore) {
    console.log(
      '[History API] Error: Both starting_after and ending_before provided',
    );
    return Response.json(
      'Only one of starting_after or ending_before can be provided!',
      { status: 400 },
    );
  }

  console.log('[History API] Fetching auth session...');
  const session = await auth();
  console.log('[History API] Session received:', session);
  console.log('[History API] User ID from session:', session?.user?.id);

  if (!session?.user?.id) {
    console.log('[History API] Unauthorized: No user ID in session');
    return Response.json('Unauthorized!', { status: 401 });
  }

  try {
    console.log('[History API] Fetching chats for user ID:', session.user.id);
    const chatsData = await getChatsByUserId({
      id: session.user.id,
      limit,
      startingAfter,
      endingBefore,
    });
    console.log(
      '[History API] Successfully fetched chats, count:',
      chatsData.chats.length,
    );

    return Response.json(chatsData);
  } catch (error) {
    console.error('[History API] Error fetching chats:', error);
    return Response.json('Failed to fetch chats!', { status: 500 });
  }
}
