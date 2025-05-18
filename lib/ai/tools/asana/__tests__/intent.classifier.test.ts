/**
 * Unit tests for intent classifier
 */

import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../intent-parser/intent.classifier';
import { AsanaOperationType } from '../intent-parser/types';

describe('Intent Classifier', () => {
  describe('GET_USER_ME intent', () => {
    it('should classify "who am i" as GET_USER_ME', () => {
      const result = classifyIntent('who am i');
      expect(result).toBe(AsanaOperationType.GET_USER_ME);
    });

    it('should classify "get my user info" as GET_USER_ME', () => {
      const result = classifyIntent('get my user info');
      expect(result).toBe(AsanaOperationType.GET_USER_ME);
    });

    it('should classify "show my asana profile" as GET_USER_ME', () => {
      const result = classifyIntent('show my asana profile');
      expect(result).toBe(AsanaOperationType.GET_USER_ME);
    });
  });

  describe('Unknown intent', () => {
    it('should classify unrecognized queries as UNKNOWN', () => {
      const result = classifyIntent(
        "random text that doesn't match any patterns",
      );
      expect(result).toBe(AsanaOperationType.UNKNOWN);
    });

    it('should classify empty input as UNKNOWN', () => {
      const result = classifyIntent('');
      expect(result).toBe(AsanaOperationType.UNKNOWN);
    });
  });
});
