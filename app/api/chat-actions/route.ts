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
      const result = await createChatAndSaveFirstMessages({
        chatId: body.chatId,
        userMessage: body.userMessage,
        assistantMessage: body.assistantMessage,
      });

      // Explicitly revalidate history path
      revalidatePath('/api/history');

      console.log('[API] createChatAndSaveFirstMessages result:', result);
      return NextResponse.json(result);
    }

    if (body.action === 'saveSubsequentMessages') {
      // Create FormData to match the expected format
      const formData = new FormData();
      formData.append('messages', JSON.stringify(body.messages));

      const result = await saveSubsequentMessages(formData);

      // Explicitly revalidate history path
      revalidatePath('/api/history');

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
