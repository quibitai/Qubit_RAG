import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import type { ChatSummary } from '@/lib/types';
import { getChatSummaries } from '@/lib/db/queries';
import type { Session } from 'next-auth';

export async function GET(request: NextRequest) {
  try {
    const session = (await auth()) as Session;
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    const clientId = (session.user as any).clientId || 'default';

    const searchParams = request.nextUrl.searchParams;
    const historyType = searchParams.get('type') as 'sidebar' | 'global' | null;
    const bitContextId = searchParams.get('contextId');
    const page = Number.parseInt(searchParams.get('page') || '1', 10);
    const limit = Number.parseInt(searchParams.get('limit') || '20', 10);

    console.log(
      `[API History] GET request: type=${historyType}, bitContextId=${bitContextId}, page=${page}, limit=${limit}, userId=${userId}, clientId=${clientId}`,
    );

    const chatSummaries: ChatSummary[] = await getChatSummaries({
      userId,
      clientId,
      historyType,
      bitContextId,
      page,
      limit,
    });

    const hasMore = chatSummaries.length === limit;

    return NextResponse.json(
      {
        chats: chatSummaries,
        hasMore,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[API History] Error fetching chat history:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: 'Failed to fetch chat history', details: errorMessage },
      { status: 500 },
    );
  }
}
