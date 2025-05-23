/**
 * Debug script for n8nMcpGatewayTool
 * Run this with: NODE_OPTIONS='--require dotenv/config' node scripts/debug-n8n-tool.js
 */

// Start a simple HTTP server to test the n8n tool
const http = require('http');
const url = require('url');

// Create HTTP server
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST') {
    try {
      // Read request body
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const { query, format } = JSON.parse(body);

          console.log(`\n=== RECEIVED TEST REQUEST ===`);
          console.log(`Query: ${query}`);
          console.log(`Format: ${format || 'default'}`);

          let testArgs;
          // Format the args based on specified format
          switch (format) {
            case 'openai':
              testArgs = {
                arguments: JSON.stringify({
                  task_description: query,
                }),
              };
              break;
            case 'input':
              testArgs = { input: query };
              break;
            case 'string':
              testArgs = query;
              break;
            default:
              testArgs = { task_description: query };
          }

          console.log(`Test args:`, JSON.stringify(testArgs, null, 2));

          // Import dynamically to ensure environment variables are loaded
          const { default: directN8nFetch } = await import(
            '../scripts/direct-n8n-fetch.js'
          );

          // Make direct fetch to n8n
          console.log(`\n=== MAKING DIRECT FETCH TO N8N ===`);
          const directResult = await directN8nFetch(query);
          console.log(
            `Direct n8n result: `,
            JSON.stringify(directResult, null, 2).substring(0, 500) + '...',
          );

          // Return the result
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              input: testArgs,
              directResult,
            }),
          );
        } catch (error) {
          console.error('Error processing request:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    } catch (error) {
      console.error('Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  } else {
    // Instructions for GET requests
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body>
          <h1>n8n Tool Debug Server</h1>
          <p>Send a POST request to this endpoint with:</p>
          <pre>
          {
            "query": "Your calendar query here",
            "format": "default" // or "openai", "input", "string"
          }
          </pre>
        </body>
      </html>
    `);
  }
});

// Start the server
const PORT = 3456;
server.listen(PORT, () => {
  console.log(`Debug server running at http://localhost:${PORT}/`);
  console.log(
    `Send POST requests with {"query": "Your calendar query", "format": "default"}`,
  );
});
