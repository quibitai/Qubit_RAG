const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });

if (!process.env.POSTGRES_URL) {
  console.error('ERROR: POSTGRES_URL environment variable is not set');
  process.exit(1);
}

// Create a Postgres client
const sql = postgres(process.env.POSTGRES_URL, {
  max: 1,
  ssl: 'require',
});

async function createAuthTables() {
  try {
    console.log('Checking for existing NextAuth tables...');

    // First, check if the tables already exist to avoid errors
    const checkResult = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'Account'
      ) as account_exists,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'Session'
      ) as session_exists,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'VerificationToken'
      ) as verificationtoken_exists;
    `;

    const { account_exists, session_exists, verificationtoken_exists } =
      checkResult[0];

    console.log('Table check results:');
    console.log(`- Account table exists: ${account_exists}`);
    console.log(`- Session table exists: ${session_exists}`);
    console.log(
      `- VerificationToken table exists: ${verificationtoken_exists}`,
    );

    // Create Account table if it doesn't exist
    if (!account_exists) {
      console.log('Creating Account table...');
      await sql`
        CREATE TABLE "Account" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "type" VARCHAR(255) NOT NULL,
          "provider" VARCHAR(255) NOT NULL,
          "providerAccountId" VARCHAR(255) NOT NULL,
          "refresh_token" TEXT,
          "access_token" TEXT,
          "expires_at" INTEGER,
          "token_type" VARCHAR(255),
          "scope" VARCHAR(255),
          "id_token" TEXT,
          "session_state" VARCHAR(255),
          UNIQUE("provider", "providerAccountId")
        );
      `;
      console.log('Account table created successfully.');
    } else {
      console.log('Account table already exists, skipping creation.');
    }

    // Create Session table if it doesn't exist
    if (!session_exists) {
      console.log('Creating Session table...');
      await sql`
        CREATE TABLE "Session" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "sessionToken" VARCHAR(255) UNIQUE NOT NULL,
          "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "expires" TIMESTAMP NOT NULL
        );
      `;
      console.log('Session table created successfully.');
    } else {
      console.log('Session table already exists, skipping creation.');
    }

    // Create VerificationToken table if it doesn't exist
    if (!verificationtoken_exists) {
      console.log('Creating VerificationToken table...');
      await sql`
        CREATE TABLE "VerificationToken" (
          "identifier" VARCHAR(255) NOT NULL,
          "token" VARCHAR(255) NOT NULL,
          "expires" TIMESTAMP NOT NULL,
          PRIMARY KEY ("identifier", "token")
        );
      `;
      console.log('VerificationToken table created successfully.');
    } else {
      console.log('VerificationToken table already exists, skipping creation.');
    }

    console.log('All NextAuth tables have been checked/created successfully!');
  } catch (error) {
    console.error('Error creating auth tables:', error);
  } finally {
    await sql.end();
  }
}

createAuthTables();
