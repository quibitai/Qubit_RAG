# Cascade Delete Implementation for n8n-Created Database Tables

This documentation explains the implementation of cascading delete functionality for database tables created through n8n workflows. This ensures data integrity by automatically removing related records when a document is deleted from the system.

## Table Structure and Relationships

The database consists of three main tables:

1. **document_metadata** - Contains primary document information
   - `id`: Primary key, unique identifier for documents
   - `title`: Document title
   - Other metadata fields

2. **document_rows** - Contains structured row data from documents (like spreadsheet rows)
   - `id`: Primary key
   - `dataset_id`: Foreign key reference to document_metadata.id
   - `row_data`: Contains the actual row data

3. **documents** - Contains document chunks and embeddings
   - `id`: Primary key
   - `content`: Document content
   - `metadata`: JSON field containing metadata, including `file_id` referencing document_metadata.id
   - `embedding`: Vector embedding for content

## Problem and Solution

### Problem

When a document is deleted from `document_metadata`, related records in `document_rows` and `documents` tables were not automatically deleted. This led to:

- Orphaned records consuming database space
- Potential data integrity issues
- Inconsistent query results

### Solution

The implementation uses two different approaches based on the table structure:

1. **For document_rows**: Standard SQL foreign key constraint with CASCADE DELETE
2. **For documents**: Database trigger since the relationship is through a JSON field

## Implementation Details

### 1. Foreign Key Constraint for document_rows

A standard SQL foreign key constraint with CASCADE DELETE option:

```sql
ALTER TABLE public.document_rows
ADD CONSTRAINT document_rows_dataset_id_fkey
FOREIGN KEY (dataset_id) 
REFERENCES public.document_metadata(id)
ON DELETE CASCADE;
```

This ensures when a record is deleted from `document_metadata`, all matching records in `document_rows` are automatically deleted.

### 2. Database Trigger for documents

Since the `documents` table uses a JSON field to store the relationship, we implement a trigger:

```sql
CREATE OR REPLACE FUNCTION delete_documents_on_metadata_delete()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM documents 
    WHERE metadata->>'file_id' = OLD.id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_delete_documents_on_metadata_delete
BEFORE DELETE ON document_metadata
FOR EACH ROW
EXECUTE FUNCTION delete_documents_on_metadata_delete();
```

This trigger runs before any deletion from `document_metadata` and removes all related records from `documents` based on the JSON field value.

## Implementation Steps

The complete implementation is contained in the `cascade-delete-implementation.sql` file, which includes:

1. **Schema Verification**: Queries to understand the database structure
2. **Orphaned Record Check**: Queries to identify any existing orphaned records
3. **Constraint Implementation**: SQL to add the CASCADE DELETE constraint
4. **Trigger Implementation**: SQL to create the deletion trigger
5. **Verification Queries**: SQL to confirm the implementation is correct
6. **Testing Queries**: SQL to test the cascade delete functionality

## Usage

To implement the cascade delete functionality:

1. Review the database structure first to understand the relationships
2. Check for orphaned records that might cause issues
3. Run the constraint and trigger implementation SQL
4. Verify the implementation with the provided queries
5. Test with a sample document to ensure proper functionality

## Troubleshooting

### Common Issues

1. **Constraint Violation Errors**:
   - Cause: Existing orphaned records
   - Solution: Run the orphaned record check and clean up before implementing

2. **Column Not Found Errors**:
   - Cause: Database schema differences
   - Solution: Verify column names and adjust SQL accordingly

3. **Trigger Not Firing**:
   - Cause: Incorrectly implemented trigger or permissions issue
   - Solution: Verify trigger installation and database user permissions

### Performance Considerations

The implementation includes indexes on foreign key columns to improve deletion performance:

```sql
CREATE INDEX IF NOT EXISTS idx_document_rows_dataset_id ON public.document_rows(dataset_id);
```

For large datasets, consider:
- Batching deletions if deleting many documents at once
- Running maintenance operations during off-peak hours
- Adding logging for audit purposes

## Maintenance

Periodically check for orphaned records using the queries in the script:

```sql
SELECT r.dataset_id, COUNT(*) as orphaned_count 
FROM document_rows r
LEFT JOIN document_metadata m ON r.dataset_id = m.id
WHERE m.id IS NULL
GROUP BY r.dataset_id;

-- Similar query for documents table
```

## Benefits

This implementation provides several advantages:

1. **Data Integrity**: Ensures no orphaned records remain in the database
2. **Simplified Application Code**: No need for application-level cleanup logic
3. **Performance**: Database-level operations are faster than application cleanup
4. **Reliability**: Database constraints and triggers are more reliable than application code

## Version History

- 1.0 (Current): Initial implementation of cascade delete functionality 