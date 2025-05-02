import {
  createChatAndSaveFirstMessages,
  saveSubsequentMessages,
} from '@/app/(chat)/actions';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

// This is a fallback API route to wrap the server actions
// in case they don't bind properly in the client components

export async function POST(request: NextRequest) {
  console.log('[API] /api/chat-actions route called');

  try {
    const body = await request.json();
    console.log('[API] Received request body:', body);

    if (body.action === 'createChatAndSaveFirstMessages') {
      console.log('[API] Creating chat and saving first messages');
      console.log('[API] User message:', body.userMessage);
      console.log('[API] Assistant message:', body.assistantMessage);

      // Validate that we have all required data
      if (!body.chatId || !body.userMessage || !body.assistantMessage) {
        console.error(
          '[API] Missing required data for createChatAndSaveFirstMessages',
        );
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required data',
          },
          { status: 400 },
        );
      }

      const result = await createChatAndSaveFirstMessages({
        chatId: body.chatId,
        userMessage: body.userMessage,
        assistantMessage: body.assistantMessage,
      });

      // Revalidate all relevant paths to ensure data is fresh
      console.log('[API] Revalidating paths for new chat');
      revalidatePath('/api/history');
      revalidatePath('/api/history?limit=20');
      revalidatePath('/');
      revalidatePath('/chat');
      revalidatePath(`/chat/${body.chatId}`);

      console.log('[API] createChatAndSaveFirstMessages result:', result);
      return NextResponse.json(result);
    }

    if (body.action === 'saveSubsequentMessages') {
      console.log('[API] Saving subsequent messages');
      console.log('[API] User message:', body.userMessage);
      console.log('[API] Assistant message:', body.assistantMessage);

      // Validate that we have all required data
      if (!body.chatId || !body.userMessage || !body.assistantMessage) {
        console.error('[API] Missing required data for saveSubsequentMessages');
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required data',
          },
          { status: 400 },
        );
      }

      // Call the server action with the proper parameters
      const result = await saveSubsequentMessages({
        chatId: body.chatId,
        userMessage: body.userMessage,
        assistantMessage: body.assistantMessage,
      });

      // Revalidate all relevant paths to ensure data is fresh
      console.log('[API] Revalidating paths for updated chat');
      revalidatePath('/api/history');
      revalidatePath('/api/history?limit=20');
      revalidatePath('/');
      revalidatePath('/chat');
      revalidatePath(`/chat/${body.chatId}`);

      console.log('[API] saveSubsequentMessages result:', result);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid action specified',
      },
      { status: 400 },
    );
  } catch (error: any) {
    console.error('[API] Error in chat-actions route:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}
