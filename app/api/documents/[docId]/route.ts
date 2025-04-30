import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db';
import { document } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// GET handler to fetch a document by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { docId: string } },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Fetch the document
    const doc = await db.query.document.findFirst({
      where: eq(document.id, params.docId),
    });

    if (!doc) {
      return new NextResponse('Document not found', { status: 404 });
    }

    // Check authorization (only allow access to documents owned by the user)
    if (doc.userId !== userId) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    return NextResponse.json(doc);
  } catch (error) {
    console.error('Error fetching document:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

// PUT handler to update an existing document
export async function PUT(
  request: NextRequest,
  { params }: { params: { docId: string } },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const body = await request.json();
    const { content, title } = body;

    if (!content) {
      return new NextResponse('Content is required', { status: 400 });
    }

    // Check if document exists and belongs to user
    const existingDoc = await db.query.document.findFirst({
      where: eq(document.id, params.docId),
    });

    if (!existingDoc) {
      return new NextResponse('Document not found', { status: 404 });
    }

    if (existingDoc.userId !== userId) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Update the document
    const updatedDoc = await db
      .update(document)
      .set({
        content,
        title: title || existingDoc.title,
        updatedAt: new Date(),
      })
      .where(eq(document.id, params.docId))
      .returning();

    return NextResponse.json(updatedDoc[0]);
  } catch (error) {
    console.error('Error updating document:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
