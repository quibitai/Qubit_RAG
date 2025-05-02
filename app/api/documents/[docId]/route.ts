import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { document } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// GET handler to fetch a document by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const { docId } = await params; // Await params before using its properties

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Special handling for 'new' document ID - return an empty template document
    if (docId === 'new') {
      console.log('Returning template for new document');
      return NextResponse.json({
        document: {
          id: 'new',
          title: 'Untitled Document',
          content: '<p>Start typing your document here...</p>',
          kind: 'text',
          userId,
          createdAt: new Date().toISOString(),
        },
      });
    }

    // Fetch the document using proper Drizzle query syntax
    const docs = await db
      .select()
      .from(document)
      .where(eq(document.id, docId))
      .limit(1);

    if (!docs || docs.length === 0) {
      return new NextResponse('Document not found', { status: 404 });
    }

    const doc = docs[0];

    // Check authorization (only allow access to documents owned by the user)
    if (doc.userId !== userId) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    return NextResponse.json({ document: doc });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error fetching document:', error);
    return new NextResponse(`Internal Server Error: ${errorMessage}`, {
      status: 500,
    });
  }
}

// PUT handler to update an existing document
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const { docId } = await params; // Await params before using its properties

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Parse request body safely
    let body;
    try {
      body = await request.json();
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : 'Unknown parsing error';
      console.error('Failed to parse request body:', e);
      return new NextResponse(`Invalid request body: ${errorMessage}`, {
        status: 400,
      });
    }

    const { content, title } = body;
    console.log(
      `PUT document/${docId} - Content length: ${content ? content.length : 'undefined'}`,
    );

    // Enhanced validation - reject empty content with detailed error message
    if (!content || content.trim() === '' || content === '<p></p>') {
      console.error(
        `Attempt to save empty content for document ${docId} rejected`,
      );
      return new NextResponse('Content cannot be empty or whitespace only', {
        status: 400,
      });
    }

    // Check if document exists and belongs to user
    const docs = await db
      .select()
      .from(document)
      .where(eq(document.id, docId))
      .limit(1);

    if (!docs || docs.length === 0) {
      return new NextResponse('Document not found', { status: 404 });
    }

    const existingDoc = docs[0];

    if (existingDoc.userId !== userId) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Safety check: compare lengths to ensure we're not significantly reducing content
    if (
      existingDoc.content &&
      existingDoc.content.length > 100 &&
      content.length < existingDoc.content.length * 0.5
    ) {
      console.warn(
        `Warning: Content length reduced from ${existingDoc.content.length} to ${content.length} for document ${docId}`,
      );
      console.log(
        `Existing content (first 100 chars): ${existingDoc.content.substring(0, 100)}`,
      );
      console.log(
        `New content (first 100 chars): ${content.substring(0, 100)}`,
      );
    }

    // Update the document
    const updatedDoc = await db
      .update(document)
      .set({
        content,
        title: title || existingDoc.title,
      })
      .where(eq(document.id, docId))
      .returning();

    return NextResponse.json(updatedDoc[0]);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error updating document:', error);
    return new NextResponse(`Internal Server Error: ${errorMessage}`, {
      status: 500,
    });
  }
}

// DELETE handler to delete a document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    const { docId } = await params; // Await params before using its properties

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Check if document exists and belongs to user
    const docs = await db
      .select()
      .from(document)
      .where(eq(document.id, docId))
      .limit(1);

    if (!docs || docs.length === 0) {
      return new NextResponse('Document not found', { status: 404 });
    }

    const existingDoc = docs[0];

    if (existingDoc.userId !== userId) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Delete the document
    await db.delete(document).where(eq(document.id, docId));

    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error deleting document:', error);
    return new NextResponse(`Internal Server Error: ${errorMessage}`, {
      status: 500,
    });
  }
}
