/**
 * Semantic Entity Resolver
 *
 * Provides intelligent entity resolution for Asana entities (tasks, projects, users)
 * using fuzzy matching, semantic similarity, and learning from user corrections.
 */

import { levenshteinDistance } from '../utils/stringUtils';

export interface EntityMatch {
  gid: string;
  name: string;
  score: number;
  matchType: 'exact' | 'fuzzy' | 'semantic' | 'contextual';
  confidence: number;
  metadata?: Record<string, any>;
}

export interface EntityResolutionResult {
  matches: EntityMatch[];
  bestMatch?: EntityMatch;
  isAmbiguous: boolean;
  needsDisambiguation: boolean;
  confidence: number;
  query: string;
}

export interface EntityLearningData {
  query: string;
  selectedGid: string;
  selectedName: string;
  timestamp: number;
  sessionId: string;
}

export interface SemanticEntityResolverConfig {
  fuzzyThreshold: number;
  semanticThreshold: number;
  maxMatches: number;
  disambiguationThreshold: number;
  learningEnabled: boolean;
}

export class SemanticEntityResolver {
  private learningData: Map<string, EntityLearningData[]> = new Map();
  private config: SemanticEntityResolverConfig;

  constructor(config: Partial<SemanticEntityResolverConfig> = {}) {
    this.config = {
      fuzzyThreshold: 0.6,
      semanticThreshold: 0.7,
      maxMatches: 5,
      disambiguationThreshold: 0.8,
      learningEnabled: true,
      ...config,
    };
  }

