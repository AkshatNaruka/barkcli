---
id: api-design
name: Production API Design
description: Robust RESTful contracts, structured errors, idempotency, and versioning
triggers: [api, endpoint, rest, route, schema, openapi, payload]
---
# Production API Design

- Design clear, resource-oriented endpoint URLs with consistent casing
- Structure response payloads with predictable envelopes (`data`, `error`, `pagination`)
- Use semantic HTTP status codes (`200 OK`, `201 Created`, `400 Bad Request`, `404 Not Found`)
- Ensure mutating endpoints are idempotent when repeated with identical request IDs
- Include actionable error codes and human-readable messages in error bodies
- Support forward and backward compatibility when extending payloads
