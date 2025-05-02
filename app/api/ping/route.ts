import { NextResponse } from 'next/server';

/**
 * Simple ping endpoint to verify API connectivity
 * Can be used for health checks and to test if server actions are working
 */
export async function GET() {
  try {
    return NextResponse.json(
      {
        ok: true,
        timestamp: new Date().toISOString(),
        message: 'Server is operational',
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[ping] Error handling ping request:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * POST endpoint for more detailed connectivity testing
 * Accepts a payload and echoes it back to verify data transmission
 */
export async function POST(request: Request) {
  try {
    const data = await request.json();

    return NextResponse.json(
      {
        ok: true,
        timestamp: new Date().toISOString(),
        message: 'Echo response',
        echo: data,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[ping] Error handling ping POST request:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
