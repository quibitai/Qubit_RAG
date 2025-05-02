import { NextResponse } from 'next/server';

/**
 * Simple test endpoint for document streaming functionality
 * This provides mock responses to simulate document updates without database dependencies
 */
export async function POST(request: Request) {
  try {
    const data = await request.json();

    // Validate input
    if (!data.documentId) {
      return NextResponse.json(
        { error: 'Missing documentId' },
        { status: 400 },
      );
    }

    // Prepare the response based on test type
    const testType = data.testType || 'simple-update';
    let responseObject: any;

    switch (testType) {
      case 'simple-update':
        responseObject = {
          success: true,
          updates: [
            {
              type: 'text-delta',
              documentId: data.documentId,
              content: data.testContent || 'This is a test update',
              timestamp: new Date().toISOString(),
            },
          ],
        };
        break;

      case 'clear-document':
        responseObject = {
          success: true,
          updates: [
            {
              type: 'clear',
              documentId: data.documentId,
              timestamp: new Date().toISOString(),
            },
          ],
        };
        break;

      case 'finish-update':
        responseObject = {
          success: true,
          updates: [
            {
              type: 'finish',
              documentId: data.documentId,
              timestamp: new Date().toISOString(),
            },
          ],
        };
        break;

      default:
        responseObject = {
          success: false,
          error: `Unknown test type: ${testType}`,
        };
    }

    return NextResponse.json(responseObject);
  } catch (error) {
    console.error('[stream-test] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
