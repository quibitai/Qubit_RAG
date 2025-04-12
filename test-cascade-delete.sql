-- SQL to test if cascading delete is working properly

-- 1. Choose a document to test with (one that has related records)
-- Find a document with related records
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

-- 2. Before deletion: Count records for a specific document
-- Replace 'your-document-id' with an actual ID from above
-- SELECT COUNT(*) FROM documents WHERE file_id = 'your-document-id';
-- SELECT COUNT(*) FROM document_rows WHERE dataset_id = 'your-document-id';

-- 3. Delete the document (commented out for safety - uncomment to actually test)
-- DELETE FROM document_metadata WHERE id = 'your-document-id';

-- 4. After deletion: Verify records are gone (should return 0)
-- SELECT COUNT(*) FROM documents WHERE file_id = 'your-document-id';
-- SELECT COUNT(*) FROM document_rows WHERE dataset_id = 'your-document-id'; 