/**
 * QueryClassifier
 *
 * Intelligent routing service that analyzes queries to determine whether they
 * should be handled by LangChain (complex tool orchestration) or Vercel AI SDK
 * (simple responses). Ports logic from EnhancedAgentExecutor with enhanced
 * complexity scoring algorithm.
 * Target: ~140 lines as per roadmap specifications.
 */

import type { RequestLogger } from './observabilityService';
import type { ClientConfig } from '@/lib/db/queries';

/**
 * Query classification result
 */
export interface QueryClassificationResult {
  shouldUseLangChain: boolean;
  confidence: number;
  reasoning: string;
  complexityScore: number;
  detectedPatterns: string[];
  recommendedModel?: string;
  estimatedTokens?: number;
}

/**
 * Configuration for query classification
 */
export interface QueryClassifierConfig {
  clientConfig?: ClientConfig | null;
  contextId?: string | null;
  enableOverrides?: boolean;
  complexityThreshold?: number;
  confidenceThreshold?: number;
  verbose?: boolean;
}

/**
 * Pattern definitions for query analysis
 */
const COMPLEX_PATTERNS = {
  // Tool invocation patterns
  TOOL_REQUESTS: [
    /(?:create|make|generate|build).+(?:task|project|document|file)/i,
    /(?:search|find|look up|retrieve|get|fetch|access).+(?:asana|google|drive|file|document|content|data|knowledge)/i,
    /(?:update|modify|change|edit).+(?:task|project|status|document|file)/i,
    /(?:analyze|process|transform).+(?:data|content|document)/i,
    /(?:give me|show me|provide|display).+(?:contents|file|document|data|information)/i,
    /(?:upload|download|save|store|backup).+(?:file|document|data)/i,
  ],

  // Multi-step operation patterns
  MULTI_STEP: [
    /(?:first|then|next|after|before|finally)/i,
    /(?:step \d+|phase \d+|\d+\. )/i,
    /(?:if.+then|when.+do|unless.+)/i,
  ],

  // Complex reasoning patterns
  REASONING: [
    /(?:compare|contrast|analyze|evaluate|assess)/i,
    /(?:pros and cons|advantages|disadvantages)/i,
    /(?:because|therefore|however|although|despite)/i,
    /(?:explain why|how does|what if|suppose that)/i,
  ],

  // Domain-specific complexity
  DOMAIN_SPECIFIC: [
    /(?:RAG|retrieval|embedding|vector|semantic)/i,
    /(?:workflow|automation|integration|API)/i,
    /(?:code|programming|development|technical)/i,
    /(?:core values|knowledge base|company|organization|internal)/i,
  ],

  // Document and knowledge retrieval
  KNOWLEDGE_RETRIEVAL: [
    /(?:complete contents|full content|entire file|all content)/i,
    /(?:knowledge base|internal docs|company files|core values|policies|procedures)/i,
    /(?:from the|in our|company's|organization's).+(?:files|documents|database)/i,
  ],
};

const SIMPLE_PATTERNS = {
  // Basic conversational patterns
  CONVERSATIONAL: [
    /^(?:hi|hello|hey|good morning|good afternoon)/i,
    /^(?:how are you|what's up|how's it going)/i,
    /^(?:thanks|thank you|thx)/i,
    /^(?:yes|no|ok|okay|sure|alright)/i,
  ],

  // Simple informational requests
  FACTUAL: [
    /^(?:what is|what are|who is|when is|where is)/i,
    /^(?:define|explain|tell me about)/i,
    /^(?:can you help|help me)/i,
  ],

  // Weather and simple tools
  SIMPLE_TOOLS: [
    /(?:weather|temperature|forecast)/i,
    /(?:time|date|calendar)/i,
    /(?:suggestion|recommend|advice)/i,
  ],
};

/**
 * QueryClassifier class
 *
 * Analyzes queries and determines optimal execution path
 */
export class QueryClassifier {
  private logger: RequestLogger;
  private config: QueryClassifierConfig;

  constructor(logger: RequestLogger, config: QueryClassifierConfig = {}) {
    this.logger = logger;
    this.config = {
      complexityThreshold: 0.6,
      confidenceThreshold: 0.7,
      enableOverrides: true,
      verbose: false,
      ...config,
    };

    this.logger.info('Initializing QueryClassifier', {
      complexityThreshold: this.config.complexityThreshold,
      confidenceThreshold: this.config.confidenceThreshold,
      contextId: this.config.contextId,
    });
  }

