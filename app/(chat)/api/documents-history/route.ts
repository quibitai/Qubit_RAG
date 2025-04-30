import { auth } from '@/app/(auth)/auth';
import type { NextRequest } from 'next/server';
import { getDocumentsByUserId } from '@/lib/db/queries';

export async function GET(request: NextRequest) {
  console.log('[Documents History API] Starting request handling');
  const { searchParams } = request.nextUrl;

  const limit = Number.parseInt(searchParams.get('limit') || '10');
  const startingAfter = searchParams.get('starting_after');
  const endingBefore = searchParams.get('ending_before');

  if (startingAfter && endingBefore) {
    console.log(
      '[Documents History API] Error: Both starting_after and ending_before provided',
    );
    return Response.json(
      'Only one of starting_after or ending_before can be provided!',
      { status: 400 },
    );
  }

  console.log('[Documents History API] Fetching auth session...');
  const session = await auth();
  console.log('[Documents History API] Session received:', session);
  console.log(
    '[Documents History API] User ID from session:',
    session?.user?.id,
  );

  if (!session?.user?.id) {
    console.log('[Documents History API] Unauthorized: No user ID in session');
    return Response.json('Unauthorized!', { status: 401 });
  }

  try {
    console.log(
      '[Documents History API] Fetching documents for user ID:',
      session.user.id,
    );
    const documentsData = await getDocumentsByUserId({
      id: session.user.id,
      limit,
      startingAfter,
      endingBefore,
    });
    console.log(
      '[Documents History API] Successfully fetched documents, count:',
      documentsData.documents.length,
    );

    return Response.json(documentsData);
  } catch (error) {
    console.error('[Documents History API] Error fetching documents:', error);
    return Response.json('Failed to fetch documents!', { status: 500 });
  }
}
