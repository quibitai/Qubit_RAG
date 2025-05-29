import { cookies } from 'next/headers';

import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';
import { ChatPageWrapper } from '@/components/chat-page-wrapper';

export default async function Page() {
  const id = generateUUID();
  console.log('[DEBUG] New chat page loaded, generated UUID:', id);
  console.log(
    '[DEBUG] This UUID should be used to create a new chat in the database',
  );

  // This would be the perfect place to save the new chat to the database
  // using the saveChat function, but it's missing!
  // Example of what should happen:
  // try {
  //   const session = await auth();
  //   if (session?.user?.id) {
  //     console.log('[DEBUG] Attempting to save new chat with ID:', id, 'for user:', session.user.id);
  //     await saveChat({ id, userId: session.user.id, title: "New Chat" });
  //   }
  // } catch (error) {
  //   console.error('[DEBUG] Failed to save new chat:', error);
  // }

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');

  if (!modelIdFromCookie) {
    return (
      <ChatPageWrapper>
        <Chat
          key={id}
          id={id}
          initialMessages={[]}
          selectedChatModel={DEFAULT_CHAT_MODEL}
          selectedVisibilityType="private"
          isReadonly={false}
        />
      </ChatPageWrapper>
    );
  }

  return (
    <ChatPageWrapper>
      <Chat
        key={id}
        id={id}
        initialMessages={[]}
        selectedChatModel={modelIdFromCookie.value}
        selectedVisibilityType="private"
        isReadonly={false}
      />
    </ChatPageWrapper>
  );
}
