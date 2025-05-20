import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Add runtime directive to ensure Node.js runtime
export const runtime = 'nodejs';

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

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL is not defined');
}

// Create Supabase client
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '',
);

// Create Postgres client with enhanced edge compatibility
export const sql = postgres(process.env.POSTGRES_URL, {
  prepare: false, // Disable prepared statements
  max: 1, // Set max connections to 1
  transform: {
    undefined: null, // Transform undefined values to null
  },
  types: {
    // Disable any custom type parsing that might use advanced Node.js features
  },
  debug: false, // Disable debug logging which might use perf hooks
  idle_timeout: 0, // Disable connection monitoring features
  connection: {
    application_name: 'quibit-app', // Set a static application name
  },
  ssl: 'require', // Enable SSL if connecting to hosted Postgres
});

// Pass the schema to drizzle
export const db = drizzle(sql, { schema });