  /**
   * Resolve an entity query against a list of candidates
   */
  async resolveEntity(
    query: string,
    candidates: Array<{
      gid: string;
      name: string;
      metadata?: Record<string, any>;
    }>,
    sessionId?: string,
  ): Promise<EntityResolutionResult> {
    if (!query || candidates.length === 0) {
      return {
        matches: [],
        isAmbiguous: false,
        needsDisambiguation: false,
        confidence: 0,
        query,
      };
    }

    const normalizedQuery = this.normalizeQuery(query);
    const matches: EntityMatch[] = [];

    // 1. Exact matches
    const exactMatches = this.findExactMatches(normalizedQuery, candidates);
    matches.push(...exactMatches);

    // 2. Fuzzy matches (if no exact matches or exact match confidence is low)
    if (exactMatches.length === 0 || exactMatches[0].confidence < 0.9) {
      const fuzzyMatches = this.findFuzzyMatches(normalizedQuery, candidates);
      matches.push(...fuzzyMatches);
    }

    // 3. Apply learning from previous user selections
    if (this.config.learningEnabled && sessionId) {
      this.applyLearning(matches, normalizedQuery, sessionId);
    }

    // 4. Sort by score and confidence
    matches.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      return b.score - a.score;
    });

    // 5. Limit results
    const limitedMatches = matches.slice(0, this.config.maxMatches);

    // 6. Determine best match and ambiguity
    const bestMatch = limitedMatches[0];
    const isAmbiguous = this.isAmbiguous(limitedMatches);
    const needsDisambiguation =
      isAmbiguous &&
      bestMatch?.confidence < this.config.disambiguationThreshold;

    return {
      matches: limitedMatches,
      bestMatch,
      isAmbiguous,
      needsDisambiguation,
      confidence: bestMatch?.confidence || 0,
      query,
    };
  }

  /**
   * Record user selection for learning
   */
  recordUserSelection(
    query: string,
    selectedGid: string,
    selectedName: string,
    sessionId: string,
  ): void {
    if (!this.config.learningEnabled) return;

    const normalizedQuery = this.normalizeQuery(query);
    const learningEntry: EntityLearningData = {
      query: normalizedQuery,
      selectedGid,
      selectedName,
      timestamp: Date.now(),
      sessionId,
    };

    if (!this.learningData.has(normalizedQuery)) {
      this.learningData.set(normalizedQuery, []);
    }

    const entries = this.learningData.get(normalizedQuery);
    if (entries) {
      entries.push(learningEntry);

      // Keep only recent entries (last 10)
      if (entries.length > 10) {
        entries.splice(0, entries.length - 10);
      }
    }
  }

  /**
   * Generate disambiguation dialog
   */
  generateDisambiguationDialog(
    result: EntityResolutionResult,
    entityType: string,
  ): string {
    if (!result.needsDisambiguation || result.matches.length === 0) {
      return '';
    }

    const lines = [
      `Multiple ${entityType}s match "${result.query}". Please specify which one:`,
      '',
    ];

    result.matches.forEach((match, index) => {
      const confidence = Math.round(match.confidence * 100);
      const metadata = match.metadata
        ? ` (${this.formatMetadata(match.metadata)})`
        : '';
      lines.push(
        `${index + 1}. **${match.name}**${metadata} - ${confidence}% match`,
      );
    });

    lines.push('');
    lines.push(
      'Please respond with the number of your choice, or provide a more specific name.',
    );

    return lines.join('\n');
  }

  /**
   * Clear learning data (for testing or privacy)
   */
  clearLearningData(): void {
    this.learningData.clear();
  }

  /**
   * Get learning statistics
   */
  getLearningStats(): { totalQueries: number; totalSelections: number } {
    let totalSelections = 0;
    this.learningData.forEach((entries) => {
      totalSelections += entries.length;
    });
    return {
      totalQueries: this.learningData.size,
      totalSelections,
    };
  }

  // Private methods

  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '');
  }

  private findExactMatches(
    query: string,
    candidates: Array<{
      gid: string;
      name: string;
      metadata?: Record<string, any>;
    }>,
  ): EntityMatch[] {
    const matches: EntityMatch[] = [];

    for (const candidate of candidates) {
      const normalizedName = this.normalizeQuery(candidate.name);

      if (normalizedName === query) {
        matches.push({
          gid: candidate.gid,
          name: candidate.name,
          score: 1.0,
          matchType: 'exact',
          confidence: 1.0,
          metadata: candidate.metadata,
        });
      } else if (
        normalizedName.includes(query) ||
        query.includes(normalizedName)
      ) {
        const score = Math.max(
          query.length / normalizedName.length,
          normalizedName.length / query.length,
        );
        matches.push({
          gid: candidate.gid,
          name: candidate.name,
          score,
          matchType: 'exact',
          confidence: 0.9,
          metadata: candidate.metadata,
        });
      }
    }

    return matches;
  }

  private findFuzzyMatches(
    query: string,
    candidates: Array<{
      gid: string;
      name: string;
      metadata?: Record<string, any>;
    }>,
  ): EntityMatch[] {
    const matches: EntityMatch[] = [];

    for (const candidate of candidates) {
      const normalizedName = this.normalizeQuery(candidate.name);
      const distance = levenshteinDistance(query, normalizedName);
      const maxLength = Math.max(query.length, normalizedName.length);
      const similarity = 1 - distance / maxLength;

      if (similarity >= this.config.fuzzyThreshold) {
        matches.push({
          gid: candidate.gid,
          name: candidate.name,
          score: similarity,
          matchType: 'fuzzy',
          confidence: similarity * 0.8, // Fuzzy matches have lower confidence
          metadata: candidate.metadata,
        });
      }
    }

    return matches;
  }

  private applyLearning(
    matches: EntityMatch[],
    query: string,
    sessionId: string,
  ): void {
    const learningEntries = this.learningData.get(query);
    if (!learningEntries || learningEntries.length === 0) return;

    // Boost confidence for previously selected entities
    for (const match of matches) {
      const selections = learningEntries.filter(
        (entry) => entry.selectedGid === match.gid,
      );
      if (selections.length > 0) {
        // Boost confidence based on selection frequency and recency
        const recentSelections = selections.filter(
          (s) => Date.now() - s.timestamp < 7 * 24 * 60 * 60 * 1000,
        ); // 7 days
        const boost = Math.min(0.2, recentSelections.length * 0.05);
        match.confidence = Math.min(1.0, match.confidence + boost);
        match.matchType = 'contextual';
      }
    }
  }

  private isAmbiguous(matches: EntityMatch[]): boolean {
    if (matches.length <= 1) return false;

    const topMatch = matches[0];
    const secondMatch = matches[1];

    // Consider ambiguous if top two matches are close in confidence
    return Math.abs(topMatch.confidence - secondMatch.confidence) < 0.2;
  }

  private formatMetadata(metadata: Record<string, any>): string {
    const parts: string[] = [];

    if (metadata.projectName) parts.push(`Project: ${metadata.projectName}`);
    if (metadata.teamName) parts.push(`Team: ${metadata.teamName}`);
    if (metadata.status) parts.push(`Status: ${metadata.status}`);
    if (metadata.assignee) parts.push(`Assignee: ${metadata.assignee}`);

    return parts.join(', ');
  }
}

// Singleton instance
export const semanticEntityResolver = new SemanticEntityResolver();
