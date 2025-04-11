// This file forwards requests to the actual route implementation
// to fix routing issues in production deployments

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Import the actual route handler dynamically to avoid circular dependencies
  const { POST: actualPostHandler } = await import('../../(chat)/api/chat/route');
  
  // Forward the request to the actual implementation
  return actualPostHandler(request);
}

export async function DELETE(request: NextRequest) {
  // Import the actual route handler dynamically to avoid circular dependencies
  const { DELETE: actualDeleteHandler } = await import('../../(chat)/api/chat/route');
  
  // Forward the request to the actual implementation
  return actualDeleteHandler(request);
} 