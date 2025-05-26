import { tool } from 'ai';
import { z } from 'zod';
import { generateUUID } from '@/lib/utils';
import { saveDocument } from '@/lib/db/queries';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

// Define artifact kinds
export const artifactKinds = ['text', 'code', 'image', 'sheet'] as const;
export type ArtifactKind = (typeof artifactKinds)[number];

// Schema for creating artifacts
const createArtifactSchema = z.object({
  title: z.string().describe('The title for the artifact'),
  kind: z.enum(artifactKinds).describe('The type of artifact to create'),
  contentPrompt: z
    .string()
    .optional()
    .describe('Optional prompt to generate content for the artifact'),
});

// Schema for updating artifacts
const updateArtifactSchema = z.object({
  id: z.string().describe('The ID of the artifact to update'),
  content: z.string().describe('The updated content of the artifact'),
  description: z.string().describe('Description of what was changed'),
});

/**
 * Generate content based on artifact type and prompt
 */
async function generateArtifactContent(
  kind: ArtifactKind,
  title: string,
  contentPrompt?: string,
): Promise<string> {
  const basePrompt =
    contentPrompt || `Create a ${kind} artifact with the title: ${title}`;

  switch (kind) {
    case 'text': {
      const result = await generateText({
        model: openai('gpt-4'),
        prompt: `Write a comprehensive, well-structured document about: ${basePrompt}. 
        Use markdown formatting with headers, bullet points, and proper structure. 
        Make it informative and engaging.`,
      });
      return result.text;
    }

    case 'code': {
      const result = await generateText({
        model: openai('gpt-4'),
        prompt: `Write clean, well-commented code for: ${basePrompt}. 
        Include appropriate imports, error handling, and follow best practices. 
        Return only the code without explanations.`,
      });
      return result.text;
    }

    case 'sheet': {
      const result = await generateText({
        model: openai('gpt-4'),
        prompt: `Create a well-structured CSV data sheet for: ${basePrompt}. 
        Include clear headers and realistic sample data. 
        Use proper CSV formatting with commas as separators.`,
      });
      return result.text;
    }

    case 'image':
      return `A detailed description of an image: ${basePrompt}`;

    default:
      return basePrompt;
  }
}

/**
 * Tool for creating new artifacts - returns metadata only
 * The actual content generation will be handled by the main chat stream
 */
export const createArtifactTool = tool({
  description:
    'Create a new artifact when users request substantial content like documents, code, data sheets, or image descriptions. Use this tool for ANY request to create, write, generate, or make content that would be longer than a few sentences.',
  parameters: createArtifactSchema,
  execute: async ({ title, kind, contentPrompt }) => {
    const id = generateUUID();

    console.log(
      `[TOOL] createArtifact called with title: "${title}", kind: "${kind}"`,
    );

    // Return artifact metadata - content will be streamed separately
    return {
      id,
      title,
      kind,
      contentPrompt:
        contentPrompt || `Create a ${kind} artifact with the title: ${title}`,
      status: 'streaming',
      timestamp: new Date().toISOString(),
      action: 'create_artifact', // Signal to the chat handler
    };
  },
});

/**
 * Tool for updating existing artifacts
 */
export const updateArtifactTool = tool({
  description:
    'Update an existing artifact with new content when users request changes to previously created artifacts',
  parameters: updateArtifactSchema,
  execute: async ({ id, content, description }) => {
    console.log(`[TOOL] updateArtifact called for artifact: ${id}`);

    return {
      id,
      content,
      description,
      status: 'updated',
      timestamp: new Date().toISOString(),
      action: 'update_artifact',
    };
  },
});

// Export tools for use in the main tools array
export const artifactTools = {
  createArtifact: createArtifactTool,
  updateArtifact: updateArtifactTool,
};
