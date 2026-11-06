# Swagger UI & OpenAPI Specification

## Overview

The SMI Invoice Platform provides a comprehensive OpenAPI 3.1 specification and interactive Swagger UI for exploring and testing the API.

## Files

- **`/api/openapi.yaml`** - Complete OpenAPI 3.1 specification
  - All endpoints with request/response schemas
  - Error codes and status codes
  - Example payloads
  - Security requirements

- **`/api/server.js`** - Routes for serving OpenAPI & Swagger UI
  - `GET /api/openapi.yaml` - Download OpenAPI spec
  - `GET /api/docs` - Interactive Swagger UI

## Accessing Swagger UI

### Local Development

```bash
npm run api:dev
# Then open browser to: http://localhost:3000/api/docs
```

### Test Environment

Navigate to: `https://swa-smi-invoice-test.azurestaticapps.net/api/docs`

### Production

**Not enabled** by default (see "Security" section below).

## Features

### Swagger UI

The interactive Swagger UI provides:

1. **Browse all endpoints** - Organized by resource (Invoices, PO Import, Admin, etc.)
2. **Try it out** - Execute API calls directly from the browser
3. **Request/Response schemas** - See what data to send and expect back
4. **Error examples** - View all possible error responses
5. **Authentication** - Sign in with your SWA identity

### OpenAPI Specification

The spec includes:

- **Schemas** - Reusable data models (Invoice, InvoiceLineItem, User, etc.)
- **Paths** - All endpoints with methods, parameters, request/response bodies
- **Security** - Authentication requirements (Azure Static Web Apps x-ms-client-principal)
- **Examples** - Sample payloads for common operations
- **Error responses** - All error codes with descriptions

## Security

### Environment-Specific Behavior

| Environment | Swagger UI | OpenAPI Spec |
|---|---|---|
| **Development** | ✅ Enabled | ✅ Available |
| **Test (Azure)** | ✅ Enabled | ✅ Available |
| **Production** | ❌ Disabled | ⚠️ Available to admins only |

### Production Disabling

In production, Swagger UI is disabled by default to reduce attack surface:

```javascript
// api/server.js
const isSwaggerEnabled = process.env.NODE_ENV !== 'production' 
  || process.env.ENABLE_SWAGGER === 'true';
```

To enable in production (not recommended):

```bash
# Set environment variable
ENABLE_SWAGGER=true
```

**Recommendation**: Keep Swagger disabled in production. The OpenAPI spec should be:
1. Served from a separate documentation site
2. Protected behind admin authentication
3. Updated manually or via CI/CD

## Using Swagger UI

### 1. Sign In

Click the **Authorize** button to sign in with your Azure Static Web Apps account.

### 2. Browse Endpoints

Click on any endpoint to see:
- Description and purpose
- Required parameters (path, query, header)
- Request body schema
- Possible response codes
- Example responses

### 3. Execute API Calls

1. Click "Try it out" on an endpoint
2. Fill in required parameters
3. Click "Execute"
4. View response, headers, and timing

### 4. View Error Details

- Look at error responses to understand failure modes
- Each error includes a `referenceId` (correlation ID) for server-side logging

## Testing with Swagger

### Create an Invoice

```
POST /invoices
```

Body:
```json
{
  "vendorId": "VENDOR-001",
  "buyerId": "BUYER-001",
  "items": [
    {
      "description": "Steel Plates (50x100mm)",
      "quantity": 5,
      "unitRate": 1000,
      "taxRate": 0.18
    }
  ]
}
```

### List Invoices with Pagination

```
GET /invoices?page=1&pageSize=50&status=draft
```

### Update Invoice (Concurrency Check)

```
PATCH /invoices/{invoiceId}
```

Headers:
```
If-Match: 0x000000000000001C
```

Body:
```json
{
  "status": "submitted"
}
```

If another user modified the invoice, you'll get a 409 Conflict with the current rowVersion.

## OpenAPI Spec Structure

### Top-Level Sections

```yaml
openapi: 3.1.0
info:              # Title, version, description
servers:           # Base URLs (local, test, prod)
security:          # Global auth requirements
components:        # Reusable schemas and responses
paths:             # All endpoints
```

### Component Schemas

```yaml
components:
  schemas:
    Invoice:       # Invoice header
    InvoiceDetail: # Invoice with line items
    InvoiceLineItem: # Individual line
    Error:         # Standard error format
    PaginatedResponse: # Paginated results
    User:          # User/admin info
```

### Paths Pattern

Each path includes:
- Description
- Tags (for grouping)
- operationId (unique identifier)
- Parameters (path, query, header)
- requestBody (for POST/PATCH)
- responses (all status codes)

Example:

```yaml
/invoices:
  post:
    summary: Create invoice
    tags: [Invoices]
    operationId: createInvoice
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              vendorId: { type: string }
              buyerId: { type: string }
              items: { type: array }
    responses:
      '201':
        description: Invoice created
        content:
          application/json:
            schema: { $ref: '#/components/schemas/Invoice' }
      '400':
        $ref: '#/components/responses/BadRequest'
      '403':
        $ref: '#/components/responses/Forbidden'
```

## Troubleshooting

### Swagger UI shows blank page

1. Check that `/api/openapi.yaml` is accessible
2. Verify the spec is valid YAML
3. Open browser console (F12) for errors

### "Not authorized" when clicking "Try it out"

The `Authorize` button must be clicked first to sign in with Azure Static Web Apps.

### Spec validation errors

Use a linter to validate the spec:

```bash
npm install -g @stoplight/spectral
spectral lint api/openapi.yaml
```

### CDN issues

If Swagger UI fails to load from CDN:

1. Check your internet connection
2. Ensure no proxy/firewall blocks cdn.jsdelivr.net
3. Alternatively, download and host Swagger UI locally (see deployment guide)

## Next Steps

1. **Test all endpoints** using Swagger UI before deployment
2. **Document auth flow** - Add a "Sign In" guide to your docs
3. **Pin Swagger CDN version** - Update the URL in `server.js` if CDN URL changes
4. **Disable in production** - Ensure `ENABLE_SWAGGER=false` (default) in prod
5. **Version your spec** - Update info.version when making breaking API changes

## References

- [OpenAPI 3.1 Spec](https://spec.openapis.org/oas/v3.1.0)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [OpenAPI Guide](https://swagger.io/resources/articles/best-practices-in-api-documentation/)
