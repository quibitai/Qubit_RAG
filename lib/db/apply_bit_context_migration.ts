import { config } from 'dotenv';
import postgres from 'postgres';

config({
  path: '.env.local',
});

const runMigration = async () => {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL is not defined');
  }

  const connection = postgres(process.env.POSTGRES_URL, { max: 1 });

  console.log(
    '⏳ Running migration to add bitContextId and updatedAt columns to Chat table...',
  );

  try {
    // Add bitContextId column if it doesn't exist
    await connection.unsafe(`
      ALTER TABLE "Chat" 
      ADD COLUMN IF NOT EXISTS "bitContextId" text;
    `);
    console.log('✅ Added bitContextId column to Chat table');

    // Add updatedAt column if it doesn't exist
    await connection.unsafe(`
      ALTER TABLE "Chat" 
      ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT now() NOT NULL;
    `);
    console.log('✅ Added updatedAt column to Chat table');

    console.log('✅ Migration completed successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await connection.end();
    process.exit(0);
  }
};

runMigration().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
