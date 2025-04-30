import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { document } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// Define interface for the request body
interface TitleUpdateRequest {
  title: string;
}

// PATCH handler to update only the title of a document
export async function PATCH(
  request: NextRequest,
  { params }: { params: { docId: string } },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const { docId } = params;

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Parse request body safely
    let body: TitleUpdateRequest;
    try {
      body = await request.json();
    } catch (e) {
      console.error('Failed to parse request body:', e);
      return new NextResponse('Invalid request body', { status: 400 });
    }

    const { title } = body;

    if (!title || title.trim() === '') {
      return new NextResponse('Title cannot be empty', { status: 400 });
    }

    console.log(`PATCH document/${docId}/title - New title: "${title}"`);

    // Check if document exists and belongs to user
    const docs = await db
      .select()
      .from(document)
      .where(and(eq(document.id, docId), eq(document.userId, userId)))
      .limit(1);

    if (!docs || docs.length === 0) {
      return new NextResponse('Document not found', { status: 404 });
    }

    // Update only the title, preserving all other fields
    const updatedDoc = await db
      .update(document)
      .set({
        title,
        // Don't update content or other fields
      })
      .where(and(eq(document.id, docId), eq(document.userId, userId)))
      .returning();

    console.log(`Document title updated successfully: ${docId}`);
    return NextResponse.json(updatedDoc[0]);
  } catch (error) {
    console.error('Error updating document title:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
