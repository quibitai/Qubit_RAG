# API Endpoint: [Endpoint Name]

> Brief description of what this endpoint does

**Status**: [Draft | Stable | Deprecated]  
**Last Updated**: YYYY-MM-DD  
**Maintainer**: [Team/Role]

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Request](#request)
- [Response](#response)
- [Examples](#examples)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Related Endpoints](#related-endpoints)

## Overview

Detailed description of the endpoint's purpose, when to use it, and any important business logic.

### Use Cases
- Use case 1: Description
- Use case 2: Description
- Use case 3: Description

## Authentication

**Required**: [Yes/No]  
**Type**: [Bearer Token | API Key | Session | None]

```typescript
// Authentication header example
headers: {
  'Authorization': 'Bearer YOUR_TOKEN_HERE',
  'Content-Type': 'application/json'
}
```

**Permissions Required:**
- Permission 1
- Permission 2

## Request

### HTTP Method & URL
```
[GET|POST|PUT|DELETE] /api/endpoint/path
```

### URL Parameters
| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| `id` | string | Yes | Resource identifier | - |
| `filter` | string | No | Filter criteria | null |

### Query Parameters
| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| `limit` | number | No | Number of results | 10 |
| `offset` | number | No | Pagination offset | 0 |
| `sort` | string | No | Sort field | 'createdAt' |

### Request Headers
| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `Content-Type` | string | Yes | application/json |
| `Authorization` | string | Yes | Bearer token |

### Request Body Schema
```typescript
interface RequestBody {
  field1: string;
  field2?: number;
  field3: {
    nestedField: boolean;
    optionalField?: string;
  };
}
```

**Example Request Body:**
```json
{
  "field1": "example value",
  "field2": 42,
  "field3": {
    "nestedField": true,
    "optionalField": "optional"
  }
}
```

## Response

### Success Response (200 OK)
```typescript
interface SuccessResponse {
  success: true;
  data: {
    id: string;
    field1: string;
    field2: number;
    createdAt: string;
    updatedAt: string;
  };
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}
```

**Example Success Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "field1": "example",
    "field2": 42,
    "createdAt": "2024-12-20T10:00:00Z",
    "updatedAt": "2024-12-20T10:00:00Z"
  },
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10
  }
}
```

### Error Response
```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

## Examples

### Example 1: Basic Request
```typescript
// Using fetch
const response = await fetch('/api/endpoint/123', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer your-token',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);
```

### Example 2: POST with Body
```typescript
// Creating a resource
const response = await fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    field1: 'value',
    field2: 42
  })
});

const result = await response.json();
```

### Example 3: Using Query Parameters
```typescript
// With pagination and filtering
const params = new URLSearchParams({
  limit: '20',
  offset: '40',
  filter: 'active'
});

const response = await fetch(`/api/endpoint?${params}`);
```

## Error Handling

### Common Error Codes

| Status Code | Error Code | Description | Resolution |
|-------------|------------|-------------|------------|
| 400 | `INVALID_REQUEST` | Malformed request | Check request format |
| 401 | `UNAUTHORIZED` | Invalid credentials | Refresh token |
| 403 | `FORBIDDEN` | Insufficient permissions | Check user permissions |
| 404 | `NOT_FOUND` | Resource not found | Verify resource ID |
| 422 | `VALIDATION_ERROR` | Invalid data | Check field requirements |
| 429 | `RATE_LIMITED` | Too many requests | Wait and retry |
| 500 | `INTERNAL_ERROR` | Server error | Contact support |

### Error Response Examples
```json
// 400 Bad Request
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Required field missing",
    "details": {
      "field": "field1",
      "expectedType": "string"
    }
  }
}
```

## Rate Limiting

- **Limit**: 100 requests per minute per user
- **Headers**: 
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp

## Related Endpoints

- [`GET /api/related-endpoint`](./related-endpoint.md) - Description
- [`POST /api/other-endpoint`](./other-endpoint.md) - Description

## Notes

- Important notes about the endpoint
- Version history
- Deprecation warnings

---

**Last Updated**: YYYY-MM-DD  
**Maintained by**: [Team/Role] 