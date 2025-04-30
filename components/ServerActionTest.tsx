'use client';

import React, { useEffect } from 'react';
import { testServerAction } from '@/app/actions';

export function ServerActionTest() {
  useEffect(() => {
    console.log('[TEST] Server action check:', {
      isFunction: typeof testServerAction === 'function',
      hasServerRef:
        typeof testServerAction === 'object' &&
        (testServerAction as any)?.__$SERVER_REFERENCE,
      serverActionId: (testServerAction as any).__next_action_id,
    });
  }, []);

  const handleTest = async () => {
    try {
      const result = await testServerAction();
      console.log('[TEST] Server action result:', result);
    } catch (error) {
      console.error('[TEST] Server action error:', error);
    }
  };

  return (
    <div className="p-4 border rounded mb-4">
      <h2 className="font-bold">Server Action Test</h2>
      <button
        onClick={handleTest}
        className="px-3 py-1 bg-blue-500 text-white rounded mt-2"
      >
        Test Server Action
      </button>
    </div>
  );
}
