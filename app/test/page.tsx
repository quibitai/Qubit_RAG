'use client';

import React from 'react';
import { testServerAction, formAction } from '@/app/actions';

export default function TestPage() {
  const [result, setResult] = React.useState<string>('');

  React.useEffect(() => {
    console.log('[TEST PAGE] Server action check:', {
      isFunction: typeof testServerAction === 'function',
      hasServerRef:
        typeof testServerAction === 'object' &&
        (testServerAction as any)?.__$SERVER_REFERENCE,
      actionId: (testServerAction as any)?.__next_action_id,
      fullObject: testServerAction,
    });
  }, []);

  async function handleButtonClick() {
    try {
      const res = await testServerAction();
      setResult(JSON.stringify(res, null, 2));
      console.log('[TEST PAGE] Server action result:', res);
    } catch (error) {
      console.error('[TEST PAGE] Server action error:', error);
      setResult(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Server Action Test Page</h1>

      <div className="mb-6 p-4 bg-gray-100 rounded">
        <p>This page tests if server actions are working correctly.</p>
      </div>

      <div className="mb-6">
        <button
          type="button"
          onClick={handleButtonClick}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Test Server Action
        </button>
      </div>

      {result && (
        <div className="p-4 bg-gray-100 rounded">
          <h2 className="font-bold mb-2">Result:</h2>
          <pre className="whitespace-pre-wrap">{result}</pre>
        </div>
      )}

      <div className="mt-8 border-t pt-4">
        <h2 className="font-bold mb-2">Form-based Server Action Test</h2>
        <form action={formAction}>
          <button
            type="submit"
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Test Form Action
          </button>
        </form>
      </div>
    </div>
  );
}
