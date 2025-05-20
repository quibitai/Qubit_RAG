import fs from 'node:fs';
import path from 'node:path';

/**
 * Script to modify the asanaMcpTool.ts file to use the RealAsanaMcpClient
 * This allows testing a real connection to Asana MCP server in the main application
 * without having to manually edit the files
 */
async function enableRealAsanaMcp() {
  try {
    // Define file paths
    const asanaMcpToolPath = path.resolve('lib/ai/tools/asanaMcpTool.ts');
    const backupPath = path.resolve('lib/ai/tools/asanaMcpTool.ts.bak');

    console.log(
      '🔄 Enabling real Asana MCP connection in the main application',
    );

    // Check if asanaMcpTool.ts exists
    if (!fs.existsSync(asanaMcpToolPath)) {
      console.error(`❌ Error: ${asanaMcpToolPath} does not exist`);
      return;
    }

    // Create a backup of the original file
    console.log('📋 Creating backup of original file');
    fs.copyFileSync(asanaMcpToolPath, backupPath);
    console.log(`✅ Backup created at ${backupPath}`);

    // Read the original file
    console.log('📖 Reading asanaMcpTool.ts');
    let content = fs.readFileSync(asanaMcpToolPath, 'utf8');

    // Replace import statements
    console.log('✏️ Updating import statements');
    content = content.replace(
      "import { AsanaMcpClient } from '@/lib/ai/clients/asanaMcpClient';",
      "import { RealAsanaMcpClient } from '@/lib/ai/clients/asanaMcpClientReal';",
    );

    // Replace client initialization
    console.log('✏️ Replacing client initialization');
    content = content.replace(
      'const client = new AsanaMcpClient(tokenData.access_token);',
      'const client = new RealAsanaMcpClient(tokenData.access_token);',
    );

    // Add warning comment at the top of the file
    console.log('✏️ Adding warning comment');
    const warningComment = `/**
 * ⚠️ WARNING: REAL MCP CONNECTION ENABLED ⚠️
 * This file has been modified by the enable-real-asana-mcp.ts script
 * to use RealAsanaMcpClient instead of AsanaMcpClient.
 * 
 * This means it will attempt to connect to the real Asana MCP server
 * even in development mode.
 * 
 * To revert to the original file, run:
 * \`npx tsx scripts/disable-real-asana-mcp.ts\`
 */

`;
    content = warningComment + content;

    // Write the modified content back to the file
    console.log('💾 Writing changes to asanaMcpTool.ts');
    fs.writeFileSync(asanaMcpToolPath, content);

    console.log('✅ Successfully enabled real Asana MCP connection');
    console.log('🔄 Changes made:');
    console.log('  - Replaced AsanaMcpClient with RealAsanaMcpClient');
    console.log('  - Added warning comment');
    console.log('  - Created backup at lib/ai/tools/asanaMcpTool.ts.bak');

    console.log(
      '\n🚀 Now you can run the application to test a real connection to Asana MCP',
    );
    console.log('To revert the changes, run:');
    console.log('npx tsx scripts/disable-real-asana-mcp.ts');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Add a script to disable real Asana MCP connection
async function createDisableScript() {
  try {
    const disableScriptPath = path.resolve('scripts/disable-real-asana-mcp.ts');

    // Check if script already exists
    if (fs.existsSync(disableScriptPath)) {
      console.log(
        'ℹ️ disable-real-asana-mcp.ts already exists, skipping creation',
      );
      return;
    }

    console.log('📝 Creating disable-real-asana-mcp.ts script');

    const disableScriptContent = `import fs from 'node:fs';
import path from 'node:path';

/**
 * Script to restore the original asanaMcpTool.ts file
 * This reverts the changes made by enable-real-asana-mcp.ts
 */
async function disableRealAsanaMcp() {
  try {
    // Define file paths
    const asanaMcpToolPath = path.resolve('lib/ai/tools/asanaMcpTool.ts');
    const backupPath = path.resolve('lib/ai/tools/asanaMcpTool.ts.bak');
    
    console.log('🔄 Reverting to the original AsanaMcpClient');
    
    // Check if backup exists
    if (!fs.existsSync(backupPath)) {
      console.error(\`❌ Error: Backup file \${backupPath} does not exist\`);
      console.error('Did you run enable-real-asana-mcp.ts first?');
      return;
    }
    
    // Restore the backup
    console.log('🔄 Restoring from backup');
    fs.copyFileSync(backupPath, asanaMcpToolPath);
    
    // Optionally, delete the backup
    console.log('🔄 Deleting backup file');
    fs.unlinkSync(backupPath);
    
    console.log('✅ Successfully restored original asanaMcpTool.ts');
    console.log('The application will now use the regular AsanaMcpClient again.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
disableRealAsanaMcp().catch(console.error);
`;

    fs.writeFileSync(disableScriptPath, disableScriptContent);
    console.log(`✅ Created ${disableScriptPath}`);
  } catch (error) {
    console.error('❌ Error creating disable script:', error);
  }
}

// Run the main function
enableRealAsanaMcp()
  .then(() => createDisableScript())
  .catch(console.error);
