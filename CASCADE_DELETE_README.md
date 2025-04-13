# Cascade Delete Implementation Guide

This guide explains how to implement cascading deletion in your Supabase database to ensure that when you delete a document from `document_metadata`, all related records in `documents` and `document_rows` are automatically deleted.

## Current Database State

Based on schema verification, we've discovered:
- `document_rows` already has a foreign key constraint (`document_rows_dataset_id_fkey`), but it uses `NO ACTION` for deletion
- We need to modify this constraint to use `CASCADE` instead
- We need to add a new constraint for the `documents` table

## Implementation Steps

### Step 1: Update the `document_rows` Constraint

First, update the existing constraint to use `CASCADE` deletion:

```sql
-- Verify the current constraint
SELECT
    tc.constraint_name, 
    tc.table_name, 
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_name = 'document_rows_dataset_id_fkey';

-- Drop the existing constraint
ALTER TABLE public.document_rows 
DROP CONSTRAINT document_rows_dataset_id_fkey;

-- Re-add with CASCADE delete rule
ALTER TABLE public.document_rows
ADD CONSTRAINT document_rows_dataset_id_fkey
FOREIGN KEY (dataset_id) 
REFERENCES public.document_metadata(id)
ON DELETE CASCADE;
```

### Step 2: Add a Constraint for the `documents` Table

Next, add a foreign key constraint to the `documents` table:

```sql
-- Add CASCADE foreign key constraint
ALTER TABLE public.documents
ADD CONSTRAINT fk_documents_metadata
FOREIGN KEY (file_id) 
REFERENCES public.document_metadata(id)
ON DELETE CASCADE;

-- Create an index for performance
CREATE INDEX IF NOT EXISTS idx_documents_file_id ON public.documents(file_id);
```

### Step 3: Verify the Constraints

Verify that both constraints are properly set up:

```sql
-- Check constraints and their delete rules
SELECT
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name IN ('documents', 'document_rows')
  AND ccu.table_name = 'document_metadata';
```

Both constraints should show `DELETE RULE = CASCADE`.

## Testing the Cascading Delete

### Step 1: Find a Test Document

Find a document with related records:

```sql
SELECT 
    m.id, 
    m.title,
    (SELECT COUNT(*) FROM documents WHERE file_id = m.id) AS document_chunks,
    (SELECT COUNT(*) FROM document_rows WHERE dataset_id = m.id) AS row_count
FROM document_metadata m
WHERE 
    (SELECT COUNT(*) FROM documents WHERE file_id = m.id) > 0
    OR (SELECT COUNT(*) FROM document_rows WHERE dataset_id = m.id) > 0
LIMIT 5;
```

### Step 2: Test Deletion

Test with an actual document ID from the previous query:

```sql
-- Before deletion: Count related records
SELECT COUNT(*) FROM documents WHERE file_id = 'your-document-id';
SELECT COUNT(*) FROM document_rows WHERE dataset_id = 'your-document-id';

-- Delete the document
DELETE FROM document_metadata WHERE id = 'your-document-id';

-- After deletion: Verify records are gone (should return 0)
SELECT COUNT(*) FROM documents WHERE file_id = 'your-document-id';
SELECT COUNT(*) FROM document_rows WHERE dataset_id = 'your-document-id';
```

## Troubleshooting

### Column Name Mismatches

If you get an error like `column "file_id" referenced in foreign key constraint does not exist`:

```sql
-- Check actual column names
SELECT column_name FROM information_schema.columns WHERE table_name = 'documents';
SELECT column_name FROM information_schema.columns WHERE table_name = 'document_rows';
```

### Existing Constraints

If you get an error about duplicate constraints:

```sql
-- List existing constraints
SELECT constraint_name FROM information_schema.table_constraints 
WHERE table_name IN ('documents', 'document_rows') AND constraint_type = 'FOREIGN KEY';
```

### Orphaned Records

If you have orphaned records that prevent constraint creation:

```sql
-- Find orphaned records in documents
SELECT d.file_id 
FROM documents d 
LEFT JOIN document_metadata m ON d.file_id = m.id
WHERE m.id IS NULL;

-- Find orphaned records in document_rows
SELECT r.dataset_id 
FROM document_rows r
LEFT JOIN document_metadata m ON r.dataset_id = m.id
WHERE m.id IS NULL;
```

## Benefits

1. **Data Integrity**: Ensures no orphaned records remain when documents are deleted
2. **Simplicity**: No application code changes required
3. **Performance**: Database handles deletions in a single transaction
4. **Reliability**: Consistent behavior regardless of deletion source 