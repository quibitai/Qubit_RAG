import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { RealAsanaMcpClient } from '@/lib/ai/clients/asanaMcpClientReal';
import { db } from '@/lib/db/client';
import { account } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { tokenManager } from '@/lib/auth/tokenManager';
import type { TokenData } from '@/lib/auth/tokenManager';
import { auth } from '@/app/(auth)/auth';
import { McpError } from '@/lib/ai/clients/baseMcpClient';
import type { McpResponse } from '@/lib/ai/clients/baseMcpClient';

// Define the input schema for the Real Asana MCP tool
const RealAsanaMcpToolInputSchema = z.object({
  action_description: z
    .string()
    .describe(
      'A clear, natural language description of the Asana operation to be performed via the Asana MCP server. ' +
        "Example: \"Create a task 'Review Q1 report' in the 'Marketing' project.\" " +
        'Or: "List all my incomplete tasks in the Marketing project." ' +
        'Or: "Update the description of my \'Website redesign\' task."',
    ),
  input: z
    .string()
    .optional()
    .describe(
      'Alternative way to provide the action description, for compatibility with some LLM formats.',
    ),
  toolInput: z
    .object({
      action_description: z.string(),
    })
    .optional()
    .describe('Tool-specific input format for some LLM integrations.'),
});

/**
 * RealAsanaMcpTool - A LangChain tool for interacting with Asana via the REAL Model Context Protocol (MCP)
 * This bypasses development mode checks and always attempts a real connection
 */
class RealAsanaMcpTool extends Tool {
  name = 'realAsanaMcp';
  description =
    'A tool that forces a real connection to Asana via the official Asana MCP server to perform operations. ' +
    'Use this for managing Asana tasks and projects, such as creating, listing, updating tasks, ' +
    'or getting project statuses. Use natural language to describe the desired operation. ' +
    'Requires the user to have connected their Asana account. ' +
    "Example input: \"Create a task 'Review Q1 report' in the 'Marketing' project.\"";

  zodSchema = RealAsanaMcpToolInputSchema;

  /**
   * Execute the Asana MCP operation with real connection
   * @param args The tool input arguments
   * @returns A promise that resolves to the operation result as a string
   */
  protected async _call(
    args: z.infer<typeof RealAsanaMcpToolInputSchema>,
  ): Promise<string> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Add initial logging
    logger.debug(
      'RealAsanaMcpTool',
      '🔴 Starting REAL Asana MCP tool execution',
      {
        requestId,
        timestamp: new Date().toISOString(),
        args: JSON.stringify(args),
      },
    );

