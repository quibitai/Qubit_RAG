import { generateUUID } from '@/lib/utils';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { artifactKinds } from '@/lib/artifacts/server';

const createDocumentSchema = z.object({
  title: z.string().describe('The title for the new document artifact.'),
  kind: z
    .enum(artifactKinds)
    .describe('The type of artifact to create (e.g., text, code).'),
});

export const createDocumentTool = new DynamicStructuredTool({
  name: 'createDocument',
  description:
    'Create a document artifact (e.g., text, code) for writing or content creation activities. The content will be generated based on the title and kind.',
  schema: createDocumentSchema,
  func: async ({ title, kind }) => {
    const id = generateUUID(); // Keep ID generation
    console.log(
      `[createDocumentTool] Called with title: "${title}", kind: "${kind}", generated ID: ${id}`,
    );

    // --- TEMPORARY SIMPLIFICATION to fix build error ---
    // Bypassing actual content generation and streaming for now.
    // TODO: Re-implement content generation and streaming handling in the API route later.

    // Placeholder logic:
    console.log(
      `[createDocumentTool] Placeholder: Simulating creation for ${kind} document "${title}"`,
    );

    // Return the expected final result structure for the agent.
    // The actual content generation and streaming will be handled differently later.
    return {
      id: id,
      title: title,
      kind: kind,
      content: `Placeholder: Document artifact of kind '${kind}' titled '${title}' would be created here (ID: ${id}). Streaming logic needs reimplementation.`,
    };
    // --- END TEMPORARY SIMPLIFICATION ---
  },
});
