'use client';

import { useChat } from '@ai-sdk/react';
import { ArtifactRenderer } from '@/components/artifacts/artifact-renderer';
import { useState, useEffect } from 'react';

export default function TestArtifacts() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    isLoading,
  } = useChat({
    api: '/api/chat',
    maxSteps: 5,
  });

  // Track the current active artifact
  const [activeArtifact, setActiveArtifact] = useState<any>(null);
  const [artifactContent, setArtifactContent] = useState<Record<string, any>>(
    {},
  );

  // Create custom handleSubmit that includes artifact context
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Get current artifact context
    let artifactContext = null;
    if (activeArtifact && artifactContent[activeArtifact.id]) {
      const content = artifactContent[activeArtifact.id];
      artifactContext = {
        documentId: activeArtifact.id,
        title: activeArtifact.title,
        kind: activeArtifact.kind,
        content: content.content || '',
      };
    }

    // Call original handleSubmit with artifact context
    originalHandleSubmit(e, {
      body: {
        artifactContext,
      },
    });
  };

  // Extract artifacts from messages
  const artifacts = messages.flatMap(
    (message) =>
      message.toolInvocations
        ?.filter(
          (tool) =>
            tool.toolName === 'createArtifact' && tool.state === 'result',
        )
        .map((tool) => (tool as any).result) || [],
  );

  // Fetch content for artifacts that have been created
  useEffect(() => {
    const fetchArtifactContent = async (artifactId: string, retryCount = 0) => {
      try {
        console.log(
          `[Frontend] Fetching content for artifact ${artifactId}, attempt ${retryCount + 1}`,
        );
        const response = await fetch(`/api/document?id=${artifactId}`);

        if (response.ok) {
          const documents = await response.json();
          if (documents && documents.length > 0) {
            const document = documents[0];
            console.log(
              `[Frontend] Successfully fetched content for ${artifactId}`,
            );
            setArtifactContent((prev) => ({
              ...prev,
              [artifactId]: {
                ...document,
                status: 'created',
              },
            }));
            return true; // Success
          }
        }

        // If not found and we haven't retried too many times, retry
        if (response.status === 404 && retryCount < 5) {
          console.log(
            `[Frontend] Document not found, retrying in ${(retryCount + 1) * 2} seconds...`,
          );
          setTimeout(
            () => {
              fetchArtifactContent(artifactId, retryCount + 1);
            },
            (retryCount + 1) * 2000,
          ); // Exponential backoff: 2s, 4s, 6s, 8s, 10s
        } else {
          console.error(
            `[Frontend] Failed to fetch artifact after ${retryCount + 1} attempts`,
          );
          // Mark as failed
          setArtifactContent((prev) => ({
            ...prev,
            [artifactId]: {
              id: artifactId,
              content: 'Failed to load content. Please try refreshing.',
              status: 'error',
            },
          }));
        }
      } catch (error) {
        console.error('[Frontend] Error fetching artifact content:', error);
        if (retryCount < 3) {
          setTimeout(
            () => {
              fetchArtifactContent(artifactId, retryCount + 1);
            },
            (retryCount + 1) * 2000,
          );
        }
      }
      return false; // Failed
    };

    // Check for artifacts that need content fetching
    artifacts.forEach((artifact) => {
      if (
        artifact.action === 'create_artifact' &&
        !artifactContent[artifact.id]
      ) {
        console.log(`[Frontend] New artifact detected: ${artifact.id}`);

        // Set initial streaming state
        setArtifactContent((prev) => ({
          ...prev,
          [artifact.id]: {
            ...artifact,
            content: 'Generating content...',
            status: 'streaming',
          },
        }));

        // Start fetching after a delay to allow backend processing
        setTimeout(() => {
          fetchArtifactContent(artifact.id);
        }, 3000); // Wait 3 seconds before first attempt
      }
    });
  }, [artifacts]);

  // Set the most recent artifact as active
  const latestArtifact = artifacts[artifacts.length - 1];
  if (latestArtifact && latestArtifact !== activeArtifact) {
    setActiveArtifact(latestArtifact);
  }

  // Get the display artifact (with content from database if available)
  const getDisplayArtifact = (artifact: any) => {
    const contentData = artifactContent[artifact.id];
    if (contentData) {
      return {
        ...artifact,
        ...contentData,
        timestamp: artifact.timestamp || contentData.timestamp,
      };
    }
    return {
      ...artifact,
      content: 'Generating content...',
      status: 'streaming',
    };
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Panel - Chat */}
      <div className="w-1/2 flex flex-col border-r border-gray-200 bg-white">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-semibold">AI Assistant</h1>
          <p className="text-sm text-gray-600">
            Create and edit artifacts with AI
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-gray-500 text-center py-8">
              <div className="mb-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="font-medium mb-2">Create your first artifact</h3>
                <p className="text-sm">Try asking me to create:</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="bg-gray-100 rounded-lg p-3 text-left">
                  "Create a comprehensive guide about machine learning"
                </div>
                <div className="bg-gray-100 rounded-lg p-3 text-left">
                  "Write a Python function to sort a list"
                </div>
                <div className="bg-gray-100 rounded-lg p-3 text-left">
                  "Create a CSV with employee data"
                </div>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className="space-y-3">
              {/* Message content */}
              <div
                className={`p-3 rounded-lg max-w-[80%] ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white ml-auto'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className="text-sm">{message.content}</div>
              </div>

              {/* Tool invocations */}
              {message.toolInvocations?.map((toolInvocation) => (
                <div key={toolInvocation.toolCallId} className="ml-4">
                  {toolInvocation.toolName === 'createArtifact' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      {toolInvocation.state === 'call' && (
                        <div className="text-blue-700 text-sm flex items-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2" />
                          Creating {toolInvocation.args.kind} artifact: "
                          {toolInvocation.args.title}"...
                        </div>
                      )}

                      {toolInvocation.state === 'result' && (
                        <div className="text-blue-700 text-sm flex items-center justify-between">
                          <div className="flex items-center">
                            <svg
                              className="w-4 h-4 text-green-600 mr-2"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            Created "{toolInvocation.result.title}"
                            {artifactContent[toolInvocation.result.id]
                              ?.status === 'streaming' && (
                              <span className="ml-2 text-yellow-600">
                                (Generating content...)
                              </span>
                            )}
                            {artifactContent[toolInvocation.result.id]
                              ?.status === 'error' && (
                              <span className="ml-2 text-red-600">
                                (Failed to load)
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setActiveArtifact(toolInvocation.result)
                            }
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            View →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {isLoading && (
            <div className="text-gray-500 text-center py-4">
              <div className="inline-flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2" />
                Thinking...
              </div>
            </div>
          )}
        </div>

        {/* Input form */}
        <div className="p-4 border-t border-gray-200">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              value={input}
              onChange={handleInputChange}
              placeholder="Ask me to create an artifact..."
              className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* Right Panel - Artifact Preview */}
      <div className="w-1/2 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">
            {activeArtifact ? activeArtifact.title : 'Artifact Preview'}
          </h2>
          {activeArtifact && (
            <p className="text-sm text-gray-600 capitalize">
              {activeArtifact.kind} • Created{' '}
              {new Date(activeArtifact.timestamp).toLocaleTimeString()}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeArtifact ? (
            <div className="h-full">
              <ArtifactRenderer artifact={getDisplayArtifact(activeArtifact)} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-12 h-12 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium mb-2">
                  No artifact selected
                </h3>
                <p className="text-sm">Create an artifact to see it here</p>
              </div>
            </div>
          )}
        </div>

        {/* Artifact Actions */}
        {activeArtifact && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Edit
              </button>
              <button
                type="button"
                className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Download
              </button>
              <button
                type="button"
                className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Share
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
