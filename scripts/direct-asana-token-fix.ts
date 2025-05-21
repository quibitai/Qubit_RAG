import { config } from 'dotenv';

// Load environment variables if available
try {
  config({ path: '.env.local' });
} catch (e) {
  console.log('No .env.local file found, continuing anyway');
}

// Set the JWT token that was found in the database
const jwtToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NDc4Mzg1NjgsInNjb3BlIjoiYXR0YWNobWVudHM6d3JpdGUgZ29hbHM6cmVhZCBwcm9qZWN0czpkZWxldGUgcHJvamVjdHM6cmVhZCBwcm9qZWN0czp3cml0ZSBzdG9yaWVzOnJlYWQgdGFza3M6ZGVsZXRlIHRhc2tzOnJlYWQgdGFza3M6d3JpdGUgdGVhbXM6cmVhZCB1c2VyczpyZWFkIHdvcmtzcGFjZXM6cmVhZCB3b3Jrc3BhY2VzLnR5cGVhaGVhZDpyZWFkIG9wZW5pZCBlbWFpbCBwcm9maWxlIiwic3ViIjoxMjA4NDYxODIzNDI2MDcyLCJyZWZyZXNoX3Rva2VuIjoxMjEwMzQzNjIyMzE5OTI2LCJ2ZXJzaW9uIjoyLCJhcHAiOjEyMTAzMjI2OTIwNjAyODMsImV4cCI6MTc0Nzg0MjE2OH0.uryc-meX6tcWYK_qLBfGSlliuKSV6yOuhaJf93Iaidk';

// Get credentials from environment or user input
const asanaClientId = process.env.ASANA_OAUTH_CLIENT_ID || '';
const asanaClientSecret = process.env.ASANA_OAUTH_CLIENT_SECRET || '';

async function directAsanaTokenFix() {
  console.log('🔧 Starting Direct Asana Token Fix');
  console.log('This script will:');
  console.log('1. Decode the JWT token');
  console.log('2. Extract the refresh_token from the JWT payload');
  console.log('3. Use the refresh_token to get a new opaque token from Asana');
  console.log('--------------------------------------------------');

  try {
    // 1. Check if the token is a JWT
    const isJwt = jwtToken.includes('.') && jwtToken.split('.').length === 3;

    if (!isJwt) {
      console.log('❌ The provided token is not a JWT. Cannot proceed.');
      return;
    }

    // 2. Decode the JWT payload
    let payload: any;
    try {
      // Decode the JWT payload
      const base64Payload = jwtToken.split('.')[1];
      const normalizedBase64 = base64Payload
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const paddedBase64 = normalizedBase64.padEnd(
        normalizedBase64.length + ((4 - (normalizedBase64.length % 4)) % 4),
        '=',
      );

      payload = JSON.parse(Buffer.from(paddedBase64, 'base64').toString());

      console.log('✅ Successfully decoded JWT payload');
      console.log('JWT payload contains fields:', Object.keys(payload));

      // Display selected payload information
      console.log('Subject (sub):', payload.sub);
      console.log('Refresh token inside JWT:', payload.refresh_token);
      console.log(
        'Expiration time:',
        new Date(payload.exp * 1000).toLocaleString(),
      );
      console.log('Scopes:', payload.scope);
    } catch (e) {
      console.error('❌ Error decoding JWT payload:', e);
      return;
    }

    // 3. Extract refresh_token from JWT
    let refreshToken = '';

    if (payload.refresh_token) {
      if (typeof payload.refresh_token === 'string') {
        refreshToken = payload.refresh_token;
        console.log('✅ Extracted string refresh_token from JWT payload');
      } else if (typeof payload.refresh_token === 'number') {
        // Asana sometimes provides refresh token as a number in the JWT
        refreshToken = payload.refresh_token.toString();
        console.log(
          '✅ Extracted numeric refresh_token from JWT payload:',
          refreshToken,
        );
      }
    }

    if (!refreshToken) {
      console.error('❌ No refresh token found in the JWT payload');
      return;
    }

    // 4. Check for required OAuth credentials
    if (!asanaClientId || !asanaClientSecret) {
      console.error('❌ Missing Asana OAuth credentials!');
      console.error('Please provide the following environment variables:');
      console.error('- ASANA_OAUTH_CLIENT_ID');
      console.error('- ASANA_OAUTH_CLIENT_SECRET');
      return;
    }

    // 5. Use the refresh token to get a new access token
    console.log('🔄 Using refresh token to request new opaque token...');

    const tokenEndpoint =
      process.env.ASANA_OAUTH_TOKEN_URL ||
      'https://app.asana.com/-/oauth_token';

    const refreshParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: asanaClientId,
      client_secret: asanaClientSecret,
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
        return;
      }

      const tokens = await refreshResponse.json();

      console.log('✅ Token refresh succeeded!');
      console.log('Response contains fields:', Object.keys(tokens));

      if (!tokens.access_token) {
        console.error('❌ No access_token in refresh response');
        return;
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

      // Print the new token details
      console.log('--------------------------------------------------');
      console.log('📋 NEW TOKEN DETAILS:');
      console.log('--------------------------------------------------');
      console.log('Access Token:', tokens.access_token);
      console.log('Token Type:', tokens.token_type);
      if (tokens.refresh_token) {
        console.log('Refresh Token:', tokens.refresh_token);
      }
      if (tokens.expires_in) {
        console.log('Expires In:', tokens.expires_in, 'seconds');
        console.log(
          'Expires At:',
          new Date(Date.now() + tokens.expires_in * 1000).toLocaleString(),
        );
      }
      console.log('--------------------------------------------------');

      // 6. Test the new token against Asana API
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
        const userData = await validationResponse.json();
        console.log('✅ Token is valid for Asana REST API!');
        console.log('User data received:', userData.data?.name);
      } else {
        console.warn(
          `⚠️ Token validation against REST API failed: ${validationResponse.status}`,
        );
      }

      // 7. Test the new token against Asana MCP server
      console.log('🔄 Testing new token against Asana MCP server...');

      try {
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
      } catch (e) {
        console.error('❌ Error testing against MCP server:', e);
      }

      console.log('--------------------------------------------------');
      console.log('🔧 MANUAL UPDATE INSTRUCTIONS:');
      console.log('--------------------------------------------------');
      console.log('To manually update your database, you need to:');
      console.log('1. Connect to your database');
      console.log('2. Find the Asana account record');
      console.log('3. Replace the JWT access_token with this opaque token:');
      console.log(tokens.access_token);
      if (tokens.refresh_token) {
        console.log('4. Update the refresh_token to:');
        console.log(tokens.refresh_token);
      }
      console.log('--------------------------------------------------');
    } catch (error) {
      console.error('❌ Error during token refresh operation:', error);
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the script
directAsanaTokenFix()
  .catch(console.error)
  .finally(() => process.exit());
