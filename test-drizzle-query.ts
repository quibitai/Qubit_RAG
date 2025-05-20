import { db } from './lib/db/client';
import { account } from './lib/db/schema';
import { sql } from './lib/db/client';

async function testDrizzleQueries() {
  console.log('Running Drizzle query tests...');

  // Test 1: Raw SQL query to check table existence and casing
  try {
    console.log('Test 1: Checking table existence with raw SQL');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log(
      'Tables in database:',
      tables.map((t) => t.table_name),
    );
  } catch (error) {
    console.error('Error in Test 1:', error);
  }

  // Test 2: Direct Drizzle query on Account table
  try {
    console.log('\nTest 2: Direct Drizzle query on Account table');
    // Log the SQL that would be generated (this is Drizzle's internal debug feature)
    const query = db.select().from(account).limit(1).toSQL();
    console.log('Generated SQL:', query.sql);
    console.log('SQL Parameters:', query.params);

    // Actually execute the query
    const result = await db.select().from(account).limit(1);
    console.log('Query Result:', result);
  } catch (error) {
    console.error('Error in Test 2:', error);
  }

  // Test 3: Raw SQL to query the Account table directly
  try {
    console.log('\nTest 3: Raw SQL query on Account table with quotes');
    const accountsWithQuotes = await sql`SELECT * FROM "Account" LIMIT 1`;
    console.log('Accounts (with quotes):', accountsWithQuotes);
  } catch (error) {
    console.error('Error in Test 3:', error);
  }

  // Test 4: Raw SQL to query the account table (lowercase) directly
  try {
    console.log('\nTest 4: Raw SQL query on account table without quotes');
    const accountsWithoutQuotes = await sql`SELECT * FROM account LIMIT 1`;
    console.log('Accounts (without quotes):', accountsWithoutQuotes);
  } catch (error) {
    console.error('Error in Test 4:', error);
  }
}

// Execute the tests
testDrizzleQueries()
  .then(() => {
    console.log('\nTests completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
