/**
 * MessageService Unit Tests
 *
 * Testing Milestone 3: Message processing tests
 * - Message processing tests
 * - Context handling tests
 * - Integration test with existing tools
 * - Memory leak testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MessageService,
  createMessageService,
  convertMessagesToLangChain,
  convertMessagesToStreaming,
  type UIMessage,
} from '../messageService';
import type { RequestLogger } from '../observabilityService';
import type { BrainRequest } from '@/lib/validation/brainValidation';

// Mock logger
const mockLogger: RequestLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  correlationId: 'test-correlation-id',
  startTime: Date.now(),
  logTokenUsage: vi.fn(),
  logPerformanceMetrics: vi.fn(),
  finalize: vi.fn().mockReturnValue({
    correlationId: 'test-correlation-id',
    duration: 100,
    success: true,
    events: [],
  }),
};

describe('MessageService', () => {
  let messageService: MessageService;

  beforeEach(() => {
    vi.clearAllMocks();
    messageService = new MessageService(mockLogger);
  });

  describe('convertToLangChainFormat', () => {
    it('should convert UI messages to LangChain format', () => {
      const uiMessages: UIMessage[] = [
        { id: '1', role: 'system', content: 'You are a helpful assistant' },
        { id: '2', role: 'user', content: 'Hello' },
        { id: '3', role: 'assistant', content: 'Hi there!' },
        { id: '4', role: 'user', content: 'How are you?' },
      ];

      const result = messageService.convertToLangChainFormat(uiMessages);

      // Should exclude the last message (current user input)
      expect(result).toHaveLength(3);
      expect(result).toEqual([
        { type: 'system', content: 'You are a helpful assistant' },
        { type: 'human', content: 'Hello' },
        { type: 'ai', content: 'Hi there!' },
      ]);
    });

    it('should handle empty messages array', () => {
      const result = messageService.convertToLangChainFormat([]);
      expect(result).toEqual([]);
    });

    it('should sanitize message content', () => {
      const uiMessages: UIMessage[] = [
        { id: '1', role: 'user', content: '  Hello world  \r\n' },
        { id: '2', role: 'assistant', content: 'Response' },
      ];

      const result = messageService.convertToLangChainFormat(uiMessages);
      expect(result[0].content).toBe('Hello world');
    });
  });

  describe('convertToStreamingFormat', () => {
    it('should convert UI messages to streaming format', () => {
      const uiMessages: UIMessage[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi there!' },
      ];

      const result = messageService.convertToStreamingFormat(uiMessages);

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });
  });

  describe('extractUserInput', () => {
    it('should extract user input from last message', () => {
      const brainRequest: Partial<BrainRequest> = {
        messages: [
          { id: '1', role: 'user', content: 'Hello' },
          { id: '2', role: 'assistant', content: 'Hi' },
          { id: '3', role: 'user', content: 'How are you?' },
        ],
      };

      const result = messageService.extractUserInput(
        brainRequest as BrainRequest,
      );
      expect(result).toBe('How are you?');
    });

    it('should return empty string if no messages', () => {
      const brainRequest: Partial<BrainRequest> = { messages: [] };
      const result = messageService.extractUserInput(
        brainRequest as BrainRequest,
      );
      expect(result).toBe('');
    });

    it('should sanitize user input', () => {
      const brainRequest: Partial<BrainRequest> = {
        messages: [{ id: '1', role: 'user', content: '  Hello world  \r\n\r' }],
      };

      const result = messageService.extractUserInput(
        brainRequest as BrainRequest,
      );
      expect(result).toBe('Hello world');
    });
  });

  describe('processAttachments', () => {
    it('should extract attachments from messages', () => {
      const brainRequest: Partial<BrainRequest> = {
        messages: [
          {
            id: '1',
            role: 'user',
            content: 'Hello',
            attachments: [
              {
                name: 'file1.txt',
                contentType: 'text/plain',
                size: 100,
                url: 'url1',
              },
            ],
          },
          {
            id: '2',
            role: 'user',
            content: 'World',
            experimental_attachments: [
              {
                name: 'file2.txt',
                contentType: 'text/plain',
                size: 200,
                url: 'url2',
              },
            ],
          },
        ],
      };

      const result = messageService.processAttachments(
        brainRequest as BrainRequest,
      );
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('file1.txt');
      expect(result[1].name).toBe('file2.txt');
    });

    it('should handle messages without attachments', () => {
      const brainRequest: Partial<BrainRequest> = {
        messages: [{ id: '1', role: 'user', content: 'Hello' }],
      };

      const result = messageService.processAttachments(
        brainRequest as BrainRequest,
      );
      expect(result).toEqual([]);
    });
  });

  describe('validateMessages', () => {
    it('should validate correct messages', () => {
      const messages: UIMessage[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi there!' },
      ];

      const result = messageService.validateMessages(messages);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect invalid role', () => {
      const messages: UIMessage[] = [
        { id: '1', role: 'invalid' as any, content: 'Hello' },
      ];

      const result = messageService.validateMessages(messages);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Message 0: Invalid role');
    });

    it('should detect missing content', () => {
      const messages: UIMessage[] = [{ id: '1', role: 'user', content: '' }];

      const result = messageService.validateMessages(messages);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Message 0: Content must be a non-empty string',
      );
    });

    it('should detect content exceeding max length', () => {
      const longContent = 'a'.repeat(60000);
      const messageService = new MessageService(mockLogger, {
        maxContentLength: 50000,
      });
      const messages: UIMessage[] = [
        { id: '1', role: 'user', content: longContent },
      ];

      const result = messageService.validateMessages(messages);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Message 0: Content exceeds maximum length',
      );
    });

    it('should reject non-array input', () => {
      const result = messageService.validateMessages({} as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Messages must be an array');
    });

    it('should reject empty array', () => {
      const result = messageService.validateMessages([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one message is required');
    });
  });

  describe('content sanitization', () => {
    it('should sanitize content when enabled', () => {
      const messageService = new MessageService(mockLogger, {
        sanitizeContent: true,
      });
      const messages: UIMessage[] = [
        { id: '1', role: 'user', content: '  Hello\r\nWorld\r  ' },
      ];

      const result = messageService.convertToStreamingFormat(messages);
      expect(result[0].content).toBe('Hello\nWorld');
    });

    it('should not sanitize content when disabled', () => {
      const messageService = new MessageService(mockLogger, {
        sanitizeContent: false,
      });
      const messages: UIMessage[] = [
        { id: '1', role: 'user', content: '  Hello\r\nWorld\r  ' },
      ];

      const result = messageService.convertToStreamingFormat(messages);
      expect(result[0].content).toBe('  Hello\r\nWorld\r  ');
    });

    it('should enforce max length during sanitization', () => {
      const messageService = new MessageService(mockLogger, {
        maxContentLength: 10,
      });
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'This is a very long message that exceeds the limit',
        },
      ];

      const result = messageService.convertToStreamingFormat(messages);
      expect(result[0].content).toHaveLength(10);
    });
  });

  describe('convenience functions', () => {
    it('should create MessageService with createMessageService', () => {
      const service = createMessageService(mockLogger);
      expect(service).toBeInstanceOf(MessageService);
    });

    it('should convert messages with utility functions', () => {
      const messages: UIMessage[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi' },
      ];

      const langchainResult = convertMessagesToLangChain(messages, mockLogger);
      const streamingResult = convertMessagesToStreaming(messages, mockLogger);

      expect(langchainResult).toHaveLength(1); // Excludes last message
      expect(streamingResult).toHaveLength(2); // Includes all messages
    });
  });

  describe('logging', () => {
    it('should log message conversions', () => {
      const messages: UIMessage[] = [
        { id: '1', role: 'user', content: 'Hello' },
      ];

      messageService.convertToLangChainFormat(messages);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Converting messages to LangChain format',
        { messageCount: 1 },
      );
    });

    it('should log user input extraction', () => {
      const brainRequest: Partial<BrainRequest> = {
        messages: [{ id: '1', role: 'user', content: 'Hello' }],
      };

      messageService.extractUserInput(brainRequest as BrainRequest);

      expect(mockLogger.info).toHaveBeenCalledWith('Extracted user input', {
        inputLength: 5,
        hasInput: true,
      });
    });

    it('should log attachment processing', () => {
      const brainRequest: Partial<BrainRequest> = {
        messages: [{ id: '1', role: 'user', content: 'Hello' }],
      };

      messageService.processAttachments(brainRequest as BrainRequest);

      expect(mockLogger.info).toHaveBeenCalledWith('Processed attachments', {
        attachmentCount: 0,
      });
    });
  });
});
