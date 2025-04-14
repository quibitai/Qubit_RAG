-- Script to update the existing foreign key constraint to use CASCADE instead of NO ACTION

-- Step 1: First, verify the current delete rule
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
  AND tc.table_name = 'document_rows'
  AND tc.constraint_name = 'document_rows_dataset_id_fkey';

-- Step 2: Drop the existing constraint
ALTER TABLE public.document_rows 
DROP CONSTRAINT document_rows_dataset_id_fkey;

-- Step 3: Re-add the constraint with CASCADE delete rule
ALTER TABLE public.document_rows
ADD CONSTRAINT document_rows_dataset_id_fkey
FOREIGN KEY (dataset_id) 
REFERENCES public.document_metadata(id)
ON DELETE CASCADE;

-- Step 4: Verify the constraint was updated correctly
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
  AND tc.table_name = 'document_rows'
  AND tc.constraint_name = 'document_rows_dataset_id_fkey'; 