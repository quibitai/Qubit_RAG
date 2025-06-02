import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  message,
  conversationEntities,
  conversationSummaries,
  chatFileReferences,
  type ConversationEntity,
  type ConversationSummary,
  type ChatFileReference,
  type DBMessage,
} from '@/lib/db/schema';

export interface ContextWindow {
  recentHistory: DBMessage[];
  keyEntities: ConversationEntity[];
  summary?: string;
  files: any[];
  tokenCount: number;
}

export interface FileReference {
  chatId: string;
  userId: string;
  messageId?: string;
  fileType: 'uploaded' | 'knowledge_base' | 'artifact';
  fileMetadata?: any;
  documentMetadataId?: string;
  documentChunkId?: number;
  artifactDocumentId?: string;
  artifactDocumentCreatedAt?: Date;
  clientId: string;
}

export interface ExtractedEntity {
  type: string;
  value: string;
}

export class ContextManager {
  private maxRecentMessages = 15;
  private maxTokens = 2000;

  /**
   * Build a context window for a specific chat, user, and client
   */
  async buildContextWindow(
    chatId: string,
    userId: string,
    clientId: string,
  ): Promise<ContextWindow> {
    try {
      // 1. Get recent conversation history
      const recentMessages = await db
        .select()
        .from(message)
        .where(and(eq(message.chatId, chatId), eq(message.clientId, clientId)))
        .orderBy(desc(message.createdAt))
        .limit(this.maxRecentMessages);

      // 2. Get tracked entities for this conversation and user
      const entities = await db
        .select()
        .from(conversationEntities)
        .where(
          and(
            eq(conversationEntities.chatId, chatId),
            eq(conversationEntities.userId, userId),
          ),
        )
        .orderBy(desc(conversationEntities.extractedAt));

      // 3. Get the most recent conversation summary if it exists
      const summaryResult = await db
        .select()
        .from(conversationSummaries)
        .where(
          and(
            eq(conversationSummaries.chatId, chatId),
            eq(conversationSummaries.userId, userId),
          ),
        )
        .orderBy(desc(conversationSummaries.createdAt))
        .limit(1);

      // 4. Get referenced files with joins to external tables
      const fileReferences = await db
        .select()
        .from(chatFileReferences)
        .where(
          and(
            eq(chatFileReferences.chatId, chatId),
            eq(chatFileReferences.userId, userId),
          ),
        )
        .orderBy(desc(chatFileReferences.createdAt));

      // Calculate approximate token count
      const tokenCount = this.calculateTokenCount({
        recentHistory: recentMessages,
        keyEntities: entities,
        summary: summaryResult[0]?.summaryText,
        files: fileReferences,
      });

      return {
        recentHistory: recentMessages,
        keyEntities: entities,
        summary: summaryResult[0]?.summaryText,
        files: fileReferences,
        tokenCount,
      };
    } catch (error) {
      console.error('[ContextManager] Error building context window:', error);
      throw error;
    }
  }

  /**
   * Extract entities from message content and store them
   */
  async extractEntities(
    messageId: string,
    content: string,
    chatId: string,
    userId: string,
    clientId: string,
  ): Promise<void> {
    try {
      const extractedEntities = await this.performEntityExtraction(content);

      // Store each extracted entity
      for (const entity of extractedEntities) {
        await db.insert(conversationEntities).values({
          chatId,
          userId,
          messageId,
          entityType: entity.type,
          entityValue: entity.value,
          clientId,
        });
      }

      console.log(
        `[ContextManager] Extracted ${extractedEntities.length} entities from message ${messageId}`,
      );
    } catch (error) {
      console.error('[ContextManager] Error extracting entities:', error);
      // Don't throw - entity extraction failures shouldn't break the main flow
    }
  }

