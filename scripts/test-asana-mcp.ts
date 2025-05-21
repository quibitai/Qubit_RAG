import EventSourcePolyfill from 'eventsource';
import readline from 'readline';

// Create interface for console input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function testAsanaMcpConnection(token: string) {
  console.log('\n=== Testing MCP Connection ===');
  console.log(`Connecting to: https://mcp.asana.com/sse`);
  console.log(
    `Using token: ${token.substring(0, 10)}...${token.substring(token.length - 10)}`,
  );

  // Check token format
  const isJwt =
    token.includes('.') &&
    (token.startsWith('eyJ') ||
      token.match(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/));
  const isOpaque =
    token.match(/^[1-2]\/\d+\/\d+:[a-zA-Z0-9]+$/) ||
    token.match(/^[1-2]\/[a-zA-Z0-9]+$/);

  console.log(
    `Token Format: ${isJwt ? 'JWT' : isOpaque ? 'Opaque' : 'Unknown'}`,
  );

  // Set up connection
  const eventSource = new EventSourcePolyfill('https://mcp.asana.com/sse', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // Set up event handlers
  eventSource.addEventListener('open', () => {
    console.log('✅ Connection opened successfully!');
  });

  eventSource.addEventListener('message', (event) => {
    console.log('Message received:', event.data);
  });

  eventSource.addEventListener('error', (event: any) => {
    console.error('❌ Connection error!');

    // Try to extract more information about the error if possible
    if (event.status === 401) {
      console.error('Authentication failed: 401 Unauthorized');
      console.error(
        'This indicates the token is not valid for the MCP server.',
      );
    } else {
      console.error('Error details:', event);
    }

    // Close connection
    eventSource.close();
    rl.close();
  });

  // Wait for a few seconds to see if connection succeeds
  setTimeout(() => {
    console.log('Test complete.');
    eventSource.close();
    rl.close();
  }, 5000);
}

// Prompt for token
rl.question('Enter your Asana token (access token or PAT): ', (token) => {
  testAsanaMcpConnection(token);
});
