-- Script to add a CASCADE foreign key constraint for the documents table

-- Step 1: Check if a foreign key constraint already exists
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
  AND tc.table_name = 'documents'
  AND kcu.column_name = 'file_id';

-- Step 2: Add the CASCADE foreign key constraint
-- If a constraint exists, you'll need to drop it first
-- ALTER TABLE public.documents DROP CONSTRAINT constraint_name_here;

ALTER TABLE public.documents
ADD CONSTRAINT fk_documents_metadata
FOREIGN KEY (file_id) 
REFERENCES public.document_metadata(id)
ON DELETE CASCADE;

-- Step 3: Create an index to improve performance
CREATE INDEX IF NOT EXISTS idx_documents_file_id ON public.documents(file_id);

-- Step 4: Verify the constraint was added correctly
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
  AND tc.table_name = 'documents'
  AND kcu.column_name = 'file_id'; 