    try {
      // Get the current user's session
      logger.debug('RealAsanaMcpTool', 'Attempting to get session', {
        requestId,
        timestamp: new Date().toISOString(),
      });

      const session = await auth();

      logger.debug('RealAsanaMcpTool', 'Session retrieved', {
        requestId,
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
        timestamp: new Date().toISOString(),
      });

      if (!session?.user?.id) {
        const errorMsg =
          'User not authenticated. Please sign in to use Asana features.';
        logger.error('RealAsanaMcpTool', errorMsg, {
          requestId,
          sessionState: {
            hasSession: !!session,
            hasUser: !!session?.user,
            userId: session?.user?.id,
          },
        });
        return errorMsg;
      }

      const userId = session.user.id;
      logger.debug('RealAsanaMcpTool', 'Using authenticated userId:', {
        requestId,
        userId,
      });

      // Extract action description from various possible input formats
      let actionDescription: string;
      if (args === null || args === undefined) {
        const errorMsg = `Error: Received null or undefined input`;
        logger.error('RealAsanaMcpTool', errorMsg, { requestId });
        return errorMsg;
      }

      if (typeof args === 'string') {
        actionDescription = args;
      } else if (typeof args === 'object') {
        if (args.action_description) {
          actionDescription = args.action_description;
        } else if (args.input) {
          actionDescription = args.input;
        } else if (
          args.toolInput &&
          typeof args.toolInput === 'object' &&
          (args.toolInput as { action_description?: string }).action_description
        ) {
          actionDescription = (args.toolInput as { action_description: string })
            .action_description;
        } else {
          const errorMsg = `Error: Invalid input: Missing 'action_description', 'input', or valid 'toolInput' field`;
          logger.error('RealAsanaMcpTool', errorMsg, {
            requestId,
            args: JSON.stringify(args),
          });
          return errorMsg;
        }
      } else {
        const errorMsg = `Error: Invalid input: Expected string or object, but received ${typeof args}`;
        logger.error('RealAsanaMcpTool', errorMsg, { requestId });
        return errorMsg;
      }

      if (!actionDescription) {
        const errorMsg = `Error: No action description provided. Cannot determine the Asana request.`;
        logger.error('RealAsanaMcpTool', errorMsg, { requestId });
        return errorMsg;
      }

      logger.debug('RealAsanaMcpTool', 'Using action description:', {
        requestId,
        actionDescription,
      });

      // Check if user has connected Asana account
      logger.debug(
        'RealAsanaMcpTool',
        'Querying account table for Asana credentials',
        {
          requestId,
          userId,
          provider: 'asana',
          tableName: 'account',
          query: {
            userId,
            provider: 'asana',
          },
        },
      );

      const userAsanaAccount = await db.query.account.findFirst({
        where: and(eq(account.userId, userId), eq(account.provider, 'asana')),
      });

      // Enhanced debugging for account lookup
      logger.debug('RealAsanaMcpTool', 'Account lookup result', {
        requestId,
        userId,
        provider: 'asana',
        accountFound: !!userAsanaAccount,
        tableName: 'account',
        accountDetails: userAsanaAccount
          ? {
              id: userAsanaAccount.id,
              providerAccountId: userAsanaAccount.providerAccountId,
              hasAccessToken: !!userAsanaAccount.access_token,
              hasRefreshToken: !!userAsanaAccount.refresh_token,
              expiresAt: userAsanaAccount.expires_at,
              tokenType: userAsanaAccount.token_type,
              scope: userAsanaAccount.scope,
            }
          : null,
      });

      if (!userAsanaAccount) {
        const errorMsg =
          'Asana account not connected. Please connect your Asana account through the application settings.';
        logger.error('RealAsanaMcpTool', errorMsg, { requestId });
        return errorMsg;
      }

      // Get the token using TokenManager (refreshes automatically if needed)
      let tokenData: TokenData;
      try {
        logger.debug(
          'RealAsanaMcpTool',
          'Retrieving Asana token from TokenManager',
          {
            requestId,
            userId,
            provider: 'asana',
            accountId: userAsanaAccount.id,
          },
        );

        tokenData = await tokenManager.getToken(userId, 'asana');

        logger.debug('RealAsanaMcpTool', 'Token retrieved successfully', {
          requestId,
          hasAccessToken: !!tokenData.access_token,
          accessTokenLength: tokenData.access_token?.length || 0,
          hasRefreshToken: !!tokenData.refresh_token,
          tokenExpiry: tokenData.expires_at,
          tokenType: tokenData.token_type,
          scope: tokenData.scope,
        });
      } catch (error) {
        const errorMsg =
          'Failed to obtain Asana token. Please try reconnecting your Asana account.';
        logger.error('RealAsanaMcpTool', errorMsg, {
          requestId,
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          userId,
          accountId: userAsanaAccount.id,
        });
        return errorMsg;
      }

      // Initialize and use RealAsanaMcpClient
      const client = new RealAsanaMcpClient(tokenData.access_token);
      let mcpResponse: McpResponse;

      try {
        logger.info(
          'RealAsanaMcpTool',
          '🔴 Attempting to connect to REAL Asana MCP server',
          {
            requestId,
            tokenType: tokenData.token_type,
            tokenExpiry: tokenData.expires_at,
          },
        );

        await client.connect();

        logger.info(
          'RealAsanaMcpTool',
          '✅ Successfully connected to REAL Asana MCP server',
          {
            requestId,
          },
        );

        mcpResponse = await client.sendCommand(actionDescription);
      } catch (error) {
        // Create a user-friendly error message with troubleshooting steps
        let errorMsg = '';
        let userGuidance = '';

        if (error instanceof McpError) {
          logger.error(
            'RealAsanaMcpTool',
            `REAL Asana MCP Error: ${error.message}`,
            {
              requestId,
              errorCode: error.code,
              errorDetails: error,
            },
          );

          // Provide specific guidance based on error code
          switch (error.code) {
            case 'NOT_CONNECTED':
              errorMsg = `Unable to connect to Asana's server.`;
              userGuidance = `Please check that the Asana MCP server URL is correctly configured and that your access token has the necessary permissions.`;
              break;
            case 'CONNECTION_FAILED':
              errorMsg = `Failed to establish connection to Asana MCP server.`;
              userGuidance = `Please check your internet connection and the Asana MCP server URL. The server might be unavailable or the URL might be incorrect.`;
              break;
            case 'TIMEOUT':
              errorMsg = `The request to Asana timed out.`;
              userGuidance = `This might be due to server issues or network latency. Please try again with a simpler request.`;
              break;
            case 'SEND_ERROR':
              errorMsg = `Failed to send your request to Asana.`;
              userGuidance = `The request format might be incorrect or the Asana MCP server endpoint might be misconfigured.`;
              break;
            default:
              errorMsg = `Asana MCP Error: ${error.message}`;
              userGuidance = `Please check the Asana API documentation for more information about this error.`;
          }
        } else {
          errorMsg = `Error communicating with Asana: ${error instanceof Error ? error.message : 'Unknown error'}`;
          userGuidance = `This might be due to misconfiguration or Asana API changes. Please check server logs for more details.`;

          logger.error('RealAsanaMcpTool', errorMsg, {
            requestId,
            error: error instanceof Error ? error.stack : String(error),
          });
        }

        return `${errorMsg} ${userGuidance}`;
      } finally {
        await client.disconnect();
      }

      if (mcpResponse.success) {
        logger.debug('RealAsanaMcpTool', 'Command successful:', {
          requestId,
          response: mcpResponse.data,
        });
        return `Success: ${JSON.stringify(mcpResponse.data)}`;
      } else {
        const errorMsg = `Error: ${mcpResponse.error || 'Unknown error occurred'}`;
        logger.error('RealAsanaMcpTool', errorMsg, {
          requestId,
          error: mcpResponse.error,
        });
        return errorMsg;
      }
    } catch (error) {
      const errorMsg = `Error processing Asana request: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error('RealAsanaMcpTool', errorMsg, { requestId, error });
      return errorMsg;
    }
  }
}

export const realAsanaMcpTool = new RealAsanaMcpTool();
