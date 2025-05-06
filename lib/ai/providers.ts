import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.test';

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'global-orchestrator': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : customProvider({
      languageModels: {
        'chat-model': openai('gpt-4.1-mini'),
        'global-orchestrator': wrapLanguageModel({
          model: openai('gpt-4.1'),
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        'echo-tango-specialist': openai('gpt-4.1-mini'),
        'title-model': openai('gpt-4.1-mini'),
        'artifact-model': openai('gpt-4.1-mini'),
      },
      imageModels: {
        'small-model': openai.image('dall-e-3'),
      },
    });
