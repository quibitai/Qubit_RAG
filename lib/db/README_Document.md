# Document Module

This module provides a data structure and functions for working with documents in the database.

## Document Data Structure

The `Document` interface accurately reflects the database schema for the `Document` table, including all columns:

- `id`: UUID string (primary key part 1)
- `createdAt`: Date object (primary key part 2)
- `title`: String (required)
- `content`: String or null (optional)
- `userId`: UUID string (foreign key to User table)
- `kind`: String enum ('text', 'code', 'image', 'sheet')
- `clientId`: String (foreign key to Clients table)

## Database Schema

The document table has a composite primary key on `(id, createdAt)` and foreign key constraints:
- `userId` references `id` in the `User` table with ON DELETE CASCADE
- `clientId` references `id` in the `Clients` table

## Usage

### Creating a Document

The `createDocument` function creates a new document in the database.

```typescript
import { createDocument, type CreateDocumentParams } from './document';

// Required parameters
const params: CreateDocumentParams = {
  createdAtInput: new Date(), // Must be provided by application
  titleInput: 'My Document',
  userIdInput: 'user-uuid-here',
  clientIdInput: 'client-id-here',
  
  // Optional parameters
  contentInput: 'Document content here',
  kindInput: 'text', // One of: 'text', 'code', 'image', 'sheet'
  idInput: 'custom-uuid-here', // If not provided, a UUID will be generated
};

try {
  const document = await createDocument(params);
  console.log('Document created:', document);
} catch (error) {
  console.error('Failed to create document:', error);
}
```

### Parameter Details

#### Required Parameters

- `createdAtInput`: A Date object representing when the document was created. This must be provided by the application as the database does not have a default value for this field.
- `titleInput`: A non-empty string for the document title.
- `userIdInput`: A valid UUID string that references an existing user in the User table.
- `clientIdInput`: A string that references an existing client in the Clients table.

#### Optional Parameters

- `contentInput`: The document content as a string. Can be null or undefined.
- `kindInput`: The document kind, one of: 'text', 'code', 'image', 'sheet'. Defaults to 'text' if not provided.
- `idInput`: A custom UUID for the document. If not provided, a new UUID will be generated.

### Error Handling

The `createDocument` function performs validation on the input parameters and will throw errors for:
- Missing or invalid required parameters
- Invalid UUID formats
- Database errors (foreign key violations, etc.)

Example error handling:

```typescript
try {
  const document = await createDocument(params);
  // Success
} catch (error) {
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    
    // Handle specific error types
    if (error.message.includes('foreign key constraint')) {
      // Handle foreign key violation
    } else if (error.message.includes('UUID')) {
      // Handle invalid UUID format
    }
  }
}
```

## Implementation Notes

- The function validates all required parameters before attempting to insert into the database.
- A UUID pattern check is performed on `userIdInput` and `idInput` (if provided).
- The function uses the Drizzle ORM for database operations.
- The function returns the newly created document with all fields populated.
- Default values:
  - If `idInput` is not provided, a new UUID is generated.
  - If `kindInput` is not provided, it defaults to 'text'.
  - If `contentInput` is not provided, it defaults to null. 