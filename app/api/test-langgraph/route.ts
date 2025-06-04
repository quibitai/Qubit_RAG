import { NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { createLangGraphWrapper } from '@/lib/ai/graphs';
import type {
  RequestLogger,
  TokenUsage,
  PerformanceMetrics,
  RequestSummary,
} from '@/lib/services/observabilityService';

// Proper mock logger implementing the full RequestLogger interface
const createMockLogger = (): RequestLogger => ({
  correlationId: 'test-correlation-id',
  startTime: Date.now(),
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg: string, data?: any) =>
    console.error(`[ERROR] ${msg}`, data || ''),
  warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
  logTokenUsage: (usage: TokenUsage) => console.log('[TOKEN]', usage),
  logPerformanceMetrics: (metrics: PerformanceMetrics) =>
    console.log('[PERF]', metrics),
  finalize: (): RequestSummary => ({
    correlationId: 'test-correlation-id',
    duration: Date.now() - Date.now(),
    success: true,
    events: [],
  }),
});

export async function GET() {
  try {
    console.log('Testing LangGraph initialization...');

    // Create a ChatOpenAI instance
    const llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
      apiKey: process.env.OPENAI_API_KEY || 'test-key',
      streaming: true,
    });

    console.log('LLM created successfully');

    // Create LangGraph wrapper config
    const config = {
      systemPrompt: 'You are a helpful AI assistant.',
      llm: llm,
      tools: [], // Empty tools for this test
      logger: createMockLogger(),
    };

    console.log('Creating LangGraph wrapper...');

    // This should not fail with "Cannot read properties of undefined (reading 'modelName')"
    const wrapper = createLangGraphWrapper(config);

    console.log('✅ LangGraph wrapper created successfully!');

    return NextResponse.json({
      success: true,
      message:
        'LangGraph wrapper created successfully! The modelName error has been fixed.',
      wrapperConfig: {
        hasSystemPrompt: !!config.systemPrompt,
        hasLLM: !!config.llm,
        hasLogger: !!config.logger,
        toolCount: config.tools.length,
      },
    });
  } catch (error) {
    console.error('❌ LangGraph initialization failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'LangGraph initialization failed',
      },
      { status: 500 },
    );
  }
}
