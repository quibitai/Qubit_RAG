import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { document } from '@/lib/db/schema';
import { nanoid } from 'nanoid';

// POST handler to create a new document
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    const { content, title = 'Untitled Document' } = body;

    if (!content) {
      return new NextResponse('Content is required', { status: 400 });
    }

    // Generate a unique ID for the document
    const documentId = nanoid();

    // Create the document
    const newDoc = await db
      .insert(document)
      .values({
        id: documentId,
        userId,
        title,
        content,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return NextResponse.json(newDoc[0]);
  } catch (error) {
    console.error('Error creating document:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
