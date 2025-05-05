# Multi-Tenant Migration Guide

This document provides instructions for migrating the application database to support multi-tenancy using a client_id column in all tables.

## Migration Steps

### Step 1: Update Schema Definitions

- The schema.ts file has been updated to include:
  - New `Clients` table definition
  - `client_id` column in all existing tables
  - Foreign key references from `client_id` to the `Clients` table

### Step 2: Run Initial Migration

Run the first migration file which:
- Creates the Clients table
- Adds nullable client_id columns to all existing tables
- Sets up foreign key constraints

```bash
# Run the initial migration
pnpm db:migrate
```

### Step 3: Populate Data

After the initial migration, manually run the data population script:

```bash
# Connect to your database
psql YOUR_DATABASE_URL

# Run the data population script
\i lib/db/migrations/0006_data_population.sql
```

This script:
1. Creates a default client with ID 'default'
2. Updates all existing records to use this default client_id
3. Provides verification queries to ensure all records have been updated

### Step 4: Make client_id Required

After verifying all data has been populated, run the final migration to make client_id columns required:

```bash
# Connect to your database
psql YOUR_DATABASE_URL

# Run the final migration
\i lib/db/migrations/0007_make_client_id_required.sql
```

This script:
1. Alters all tables to make client_id NOT NULL
2. Provides verification queries to confirm the changes

### Step 5: Update Schema Definitions Again

Once all migrations have been applied, update the schema.ts file again to make client_id required by adding .notNull() to all client_id field definitions.

## Verification

After completing all steps, verify that:

1. The Clients table exists with at least one record
2. All tables have a NOT NULL client_id column 
3. All records in all tables have a valid client_id value

## Rollback Plan

If issues occur, you can:

1. For schema issues: Revert the schema.ts changes and regenerate migrations
2. For data issues: Run custom SQL scripts to fix data inconsistencies
3. For foreign key issues: Temporarily disable constraints, fix data, then re-enable

Always backup your database before performing these migrations! 