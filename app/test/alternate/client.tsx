'use client';

import React, { useState, useEffect } from 'react';
import { testServerAction, testApiServerAction } from '@/app/actions';

export function ClientTest() {
  const [result1, setResult1] = useState<string>('');
  const [result2, setResult2] = useState<string>('');

  useEffect(() => {
    console.log('[CLIENT] Server action check (testServerAction):', {
      isFunction: typeof testServerAction === 'function',
      hasServerRef:
        typeof testServerAction === 'object' &&
        (testServerAction as any)?.__$SERVER_REFERENCE,
      actionId: (testServerAction as any)?.__next_action_id,
    });

    console.log('[CLIENT] Server action check (testApiServerAction):', {
      isFunction: typeof testApiServerAction === 'function',
      hasServerRef:
        typeof testApiServerAction === 'object' &&
        (testApiServerAction as any)?.__$SERVER_REFERENCE,
      actionId: (testApiServerAction as any)?.__next_action_id,
    });
  }, []);

  async function handleTestAction1() {
    try {
      const result = await testServerAction();
      setResult1(JSON.stringify(result, null, 2));
      console.log('[CLIENT] testServerAction result:', result);
    } catch (error) {
      console.error('[CLIENT] testServerAction error:', error);
      setResult1(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function handleTestAction2() {
    try {
      const result = await testApiServerAction();
      setResult2(JSON.stringify(result, null, 2));
      console.log('[CLIENT] testApiServerAction result:', result);
    } catch (error) {
      console.error('[CLIENT] testApiServerAction error:', error);
      setResult2(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="p-4 border rounded">
        <h3 className="font-bold">testServerAction (Client)</h3>
        <button
          type="button"
          onClick={handleTestAction1}
          className="px-3 py-1 bg-blue-500 text-white rounded mt-2"
        >
          Test From Client
        </button>
        {result1 && (
          <pre className="mt-2 p-2 bg-gray-100 text-sm overflow-auto">
            {result1}
          </pre>
        )}
      </div>

      <div className="p-4 border rounded">
        <h3 className="font-bold">testApiServerAction (Client)</h3>
        <button
          type="button"
          onClick={handleTestAction2}
          className="px-3 py-1 bg-blue-500 text-white rounded mt-2"
        >
          Test From Client
        </button>
        {result2 && (
          <pre className="mt-2 p-2 bg-gray-100 text-sm overflow-auto">
            {result2}
          </pre>
        )}
      </div>
    </div>
  );
}
