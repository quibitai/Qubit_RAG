/**
 * Asana API client for making authenticated requests
 */

import { ASANA_API_BASE_URL, DEFAULT_HEADERS } from '../constants';
import { ASANA_PAT, ASANA_REQUEST_TIMEOUT_MS } from '../config';
import {
  AsanaIntegrationError,
  handleAsanaApiError,
  logAndFormatError,
} from '../utils/errorHandler';
import { withRetry, type RetryOptions } from './retryHandler';

/**
 * Base Asana API client class
 */
export class AsanaApiClient {
  private apiBaseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeoutMs: number;

  constructor(
    private readonly apiKey: string = ASANA_PAT || '',
    apiBaseUrl: string = ASANA_API_BASE_URL,
    timeoutMs: number = ASANA_REQUEST_TIMEOUT_MS,
  ) {
    this.apiBaseUrl = apiBaseUrl;
    this.timeoutMs = timeoutMs;

    // Set up default headers with authentication
    this.defaultHeaders = {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (!this.apiKey) {
      console.warn(
        'AsanaApiClient initialized without API key. Requests will fail.',
      );
    }
  }

  /**
   * Makes an authenticated request to the Asana API
   *
   * @param endpoint The API endpoint path (without base URL)
   * @param method The HTTP method
   * @param body Optional request body for POST/PUT requests
   * @param queryParams Optional query parameters
   * @param requestId Optional request ID for logging
   * @param retryOptions Optional retry options
   * @returns The response from the API
   * @throws AsanaIntegrationError if the request fails
   */
  public async request<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    queryParams?: Record<string, string | string[]>,
    requestId?: string,
    retryOptions?: Partial<RetryOptions>,
  ): Promise<T> {
    const finalRetryOptions = { ...ASANA_RETRY_OPTIONS, ...retryOptions };

    const operation = async (): Promise<T> => {
      try {
        // Construct the full URL with query parameters
        let url = `${this.apiBaseUrl}/${endpoint.replace(/^\//, '')}`;

        if (queryParams && Object.keys(queryParams).length > 0) {
          const params = new URLSearchParams();

          for (const [key, value] of Object.entries(queryParams)) {
            if (Array.isArray(value)) {
              for (const item of value) {
                params.append(key, item);
              }
            } else {
              params.append(key, value);
            }
          }

          url = `${url}?${params.toString()}`;
        }

        console.log(
          `[AsanaApiClient] [${requestId || 'no-id'}] ${method} ${url}`,
        );

        // Set up request options
        const options: RequestInit = {
          method,
          headers: this.defaultHeaders,
        };

        // Add body for POST/PUT requests
        if (body && (method === 'POST' || method === 'PUT')) {
          options.body = JSON.stringify(body);
        }

        // Set up timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `Request to ${url} timed out after ${this.timeoutMs}ms`,
                ),
              ),
            this.timeoutMs,
          );
        });

        // Make the request with timeout
        const response = (await Promise.race([
          fetch(url, options),
          timeoutPromise,
        ])) as Response;

        // Handle non-200 responses
        if (!response.ok) {
          const errorText = await response.text();
          let errorData: any;

          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            errorData = { error: errorText };
          }

          const apiError = new AsanaIntegrationError(
            `API responded with status ${response.status}`,
            `${method} ${endpoint}`,
            errorData,
            requestId,
          );

          // Add status and headers to error for retry logic
          (apiError as any).status = response.status;
          (apiError as any).headers = Object.fromEntries(
            response.headers.entries(),
          );

          throw apiError;
        }

        // Parse JSON response
        const responseData = await response.json();
        return responseData.data as T;
      } catch (error: any) {
        if (error instanceof AsanaIntegrationError) {
          throw error;
        }

        throw handleAsanaApiError(error, `${method} ${endpoint}`, requestId);
      }
    };

    // Execute with retry logic
    const result = await withRetry(operation, finalRetryOptions, requestId);

    if (result.success) {
      if (requestId && result.attemptCount > 1) {
        console.log(
          `[AsanaApiClient] [${requestId}] Request succeeded after ${result.attemptCount} attempts (${result.totalDuration}ms total)`,
        );
      }
      if (result.data !== undefined) {
        return result.data;
      } else {
        throw new Error('Operation succeeded but no data was returned');
      }
    } else {
      throw result.error;
    }
  }

  /**
   * Get resource by GID
   *
   * @param resourceType The Asana resource type (tasks, projects, etc.)
   * @param gid The resource GID
   * @param fields Optional fields to include in the response
   * @param requestId Optional request ID for logging
   * @returns The resource data
   */
  public async getResourceByGid<T = any>(
    resourceType: string,
    gid: string,
    fields?: string[],
    requestId?: string,
  ): Promise<T> {
    const queryParams: Record<string, string | string[]> = {};

    if (fields && fields.length > 0) {
      queryParams.opt_fields = fields.join(',');
    }

    return this.request<T>(
      `${resourceType}/${gid}`,
      'GET',
      undefined,
      queryParams,
      requestId,
    );
  }

  /**
   * Create a new resource
   *
   * @param resourceType The Asana resource type (tasks, projects, etc.)
   * @param data The resource data
   * @param requestId Optional request ID for logging
   * @returns The created resource data
   */
  public async createResource<T = any, D = any>(
    resourceType: string,
    data: D,
    requestId?: string,
  ): Promise<T> {
    return this.request<T>(
      resourceType,
      'POST',
      { data },
      undefined,
      requestId,
    );
  }

  /**
   * Update an existing resource
   *
   * @param resourceType The Asana resource type (tasks, projects, etc.)
   * @param gid The resource GID
   * @param data The resource data to update
   * @param requestId Optional request ID for logging
   * @returns The updated resource data
   */
  public async updateResource<T = any, D = any>(
    resourceType: string,
    gid: string,
    data: D,
    requestId?: string,
  ): Promise<T> {
    return this.request<T>(
      `${resourceType}/${gid}`,
      'PUT',
      { data },
      undefined,
      requestId,
    );
  }
}

/**
 * Create a new Asana API client instance
 */
export function createAsanaClient(apiKey?: string): AsanaApiClient {
  return new AsanaApiClient(apiKey);
}

/**
 * Default retry options for Asana API requests
 * More conservative than generic retries due to API rate limits
 */
const ASANA_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 2, // Reduced for API calls
  baseDelay: 2000, // 2 seconds base delay
  maxDelay: 60000, // 1 minute max delay for rate limits
  backoffMultiplier: 2.5,
};
