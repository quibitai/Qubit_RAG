import { testServerAction, testApiServerAction } from '@/app/actions';
import { ClientTest } from './client';

// This is a server component
export default async function AlternateTestPage() {
  console.log('[SERVER PAGE] Server action types:', {
    testServerAction: typeof testServerAction,
    testApiServerAction: typeof testApiServerAction,
  });

  let serverResult1 = 'Error';
  let serverResult2 = 'Error';

  try {
    const result1 = await testServerAction();
    serverResult1 = JSON.stringify(result1, null, 2);
    console.log('[SERVER PAGE] testServerAction result:', result1);
  } catch (error) {
    console.error('[SERVER PAGE] testServerAction error:', error);
    serverResult1 = String(error);
  }

  try {
    const result2 = await testApiServerAction();
    serverResult2 = JSON.stringify(result2, null, 2);
    console.log('[SERVER PAGE] testApiServerAction result:', result2);
  } catch (error) {
    console.error('[SERVER PAGE] testApiServerAction error:', error);
    serverResult2 = String(error);
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">
        Alternate Server Action Test Page
      </h1>

      <div className="mb-6 p-4 bg-gray-100 rounded">
        <p>This is a server component that tests server actions directly.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="p-4 border rounded">
          <h2 className="font-bold">testServerAction (Server Result)</h2>
          <pre className="mt-2 p-2 bg-gray-100 text-sm overflow-auto">
            {serverResult1}
          </pre>
        </div>

        <div className="p-4 border rounded">
          <h2 className="font-bold">testApiServerAction (Server Result)</h2>
          <pre className="mt-2 p-2 bg-gray-100 text-sm overflow-auto">
            {serverResult2}
          </pre>
        </div>
      </div>

      <div className="border-t pt-6">
        <h2 className="text-xl font-bold mb-4">Client Component Test</h2>
        <ClientTest />
      </div>
    </div>
  );
}
