import { NextResponse } from 'next/server';
import { testServerAction, testApiServerAction } from '@/app/actions';

export async function GET() {
  try {
    console.log('[API Route] Server action info (testServerAction):', {
      type: typeof testServerAction,
      isFunction: typeof testServerAction === 'function',
      hasServerRef:
        testServerAction &&
        typeof testServerAction === 'object' &&
        '__$SERVER_REFERENCE' in testServerAction,
      actionId:
        testServerAction &&
        typeof testServerAction === 'object' &&
        '__next_action_id' in testServerAction
          ? (testServerAction as any).__next_action_id
          : undefined,
    });

    console.log('[API Route] Server action info (testApiServerAction):', {
      type: typeof testApiServerAction,
      isFunction: typeof testApiServerAction === 'function',
      hasServerRef:
        testApiServerAction &&
        typeof testApiServerAction === 'object' &&
        '__$SERVER_REFERENCE' in testApiServerAction,
      actionId:
        testApiServerAction &&
        typeof testApiServerAction === 'object' &&
        '__next_action_id' in testApiServerAction
          ? (testApiServerAction as any).__next_action_id
          : undefined,
    });

    // Try to call the server actions directly from server code (should work)
    const result1 = await testServerAction();
    console.log('[API Route] testServerAction result:', result1);

    const result2 = await testApiServerAction();
    console.log('[API Route] testApiServerAction result:', result2);

    return NextResponse.json({
      success: true,
      message: 'API route works',
      testServerAction: {
        type: typeof testServerAction,
        isFunction: typeof testServerAction === 'function',
        result: result1,
      },
      testApiServerAction: {
        type: typeof testApiServerAction,
        isFunction: typeof testApiServerAction === 'function',
        result: result2,
      },
    });
  } catch (error) {
    console.error('[API Route] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
