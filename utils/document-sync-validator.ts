/**
 * Document synchronization validation utilities
 * These help diagnose issues with document content synchronization between the editor and database
 */

/**
 * Calculate the difference between two document contents
 */
export function calculateContentDiff(
  content1: string,
  content2: string,
): {
  diffLength: number;
  diffPercentage: number;
  diffLocations: Array<{
    position: number;
    content1Char: string;
    content2Char: string;
  }>;
} {
  const maxDiffLocations = 10; // Maximum number of diff locations to return
  const diffLocations: Array<{
    position: number;
    content1Char: string;
    content2Char: string;
  }> = [];

  let diffCount = 0;
  const maxLength = Math.max(content1.length, content2.length);

  // Find specific differences
  for (let i = 0; i < maxLength; i++) {
    const char1 = i < content1.length ? content1[i] : null;
    const char2 = i < content2.length ? content2[i] : null;

    if (char1 !== char2) {
      diffCount++;

      if (diffLocations.length < maxDiffLocations) {
        diffLocations.push({
          position: i,
          content1Char: char1 || '',
          content2Char: char2 || '',
        });
      }
    }
  }

  return {
    diffLength: diffCount,
    diffPercentage: (diffCount / maxLength) * 100,
    diffLocations,
  };
}

/**
 * Check if document content has HTML elements that might cause issues
 */
export function detectProblemContent(content: string): {
  hasProblemContent: boolean;
  problems: Array<{ type: string; details: string }>;
} {
  const problems: Array<{ type: string; details: string }> = [];

  // Check for unclosed HTML tags
  const openTagsMatch = content.match(/<[^\/][^>]*>/g) || [];
  const closeTagsMatch = content.match(/<\/[^>]*>/g) || [];

  if (openTagsMatch.length !== closeTagsMatch.length) {
    problems.push({
      type: 'unclosed_tags',
      details: `Unclosed HTML tags detected: ${openTagsMatch.length} opening tags, ${closeTagsMatch.length} closing tags`,
    });
  }

  // Check for invalid JSON strings
  const jsonRegex = /\{(?:[^{}]|(\{(?:[^{}]|())*\}))*\}/g;
  const possibleJsonStrings = content.match(jsonRegex) || [];

  for (const jsonString of possibleJsonStrings) {
    if (jsonString.length > 20) {
      // Only check substantial JSON blocks
      try {
        JSON.parse(jsonString);
      } catch (e) {
        problems.push({
          type: 'invalid_json',
          details: `Invalid JSON detected: ${jsonString.substring(0, 50)}...`,
        });
      }
    }
  }

  // Check for control characters by code point checking instead of regex
  let controlCharCount = 0;
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    // Check for control characters (0-31, 127-159) and specific Unicode line separators
    if (
      (code >= 0 && code <= 31) ||
      (code >= 127 && code <= 159) ||
      code === 8232 ||
      code === 8233
    ) {
      // 8232 and 8233 are unicode line separators
      controlCharCount++;
    }
  }

  if (controlCharCount > 0) {
    problems.push({
      type: 'control_characters',
      details: `${controlCharCount} control characters detected`,
    });
  }

  return {
    hasProblemContent: problems.length > 0,
    problems,
  };
}

/**
 * Sanitize content for storage
 */
export function sanitizeDocumentContent(content: string): string {
  // Remove control characters using char code filtering
  let result = '';
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    // Skip control characters (0-31, 127-159) and line separators
    if (
      !(
        (code >= 0 && code <= 31) ||
        (code >= 127 && code <= 159) ||
        code === 8232 ||
        code === 8233
      )
    ) {
      result += content[i];
    }
  }

  // Normalize newlines
  const normalizedNewlines = result.replace(/\r\n|\r/g, '\n');

  return normalizedNewlines;
}

/**
 * Check if a document update is safe to apply
 */
export function isUpdateSafe(
  currentContent: string,
  updateContent: string,
): {
  safe: boolean;
  reason?: string;
} {
  // Check for large content replacements (more than 80% change)
  const { diffPercentage } = calculateContentDiff(
    currentContent,
    updateContent,
  );

  if (diffPercentage > 80) {
    return {
      safe: false,
      reason: `Update changes ${diffPercentage.toFixed(1)}% of document content which exceeds the 80% threshold`,
    };
  }

  // Check for problematic content in the update
  const { hasProblemContent, problems } = detectProblemContent(updateContent);

  if (hasProblemContent) {
    return {
      safe: false,
      reason: `Update contains problematic content: ${problems.map((p) => p.type).join(', ')}`,
    };
  }

  return { safe: true };
}
