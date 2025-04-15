// This file forwards requests to the actual route implementation
// to fix routing issues in production deployments

import type { NextRequest } from 'next/server';
import type { UIMessage } from 'ai';
import {
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
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
import { searchInternalKnowledgeBase } from '@/lib/ai/tools/search-internal-knowledge-base';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const {
      id,
      messages,
      selectedChatModel,
      experimental_attachments = [], // Extract attachments from the request
    }: {
      id: string;
      messages: Array<UIMessage>;
      selectedChatModel: string;
      experimental_attachments?: Array<{
        url: string;
        name: string;
        contentType: string;
      }>;
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

    // Process file attachments if they exist
    const contextFileContents = [];
    if (experimental_attachments.length > 0) {
      console.log(
        `Processing ${experimental_attachments.length} attached files for context`,
      );

      // Fetch content for each file
      for (const file of experimental_attachments) {
        try {
          console.log(`Fetching content for file: ${file.name} (${file.url})`);

          // Fetch the file content directly
          const response = await fetch(file.url);
          if (!response.ok) {
            console.error(
              `Failed to fetch file content: ${file.name}, status: ${response.status}`,
            );
            continue;
          }

          // Get content as text (works for most file types we'd want to use as context)
          let content = '';
          const contentType = file.contentType.toLowerCase();

          if (
            contentType.includes('text') ||
            contentType.includes('json') ||
            contentType.includes('javascript') ||
            contentType.includes('csv') ||
            contentType.includes('md')
          ) {
            content = await response.text();

            // Truncate very large text files to avoid context overflow
            if (content.length > 100000) {
              content = `${content.substring(0, 100000)}... [content truncated due to length]`;
            }
          } else {
            // For non-text files, just note the type
            content = `[Binary file of type: ${file.contentType}]`;
          }

          contextFileContents.push({
            name: file.name,
            content,
          });

          console.log(`Successfully fetched content for file: ${file.name}`);
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);
        }
      }
    }

    // Create a modified system prompt with file context if needed
    let systemPromptWithContext = systemPrompt({ selectedChatModel });

    // Add file context to the system prompt if we have any
    if (contextFileContents.length > 0) {
      console.log('Injecting file context into system prompt');

      const fileContextString = `
--- User Uploaded Reference Files ---
${contextFileContents.map((f) => `File: ${f.name}\nContent:\n${f.content}\n---\n`).join('')}
--- End of Reference Files ---

Use the above files as reference material when answering the user's questions. If the information in the files is relevant to the question, be sure to incorporate that information in your response.
`;

      // Append the file context to the system prompt
      systemPromptWithContext = `${systemPromptWithContext}\n\n${fileContextString}`;
    }

    return createDataStreamResponse({
      execute: (dataStream) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPromptWithContext, // Use the enhanced system prompt with context
          messages,
          maxSteps: 5,
          experimental_activeTools: [
            'searchInternalKnowledgeBase',
            'listDocuments',
            'retrieveDocument',
            'queryDocumentRows',
            'tavilySearch',
            'getWeather',
            'createDocument',
            'updateDocument',
            'requestSuggestions',
          ],
          experimental_transform: smoothStream({ chunking: 'word' }),
          experimental_generateMessageId: generateUUID,
          tools: {
            searchInternalKnowledgeBase,
            listDocuments,
            retrieveDocument,
            queryDocumentRows,
            tavilySearch,
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({ session, dataStream }),
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
