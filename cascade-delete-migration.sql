-- Migration to add cascading delete constraints for document relationships

-- Based on the database schema visible in the Supabase dashboard:
-- We can see document_metadata, documents, and document_rows tables

-- First, let's examine the existing constraints to avoid duplicates
-- SELECT conname, conrelid::regclass, conkey, confrelid::regclass, confkey 
-- FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text IN ('documents', 'document_rows');

-- Step 1: Add foreign key with ON DELETE CASCADE from documents to document_metadata
-- The documents table likely has a column referencing the document_metadata.id (probably file_id)
ALTER TABLE public.documents
ADD CONSTRAINT fk_documents_metadata
FOREIGN KEY (file_id) 
REFERENCES public.document_metadata(id)
ON DELETE CASCADE;

-- Step 2: Add foreign key with ON DELETE CASCADE from document_rows to document_metadata
-- The document_rows table likely has a column referencing document_metadata.id (probably dataset_id)
ALTER TABLE public.document_rows
ADD CONSTRAINT fk_document_rows_metadata
FOREIGN KEY (dataset_id) 
REFERENCES public.document_metadata(id)
ON DELETE CASCADE;

-- Step 3: Add indexes to improve delete performance
CREATE INDEX IF NOT EXISTS idx_documents_file_id ON public.documents(file_id);
CREATE INDEX IF NOT EXISTS idx_document_rows_dataset_id ON public.document_rows(dataset_id);

-- NOTE: If you encounter errors while running this migration, you might need to:
-- 1. Confirm the actual column names (file_id, dataset_id) by checking your database schema
-- 2. Check if foreign keys already exist and drop them first
-- 3. Verify there are no orphaned records that would violate constraints

-- To run this migration:
-- 1. Go to the Supabase SQL Editor
-- 2. Paste this SQL and execute it
-- 3. Verify the constraints were added by checking the table definitions

-- To execute this migration, run it in the SQL editor in Supabase
-- or use the Supabase CLI with the migration framework 