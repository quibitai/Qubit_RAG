import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { document } from '@/lib/db/schema';
import { v4 as uuidv4 } from 'uuid';

// POST handler to create a new document
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Parse request body safely
    let body;
    try {
      body = await request.json();
    } catch (e) {
      console.error('Failed to parse request body:', e);
      return new NextResponse('Invalid request body', { status: 400 });
    }

    const { content, title = 'Untitled Document' } = body;
    console.log(
      `POST document - Content length: ${content ? content.length : 'undefined'}`,
    );

    // Use kind from body or default to 'text'
    const kind = body.kind || 'text';

    // Enhanced content validation
    if (!content || content.trim() === '' || content === '<p></p>') {
      console.error('Attempt to create document with empty content rejected');
      return new NextResponse('Content cannot be completely empty', {
        status: 400,
      });
    }

    // Allow placeholder content for initial document creation but log it
    if (content.includes('Start typing your document here...')) {
      console.log('Creating document with placeholder content');
    }

    // Generate a proper UUID for the document
    const documentId = uuidv4();
    const now = new Date();

    // Create the document matching the exact schema
    const newDoc = await db
      .insert(document)
      .values({
        id: documentId,
        userId,
        title,
        content,
        createdAt: now,
        kind,
      })
      .returning();

    console.log(`Document created successfully: ${documentId}`);
    return NextResponse.json(newDoc[0]);
  } catch (error) {
    console.error('Error creating document:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
