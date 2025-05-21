/**
 * This script provides a direct approach to obtaining a Personal Access Token
 * from Asana that should work with both the REST API and the MCP server.
 */

async function getAsanaDirectToken() {
  console.log('🔑 Asana Direct Token Solution');
  console.log('--------------------------------------------------');
  console.log(
    'The JWT format token we have in the database cannot be fixed via a refresh operation.',
  );
  console.log(
    'Instead, we recommend creating a Personal Access Token (PAT) directly from Asana:',
  );
  console.log('');
  console.log('1. Go to https://app.asana.com/0/developer-console');
  console.log('2. Click on "Personal Access Tokens" tab');
  console.log('3. Click "+ Create new token"');
  console.log('4. Give it a name like "MCP Connection"');
  console.log(
    '5. Copy the token - it should look like: "1/1234567890:abcdefghijklmno"',
  );
  console.log('6. Update your database record with this token');
  console.log('');
  console.log(
    'The token format from PAT is opaque and compatible with both REST API and MCP server.',
  );
  console.log('--------------------------------------------------');

  // See if we can help with a direct SQL statement for updating
  console.log('SQL statement to update your database:');
  console.log(`
UPDATE account 
SET access_token = 'YOUR_NEW_PERSONAL_ACCESS_TOKEN' 
WHERE provider = 'asana';
  `);
  console.log('--------------------------------------------------');

  console.log('Alternative manual approach:');
  console.log('1. Stop your application');
  console.log('2. Open the SQL admin tool for your database');
  console.log('3. Find the account table, locate the Asana account row');
  console.log('4. Update the access_token field with your new PAT');
  console.log('5. Restart your application');
  console.log('--------------------------------------------------');
}

// Run the script
getAsanaDirectToken().catch(console.error);
