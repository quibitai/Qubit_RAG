// Run this script with: node run-auth-table-migration.js
// Make sure all environment variables are properly set

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Validate environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined');
}

if (
  !process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
) {
  throw new Error(
    'Neither SUPABASE_SERVICE_ROLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY is defined',
  );
}

// Create Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '',
);

async function runMigration() {
  console.log('Starting auth tables migration...');

  try {
    const migrationPath = path.join(
      __dirname,
      'lib/db/migrations/0012_rename_auth_tables.sql',
    );
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration SQL
    const { error } = await supabase.rpc('pgmigration', {
      query: migrationSql,
    });

    if (error) {
      console.error('Error running migration:', error);
      return;
    }

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Error executing migration:', err);
  }
}

runMigration();
