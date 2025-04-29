/**
 * DEPRECATED: This route is deprecated in favor of using the Brain API.
 * This file is maintained temporarily for backwards compatibility.
 *
 * Re-exports the chat functionality from the core implementation.
 */

// Import necessary dependencies
import {
  createChatAndSaveFirstMessages,
  saveSubsequentMessages,
} from '@/app/(chat)/actions';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Runtime configuration for the route
export const config = {
  runtime: 'edge',
  unstable_allowDynamic: ['**/node_modules/**'],
};

// Set maximum duration for edge function
export const maxDuration = 60; // 60 seconds timeout

// Unified POST handler for chat actions
export async function POST(request: NextRequest) {
  console.log('[API] /api/chat route called');

  try {
    const body = await request.json();
    console.log('[API] Received request body:', body);

    if (body.action === 'createChatAndSaveFirstMessages') {
      const result = await createChatAndSaveFirstMessages({
        chatId: body.chatId,
        userMessage: body.userMessage,
        assistantMessage: body.assistantMessage,
      });

      console.log('[API] createChatAndSaveFirstMessages result:', result);
      return NextResponse.json(result);
    }

    if (body.action === 'saveSubsequentMessages') {
      // Pass structured data instead of FormData
      const result = await saveSubsequentMessages({
        chatId: body.chatId,
        userMessage: body.userMessage,
        assistantMessage: body.assistantMessage,
      });

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
    console.error('[API] Error in chat route:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 },
    );
  }
}

// Add DELETE handler if needed
export async function DELETE(request: NextRequest) {
  // Handle chat deletion
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing chat ID' },
        { status: 400 },
      );
    }

    // Implement chat deletion logic here

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API] Error deleting chat:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete chat' },
      { status: 500 },
    );
  }
}
