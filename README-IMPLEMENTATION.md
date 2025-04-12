# Cascade Delete Implementation for n8n-Created Tables

This guide provides step-by-step instructions for implementing cascading deletes in your Supabase database, specifically for tables created through n8n workflows. This will ensure that when a document is deleted from `document_metadata`, all related records in `documents` and `document_rows` are automatically deleted as well.

## Implementation Steps

### Step 1: Verify the Schema

Since your tables were created via n8n and not through migrations, first verify the exact structure:

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Paste and run the queries from `verify-schema.sql`
4. Note the exact column names that link your tables, especially:
   - The column in `documents` that references `document_metadata.id` (likely `file_id`)
   - The column in `document_rows` that references `document_metadata.id` (likely `dataset_id`)

### Step 2: Check for Orphaned Records

Before adding constraints, check for any orphaned records that would violate them:

1. Run the queries from `clean-orphaned-records.sql` to identify orphaned records
2. If orphaned records exist, decide if they should be:
   - Deleted (if they're no longer needed)
   - Updated to reference valid document metadata
   - Preserved by adjusting your constraint strategy

### Step 3: Add Cascading Delete Constraints

Now add the cascading delete constraints:

1. Update `cascade-delete-migration.sql` if needed to match your actual column names
2. Run the updated migration script in Supabase SQL Editor

Example of `cascade-delete-migration.sql`:
```sql
ALTER TABLE public.documents
ADD CONSTRAINT fk_documents_metadata
FOREIGN KEY (file_id) 
REFERENCES public.document_metadata(id)
ON DELETE CASCADE;

ALTER TABLE public.document_rows
ADD CONSTRAINT fk_document_rows_metadata
FOREIGN KEY (dataset_id) 
REFERENCES public.document_metadata(id)
ON DELETE CASCADE;
```

### Step 4: Verify the Constraints

Verify that the constraints were properly added:

1. Run the verification query from `CASCADE_DELETE_README.md`
2. Confirm that the constraints show `DELETE RULE = CASCADE`

### Step 5: Test the Cascading Delete

Test that the cascading delete works properly:

1. Run `test-cascade-delete.sql` to find a suitable test document
2. Uncomment and run the "Before deletion" queries to count related records
3. Uncomment and run the "Delete" query to remove the document from `document_metadata`
4. Uncomment and run the "After deletion" queries to verify related records were deleted

## Troubleshooting

### Error: "column referenced in foreign key constraint does not exist"

If you get this error, check the actual column names in your tables:

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'documents';
SELECT column_name FROM information_schema.columns WHERE table_name = 'document_rows';
```

Update your migration SQL with the correct column names.

### Error: "duplicate key constraint"

If you get an error about duplicate constraints, check existing constraints:

```sql
SELECT constraint_name FROM information_schema.table_constraints 
WHERE table_name IN ('documents', 'document_rows') AND constraint_type = 'FOREIGN KEY';
```

Drop existing constraints if needed:

```sql
ALTER TABLE documents DROP CONSTRAINT constraint_name;
ALTER TABLE document_rows DROP CONSTRAINT constraint_name;
```

### Error: "violates foreign key constraint"

This error occurs when you have orphaned records. Follow Step 2 to identify and clean them up.

## Benefits of the Database-Level Approach

Using database-level cascading deletes provides several advantages:

1. **Reliability**: Deletions are handled at the database level, ensuring consistency
2. **Simplicity**: No application code changes required for cleanup logic
3. **Performance**: Database handles deletions in a single transaction
4. **Maintainability**: Logic is centralized in the database, not scattered across code

## Monitoring and Maintenance

After implementation:

1. Consider creating a database trigger to log deletions for audit purposes:

```sql
CREATE OR REPLACE FUNCTION log_document_deletion()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO deletion_log (deleted_id, deleted_title, deleted_at, deleted_by)
  VALUES (OLD.id, OLD.title, NOW(), current_user);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_deletion_trigger
BEFORE DELETE ON document_metadata
FOR EACH ROW
EXECUTE FUNCTION log_document_deletion();
```

2. Periodically check for orphaned records that might have been created outside the normal workflow 