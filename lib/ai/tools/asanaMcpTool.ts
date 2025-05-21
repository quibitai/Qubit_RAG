/**
 * Asana MCP Tool
 * This tool connects to the Asana Model Context Protocol (MCP) server
 * to perform operations on Asana tasks and projects.
 */

import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { AsanaMcpClient } from '@/lib/ai/clients/asanaMcpClient';
import { db } from '@/lib/db/client';
import { account } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { tokenManager } from '@/lib/auth/tokenManager';
import type { TokenData } from '@/lib/auth/tokenManager';
import { auth } from '@/app/(auth)/auth';
import { McpError } from '@/lib/ai/clients/baseMcpClient';
import type { McpResponse } from '@/lib/ai/clients/baseMcpClient';

// Define the input schema for the Asana MCP tool
const AsanaMcpToolInputSchema = z.object({
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
 * AsanaMcpTool - A LangChain tool for interacting with Asana via the Model Context Protocol (MCP)
 * This tool requires the user to have connected their Asana account through OAuth.
 */
class AsanaMcpTool extends Tool {
  name = 'asanaMcp';
  description =
    'A tool that connects to Asana via the official Asana MCP server to perform operations. ' +
    'Use this for managing Asana tasks and projects, such as creating, listing, updating tasks, ' +
    'or getting project statuses. Use natural language to describe the desired operation. ' +
    'Requires the user to have connected their Asana account. ' +
    "Example input: \"Create a task 'Review Q1 report' in the 'Marketing' project.\"";

  zodSchema = AsanaMcpToolInputSchema;

  /**
   * Execute the Asana MCP operation
   * @param args The tool input arguments
   * @returns A promise that resolves to the operation result as a string
   */
  protected async _call(
    args: z.infer<typeof AsanaMcpToolInputSchema>,
  ): Promise<string> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Add initial logging
    logger.debug('AsanaMcpTool', 'Starting Asana MCP tool execution', {
      requestId,
      timestamp: new Date().toISOString(),
      args: JSON.stringify(args),
    });

    try {
      // Get the current user's session
      logger.debug('AsanaMcpTool', 'Attempting to get session', {
        requestId,
        timestamp: new Date().toISOString(),
      });

      const session = await auth();

      logger.debug('AsanaMcpTool', 'Session retrieved', {
        requestId,
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
        timestamp: new Date().toISOString(),
      });

      if (!session?.user?.id) {
        const errorMsg =
          'User not authenticated. Please sign in to use Asana features.';
        logger.error('AsanaMcpTool', errorMsg, {
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
      logger.debug('AsanaMcpTool', 'Using authenticated userId:', {
        requestId,
        userId,
      });

      // Extract action description from various possible input formats
      let actionDescription: string;
      if (args === null || args === undefined) {
        const errorMsg = `Error: Received null or undefined input`;
        logger.error('AsanaMcpTool', errorMsg, { requestId });
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
          logger.error('AsanaMcpTool', errorMsg, {
            requestId,
            args: JSON.stringify(args),
          });
          return errorMsg;
        }
      } else {
        const errorMsg = `Error: Invalid input: Expected string or object, but received ${typeof args}`;
        logger.error('AsanaMcpTool', errorMsg, { requestId });
        return errorMsg;
      }

      if (!actionDescription) {
        const errorMsg = `Error: No action description provided. Cannot determine the Asana request.`;
        logger.error('AsanaMcpTool', errorMsg, { requestId });
        return errorMsg;
      }

      logger.debug('AsanaMcpTool', 'Using action description:', {
        requestId,
        actionDescription,
      });

      // Check if user has connected Asana account
      logger.debug(
        'AsanaMcpTool',
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

      logger.debug('AsanaMcpTool', 'Account lookup result', {
        requestId,
        hasAccount: !!userAsanaAccount,
        accountId: userAsanaAccount?.id,
      });

      if (!userAsanaAccount) {
        const errorMsg =
          'You need to connect your Asana account first. Please go to Settings > Connected Accounts to add Asana.';

        try {
          // Additional diagnostics: Check raw accounts in database
          const rawAccounts = await db.query.account.findMany({
            where: eq(account.userId, userId),
          });

          logger.debug('AsanaMcpTool', 'Raw accounts in database:', {
            requestId,
            userId,
            accountCount: rawAccounts.length,
            accounts: rawAccounts.map((a) => ({
              id: a.id,
              provider: a.provider,
            })),
          });
        } catch (dbError) {
          logger.error('AsanaMcpTool', 'Error getting raw accounts', {
            requestId,
            error: dbError,
          });
        }

        logger.error('AsanaMcpTool', errorMsg, { requestId });
        return errorMsg;
      }

      // Get the token using TokenManager (refreshes automatically if needed)
      let tokenData: TokenData;
      try {
        logger.debug(
          'AsanaMcpTool',
          'Retrieving Asana token from TokenManager',
          {
            requestId,
            userId,
            provider: 'asana',
            accountId: userAsanaAccount.id,
          },
        );

        tokenData = await tokenManager.getToken(userId, 'asana');

        logger.debug('AsanaMcpTool', 'Token retrieved successfully', {
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
        logger.error('AsanaMcpTool', errorMsg, {
          requestId,
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          userId,
          accountId: userAsanaAccount.id,
        });
        return errorMsg;
      }

      // Initialize Asana MCP client
      const client = new AsanaMcpClient(tokenData.access_token);
      let mcpResponse: McpResponse;

      try {
        logger.debug(
          'AsanaMcpTool',
          'Attempting to connect to Asana MCP server',
          {
            requestId,
            tokenType: tokenData.token_type,
            tokenExpiry: tokenData.expires_at,
          },
        );

        await client.connect();

        logger.debug(
          'AsanaMcpTool',
          'Successfully connected to Asana MCP server',
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
          logger.error('AsanaMcpTool', `Asana MCP Error: ${error.message}`, {
            requestId,
            errorCode: error.code,
            errorDetails: error,
          });

          // Provide specific guidance based on error code
          switch (error.code) {
            case 'NOT_CONNECTED':
              errorMsg = `Unable to connect to Asana's server.`;
              userGuidance = `Please try again in a few moments or reconnect your Asana account in settings.`;
              break;
            case 'CONNECTION_FAILED':
              errorMsg = `Failed to establish connection to Asana MCP server.`;
              userGuidance = `Please check your internet connection and try again. If the problem persists, please reconnect your Asana account.`;
              break;
            case 'TIMEOUT':
              errorMsg = `The request to Asana timed out.`;
              userGuidance = `This might be due to temporary server issues. Please try again.`;
              break;
            case 'SEND_ERROR':
              errorMsg = `Failed to send your request to Asana.`;
              userGuidance = `Please try again. If the issue persists, try reconnecting your Asana account.`;
              break;
            default:
              errorMsg = `Asana MCP Error: ${error.message}`;
              userGuidance = `Please try again or reconnect your Asana account if the problem persists.`;
          }
        } else {
          errorMsg = `Error communicating with Asana: ${error instanceof Error ? error.message : 'Unknown error'}`;
          userGuidance = `This might be a temporary issue. Please try again later.`;

          logger.error('AsanaMcpTool', errorMsg, {
            requestId,
            error: error instanceof Error ? error.stack : String(error),
          });
        }

        return `${errorMsg} ${userGuidance}`;
      } finally {
        await client.disconnect();
      }

      if (mcpResponse.success) {
        logger.debug('AsanaMcpTool', 'Command successful:', {
          requestId,
          response: mcpResponse.data,
        });
        return `Success: ${JSON.stringify(mcpResponse.data)}`;
      } else {
        const errorMsg = `Error: ${mcpResponse.error || 'Unknown error occurred'}`;
        logger.error('AsanaMcpTool', errorMsg, {
          requestId,
          error: mcpResponse.error,
        });
        return errorMsg;
      }
    } catch (error) {
      const errorMsg = `Error processing Asana request: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error('AsanaMcpTool', errorMsg, { requestId, error });
      return errorMsg;
    }
  }
}

export const asanaMcpTool = new AsanaMcpTool();
