import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { db } from '@/lib/db/client';
import { account, user } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * API endpoint to disconnect a provider account
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { provider } = await request.json();

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 },
      );
    }

    // Only allow supported providers
    if (!['asana', 'google'].includes(provider)) {
      return NextResponse.json(
        { error: `Unsupported provider: ${provider}` },
        { status: 400 },
      );
    }

    logger.debug('AuthDisconnect', `Disconnecting ${provider} account`, {
      userId: session.user.id,
      provider,
    });

    // Check if account exists before attempting to delete
    const existingAccount = await db.query.account.findFirst({
      where: and(
        eq(account.userId, session.user.id),
        eq(account.provider, provider),
      ),
    });

    if (!existingAccount) {
      // If the account doesn't exist in the database but the session still has provider data,
      // we'll handle it as a successful operation and just return success
      logger.warn(
        'AuthDisconnect',
        `No ${provider} account found in database, but session may still have references`,
        {
          userId: session.user.id,
        },
      );

      // Return success even if account doesn't exist, as the goal is to ensure the session is clean
      return NextResponse.json({
        success: true,
        message: `${provider} account disconnected successfully (already removed from database)`,
      });
    }

    // Delete the provider account from the database
    const result = await db
      .delete(account)
      .where(
        and(
          eq(account.userId, session.user.id),
          eq(account.provider, provider),
        ),
      )
      .returning({ id: account.id });

    logger.info(
      'AuthDisconnect',
      `Successfully disconnected ${provider} account`,
      {
        userId: session.user.id,
        accountId: result[0].id,
      },
    );

    // Return success response with updated session data
    return NextResponse.json({
      success: true,
      message: `${provider} account disconnected successfully`,
      session: {
        ...session,
        user: {
          ...session.user,
          [`${provider}ProviderAccountId`]: undefined,
        },
      },
    });
  } catch (error) {
    logger.error('AuthDisconnect', 'Error disconnecting account', {
      userId: session.user.id,
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Failed to disconnect account' },
      { status: 500 },
    );
  }
}
