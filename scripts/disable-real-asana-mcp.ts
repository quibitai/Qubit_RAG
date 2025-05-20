import fs from 'node:fs';
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
      console.error(`❌ Error: Backup file ${backupPath} does not exist`);
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
