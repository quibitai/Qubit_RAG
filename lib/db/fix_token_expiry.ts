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

  console.log('⏳ Running migration to fix token expiry column...');

  try {
    // Alter the expires_at column to use bigint
    await connection.unsafe(`
      ALTER TABLE account ALTER COLUMN expires_at TYPE bigint USING expires_at::bigint;
    `);
    console.log('✅ Successfully altered expires_at column to bigint');

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