  /**
   * Update or create a conversation summary
   */
  async updateSummary(
    chatId: string,
    userId: string,
    clientId: string,
  ): Promise<void> {
    try {
      // Get recent messages to summarize
      const messagesToSummarize = await db
        .select()
        .from(message)
        .where(and(eq(message.chatId, chatId), eq(message.clientId, clientId)))
        .orderBy(desc(message.createdAt))
        .limit(50); // Get more messages for summarization

      if (messagesToSummarize.length < 10) {
        // Don't create summaries for very short conversations
        return;
      }

      const summaryText = await this.generateSummary(messagesToSummarize);
      const now = new Date();
      const oldestMessage = messagesToSummarize[messagesToSummarize.length - 1];
      const newestMessage = messagesToSummarize[0];

      await db.insert(conversationSummaries).values({
        chatId,
        userId,
        summaryText,
        messagesCoveredStart: oldestMessage.createdAt,
        messagesCoveredEnd: newestMessage.createdAt,
        clientId,
      });

      console.log(`[ContextManager] Created summary for chat ${chatId}`);
    } catch (error) {
      console.error('[ContextManager] Error updating summary:', error);
      // Don't throw - summary failures shouldn't break the main flow
    }
  }

  /**
   * Store a file reference
   */
  async storeFileReference(fileRef: FileReference): Promise<void> {
    try {
      await db.insert(chatFileReferences).values({
        chatId: fileRef.chatId,
        userId: fileRef.userId,
        messageId: fileRef.messageId,
        fileType: fileRef.fileType,
        fileMetadata: fileRef.fileMetadata,
        documentMetadataId: fileRef.documentMetadataId,
        documentChunkId: fileRef.documentChunkId,
        artifactDocumentId: fileRef.artifactDocumentId,
        artifactDocumentCreatedAt: fileRef.artifactDocumentCreatedAt,
        clientId: fileRef.clientId,
      });

      console.log(
        `[ContextManager] Stored file reference of type ${fileRef.fileType} for chat ${fileRef.chatId}`,
      );
    } catch (error) {
      console.error('[ContextManager] Error storing file reference:', error);
      throw error;
    }
  }

  /**
   * Simple entity extraction using patterns and keywords
   * TODO: Replace with more sophisticated NLP or LLM-based extraction
   */
  private async performEntityExtraction(
    content: string,
  ): Promise<ExtractedEntity[]> {
    const entities: ExtractedEntity[] = [];

    // Extract addresses (basic pattern)
    const addressPattern =
      /\b\d+\s+[A-Za-z\s]+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Circle|Cir|Place|Pl)[A-Za-z\s,]*\b/gi;
    const addresses = content.match(addressPattern);
    if (addresses) {
      addresses.forEach((addr) => {
        entities.push({ type: 'address', value: addr.trim() });
      });
    }

    // Extract emails
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = content.match(emailPattern);
    if (emails) {
      emails.forEach((email) => {
        entities.push({ type: 'email', value: email });
      });
    }

