/**
 * This script guides you through creating a personal access token (PAT) for Asana
 * A PAT is different from an OAuth token and might be needed for certain API operations
 */

import { execSync } from 'node:child_process';
import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log(`
=====================================================
   🔐 Asana Personal Access Token (PAT) Generator
=====================================================

This script will guide you through creating a Personal Access Token
for Asana, which is different from the OAuth tokens used by the app.

Since MCP requires a specific token format, you may need a PAT for testing.

Follow these steps:
`);

function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function generatePAT() {
  console.log(`\n1️⃣ First, you'll need to log in to Asana in your browser`);

  await askQuestion('Press Enter to continue when ready...');

  // Try to open the Asana developer console in the default browser
  try {
    console.log('\n🌐 Opening Asana developer console in your browser...');

    const command =
      process.platform === 'win32'
        ? 'start'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open';

    execSync(
      `${command} https://app.asana.com/0/developer-console/my-access-tokens`,
    );
  } catch (error) {
    console.log('❌ Could not open browser automatically.');
    console.log(
      'Please visit this URL manually: https://app.asana.com/0/developer-console/my-access-tokens',
    );
  }

  console.log(`\n2️⃣ In the Asana developer console:
  - Click on "Personal Access Tokens" tab 
  - Click "+ New Access Token"
  - Enter a name for your token (e.g., "MCP Testing")
  - Click "Create"`);

  const pat = await askQuestion('\n🔑 Copy your new token here: ');

  if (!pat) {
    console.log('❌ No token provided. Exiting.');
    process.exit(1);
  }

  console.log(`\n✅ Your Personal Access Token is: ${pat}`);
  console.log(`\nYou can use this in your tests by setting the environment variable:
  
  export ASANA_ACCESS_TOKEN='${pat}'
  
  Or by adding it to your .env.local file:
  
  ASANA_ACCESS_TOKEN=${pat}
  
  Note: PATs are different from OAuth tokens and may have different access rights.
  They may not work with all Asana API endpoints, particularly newer ones like MCP.
  `);

  await askQuestion('Press Enter to exit...');
  rl.close();
}

generatePAT().catch((error) => {
  console.error('An error occurred:', error);
  rl.close();
});
