const fs = require('fs');
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

async function runAccountMigration() {
  try {
    // Fixed Account table creation statement (removed conflicting PRIMARY KEY)
    const accountSql = `
    CREATE TABLE IF NOT EXISTS "Account" (
      "id" uuid DEFAULT gen_random_uuid() NOT NULL,
      "userId" uuid NOT NULL,
      "type" varchar(255) NOT NULL,
      "provider" varchar(255) NOT NULL,
      "providerAccountId" varchar(255) NOT NULL,
      "refresh_token" text,
      "access_token" text,
      "expires_at" integer,
      "token_type" varchar(255),
      "scope" varchar(255),
      "id_token" text,
      "session_state" varchar(255),
      CONSTRAINT "Account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
    );`;

    console.log('Executing fixed Account table creation:');
    console.log(accountSql);

    try {
      await sql.unsafe(accountSql);
      console.log('✅ Account table created successfully');
    } catch (err) {
      console.error('❌ Error creating Account table:', err.message);
    }

    // Add foreign key constraint
    const fkSql = `
    DO $$ BEGIN
      ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;`;

    console.log('\nExecuting foreign key constraint:');
    console.log(fkSql);

    try {
      await sql.unsafe(fkSql);
      console.log('✅ Foreign key constraint added successfully');
    } catch (err) {
      console.error('❌ Error adding foreign key constraint:', err.message);
    }

    console.log('\nMigration completed');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sql.end();
  }
}

runAccountMigration();
