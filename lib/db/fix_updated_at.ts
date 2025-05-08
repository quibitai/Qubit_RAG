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

  console.log('⏳ Running migration to fix updatedAt column...');

  try {
    // First check if the column exists
    console.log('Checking if updatedAt column exists...');
    const result = await connection.unsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'Chat'
      AND column_name = 'updatedAt';
    `);

    console.log('Column check result:', result);

    if (result.length === 0) {
      // Column doesn't exist, so add it
      console.log('updatedAt column does not exist. Adding it...');
      await connection.unsafe(`
        ALTER TABLE "Chat" 
        ADD COLUMN "updatedAt" timestamp DEFAULT now() NOT NULL;
      `);
      console.log('✅ Added updatedAt column to Chat table');
    } else {
      console.log('✅ updatedAt column already exists in Chat table');
    }

    // Set updatedAt to createdAt for existing rows to ensure all have a valid value
    console.log('Updating existing rows with createdAt values...');
    await connection.unsafe(`
      UPDATE "Chat"
      SET "updatedAt" = "createdAt"
      WHERE "updatedAt" IS NULL OR "updatedAt" = '1970-01-01 00:00:00';
    `);
    console.log('✅ Updated existing rows successfully');

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
