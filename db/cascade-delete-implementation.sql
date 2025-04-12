-- =================================================================
-- CASCADE DELETE IMPLEMENTATION FOR N8N-CREATED TABLES
-- =================================================================
-- Author: System Administrator
-- Created: [Current Date]
-- Description: Complete implementation of cascade delete functionality 
-- for document_metadata, document_rows, and documents tables
-- =================================================================

-- =================================================================
-- STEP 1: VERIFY SCHEMA
-- =================================================================
-- These queries verify the current table structure and constraints
-- Run them to understand your database before making changes

-- Check document_metadata structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'document_metadata'
ORDER BY ordinal_position;

-- Check document_rows structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'document_rows'
ORDER BY ordinal_position;

-- Check documents structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'documents'
ORDER BY ordinal_position;

-- Check existing foreign key relationships
SELECT
    tc.table_schema, 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name IN ('document_rows');

-- =================================================================
-- STEP 2: CHECK FOR ORPHANED RECORDS
-- =================================================================
-- These queries identify orphaned records that might cause constraint violations
-- Important: Run these checks before adding constraints

-- Find orphaned records in document_rows
-- These are records whose dataset_id doesn't exist in document_metadata
SELECT r.dataset_id, COUNT(*) as orphaned_count 
FROM document_rows r
LEFT JOIN document_metadata m ON r.dataset_id = m.id
WHERE m.id IS NULL
GROUP BY r.dataset_id;

-- OPTIONAL: Delete orphaned records from document_rows
-- WARNING: Only run this after confirming the records should be deleted
-- DELETE FROM document_rows
-- WHERE dataset_id IN (
--   SELECT r.dataset_id
--   FROM document_rows r
--   LEFT JOIN document_metadata m ON r.dataset_id = m.id
--   WHERE m.id IS NULL
-- );

-- =================================================================
-- STEP 3: IMPLEMENT CASCADE DELETE FOR DOCUMENT_ROWS
-- =================================================================
-- This section adds the cascade delete constraint to the document_rows table

-- Step 3.1: Drop the existing constraint on document_rows
ALTER TABLE public.document_rows 
DROP CONSTRAINT IF EXISTS document_rows_dataset_id_fkey;

-- Step 3.2: Re-add the constraint for document_rows with CASCADE
ALTER TABLE public.document_rows
ADD CONSTRAINT document_rows_dataset_id_fkey
FOREIGN KEY (dataset_id) 
REFERENCES public.document_metadata(id)
ON DELETE CASCADE;

-- Step 3.3: Add index to improve delete performance
CREATE INDEX IF NOT EXISTS idx_document_rows_dataset_id ON public.document_rows(dataset_id);

-- =================================================================
-- STEP 4: IMPLEMENT CASCADE DELETE FOR DOCUMENTS
-- =================================================================
-- This section creates a trigger to handle cascade delete for the documents table
-- since it uses a JSON field (metadata->>'file_id') to reference document_metadata

-- Step 4.1: Create the function that will be called by the trigger
CREATE OR REPLACE FUNCTION delete_documents_on_metadata_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Log the deletion for debugging (optional)
    RAISE NOTICE 'Deleting documents with metadata->file_id = %', OLD.id;
    
    -- Delete documents where the file_id in the metadata JSON matches the deleted document_metadata id
    DELETE FROM documents 
    WHERE metadata->>'file_id' = OLD.id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Step 4.2: Create the trigger
DROP TRIGGER IF EXISTS trigger_delete_documents_on_metadata_delete ON document_metadata;

CREATE TRIGGER trigger_delete_documents_on_metadata_delete
BEFORE DELETE ON document_metadata
FOR EACH ROW
EXECUTE FUNCTION delete_documents_on_metadata_delete();

-- =================================================================
-- STEP 5: VERIFY IMPLEMENTATION
-- =================================================================
-- Run these queries to verify the constraint and trigger are working

-- Step 5.1: Verify the constraint on document_rows
SELECT
    tc.table_schema, 
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
  AND tc.table_name = 'document_rows';

-- Step 5.2: Verify the trigger on document_metadata
SELECT 
    event_object_table,
    trigger_name, 
    action_timing, 
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'document_metadata';

-- =================================================================
-- STEP 6: TEST CASCADE DELETE
-- =================================================================
-- These queries can be used to test if cascade delete is working properly

-- Step 6.1: Find a document with related records to test with
SELECT 
    m.id, 
    m.title,
    (SELECT COUNT(*) FROM document_rows WHERE dataset_id = m.id) AS row_count,
    (SELECT COUNT(*) FROM documents WHERE metadata->>'file_id' = m.id) AS document_count
FROM document_metadata m
WHERE 
    (SELECT COUNT(*) FROM document_rows WHERE dataset_id = m.id) > 0
    OR (SELECT COUNT(*) FROM documents WHERE metadata->>'file_id' = m.id) > 0
LIMIT 5;

-- Step 6.2: Before deletion - Check how many related records exist
-- Replace 'your-document-id' with an actual ID from the results above
-- SELECT COUNT(*) FROM document_rows WHERE dataset_id = 'your-document-id';
-- SELECT COUNT(*) FROM documents WHERE metadata->>'file_id' = 'your-document-id';

-- Step 6.3: Delete the test document
-- WARNING: This will permanently delete the document and all related records
-- DELETE FROM document_metadata WHERE id = 'your-document-id';

-- Step 6.4: After deletion - Verify related records were deleted
-- These should both return 0 if cascade delete is working properly
-- SELECT COUNT(*) FROM document_rows WHERE dataset_id = 'your-document-id';
-- SELECT COUNT(*) FROM documents WHERE metadata->>'file_id' = 'your-document-id'; 