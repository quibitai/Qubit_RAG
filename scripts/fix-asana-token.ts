import { config } from 'dotenv';
import { db } from '../lib/db/client';
import { account } from '../lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../lib/logger';

// Load environment variables
config({ path: '.env.local' });

async function fixAsanaToken() {
  console.log('🔧 Starting Asana token fix script');
  console.log('This script will:');
  console.log('1. Get the current Asana JWT token from the database');
  console.log('2. Extract the refresh_token from the JWT payload');
  console.log('3. Use the refresh_token to get a new opaque token from Asana');
  console.log('4. Update the database with the opaque token');
  console.log('--------------------------------------------------');

  try {
    // 1. Fetch the Asana account record
    const asanaAccounts = await db.query.account.findMany({
      where: eq(account.provider, 'asana'),
    });

    if (asanaAccounts.length === 0) {
      console.error('❌ No Asana accounts found in the database');
      return;
    }

    console.log(`📊 Found ${asanaAccounts.length} Asana account(s)`);

    for (const asanaAccount of asanaAccounts) {
      console.log(`Processing account for user ID: ${asanaAccount.userId}`);

      if (!asanaAccount.access_token) {
        console.error('❌ No access token found for this account');
        continue;
      }

      // 2. Check if the token is a JWT
      const isJwt =
        asanaAccount.access_token.includes('.') &&
        asanaAccount.access_token.split('.').length === 3;

      if (!isJwt) {
        console.log('✅ Account already has a non-JWT token. Skipping.');
        continue;
      }

      // 3. Extract refresh_token from JWT or use stored refresh token
      let refreshToken = asanaAccount.refresh_token;

      if (!refreshToken) {
        try {
          // Try to extract from JWT payload
          const payload = JSON.parse(
            Buffer.from(
              asanaAccount.access_token.split('.')[1],
              'base64',
            ).toString(),
          );

          console.log('JWT payload found with fields:', Object.keys(payload));

          if (payload.refresh_token) {
            if (typeof payload.refresh_token === 'string') {
              refreshToken = payload.refresh_token;
              console.log('✅ Extracted string refresh_token from JWT payload');
            } else if (typeof payload.refresh_token === 'number') {
              // Asana sometimes provides refresh token as a number in the JWT
              refreshToken = payload.refresh_token.toString();
              console.log(
                '✅ Extracted numeric refresh_token from JWT payload',
              );
            }
          }
        } catch (e) {
          console.error('❌ Error extracting data from JWT:', e);
        }
      }

      if (!refreshToken) {
        console.error('❌ No refresh token available. Cannot proceed.');
        continue;
      }

      // 4. Use refresh token to get a new opaque token
      console.log('🔄 Using refresh token to request new opaque token...');

      const tokenEndpoint =
        process.env.ASANA_OAUTH_TOKEN_URL ||
        'https://app.asana.com/-/oauth_token';
      const clientId = process.env.ASANA_OAUTH_CLIENT_ID;
      const clientSecret = process.env.ASANA_OAUTH_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        console.error(
          '❌ Missing OAuth client credentials in environment variables',
        );
        continue;
      }

      const refreshParams = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      });

      try {
        const refreshResponse = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: refreshParams.toString(),
        });

        if (!refreshResponse.ok) {
          const errorText = await refreshResponse.text();
          console.error(
            `❌ Token refresh failed: ${refreshResponse.status} ${errorText}`,
          );
          continue;
        }

        const tokens = await refreshResponse.json();

        if (!tokens.access_token) {
          console.error('❌ No access_token in refresh response');
          continue;
        }

        // Check if the new token is opaque (not a JWT)
        const isNewTokenJwt =
          tokens.access_token.includes('.') &&
          tokens.access_token.split('.').length === 3;

        if (isNewTokenJwt) {
          console.warn('⚠️ Refresh still returned a JWT access token');
        } else {
          console.log('✅ Successfully obtained opaque token!');
        }

        // 5. Update the database with the new token
        const updateData: any = {
          access_token: tokens.access_token,
        };

        // Update refresh token if we got a new one
        if (tokens.refresh_token) {
          updateData.refresh_token = tokens.refresh_token;
        }

        // Update expiry if provided
        if (tokens.expires_in) {
          const expiresAt = Date.now() + tokens.expires_in * 1000;
          updateData.expires_at = expiresAt;
        }

        // Update token type if provided
        if (tokens.token_type) {
          updateData.token_type = tokens.token_type;
        }

        await db
          .update(account)
          .set(updateData)
          .where(
            and(eq(account.provider, 'asana'), eq(account.id, asanaAccount.id)),
          );

        console.log('✅ Database updated with new token');

        // Test the new token against Asana API
        console.log('🔄 Testing new token against Asana API...');

        const validationResponse = await fetch(
          'https://app.asana.com/api/1.0/users/me',
          {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
          },
        );

        if (validationResponse.ok) {
          console.log('✅ Token is valid for Asana REST API');
        } else {
          console.warn(
            `⚠️ Token validation against REST API failed: ${validationResponse.status}`,
          );
        }

        // Test the new token against Asana MCP server
        console.log('🔄 Testing new token against Asana MCP server...');

        const mcpValidationResponse = await fetch('https://mcp.asana.com/sse', {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        });

        if (mcpValidationResponse.ok) {
          console.log('✅ Token is valid for Asana MCP server!');
        } else {
          const mcpErrorText = await mcpValidationResponse.text();
          console.warn(
            `⚠️ Token validation against MCP server failed: ${mcpValidationResponse.status} ${mcpErrorText}`,
          );
        }
      } catch (error) {
        console.error('❌ Error during token refresh:', error);
      }
    }

    console.log('--------------------------------------------------');
    console.log('Script completed');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
fixAsanaToken()
  .catch(console.error)
  .finally(() => process.exit());
