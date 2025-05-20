// run-migration.js
const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

require('dotenv').config({ path: '.env.local' });

if (!process.env.POSTGRES_URL) {
  console.error('POSTGRES_URL environment variable is not set');
  process.exit(1);
}

// Create a Postgres client
const sql = postgres(process.env.POSTGRES_URL, {
  max: 1,
  ssl: 'require',
});

async function runMigration() {
  try {
    // Read migration file
    const migrationPath = path.join(
      __dirname,
      'lib/db/migrations/0010_handy_slayback.sql',
    );
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Split statements by the statement-breakpoint marker
    const statements = migrationSql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    console.log(`Executing ${statements.length} SQL statements...`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`\nExecuting statement ${i + 1}/${statements.length}:`);
      console.log(
        statement.substring(0, 100) + (statement.length > 100 ? '...' : ''),
      );

      try {
        await sql.unsafe(statement);
        console.log(`✅ Statement ${i + 1} executed successfully`);
      } catch (err) {
        console.error(`❌ Error executing statement ${i + 1}:`, err.message);
        // Continue with next statement
      }
    }

    console.log('\nMigration completed');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sql.end();
  }
}

runMigration();
