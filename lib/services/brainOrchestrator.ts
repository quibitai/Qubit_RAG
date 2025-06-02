import type { NextRequest } from 'next/server';
import type { BrainRequest } from '@/lib/validation/brainValidation';
import type { ClientConfig } from '@/lib/db/queries';

// Import all our services
import {
  validateRequest,
  validateRequestSize,
  validateContentType,
} from './validationService';
import * as ErrorService from './errorService';
import { getRequestLogger, type RequestLogger } from './observabilityService';
import {
  loadSystemPrompt,
  type PromptContext,
  type PromptConfig,
} from './promptService';
import {
  createStreamingResponse,
  getDefaultStreamingConfig,
  validateStreamingConfig,
  type StreamingConfig,
  type StreamingContext,
} from './streamingService';
import {
  selectRelevantTools,
  executeToolWithMonitoring,
  type ToolContext,
} from './modernToolService';

// Import LangChain bridge
import {
  createLangChainAgent,
  streamLangChainAgent,
  cleanupLangChainAgent,
  type LangChainBridgeConfig,
  type LangChainAgent,
} from './langchainBridge';

// Import new service dependencies
import { createMessageService, type MessageService } from './messageService';
import { createContextService, type ContextService } from './contextService';

/**
 * BrainOrchestrator
 *
 * Main coordination service that orchestrates the complete brain API pipeline
 * with LangChain integration
 */

export interface BrainOrchestratorConfig {
  clientConfig?: ClientConfig | null;
  enableCaching?: boolean;
  enableToolExecution?: boolean;
  maxTools?: number;
  streamingEnabled?: boolean;
  enableLangChainBridge?: boolean;
  maxIterations?: number;
  verbose?: boolean;
}

export interface BrainResponse {
  success: boolean;
  stream?: AsyncIterable<any> | ReadableStream<any>;
  data?: any;
  error?: any;
  correlationId: string;
  processingTime: number;
}

/**
 * BrainOrchestrator
 *
 * Main coordination service that orchestrates the complete brain API pipeline
 * with hybrid LangChain integration and performance monitoring
 */
export class BrainOrchestrator {
  private request: NextRequest;
  private config: BrainOrchestratorConfig;
  private logger: RequestLogger;
  private langchainAgent?: LangChainAgent;
  private startTime: number;
  private messageService: MessageService;
  private contextService: ContextService;

  constructor(request: NextRequest, config: BrainOrchestratorConfig) {
    this.request = request;
    this.config = {
      enableCaching: false,
      enableToolExecution: true,
      maxTools: 26,
      streamingEnabled: true,
      enableLangChainBridge: true,
      maxIterations: 10,
      verbose: false,
      ...config,
    };
    this.logger = getRequestLogger(request);
    this.startTime = performance.now();

    // Initialize service dependencies
    this.messageService = createMessageService(this.logger);
    this.contextService = createContextService(
      this.logger,
      this.config.clientConfig,
    );

    this.logger.info('BrainOrchestrator initialized', {
      config: this.config,
      correlationId: this.logger.correlationId,
    });
  }

