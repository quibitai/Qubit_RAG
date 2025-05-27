/**
 * LLM-based Function Call Extractor
 * Replaces regex-based intent parsing with structured LLM function calling
 */

import {
  ASANA_FUNCTION_SCHEMAS,
  type AsanaFunctionName,
} from '../schemas/functionSchemas';

export interface ExtractedFunctionCall {
  functionName: AsanaFunctionName | null;
  parameters: Record<string, any>;
  confidence: number;
  reasoning?: string;
}

export interface ConversationContext {
  recentMessages?: Array<{ role: string; content: string }>;
  lastMentionedProject?: { gid: string; name: string };
  lastCreatedTask?: { gid: string; name: string };
  userPreferences?: {
    defaultProject?: string;
    timezone?: string;
  };
}

/**
 * Extract function calls using LLM instead of regex patterns
 */
export class LLMFunctionExtractor {
  private openaiApiKey: string;

  constructor(openaiApiKey?: string) {
    this.openaiApiKey = openaiApiKey || process.env.OPENAI_API_KEY || '';
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key is required for LLM function extraction');
    }
  }

  /**
   * Extract function call from user message using LLM
   */
  async extractFunctionCall(
    userMessage: string,
    conversationContext?: ConversationContext,
  ): Promise<ExtractedFunctionCall> {
    try {
      const prompt = this.buildExtractionPrompt(
        userMessage,
        conversationContext,
      );

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 800,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content);

      return this.validateAndNormalizeFunctionCall(result);
    } catch (error) {
      console.error('Error extracting function call:', error);
      return {
        functionName: null,
        parameters: {},
        confidence: 0,
        reasoning: `Failed to parse: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Build the extraction prompt for the LLM
   */
  private buildExtractionPrompt(
    userMessage: string,
    context?: ConversationContext,
  ): string {
    const contextInfo = this.buildContextInfo(context);

    const availableFunctions = Object.entries(ASANA_FUNCTION_SCHEMAS)
      .map(([name, schema]) => `- ${name}: ${schema.description}`)
      .join('\n');

    return `You are a function call extractor for an Asana integration. Analyze the user message and determine if it's requesting an Asana operation.

AVAILABLE FUNCTIONS:
${availableFunctions}

CONTEXT:
${contextInfo}

USER MESSAGE: "${userMessage}"

INSTRUCTIONS:
1. If this is an Asana request, identify the most appropriate function and extract parameters
2. Handle contextual references like "that project", "my tasks", "the task I just created"
3. Be flexible with parameter extraction (e.g., "tomorrow" for due dates, "me" for assignee)
4. If ambiguous, choose the most likely interpretation
5. If NOT an Asana request, return function_name: null

RESPONSE FORMAT (JSON only):
{
  "function_name": "list_tasks" | "create_task" | ... | null,
  "parameters": {
    "project_name": "Marketing",
    "assignee": "me"
  },
  "confidence": 0.95,
  "reasoning": "User wants to list tasks in Marketing project assigned to them"
}

EXAMPLES:
- "Show me my tasks" → list_tasks with assignee: "me"
- "Create a task to review designs" → create_task with name: "review designs"
- "What's in that project?" → list_tasks (resolve project from context)
- "Add a subtask to finish the report" → add_subtask with subtask_name: "finish the report"

Response (JSON only):`;
  }

  /**
   * Build context information for the prompt
   */
  private buildContextInfo(context?: ConversationContext): string {
    if (!context) return 'No conversation context available.';

    let contextInfo = '';

    if (context.recentMessages?.length) {
      const recentContext = context.recentMessages
        .slice(-3)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
      contextInfo += `Recent conversation:\n${recentContext}\n\n`;
    }

    if (context.lastMentionedProject) {
      contextInfo += `Last mentioned project: ${context.lastMentionedProject.name} (${context.lastMentionedProject.gid})\n`;
    }

    if (context.lastCreatedTask) {
      contextInfo += `Last created task: ${context.lastCreatedTask.name} (${context.lastCreatedTask.gid})\n`;
    }

    if (context.userPreferences?.defaultProject) {
      contextInfo += `User's default project: ${context.userPreferences.defaultProject}\n`;
    }

    return contextInfo || 'No specific context available.';
  }

  /**
   * Validate and normalize the extracted function call
   */
  private validateAndNormalizeFunctionCall(result: any): ExtractedFunctionCall {
    // Validate basic structure
    if (!result || typeof result !== 'object') {
      return {
        functionName: null,
        parameters: {},
        confidence: 0,
        reasoning: 'Invalid response format',
      };
    }

    const functionName = result.function_name;

    // If no function identified
    if (!functionName || functionName === null) {
      return {
        functionName: null,
        parameters: {},
        confidence: result.confidence || 0,
        reasoning: result.reasoning || 'No Asana operation identified',
      };
    }

    // Validate function name
    if (!(functionName in ASANA_FUNCTION_SCHEMAS)) {
      return {
        functionName: null,
        parameters: {},
        confidence: 0,
        reasoning: `Unknown function: ${functionName}`,
      };
    }

    // Validate parameters against schema
    const schema =
      ASANA_FUNCTION_SCHEMAS[functionName as AsanaFunctionName].schema;
    try {
      const validatedParams = schema.parse(result.parameters || {});

      return {
        functionName: functionName as AsanaFunctionName,
        parameters: validatedParams,
        confidence: Math.min(Math.max(result.confidence || 0.8, 0), 1),
        reasoning:
          result.reasoning || `Extracted ${functionName} function call`,
      };
    } catch (validationError) {
      console.warn('Parameter validation failed:', validationError);

      // Return with raw parameters if validation fails
      return {
        functionName: functionName as AsanaFunctionName,
        parameters: result.parameters || {},
        confidence: Math.max((result.confidence || 0.8) - 0.2, 0.1),
        reasoning: `${result.reasoning || ''} (parameter validation warning)`,
      };
    }
  }

  /**
   * Check if a message is likely an Asana request (quick pre-filter)
   */
  isLikelyAsanaRequest(message: string): boolean {
    const asanaKeywords = [
      'task',
      'project',
      'asana',
      'assign',
      'due',
      'complete',
      'create',
      'list',
      'show',
      'update',
      'delete',
      'subtask',
      'section',
      'team',
      'workspace',
      'follower',
      'dependency',
    ];

    const lowerMessage = message.toLowerCase();
    return asanaKeywords.some((keyword) => lowerMessage.includes(keyword));
  }

  /**
   * Extract contextual references from conversation history
   */
  extractContextualReferences(
    messages: Array<{ role: string; content: string }>,
  ): Partial<ConversationContext> {
    const context: Partial<ConversationContext> = {
      recentMessages: messages.slice(-5), // Keep last 5 messages
    };

    // Extract last mentioned project
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'assistant' && message.content.includes('project')) {
        // Try to extract project name from assistant responses
        const projectMatch =
          message.content.match(/project[:\s]+"([^"]+)"/i) ||
          message.content.match(/in\s+([A-Z][a-zA-Z\s]+)\s+project/i);
        if (projectMatch) {
          context.lastMentionedProject = {
            gid: '', // Would need to be resolved
            name: projectMatch[1].trim(),
          };
          break;
        }
      }
    }

    // Extract last created task
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (
        message.role === 'assistant' &&
        message.content.includes('Created task')
      ) {
        const taskMatch = message.content.match(/Created task "([^"]+)"/i);
        if (taskMatch) {
          context.lastCreatedTask = {
            gid: '', // Would need to be resolved
            name: taskMatch[1].trim(),
          };
          break;
        }
      }
    }

    return context;
  }
}
