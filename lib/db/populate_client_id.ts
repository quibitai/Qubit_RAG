import { db } from './client';
import { sql } from 'drizzle-orm';
import { clients } from './schema';

/**
 * Script to populate default client_id values for existing records
 */
async function populateClientId() {
  console.log('⏳ Starting client_id population...');

  try {
    // Insert default client if it doesn't exist
    console.log('⏳ Creating default client...');
    await db
      .insert(clients)
      .values({
        id: 'default',
        name: 'Default Client',
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    console.log('✅ Default client created or already exists');

    // Update all tables with default client_id
    console.log('⏳ Updating User table...');
    const userResult = await db.execute(
      sql`UPDATE "User" SET "client_id" = 'default' WHERE "client_id" IS NULL RETURNING *`,
    );
    console.log(`✅ Updated ${userResult.length} User records`);

    console.log('⏳ Updating Chat table...');
    const chatResult = await db.execute(
      sql`UPDATE "Chat" SET "client_id" = 'default' WHERE "client_id" IS NULL RETURNING *`,
    );
    console.log(`✅ Updated ${chatResult.length} Chat records`);

    console.log('⏳ Updating Message_v2 table...');
    const messageResult = await db.execute(
      sql`UPDATE "Message_v2" SET "client_id" = 'default' WHERE "client_id" IS NULL RETURNING *`,
    );
    console.log(`✅ Updated ${messageResult.length} Message_v2 records`);

    console.log('⏳ Updating Document table...');
    const documentResult = await db.execute(
      sql`UPDATE "Document" SET "client_id" = 'default' WHERE "client_id" IS NULL RETURNING *`,
    );
    console.log(`✅ Updated ${documentResult.length} Document records`);

    console.log('⏳ Updating Suggestion table...');
    const suggestionResult = await db.execute(
      sql`UPDATE "Suggestion" SET "client_id" = 'default' WHERE "client_id" IS NULL RETURNING *`,
    );
    console.log(`✅ Updated ${suggestionResult.length} Suggestion records`);

    console.log('⏳ Updating Vote_v2 table...');
    const voteResult = await db.execute(
      sql`UPDATE "Vote_v2" SET "client_id" = 'default' WHERE "client_id" IS NULL RETURNING *`,
    );
    console.log(`✅ Updated ${voteResult.length} Vote_v2 records`);

    // Verify all tables
    console.log('⏳ Verifying data population...');
    const verificationResults = await db.execute(sql`
      SELECT 'User' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "User"
      UNION ALL
      SELECT 'Chat' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "Chat"
      UNION ALL
      SELECT 'Message_v2' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "Message_v2"
      UNION ALL
      SELECT 'Document' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "Document"
      UNION ALL
      SELECT 'Suggestion' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "Suggestion"
      UNION ALL
      SELECT 'Vote_v2' as table_name, COUNT(*) as total, COUNT("client_id") as with_client_id FROM "Vote_v2"
    `);

    console.log('=== Verification Results ===');
    console.table(verificationResults);

    // Determine if all records have been populated
    let allPopulated = true;
    for (const row of verificationResults) {
      if (Number(row.total) !== Number(row.with_client_id)) {
        allPopulated = false;
        console.warn(
          `⚠️ Table ${row.table_name} has unpopulated records: ${row.total} total, ${row.with_client_id} with client_id`,
        );
      }
    }

    if (allPopulated) {
      console.log('✅ All records have been populated with client_id values');
      console.log('');
      console.log('You can now create a migration to make client_id required:');
      console.log('');
      console.log('To apply the migration manually:');
      console.log('npx tsx lib/db/migrations/0007_make_client_id_required.sql');
    } else {
      console.error(
        '❌ Some records are missing client_id values. Please check and retry.',
      );
    }
  } catch (error) {
    console.error('❌ Error during client_id population:', error);
  }
}

// Run the script
populateClientId().catch(console.error);
