import { db } from './client';
import { sql } from 'drizzle-orm';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Script to apply the client_id NOT NULL migration
 */
async function applyClientIdMigration() {
  console.log('⏳ Starting client_id NOT NULL migration...');

  try {
    // Read the SQL file
    const migrationPath = path.join(
      __dirname,
      'migrations',
      '0007_enforce_not_null.sql',
    );
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Split on -- 1. Create, -- 2. Populate, -- 3. Make
    const sections = migrationSQL.split(/-- \d\./);

    // Extract the SQL statements (excluding comments and empty lines)
    const createClientSQL = sections[1]
      .split('\n')
      .filter((line) => !line.trim().startsWith('--') && line.trim() !== '')
      .join('\n');

    const populateClientIdSQL = sections[2]
      .split('\n')
      .filter((line) => !line.trim().startsWith('--') && line.trim() !== '')
      .join('\n');

    const makeNotNullSQL = sections[3]
      .split('\n')
      .filter((line) => !line.trim().startsWith('--') && line.trim() !== '')
      .join('\n');

    // 1. Create default client
    console.log('⏳ Creating default client...');
    await db.execute(sql.raw(createClientSQL));
    console.log('✅ Default client created or already exists');

    // 2. Populate client_id values
    console.log('⏳ Populating client_id values...');
    await db.execute(sql.raw(populateClientIdSQL));
    console.log('✅ client_id values populated');

    // Verify data population
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
        '❌ Some records are missing client_id values. Migration cannot proceed.',
      );
      return;
    }

    // 3. Make client_id NOT NULL
    console.log('⏳ Making client_id columns NOT NULL...');
    await db.execute(sql.raw(makeNotNullSQL));
    console.log('✅ client_id columns set to NOT NULL');

    // Verify NOT NULL constraints
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

    // Check if all columns are NOT NULL
    let allNotNull = true;
    for (const row of nullableResults) {
      if (row.is_nullable !== 'NO') {
        allNotNull = false;
        console.warn(
          `⚠️ Table ${row.table_name} has nullable client_id: is_nullable=${row.is_nullable}`,
        );
      }
    }

    if (allNotNull) {
      console.log(
        '✅ Migration successfully completed! All client_id columns are NOT NULL',
      );
    } else {
      console.error(
        '❌ Some client_id columns are still nullable. Migration not fully applied.',
      );
    }
  } catch (error) {
    console.error('❌ Error during migration:', error);
  }
}

// Run the script
applyClientIdMigration().catch(console.error);
