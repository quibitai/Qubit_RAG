-- SQL to identify and clean orphaned records

-- 1. Find orphaned records in the documents table
-- These are records whose file_id doesn't exist in document_metadata
SELECT d.file_id, COUNT(*) as orphaned_count
FROM documents d 
LEFT JOIN document_metadata m ON d.file_id = m.id
WHERE m.id IS NULL
GROUP BY d.file_id;

-- 2. Find orphaned records in document_rows
-- These are records whose dataset_id doesn't exist in document_metadata
SELECT r.dataset_id, COUNT(*) as orphaned_count 
FROM document_rows r
LEFT JOIN document_metadata m ON r.dataset_id = m.id
WHERE m.id IS NULL
GROUP BY r.dataset_id;

-- 3. OPTIONAL: Delete orphaned records from documents
-- WARNING: Only run this after confirming the records should be deleted
-- DELETE FROM documents
-- WHERE file_id IN (
--   SELECT d.file_id
--   FROM documents d 
--   LEFT JOIN document_metadata m ON d.file_id = m.id
--   WHERE m.id IS NULL
-- );

-- 4. OPTIONAL: Delete orphaned records from document_rows
-- WARNING: Only run this after confirming the records should be deleted
-- DELETE FROM document_rows
-- WHERE dataset_id IN (
--   SELECT r.dataset_id
--   FROM document_rows r
--   LEFT JOIN document_metadata m ON r.dataset_id = m.id
--   WHERE m.id IS NULL
-- ); 