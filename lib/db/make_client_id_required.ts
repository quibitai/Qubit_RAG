import { db } from './client';
import { sql } from 'drizzle-orm';

/**
 * Script to make client_id columns required (NOT NULL) after data population
 */
async function makeClientIdRequired() {
  console.log('⏳ Making client_id columns required (NOT NULL)...');

  try {
    // First verify all tables have client_id fully populated
    console.log('⏳ Verifying all tables have client_id values populated...');
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

    // Check if all records have client_id values
    let allPopulated = true;
    for (const row of verificationResults) {
      if (Number(row.total) !== Number(row.with_client_id)) {
        allPopulated = false;
        console.warn(
          `⚠️ Table ${row.table_name} has unpopulated records: ${row.total} total, ${row.with_client_id} with client_id`,
        );
      }
    }

    if (!allPopulated) {
      console.error(
        '❌ Some records are missing client_id values. Please run the populate script first:',
      );
      console.error('npx tsx lib/db/populate_client_id.ts');
      return;
    }

    console.log(
      '✅ All records have client_id values. Proceeding to make columns NOT NULL...',
    );

    // Make all client_id columns NOT NULL
    console.log('⏳ Altering User table...');
    await db.execute(
      sql`ALTER TABLE "User" ALTER COLUMN "client_id" SET NOT NULL`,
    );
    console.log('✅ User table updated');

    console.log('⏳ Altering Chat table...');
    await db.execute(
      sql`ALTER TABLE "Chat" ALTER COLUMN "client_id" SET NOT NULL`,
    );
    console.log('✅ Chat table updated');

    console.log('⏳ Altering Message_v2 table...');
    await db.execute(
      sql`ALTER TABLE "Message_v2" ALTER COLUMN "client_id" SET NOT NULL`,
    );
    console.log('✅ Message_v2 table updated');

    console.log('⏳ Altering Document table...');
    await db.execute(
      sql`ALTER TABLE "Document" ALTER COLUMN "client_id" SET NOT NULL`,
    );
    console.log('✅ Document table updated');

    console.log('⏳ Altering Suggestion table...');
    await db.execute(
      sql`ALTER TABLE "Suggestion" ALTER COLUMN "client_id" SET NOT NULL`,
    );
    console.log('✅ Suggestion table updated');

    console.log('⏳ Altering Vote_v2 table...');
    await db.execute(
      sql`ALTER TABLE "Vote_v2" ALTER COLUMN "client_id" SET NOT NULL`,
    );
    console.log('✅ Vote_v2 table updated');

    // Verify all columns are now NOT NULL
    console.log('⏳ Verifying NOT NULL constraints...');
    const nullableResults = await db.execute(sql`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND column_name = 'client_id'
      AND table_name IN ('User', 'Chat', 'Message_v2', 'Document', 'Suggestion', 'Vote_v2')
      ORDER BY table_name
    `);

    console.log('=== NOT NULL Verification ===');
    console.table(nullableResults);

    console.log(
      '✅ Migration complete! All client_id columns are now NOT NULL',
    );
    console.log('');
    console.log(
      'Important: Update schema.ts to add .notNull() to all clientId fields to match the database state',
    );
  } catch (error) {
    console.error('❌ Error during migration:', error);
  }
}

// Run the script
makeClientIdRequired().catch(console.error);
