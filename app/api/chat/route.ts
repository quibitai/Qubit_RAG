// This file forwards requests to the actual route implementation
// to fix routing issues in production deployments

import type { NextRequest } from 'next/server';
import type { UIMessage } from 'ai';
import {
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
  tool,
} from 'ai';
import { z } from 'zod';
import { auth } from '@/app/(auth)/auth';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  getTrailingMessageId,
} from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { listDocuments } from '@/lib/ai/tools/list-documents';
import { retrieveDocument } from '@/lib/ai/tools/retrieve-document';
import { queryDocumentRows } from '@/lib/ai/tools/query-document-rows';
import { tavilySearch } from '@/lib/ai/tools/tavily-search';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const {
      id,
      messages,
      selectedChatModel,
    }: {
      id: string;
      messages: Array<UIMessage>;
      selectedChatModel: string;
    } = await request.json();

    const session = await auth();

    if (!session || !session.user || !session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Get environment variables for n8n integration
    const n8nWebhookUrl = process.env.N8N_RAG_TOOL_WEBHOOK_URL;
    const n8nAuthHeader = process.env.N8N_RAG_TOOL_AUTH_HEADER;
    const n8nAuthToken = process.env.N8N_RAG_TOOL_AUTH_TOKEN;

    if (!n8nWebhookUrl || !n8nAuthHeader || !n8nAuthToken) {
      console.error('Missing n8n configuration environment variables');
      return new Response('Server configuration error', { status: 500 });
    }

    // Define the n8n RAG Tool
    const searchInternalKnowledgeBase = tool({
      description:
        'Search the internal knowledge base (documents stored in Supabase) for information relevant to the user query. Use this for specific questions about internal documents or topics.',
      parameters: z.object({
        query: z
          .string()
          .describe(
            'The specific question or topic to search for in the knowledge base.',
          ),
      }),
      execute: async ({ query }: { query: string }) => {
        console.log(
          `Tool 'searchInternalKnowledgeBase' called with query: ${query}`,
        );

        console.log(`Attempting to fetch n8n webhook at URL: ${n8nWebhookUrl}`);

        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          headers[n8nAuthHeader] = n8nAuthToken;

          const response = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ query: query }),
          });

          if (!response.ok) {
            const errorBody = await response.text();
            console.error(
              `n8n webhook call failed with status ${response.status}: ${errorBody}`,
            );
            throw new Error(`n8n webhook call failed: ${response.statusText}`);
          }

          const resultJson = await response.json();

          // Process resultJson to extract the most useful context for the LLM
          const firstResult = Array.isArray(resultJson)
            ? resultJson[0]
            : resultJson;

          // Check if we have search results using optional chaining
          if (firstResult?.results?.length > 0) {
            const searchResults = firstResult.results.map((result: any) => ({
              title: result.title || 'No title available',
              url: result.url || '',
              content: result.raw_content || 'No content available',
            }));

            // Format the response in a more readable way
            return {
              success: true,
              results: searchResults,
              summary: `Found ${searchResults.length} relevant results for your query.`,
              sources: searchResults.map((r: any) => r.url).join('\n'),
            };
          }

          // If no results found
          return {
            success: true,
            results: [],
            summary:
              'No relevant results found in the knowledge base for your query.',
            sources: [],
          };
        } catch (error) {
          console.error(
            'Error executing searchInternalKnowledgeBase tool:',
            error,
          );
          return {
            error: `Failed to fetch from knowledge base: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    });

    const userMessage = getMostRecentUserMessage(messages);

    if (!userMessage) {
      return new Response('No user message found', { status: 400 });
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message: userMessage,
      });

      await saveChat({ id, userId: session.user.id, title });
    } else {
      if (chat.userId !== session.user.id) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: userMessage.id,
          role: 'user',
          parts: userMessage.parts,
          attachments: userMessage.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel }),
          messages,
          maxSteps: 5,
          experimental_activeTools: [
            'getWeather',
            'createDocument',
            'updateDocument',
            'requestSuggestions',
            'searchInternalKnowledgeBase',
            'listDocuments',
            'retrieveDocument',
            'queryDocumentRows',
            'tavilySearch',
          ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
            searchInternalKnowledgeBase,
            listDocuments,
            retrieveDocument,
            queryDocumentRows,
            tavilySearch,
          },
          onFinish: async ({ response }) => {
            if (session.user?.id) {
              try {
                const assistantId = getTrailingMessageId({
                  messages: response.messages.filter(
                    (message) => message.role === 'assistant',
                  ),
                });

                if (!assistantId) {
                  throw new Error('No assistant message found!');
                }

                const [, assistantMessage] = appendResponseMessages({
                  messages: [userMessage],
                  responseMessages: response.messages,
                });

                await saveMessages({
                  messages: [
                    {
                      id: assistantId,
                      chatId: id,
                      role: assistantMessage.role,
                      parts: assistantMessage.parts,
                      attachments:
                        assistantMessage.experimental_attachments ?? [],
                      createdAt: new Date(),
                    },
                  ],
                });
              } catch (_) {
                console.error('Failed to save chat');
              }
            }
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
          },
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });
  } catch (error) {
    console.error('API error:', error);
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request!', {
      status: 500,
    });
  }
}
