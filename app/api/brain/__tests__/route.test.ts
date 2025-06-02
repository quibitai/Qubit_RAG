import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, GET } from '../route';

// Mock the feature flags
vi.mock('@/lib/config/featureFlags', () => ({
  shouldUseModernAPI: vi.fn(),
  logFeatureFlagDecision: vi.fn(),
  isFeatureEnabled: vi.fn(),
}));

// Mock the auth
vi.mock('@/app/(auth)/auth', () => ({
  auth: vi.fn(),
}));

// Mock the client config
vi.mock('@/lib/db/queries', () => ({
  getClientConfig: vi.fn(),
}));

// Mock the brain orchestrator
vi.mock('@/lib/services/brainOrchestrator', () => ({
  processBrainRequest: vi.fn(),
}));

// Mock the legacy route
vi.mock('../route.legacy', () => ({
  POST: vi.fn(),
}));

describe('Brain API Route', () => {
  let mockRequest: NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock request with proper JSON body
    const mockBody = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
      userTimezone: 'UTC',
    };

    mockRequest = new NextRequest('http://localhost:3000/api/brain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mockBody),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Feature Flag Routing', () => {
    it('should route to modern API when feature flag is enabled', async () => {
      // Mock feature flags and auth
      const { shouldUseModernAPI } = await import('@/lib/config/featureFlags');
      const { auth } = await import('@/app/(auth)/auth');
      const { getClientConfig } = await import('@/lib/db/queries');
      const { processBrainRequest } = await import(
        '@/lib/services/brainOrchestrator'
      );

      vi.mocked(shouldUseModernAPI).mockReturnValue(true);
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'user-123', clientId: 'client-123' },
      } as any);
      vi.mocked(getClientConfig).mockResolvedValue({
        id: 'client-123',
        name: 'Test Client',
        client_display_name: 'Test Client',
        client_core_mission: null,
        customInstructions: null,
        configJson: null,
      });
      vi.mocked(processBrainRequest).mockResolvedValue({
        success: true,
        stream: new ReadableStream(),
        correlationId: 'test-correlation-id',
        processingTime: 123.45,
      });

      const response = await POST(mockRequest);

      expect(shouldUseModernAPI).toHaveBeenCalledWith(
        'user-123',
        '123e4567-e89b-12d3-a456-426614174000',
      );
      expect(processBrainRequest).toHaveBeenCalled();
      expect(response.headers.get('X-Implementation')).toBe('modern');
    });

    it('should route to legacy API when feature flag is disabled', async () => {
      // Mock feature flags and legacy route
      const { shouldUseModernAPI } = await import('@/lib/config/featureFlags');
      const { POST: legacyPOST } = await import('../route.legacy');

      vi.mocked(shouldUseModernAPI).mockReturnValue(false);
      vi.mocked(legacyPOST).mockResolvedValue(new Response('Legacy response'));

      const response = await POST(mockRequest);

      expect(shouldUseModernAPI).toHaveBeenCalled();
      expect(legacyPOST).toHaveBeenCalledWith(mockRequest);
    });

    it('should fallback to legacy API on body parsing error', async () => {
      // Create a request with invalid JSON
      const badRequest = new NextRequest('http://localhost:3000/api/brain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ invalid json',
      });

      const { POST: legacyPOST } = await import('../route.legacy');
      vi.mocked(legacyPOST).mockResolvedValue(new Response('Legacy fallback'));

      const response = await POST(badRequest);

      expect(legacyPOST).toHaveBeenCalledWith(badRequest);
    });
  });

  describe('Modern API Implementation', () => {
    it('should handle successful modern API requests', async () => {
      // Setup all mocks for modern API
      const { shouldUseModernAPI, isFeatureEnabled } = await import(
        '@/lib/config/featureFlags'
      );
      const { auth } = await import('@/app/(auth)/auth');
      const { getClientConfig } = await import('@/lib/db/queries');
      const { processBrainRequest } = await import(
        '@/lib/services/brainOrchestrator'
      );

      vi.mocked(shouldUseModernAPI).mockReturnValue(true);
      vi.mocked(isFeatureEnabled).mockReturnValue(true);
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'user-123', clientId: 'client-123' },
      } as any);
      vi.mocked(getClientConfig).mockResolvedValue({
        id: 'client-123',
        name: 'Test Client',
        client_display_name: 'Test Client',
        client_core_mission: null,
        customInstructions: null,
        configJson: null,
      });

      const mockStream = new ReadableStream();
      vi.mocked(processBrainRequest).mockResolvedValue({
        success: true,
        stream: mockStream,
        correlationId: 'test-correlation-id',
        processingTime: 123.45,
      });

      const response = await POST(mockRequest);

      expect(response.headers.get('X-Correlation-ID')).toBe(
        'test-correlation-id',
      );
      expect(response.headers.get('X-Processing-Time')).toBe('123.45ms');
      expect(response.headers.get('X-Implementation')).toBe('modern');
    });

    it('should handle modern API errors gracefully', async () => {
      // Setup mocks to simulate error
      const { shouldUseModernAPI } = await import('@/lib/config/featureFlags');
      const { auth } = await import('@/app/(auth)/auth');
      const { getClientConfig } = await import('@/lib/db/queries');
      const { processBrainRequest } = await import(
        '@/lib/services/brainOrchestrator'
      );

      vi.mocked(shouldUseModernAPI).mockReturnValue(true);
      vi.mocked(auth).mockResolvedValue(null);
      vi.mocked(getClientConfig).mockResolvedValue(null);
      vi.mocked(processBrainRequest).mockResolvedValue({
        success: false,
        error: new Response('Processing error', { status: 500 }),
        correlationId: 'test-correlation-id',
        processingTime: 50.0,
      });

      const response = await POST(mockRequest);

      expect(response.status).toBe(500);
    });

    it('should fallback to legacy on unexpected errors', async () => {
      // Setup mocks to throw unexpected error
      const { shouldUseModernAPI } = await import('@/lib/config/featureFlags');
      const { auth } = await import('@/app/(auth)/auth');
      const { POST: legacyPOST } = await import('../route.legacy');

      vi.mocked(shouldUseModernAPI).mockReturnValue(true);
      vi.mocked(auth).mockRejectedValue(new Error('Auth service down'));
      vi.mocked(legacyPOST).mockResolvedValue(new Response('Legacy fallback'));

      const response = await POST(mockRequest);

      expect(legacyPOST).toHaveBeenCalledWith(mockRequest);
    });
  });

  describe('Health Check Endpoint', () => {
    it('should return health status for GET requests with health mode', async () => {
      const { isFeatureEnabled } = await import('@/lib/config/featureFlags');
      vi.mocked(isFeatureEnabled).mockImplementation((flag) => {
        return flag === 'enableDetailedLogging';
      });

      const healthRequest = new NextRequest(
        'http://localhost:3000/api/brain?mode=health',
        {
          method: 'GET',
        },
      );

      const response = await GET(healthRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.implementation).toBe('modern');
      expect(data.features).toEqual({
        modernAPI: false,
        detailedLogging: true,
        performanceMetrics: false,
        abTesting: false,
      });
    });

    it('should return 405 for GET requests without health mode', async () => {
      const getRequest = new NextRequest('http://localhost:3000/api/brain', {
        method: 'GET',
      });

      const response = await GET(getRequest);
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toBe('Method not allowed');
    });
  });

  describe('Configuration Handling', () => {
    it('should handle requests without user session', async () => {
      const { shouldUseModernAPI } = await import('@/lib/config/featureFlags');
      const { auth } = await import('@/app/(auth)/auth');
      const { getClientConfig } = await import('@/lib/db/queries');
      const { processBrainRequest } = await import(
        '@/lib/services/brainOrchestrator'
      );

      vi.mocked(shouldUseModernAPI).mockReturnValue(true);
      vi.mocked(auth).mockResolvedValue(null); // No session
      vi.mocked(getClientConfig).mockResolvedValue({
        id: 'client-123',
        name: 'Test Client',
        client_display_name: 'Test Client',
        client_core_mission: null,
        customInstructions: null,
        configJson: null,
      });
      vi.mocked(processBrainRequest).mockResolvedValue({
        success: true,
        stream: new ReadableStream(),
        correlationId: 'test-correlation-id',
        processingTime: 100.0,
      });

      const response = await POST(mockRequest);

      expect(processBrainRequest).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          clientConfig: null,
          enableToolExecution: true,
          maxTools: 5,
          streamingEnabled: true,
        }),
      );
    });

    it('should use client configuration when available', async () => {
      const { shouldUseModernAPI, isFeatureEnabled } = await import(
        '@/lib/config/featureFlags'
      );
      const { auth } = await import('@/app/(auth)/auth');
      const { getClientConfig } = await import('@/lib/db/queries');
      const { processBrainRequest } = await import(
        '@/lib/services/brainOrchestrator'
      );

      const mockClientConfig = {
        id: 'client-123',
        name: 'Test Client',
        client_display_name: 'Test Client',
        client_core_mission: 'Test mission',
        customInstructions: 'Test instructions',
        configJson: {
          specialistPrompts: {},
          orchestrator_client_context: 'Test context',
          available_bit_ids: ['bit-1', 'bit-2'],
          tool_configs: {},
        },
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(shouldUseModernAPI).mockReturnValue(true);
      vi.mocked(isFeatureEnabled).mockReturnValue(true);
      vi.mocked(auth).mockResolvedValue({
        user: { id: 'user-123', clientId: 'client-123' },
      } as any);
      vi.mocked(getClientConfig).mockResolvedValue(mockClientConfig);
      vi.mocked(processBrainRequest).mockResolvedValue({
        success: true,
        stream: new ReadableStream(),
        correlationId: 'test-correlation-id',
        processingTime: 150.0,
      });

      const response = await POST(mockRequest);

      expect(getClientConfig).toHaveBeenCalledWith('client-123');
      expect(processBrainRequest).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          clientConfig: mockClientConfig,
          enableCaching: true,
        }),
      );
    });
  });
});
