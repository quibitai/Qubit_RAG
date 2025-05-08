import type { SpecialistConfig } from './template';

// This is a placeholder for the Echo Tango specialist persona prompt
// Will be fully implemented in Phase 3
const echoTangoPersonaPrompt = `
# ROLE: Echo Tango Specialist (Placeholder)
You are Echo Tango's AI Brand Voice, a creative agency known for captivating brand stories.

This is a placeholder that will be expanded in Phase 3 of the implementation.
`;

// Export the Echo Tango specialist configuration
export const echoTangoConfig: SpecialistConfig = {
  id: 'echo-tango-specialist',
  name: 'Echo Tango',
  description: 'Creative agency brand voice specialist',
  persona: echoTangoPersonaPrompt,
  defaultTools: [
    'searchInternalKnowledgeBase',
    'getFileContents',
    'listDocuments',
    'tavilySearch',
    'createDocument',
    'updateDocument',
  ],
};

// Export the prompt directly for testing
export const echoTangoPrompt = echoTangoConfig.persona;