  /**
   * Processes a brain request through the complete pipeline
   */
  async processRequest(): Promise<BrainResponse> {
    const startTime = performance.now();

    try {
      // Step 1: Validate the request
      this.recordCheckpoint('validation_start');
      const validationResult = await this.validateIncomingRequest();
      if (!validationResult.success) {
        return this.createErrorResponse(
          ErrorService.validationError(validationResult.errors || []),
          startTime,
        );
      }
      this.recordCheckpoint('validation');

      const brainRequest = validationResult.data as BrainRequest;

      // Step 2: Load system prompt
      this.recordCheckpoint('prompt_loading_start');
      const promptResult = await this.loadSystemPrompt(brainRequest);
      this.recordCheckpoint('prompt_loading');

      // Step 3: Decide execution path based on configuration
      if (this.config.enableLangChainBridge) {
        return await this.processWithLangChainBridge(
          brainRequest,
          promptResult.systemPrompt,
        );
      } else {
        return await this.processWithModernPipeline(
          brainRequest,
          promptResult.systemPrompt,
        );
      }
    } catch (error) {
      this.logger.error('Unexpected error in brain orchestrator', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return this.createErrorResponse(
        ErrorService.internalError('Brain processing failed'),
        startTime,
      );
    } finally {
      // Clean up resources
      if (this.langchainAgent) {
        cleanupLangChainAgent(this.langchainAgent, this.logger);
      }
    }
  }

  /**
   * Validates the incoming request
   */
  private async validateIncomingRequest() {
    this.logger.info('Starting request validation');

    // Validate content type
    const contentTypeResult = validateContentType(this.request);
    if (!contentTypeResult.success) {
      return contentTypeResult;
    }

    // Validate request size
    const sizeResult = validateRequestSize(this.request);
    if (!sizeResult.success) {
      return sizeResult;
    }

    // Validate request schema
    const validationResult = await validateRequest(this.request);

    this.logger.info('Request validation completed', {
      success: validationResult.success,
      errorCount: validationResult.errors?.length || 0,
    });

    return validationResult;
  }

  /**
   * Loads the appropriate system prompt
   */
  private async loadSystemPrompt(request: BrainRequest) {
    // Process context first using ContextService
    const processedContext = this.contextService.processContext(request);

    const promptContext: PromptContext = {
      activeBitContextId: request.activeBitContextId,
      currentActiveSpecialistId: request.currentActiveSpecialistId,
      activeBitPersona: request.activeBitPersona,
      selectedChatModel: request.selectedChatModel,
      userTimezone: request.userTimezone || undefined, // Fix type issue
      isFromGlobalPane: request.isFromGlobalPane,
    };

    const promptConfig: PromptConfig = {
      clientConfig: this.config.clientConfig,
      currentDateTime: new Date().toISOString(),
    };

    const result = await loadSystemPrompt(
      request,
      promptContext,
      promptConfig,
      this.logger,
    );

    // Add context-aware prompt additions
    const contextAdditions =
      this.contextService.createContextPromptAdditions(processedContext);
    if (contextAdditions) {
      result.systemPrompt += contextAdditions;
    }

    return result;
  }

  /**
   * Select tools for the request
   */
  private async selectTools(
    brainRequest: BrainRequest,
    systemPrompt: string,
  ): Promise<any[]> {
    if (!this.config.enableToolExecution) {
      return [];
    }

    const userInput = this.messageService.extractUserInput(brainRequest);
    const toolContext: ToolContext = {
      userQuery: userInput,
      activeBitContextId: brainRequest.activeBitContextId || undefined,
      uploadedContent: brainRequest.uploadedContent,
      artifactContext: brainRequest.artifactContext,
      fileContext: brainRequest.fileContext,
      crossUIContext: brainRequest.crossUIContext,
      logger: this.logger,
    };

    return await selectRelevantTools(toolContext, this.config.maxTools || 26);
  }

  /**
   * Process request using LangChain bridge (hybrid approach)
   */
  private async processWithLangChainBridge(
    brainRequest: BrainRequest,
    systemPrompt: string,
  ): Promise<BrainResponse> {
    try {
      // Step 3: Create LangChain agent
      this.recordCheckpoint('agent_creation_start');
      const langchainConfig: LangChainBridgeConfig = {
        selectedChatModel: brainRequest.selectedChatModel,
        contextId: brainRequest.activeBitContextId,
        clientConfig: this.config.clientConfig,
        enableToolExecution: this.config.enableToolExecution,
        maxTools: this.config.maxTools,
        maxIterations: this.config.maxIterations,
        verbose: this.config.verbose,
      };

      this.langchainAgent = await createLangChainAgent(
        systemPrompt,
        langchainConfig,
        this.logger,
      );
      this.recordCheckpoint('agent_creation');

      // Step 4: Prepare chat history and context using MessageService
      const chatHistory = this.messageService.convertToLangChainFormat(
        brainRequest.messages as any,
      );
      const userInput = this.messageService.extractUserInput(brainRequest);

      // Step 5: Execute with streaming
      this.recordCheckpoint('execution_start');
      const stream = await streamLangChainAgent(
        this.langchainAgent,
        userInput,
        chatHistory,
        langchainConfig,
        this.logger,
      );
      this.recordCheckpoint('execution');

      // Step 6: Return the raw LangChain stream directly
      this.recordCheckpoint('streaming_setup_start'); // Checkpoint remains for consistency
      this.recordCheckpoint('streaming_setup'); // Checkpoint remains for consistency

      return {
        success: true,
        stream: stream, // Return the raw stream
        correlationId: this.logger.correlationId,
        processingTime: performance.now() - (this.startTime || 0),
      };
    } catch (error) {
      this.logger.error('LangChain bridge execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fallback to modern pipeline
      this.logger.info('Falling back to modern pipeline');
      return await this.processWithModernPipeline(brainRequest, systemPrompt);
    }
  }

  /**
   * Process request using modern pipeline only
   */
  private async processWithModernPipeline(
    brainRequest: BrainRequest,
    systemPrompt: string,
  ): Promise<BrainResponse> {
    try {
      // Step 3: Select and prepare tools
      this.recordCheckpoint('tool_selection_start');
      const tools = this.config.enableToolExecution
        ? await this.selectTools(brainRequest, systemPrompt)
        : [];
      this.recordCheckpoint('tool_selection');

      // Step 4: Create streaming context using MessageService
      this.recordCheckpoint('streaming_setup_start');
      const streamingConfig = getDefaultStreamingConfig(
        brainRequest.selectedChatModel,
      );
      const streamingContext = await this.createStreamingContext(
        brainRequest,
        systemPrompt,
        tools,
      );
      this.recordCheckpoint('streaming_setup');

      // Step 5: Execute streaming response
      this.recordCheckpoint('execution_start');
      const streamResult = await createStreamingResponse(
        streamingConfig,
        streamingContext,
      );
      this.recordCheckpoint('execution');

      return {
        success: true,
        stream: streamResult.stream,
        correlationId: this.logger.correlationId,
        processingTime: performance.now() - (this.startTime || 0),
      };
    } catch (error) {
      this.logger.error('Modern pipeline execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Record performance checkpoint if tracking is enabled
   */
  private recordCheckpoint(
    name: string,
    additionalData?: Record<string, any>,
  ): void {
    // Placeholder for performance tracking
  }

  /**
   * Create streaming context for modern pipeline using MessageService
   */
  private async createStreamingContext(
    brainRequest: BrainRequest,
    systemPrompt: string,
    tools: any[],
  ): Promise<StreamingContext> {
    // Convert request messages to streaming format using MessageService
    const messages = this.messageService.convertToStreamingFormat(
      brainRequest.messages as any,
    );

    return {
      systemPrompt,
      messages,
      tools,
      logger: this.logger,
    };
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    error: Response,
    startTime: number,
  ): BrainResponse {
    const processingTime = performance.now() - startTime;

    this.logger.error('Brain request failed', {
      processingTime: `${processingTime.toFixed(2)}ms`,
      success: false,
    });

    return {
      success: false,
      error,
      correlationId: this.logger.correlationId,
      processingTime,
    };
  }
}

/**
 * Convenience function to create and process a brain request
 */
export async function processBrainRequest(
  req: NextRequest,
  config: BrainOrchestratorConfig = {},
): Promise<BrainResponse> {
  const orchestrator = new BrainOrchestrator(req, config);
  return await orchestrator.processRequest();
}
