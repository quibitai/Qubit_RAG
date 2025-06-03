'use client';

import { useChat } from '@ai-sdk/react';

export default function TestStreamPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: '/api/test-stream',
      streamProtocol: 'data',
      onError: (err) => {
        console.error('🚨 [TestStream useChat Error]', err);
      },
      onResponse: (response) => {
        console.log('📡 [TestStream Response]', {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          contentType: response.headers.get('content-type'),
          dataStream: response.headers.get('x-vercel-ai-data-stream'),
        });
      },
      onFinish: (message) => {
        console.log('✅ [TestStream Finish]', message);
      },
    });

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Streaming Test Page</h1>

      <div className="space-y-4">
        {/* Messages */}
        <div className="min-h-[200px] border rounded-lg p-4 space-y-2">
          {messages.length === 0 && (
            <p className="text-gray-500">
              No messages yet. Click "Test Streaming" to start.
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`p-2 rounded ${
                message.role === 'user' ? 'bg-blue-100' : 'bg-gray-100'
              }`}
            >
              <strong>{message.role}:</strong> {message.content}
            </div>
          ))}
          {isLoading && <div className="text-blue-600">🔄 Streaming...</div>}
          {error && (
            <div className="text-red-600">❌ Error: {error.message}</div>
          )}
        </div>

        {/* Test Button */}
        <button
          type="button"
          onClick={() =>
            handleSubmit(new Event('submit') as any, {
              data: { testMessage: 'test' },
            })
          }
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? 'Streaming...' : 'Test Streaming'}
        </button>

        <div className="text-sm text-gray-600">
          <p>This page tests basic Vercel AI SDK streaming functionality.</p>
          <p>Check the browser console for detailed logs.</p>
        </div>
      </div>
    </div>
  );
}
