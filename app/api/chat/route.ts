import { openai } from '@ai-sdk/openai';
import { streamText, generateText } from 'ai';
import { auth } from '@/app/(auth)/auth';
import { artifactTools } from '@/lib/ai/tools/artifacts';
import { saveDocument, getDocumentById } from '@/lib/db/queries';

// Generate content prompts based on artifact type
function getContentPrompt(kind: string, title: string, contentPrompt?: string) {
  const basePrompt =
    contentPrompt || `Create a ${kind} artifact with the title: ${title}`;

  switch (kind) {
    case 'text':
      return `Write a comprehensive, well-structured document about: ${basePrompt}. 
      Use markdown formatting with headers (## ### ####), bullet points (- or *), and proper structure. 
      Make it informative and engaging. Include multiple sections with clear headings.
      DO NOT include the main title "${title}" as the first header - start with section headers.`;

    case 'code':
      return `Write clean, well-commented code for: ${basePrompt}. 
      Include appropriate imports, error handling, and follow best practices. 
      Return only the code without explanations.`;

    case 'sheet':
      return `Create a well-structured CSV data sheet for: ${basePrompt}. 
      Include clear headers and realistic sample data. 
      Use proper CSV formatting with commas as separators.`;

    case 'image':
      return `Create a detailed description of an image: ${basePrompt}`;

    default:
      return basePrompt;
  }
}

export async function POST(req: Request) {
  try {
    // Get authentication
    const session = await auth();
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Parse request body
    const { messages, artifactContext } = await req.json();

    // Build enhanced system prompt with artifact context
    let systemPrompt = `You are a helpful AI assistant that automatically creates artifacts for substantial content.

AUTOMATIC ARTIFACT CREATION: You should automatically use the createArtifact tool when:
- User requests would result in content longer than 100 words
- User asks for code, documents, guides, tutorials, or data
- User uses words like: "create", "write", "generate", "make", "build", "design"
- The response would be better displayed as a formatted document rather than chat text

ALWAYS use createArtifact for:
- Documents, articles, essays, guides, tutorials
- Code snippets, functions, scripts, configurations
- Data tables, CSV files, spreadsheets
- Image descriptions or generation prompts
- Any structured content that benefits from formatting

Examples of automatic artifact creation:
- "Tell me about renewable energy" → Create text artifact (substantial content)
- "How do I sort an array in Python?" → Create code artifact (code example)
- "What are the benefits of exercise?" → Create text artifact (comprehensive guide)
- "Show me employee data" → Create sheet artifact (data table)

When you create an artifact, respond briefly like: "I'll create a comprehensive document about [topic] for you." Then let the tool generate the content.

For simple questions or short answers (< 100 words), respond normally without artifacts.`;

    // Add artifact context if available
    if (artifactContext?.documentId) {
      systemPrompt += `

CURRENT ARTIFACT CONTEXT:
You are currently working with an artifact:
- ID: ${artifactContext.documentId}
- Title: "${artifactContext.title}"
- Type: ${artifactContext.kind}
- Content: "${artifactContext.content.substring(0, 1000)}${artifactContext.content.length > 1000 ? '...' : ''}"

When the user asks to modify, edit, update, or change this artifact, use the updateArtifact tool with the artifact ID above. 
When they ask for changes like "make the title shorter", "add final polish", "improve this", etc., they are referring to this current artifact.
Always reference the current artifact content when making modifications.`;
    }

    // Stream response with tools
    const result = streamText({
      model: openai('gpt-4'),
      messages,
      tools: artifactTools,
      maxSteps: 5,
      system: systemPrompt,

      // Handle tool results and generate streaming content
      onStepFinish: async ({ stepType, toolCalls, toolResults }) => {
        console.log(
          '[API] onStepFinish called with stepType:',
          stepType,
          'toolCalls:',
          toolCalls?.length || 0,
        );

        if (
          stepType === 'tool-result' &&
          toolCalls &&
          toolResults &&
          session?.user?.id
        ) {
          for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i];
            const toolResult = toolResults[i];

            console.log(
              '[API] Processing tool call:',
              toolCall.toolName,
              'with result:',
              toolResult.result,
            );

            if (toolCall.toolName === 'createArtifact' && toolResult.result) {
              try {
                const result = toolResult.result as any;

                console.log(
                  '[API] Creating artifact with action:',
                  result.action,
                );

                if (result.action === 'create_artifact') {
                  console.log(
                    '[API] Generating content for artifact:',
                    result.id,
                  );

                  // Generate content for the artifact
                  const contentPrompt = getContentPrompt(
                    result.kind,
                    result.title,
                    result.contentPrompt,
                  );

                  const contentResult = await generateText({
                    model: openai('gpt-4'),
                    prompt: contentPrompt,
                  });

                  console.log(
                    '[API] Generated content length:',
                    contentResult.text.length,
                  );

                  // Save the complete artifact to database
                  await saveDocument({
                    id: result.id,
                    title: result.title,
                    content: contentResult.text,
                    kind: result.kind,
                    userId: session.user.id,
                  });

                  console.log(
                    `[API] Artifact ${result.id} created and saved to database successfully`,
                  );
                } else {
                  console.log(
                    '[API] Skipping artifact - no create_artifact action',
                  );
                }
              } catch (error) {
                console.error('[API] Failed to create artifact:', error);
              }
            }

            if (toolCall.toolName === 'updateArtifact' && toolResult.result) {
              try {
                const result = toolResult.result as any;
                // Get existing document to preserve metadata
                const existingDoc = await getDocumentById({ id: result.id });
                if (existingDoc && existingDoc.userId === session.user.id) {
                  await saveDocument({
                    id: result.id,
                    title: existingDoc.title,
                    content: result.content,
                    kind: existingDoc.kind,
                    userId: session.user.id,
                  });
                  console.log(
                    `[API] Artifact ${result.id} updated in database`,
                  );
                }
              } catch (error) {
                console.error(
                  '[API] Failed to update artifact in database:',
                  error,
                );
              }
            }
          }
        } else {
          console.log(
            '[API] onStepFinish called but no tool results to process. stepType:',
            stepType,
          );
        }
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
