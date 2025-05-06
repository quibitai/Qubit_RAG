import { auth } from '@/app/(auth)/auth';
import { getChatsByUserId } from '@/lib/db/queries';
import { NextResponse } from 'next/server';
import type { Chat } from '@/lib/db/schema';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { error: 'Must be logged in to fetch chat history' },
      { status: 401 },
    );
  }

  try {
    const { chats, hasMore } = await getChatsByUserId({
      id: userId,
      limit: 10,
      startingAfter: null,
      endingBefore: null,
    });

    const formattedChats = chats.map((chat: Chat) => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      // updatedAt doesn't exist in our Chat type
      // model doesn't exist in our Chat type
      // Just return what we have in the schema
      visibility: chat.visibility,
    }));

    return NextResponse.json({ chats: formattedChats, hasMore });
  } catch (error) {
    console.error('[/api/history] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 },
    );
  }
}
