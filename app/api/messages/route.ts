import { auth } from '@/app/(auth)/auth';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { NextResponse } from 'next/server';
import { message as messageSchema } from '@/lib/db/schema';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
  }

  // Temporarily bypass authentication in development mode for testing
  if (process.env.NODE_ENV === 'development') {
    console.log('[Messages API] Development mode: Bypassing authentication');

    try {
      // Get chat to verify it exists
      const chat = await getChatById({ id: chatId });

      if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }

      const messages = await getMessagesByChatId({ id: chatId });

      return NextResponse.json({
        messages,
        chatId,
        chatTitle: chat.title,
      });
    } catch (error) {
      console.error('[Messages API] Error fetching messages:', error);
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 },
      );
    }
  }

  // Production authentication logic
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }

  try {
    // Get chat to verify the user has access to it
    const chat = await getChatById({ id: chatId });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    // Check if the user owns the chat
    if (chat.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const messages = await getMessagesByChatId({ id: chatId });

    return NextResponse.json({
      messages,
      chatId,
      chatTitle: chat.title,
    });
  } catch (error) {
    console.error('[Messages API] Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 },
    );
  }
}
