import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { AsanaMcpClient } from '@/lib/ai/clients/asanaMcpClient';
import { db } from '@/lib/db/client';
import { account } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { refreshAsanaToken } from '@/lib/auth/token-refresh';
import { auth } from '@/app/(auth)/auth';

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
  name = 'asana_mcp';
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
    logger.debug('AsanaMcpTool', 'Starting execution with args:', {
      requestId,
      args: JSON.stringify(args),
    });

    // Get the current user's session
    const session = await auth();
    if (!session?.user?.id) {
      const errorMsg =
        'User not authenticated. Please sign in to use Asana features.';
      logger.error('AsanaMcpTool', errorMsg, { requestId });
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

    try {
      // Get user's Asana account details
      const userAsanaAccount = await db.query.account.findFirst({
        where: and(eq(account.userId, userId), eq(account.provider, 'asana')),
      });

      logger.debug('AsanaMcpTool', 'Asana account query result:', {
        requestId,
        found: !!userAsanaAccount,
        accountDetails: userAsanaAccount
          ? {
              id: userAsanaAccount.id,
              provider: userAsanaAccount.provider,
              userId: userAsanaAccount.userId,
              hasAccessToken: !!userAsanaAccount.access_token,
              hasRefreshToken: !!userAsanaAccount.refresh_token,
              expiresAt: userAsanaAccount.expires_at,
              providerAccountId: userAsanaAccount.providerAccountId,
            }
          : null,
      });

      if (!userAsanaAccount) {
        const errorMsg =
          'Asana account not connected. Please connect your Asana account through the application settings.';
        logger.error('AsanaMcpTool', errorMsg, { requestId });
        return errorMsg;
      }

      // Check if token needs refresh
      const tokenExpiry = userAsanaAccount.expires_at
        ? new Date(userAsanaAccount.expires_at).getTime()
        : 0;
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (!userAsanaAccount.access_token || tokenExpiry - now < fiveMinutes) {
        logger.debug('AsanaMcpTool', 'Token needs refresh', {
          requestId,
          tokenExpiry,
          now,
          timeUntilExpiry: tokenExpiry - now,
          hasRefreshToken: !!userAsanaAccount.refresh_token,
        });

        try {
          await refreshAsanaToken(userId);
          // Fetch the updated account details
          const refreshedAccount = await db.query.account.findFirst({
            where: and(
              eq(account.userId, userId),
              eq(account.provider, 'asana'),
            ),
          });

          logger.debug('AsanaMcpTool', 'Token refresh result:', {
            requestId,
            refreshSuccess: !!refreshedAccount?.access_token,
            newExpiryTime: refreshedAccount?.expires_at,
          });

          if (!refreshedAccount?.access_token) {
            throw new Error('Failed to refresh Asana token');
          }

          userAsanaAccount.access_token = refreshedAccount.access_token;
          userAsanaAccount.expires_at = refreshedAccount.expires_at;
        } catch (error: unknown) {
          const errorMsg =
            'Failed to refresh Asana token. Please try reconnecting your Asana account.';
          logger.error('AsanaMcpTool', errorMsg, {
            requestId,
            error,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
          return errorMsg;
        }
      }

      // Initialize and use AsanaMcpClient
      const client = new AsanaMcpClient(userAsanaAccount.access_token);
      let mcpResponse: { success: boolean; data?: any; error?: string };

      try {
        await client.connect();
        mcpResponse = await client.sendCommand(actionDescription);
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