  /**
   * Classify a query and determine execution path
   */
  public async classifyQuery(
    userInput: string,
    conversationHistory: any[] = [],
    systemPrompt?: string,
  ): Promise<QueryClassificationResult> {
    const startTime = performance.now();

    this.logger.info('Classifying query', {
      inputLength: userInput.length,
      historyLength: conversationHistory.length,
      hasSystemPrompt: !!systemPrompt,
    });

    try {
      // 1. Calculate complexity score
      const complexityScore = this.calculateComplexityScore(
        userInput,
        conversationHistory,
      );

      // 2. Detect patterns
      const detectedPatterns = this.detectPatterns(userInput);

      // 3. Analyze conversation context
      const contextComplexity =
        this.analyzeContextComplexity(conversationHistory);

      // 4. Make routing decision
      const shouldUseLangChain = this.determineRoutingDecision(
        complexityScore,
        detectedPatterns,
        contextComplexity,
      );

      // 5. Calculate confidence
      const confidence = this.calculateConfidence(
        complexityScore,
        detectedPatterns,
      );

      // 6. Generate reasoning
      const reasoning = this.generateReasoning(
        shouldUseLangChain,
        complexityScore,
        detectedPatterns,
        contextComplexity,
      );

      const result: QueryClassificationResult = {
        shouldUseLangChain,
        confidence,
        reasoning,
        complexityScore,
        detectedPatterns,
        recommendedModel: shouldUseLangChain ? 'gpt-4.1' : 'gpt-4.1-mini',
        estimatedTokens: this.estimateTokenUsage(
          userInput,
          conversationHistory,
        ),
      };

      const executionTime = performance.now() - startTime;

      this.logger.info('Query classification completed', {
        shouldUseLangChain,
        confidence,
        complexityScore,
        patternCount: detectedPatterns.length,
        executionTime: `${executionTime.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      const executionTime = performance.now() - startTime;

      this.logger.error('Query classification failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: `${executionTime.toFixed(2)}ms`,
        inputLength: userInput.length,
      });

      // Fallback to LangChain for safety
      return {
        shouldUseLangChain: true,
        confidence: 0.5,
        reasoning: 'Classification failed, using LangChain as fallback',
        complexityScore: 1.0,
        detectedPatterns: ['classification_error'],
        recommendedModel: 'gpt-4.1',
      };
    }
  }

  /**
   * Calculate complexity score based on query characteristics
   */
  private calculateComplexityScore(
    userInput: string,
    conversationHistory: any[],
  ): number {
    let score = 0;

    // Base complexity factors
    const wordCount = userInput.split(/\s+/).length;
    score += Math.min(wordCount / 50, 0.3); // Word count contribution (max 0.3)

    const sentenceCount = userInput
      .split(/[.!?]+/)
      .filter((s) => s.trim()).length;
    score += Math.min(sentenceCount / 5, 0.2); // Sentence complexity (max 0.2)

    // Question complexity
    const questionWords = [
      'how',
      'why',
      'what',
      'when',
      'where',
      'which',
      'who',
    ];
    const questionCount = questionWords.filter((word) =>
      userInput.toLowerCase().includes(word),
    ).length;
    score += Math.min(questionCount / 3, 0.2); // Question complexity (max 0.2)

    // Technical terminology
    const technicalTerms = [
      'API',
      'database',
      'algorithm',
      'integration',
      'workflow',
      'automation',
    ];
    const techTermCount = technicalTerms.filter((term) =>
      userInput.toLowerCase().includes(term.toLowerCase()),
    ).length;
    score += Math.min(techTermCount / 2, 0.3); // Technical complexity (max 0.3)

    // Conversation history complexity
    if (conversationHistory.length > 3) {
      score += 0.2; // Context complexity
    }

    return Math.min(score, 1.0);
  }

  /**
   * Detect patterns in the user input
   */
  private detectPatterns(userInput: string): string[] {
    const patterns: string[] = [];

    // Check complex patterns
    for (const [category, regexes] of Object.entries(COMPLEX_PATTERNS)) {
      for (const regex of regexes) {
        if (regex.test(userInput)) {
          patterns.push(`complex_${category.toLowerCase()}`);
          break; // One per category
        }
      }
    }

    // Check simple patterns
    for (const [category, regexes] of Object.entries(SIMPLE_PATTERNS)) {
      for (const regex of regexes) {
        if (regex.test(userInput)) {
          patterns.push(`simple_${category.toLowerCase()}`);
          break; // One per category
        }
      }
    }

    return patterns;
  }

  /**
   * Analyze conversation context for complexity indicators
   */
  private analyzeContextComplexity(conversationHistory: any[]): number {
    if (conversationHistory.length === 0) return 0;

    let contextScore = 0;

    // Recent tool usage
    const recentMessages = conversationHistory.slice(-5);
    const toolMentions = recentMessages.filter(
      (msg) =>
        msg.content &&
        (msg.content.includes('tool') ||
          msg.content.includes('search') ||
          msg.content.includes('create') ||
          msg.content.includes('update')),
    ).length;

    contextScore += Math.min(toolMentions / 3, 0.4);

    // Conversation length indicates complexity
    contextScore += Math.min(conversationHistory.length / 10, 0.3);

    // Recent errors or failures might indicate complexity
    const errorMentions = recentMessages.filter(
      (msg) =>
        msg.content &&
        (msg.content.includes('error') ||
          msg.content.includes('failed') ||
          msg.content.includes('try again')),
    ).length;

    contextScore += Math.min(errorMentions / 2, 0.3);

    return Math.min(contextScore, 1.0);
  }

  /**
   * Make the final routing decision
   */
  private determineRoutingDecision(
    complexityScore: number,
    detectedPatterns: string[],
    contextComplexity: number,
  ): boolean {
    // Check for override patterns first
    const hasComplexPatterns = detectedPatterns.some((p) =>
      p.startsWith('complex_'),
    );
    const hasSimplePatterns = detectedPatterns.some((p) =>
      p.startsWith('simple_'),
    );

    // Strong simple indicators
    if (hasSimplePatterns && !hasComplexPatterns && contextComplexity < 0.3) {
      return false; // Use Vercel AI SDK
    }

    // Strong complex indicators
    if (hasComplexPatterns || contextComplexity > 0.6) {
      return true; // Use LangChain
    }

    // Use threshold-based decision
    const combinedScore = (complexityScore + contextComplexity) / 2;
    return combinedScore >= (this.config.complexityThreshold || 0.6);
  }

  /**
   * Calculate confidence in the routing decision
   */
  private calculateConfidence(
    complexityScore: number,
    detectedPatterns: string[],
  ): number {
    let confidence = 0.5; // Base confidence

    // Pattern-based confidence
    const patternStrength = detectedPatterns.length / 5; // Normalize by max expected patterns
    confidence += Math.min(patternStrength * 0.3, 0.3);

    // Score clarity (how far from threshold)
    const threshold = this.config.complexityThreshold || 0.6;
    const scoreDistance = Math.abs(complexityScore - threshold);
    confidence += Math.min(scoreDistance * 0.4, 0.2);

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate human-readable reasoning for the decision
   */
  private generateReasoning(
    shouldUseLangChain: boolean,
    complexityScore: number,
    detectedPatterns: string[],
    contextComplexity: number,
  ): string {
    if (shouldUseLangChain) {
      const reasons = [];

      if (complexityScore > 0.7) {
        reasons.push('high query complexity');
      }

      if (detectedPatterns.some((p) => p.includes('tool'))) {
        reasons.push('tool usage detected');
      }

      if (contextComplexity > 0.5) {
        reasons.push('complex conversation context');
      }

      if (reasons.length === 0) {
        reasons.push('complexity score above threshold');
      }

      return `Using LangChain due to: ${reasons.join(', ')}`;
    } else {
      const reasons = [];

      if (detectedPatterns.some((p) => p.includes('simple'))) {
        reasons.push('simple conversational patterns');
      }

      if (complexityScore < 0.4) {
        reasons.push('low complexity score');
      }

      if (contextComplexity < 0.3) {
        reasons.push('simple context');
      }

      if (reasons.length === 0) {
        reasons.push('complexity score below threshold');
      }

      return `Using Vercel AI SDK due to: ${reasons.join(', ')}`;
    }
  }

  /**
   * Estimate token usage for the query
   */
  private estimateTokenUsage(
    userInput: string,
    conversationHistory: any[],
  ): number {
    // Rough estimation: ~4 characters per token
    const inputTokens = Math.ceil(userInput.length / 4);
    const historyTokens = conversationHistory.reduce((total, msg) => {
      return total + Math.ceil((msg.content?.length || 0) / 4);
    }, 0);

    return inputTokens + historyTokens;
  }

  /**
   * Get classifier metrics
   */
  public getMetrics(): {
    complexityThreshold: number;
    confidenceThreshold: number;
    enableOverrides: boolean;
  } {
    return {
      complexityThreshold: this.config.complexityThreshold || 0.6,
      confidenceThreshold: this.config.confidenceThreshold || 0.7,
      enableOverrides: this.config.enableOverrides || false,
    };
  }
}

/**
 * Convenience functions for query classification
 */

/**
 * Create a QueryClassifier instance with default configuration
 */
export function createQueryClassifier(
  logger: RequestLogger,
  config?: QueryClassifierConfig,
): QueryClassifier {
  return new QueryClassifier(logger, config);
}

/**
 * Quick classification utility
 */
export async function classifyQuery(
  logger: RequestLogger,
  userInput: string,
  conversationHistory: any[] = [],
  config?: QueryClassifierConfig,
): Promise<QueryClassificationResult> {
  const classifier = createQueryClassifier(logger, config);
  return classifier.classifyQuery(userInput, conversationHistory);
}
