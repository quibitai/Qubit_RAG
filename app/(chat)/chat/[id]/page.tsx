import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import type { DBMessage } from '@/lib/db/schema';
import type { Attachment, UIMessage } from 'ai';

// This setting ensures Next.js will render pages for chat IDs not known at build time
export const dynamicParams = true;

// Force dynamic rendering to ensure we get fresh data each time
export const dynamic = 'force-dynamic';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  console.log(`[Chat Page] Rendering page for chat ID: ${id}`);

  // Add timestamp to logs to track when the page is actually rendering
  console.log(`[Chat Page] Timestamp: ${new Date().toISOString()}`);

  // Log before fetching chat data
  console.log(`[Chat Page] Fetching chat data for ID: ${id}`);
  const chat = await getChatById({ id });
  console.log(
    `[Chat Page] Chat data fetch result:`,
    chat
      ? `Found - Title: "${chat.title}", Created: ${chat.createdAt.toISOString()}`
      : 'NOT FOUND',
  );

  if (!chat) {
    console.log(`[Chat Page] Chat with ID ${id} not found, rendering 404`);
    notFound();
  }

  const session = await auth();

  if (chat.visibility === 'private') {
    if (!session || !session.user) {
      console.log(
        `[Chat Page] Private chat but no authenticated user, returning 404`,
      );
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      console.log(
        `[Chat Page] Private chat but user ${session.user.id} is not owner ${chat.userId}, returning 404`,
      );
      return notFound();
    }
  }

  // Log before fetching messages
  console.log(`[Chat Page] Fetching messages for chat ID: ${id}`);
  const messagesFromDb = await getMessagesByChatId({
    id,
  });
  console.log(
    `[Chat Page] Found ${messagesFromDb.length} messages for chat ID: ${id}`,
  );

  function convertToUIMessages(messages: Array<DBMessage>): Array<UIMessage> {
    return messages.map((message) => ({
      id: message.id,
      parts: message.parts as UIMessage['parts'],
      role: message.role as UIMessage['role'],
      // Note: content will soon be deprecated in @ai-sdk/react
      content: '',
      createdAt: message.createdAt,
      experimental_attachments:
        (message.attachments as Array<Attachment>) ?? [],
    }));
  }

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get('chat-model');

  if (!chatModelFromCookie) {
    return (
      <>
        <Chat
          id={chat.id}
          initialMessages={convertToUIMessages(messagesFromDb)}
          selectedChatModel={DEFAULT_CHAT_MODEL}
          selectedVisibilityType={chat.visibility}
          isReadonly={session?.user?.id !== chat.userId}
        />
        <DataStreamHandler id={id} />
      </>
    );
  }

  return (
    <>
      <Chat
        id={chat.id}
        initialMessages={convertToUIMessages(messagesFromDb)}
        selectedChatModel={chatModelFromCookie.value}
        selectedVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