    // Extract phone numbers
    const phonePattern =
      /\b(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g;
    const phones = content.match(phonePattern);
    if (phones) {
      phones.forEach((phone) => {
        entities.push({ type: 'phone', value: phone });
      });
    }

    // Extract dates (basic ISO format and common patterns)
    const datePattern =
      /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi;
    const dates = content.match(datePattern);
    if (dates) {
      dates.forEach((date) => {
        entities.push({ type: 'date', value: date });
      });
    }

    // Extract names after certain keywords
    const nameKeywords =
      /(?:my name is|i'm|i am|call me|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
    let nameMatch: RegExpExecArray | null = nameKeywords.exec(content);
    while (nameMatch !== null) {
      entities.push({ type: 'name', value: nameMatch[1] });
      nameMatch = nameKeywords.exec(content);
    }

    return entities;
  }

  /**
   * Generate a summary of messages using LLM
   */
  private async generateSummary(messages: DBMessage[]): Promise<string> {
    try {
      // Use ChatOpenAI from langchain (already available in the project)
      const { ChatOpenAI } = await import('@langchain/openai');

      if (!process.env.OPENAI_API_KEY) {
        console.warn(
          '[ContextManager] OpenAI API key not available, using basic summary',
        );
        return this.generateBasicSummary(messages);
      }

      const llm = new ChatOpenAI({
        modelName: 'gpt-4.1-mini', // Use cost-effective model for summaries
        temperature: 0.3, // Lower temperature for consistent summaries
        maxTokens: 500,
        openAIApiKey: process.env.OPENAI_API_KEY,
      });

      // Format messages for summarization
      const conversation = messages
        .reverse() // Reverse to chronological order (oldest first)
        .map((msg) => {
          const content = Array.isArray(msg.parts)
            ? msg.parts
                .map((part) =>
                  typeof part === 'string'
                    ? part
                    : part.text || JSON.stringify(part),
                )
                .join(' ')
            : typeof msg.parts === 'string'
              ? msg.parts
              : JSON.stringify(msg.parts);

          return `${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}: ${content}`;
        })
        .join('\n\n');

      const prompt = `Please create a concise summary of this conversation that captures:
1. Main topics discussed
2. Key decisions or conclusions reached  
3. Important details mentioned (names, dates, addresses, etc.)
4. Any action items or next steps
5. Overall context and purpose of the conversation

Conversation (${messages.length} messages):
${conversation}

Summary:`;

      const response = await llm.invoke(prompt);
      const summary = response.content?.toString()?.trim();

      if (!summary) {
        console.warn(
          '[ContextManager] LLM returned empty summary, using basic summary',
        );
        return this.generateBasicSummary(messages);
      }

      console.log(
        `[ContextManager] Generated LLM summary (${summary.length} chars) for ${messages.length} messages`,
      );
      return summary;
    } catch (error) {
      console.error('[ContextManager] Error generating LLM summary:', error);
      console.log('[ContextManager] Falling back to basic summary');
      return this.generateBasicSummary(messages);
    }
  }

  /**
   * Generate a basic summary as fallback when LLM is unavailable
   */
  private generateBasicSummary(messages: DBMessage[]): string {
    const userMessages = messages.filter((m) => m.role === 'user');
    const assistantMessages = messages.filter((m) => m.role === 'assistant');

    const timeSpan =
      messages.length > 0
        ? {
            start: new Date(
              Math.min(...messages.map((m) => m.createdAt.getTime())),
            ),
            end: new Date(
              Math.max(...messages.map((m) => m.createdAt.getTime())),
            ),
          }
        : null;

    let summary = `Conversation summary: ${messages.length} total messages (${userMessages.length} user, ${assistantMessages.length} assistant)`;

    if (timeSpan) {
      const duration = timeSpan.end.getTime() - timeSpan.start.getTime();
      const hours = Math.round((duration / (1000 * 60 * 60)) * 10) / 10;
      summary += `. Duration: ${hours} hours from ${timeSpan.start.toLocaleDateString()} to ${timeSpan.end.toLocaleDateString()}`;
    }

    summary += '. Topics discussed based on message content analysis.';

    return summary;
  }

  /**
   * Calculate approximate token count for context window
   */
  private calculateTokenCount(context: {
    recentHistory: DBMessage[];
    keyEntities: ConversationEntity[];
    summary?: string;
    files: any[];
  }): number {
    let tokens = 0;

    // Approximate: 1 token ≈ 4 characters for English text
    context.recentHistory.forEach((msg) => {
      const content = JSON.stringify(msg.parts);
      tokens += Math.ceil(content.length / 4);
    });

    context.keyEntities.forEach((entity) => {
      tokens += Math.ceil(
        (entity.entityType.length + entity.entityValue.length) / 4,
      );
    });

    if (context.summary) {
      tokens += Math.ceil(context.summary.length / 4);
    }

    // Add buffer for file references
    tokens += context.files.length * 10;

    return tokens;
  }
}

// Export a singleton instance
export const contextManager = new ContextManager();
