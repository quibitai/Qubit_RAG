import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  validateRequest,
  validateData,
  validateRequestSize,
  validateContentType,
} from '../validationService';
import { brainRequestSchema } from '@/lib/validation/brainValidation';

describe('ValidationService', () => {
  describe('validateRequest', () => {
    it('should validate a valid brain request', async () => {
      const validRequest = {
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello, how are you?',
          },
        ],
        id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validRequest),
      });

      const result = await validateRequest(req);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.messages).toHaveLength(1);
    });

    it('should reject invalid JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'invalid json',
      });

      const result = await validateRequest(req);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].code).toBe('INVALID_JSON');
    });

    it('should reject missing required fields', async () => {
      const invalidRequest = {
        messages: [], // Empty messages array
        // Missing id field
      };

      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(invalidRequest),
      });

      const result = await validateRequest(req);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should reject invalid message roles', async () => {
      const invalidRequest = {
        messages: [
          {
            id: 'msg-1',
            role: 'invalid-role',
            content: 'Hello',
          },
        ],
        id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(invalidRequest),
      });

      const result = await validateRequest(req);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject too many messages', async () => {
      const manyMessages = Array.from({ length: 101 }, (_, i) => ({
        id: `msg-${i}`,
        role: 'user',
        content: `Message ${i}`,
      }));

      const invalidRequest = {
        messages: manyMessages,
        id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(invalidRequest),
      });

      const result = await validateRequest(req);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('validateData', () => {
    it('should validate data against a schema', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const validData = { name: 'John', age: 30 };
      const result = validateData(validData, schema);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should reject invalid data', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const invalidData = { name: 'John', age: 'thirty' };
      const result = validateData(invalidData, schema);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('validateRequestSize', () => {
    it('should accept requests within size limit', () => {
      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-length': '1000' },
      });

      const result = validateRequestSize(req);

      expect(result.success).toBe(true);
    });

    it('should reject oversized requests', () => {
      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-length': '52428801' }, // 50MB + 1 byte
      });

      const result = validateRequestSize(req);

      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe('REQUEST_TOO_LARGE');
    });

    it('should accept requests without content-length header', () => {
      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
      });

      const result = validateRequestSize(req);

      expect(result.success).toBe(true);
    });
  });

  describe('validateContentType', () => {
    it('should accept valid JSON content type', () => {
      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });

      const result = validateContentType(req);

      expect(result.success).toBe(true);
    });

    it('should accept JSON with charset', () => {
      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });

      const result = validateContentType(req);

      expect(result.success).toBe(true);
    });

    it('should reject non-JSON content types', () => {
      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
      });

      const result = validateContentType(req);

      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe('INVALID_CONTENT_TYPE');
    });

    it('should reject missing content type', () => {
      const req = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
      });

      const result = validateContentType(req);

      expect(result.success).toBe(false);
      expect(result.errors?.[0].code).toBe('INVALID_CONTENT_TYPE');
    });
  });
});
