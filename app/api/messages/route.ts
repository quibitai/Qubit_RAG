import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getMessagesByChatId } from '@/lib/db/queries';
import { auth } from '@/app/(auth)/auth';

export async function GET(request: NextRequest) {
  try {
    // Get authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get chat ID from query parameters
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json(
        { error: 'Chat ID is required' },
        { status: 400 },
      );
    }

    console.log(`[API Messages] Fetching messages for chat: ${chatId}`);

    // Fetch messages for the chat
    const messages = await getMessagesByChatId({ id: chatId });

    console.log(
      `[API Messages] Found ${messages.length} messages for chat: ${chatId}`,
    );

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('[API Messages] Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 },
    );
  }
}
