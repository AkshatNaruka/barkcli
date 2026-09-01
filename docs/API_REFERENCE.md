# barkcli REST API Reference

> Base URL: `http://localhost:4321` (default)

All endpoints return JSON. Authentication via `?token=` query param or `Authorization: Bearer <token>` header when `--token` is used.

## Board Endpoints

### List Boards

```
GET /api/boards
```

**Response:**
```json
{ "boards": ["my-project", "backend"] }
```

### Create Board

```
POST /api/boards/create
```

**Request:**
```json
{
  "title": "My Project",
  "description": "Project board",
  "columns": ["todo", "doing", "review", "done"]
}
```

**Response:**
```json
{ "ok": true, "name": "my-project" }
```

### Delete Board

```
DELETE /api/boards/:name
```

**Response:**
```json
{ "deleted": true }
```

### Get Board

```
GET /api/board?name=my-project
```

**Response:**
```yaml
yaml: |
  title: My Project
  columns:
    - id: todo
      name: To Do
  cards: []
```

### Save Board

```
PUT /api/board
```

**Request:**
```json
{
  "name": "my-project",
  "yaml": "title: My Project\ncolumns:\n  - id: todo\n    name: To Do\ncards: []"
}
```

**Response:**
```json
{ "ok": true, "name": "my-project" }
```

## Card Endpoints

### Add Comment

```
POST /api/board/cards/:card_id/comments?name=my-project
```

**Request:**
```json
{
  "author": "alice",
  "text": "Looks good to me"
}
```

**Response:**
```json
{ "ok": true }
```

## Memory Endpoints

### List/Search Memories

```
GET /api/memory?name=my-project&q=search+term&tier=short_term&limit=20
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `name` | string | Board name |
| `q` | string | Search query (BM25 text search) |
| `tier` | string | Filter by tier: `working`, `short_term`, `long_term`, `external` |
| `limit` | number | Max results (default: 50) |

**Response:**
```json
{
  "memories": [
    {
      "id": "mem-abc123",
      "content": "Uses bcrypt for password hashing",
      "tier": "long_term",
      "tags": ["security", "auth"],
      "source": "card-abc",
      "created_at": "2025-01-15T10:30:00Z",
      "last_accessed": "2025-01-15T10:30:00Z",
      "access_count": 0
    }
  ],
  "total": 42
}
```

### Add Memory

```
POST /api/memory?name=my-project
```

**Request:**
```json
{
  "content": "Project uses TypeScript strict mode",
  "tier": "long_term",
  "tags": ["convention", "typescript"],
  "source": "card-login"
}
```

**Response:** The created memory entry.

### Delete Memory

```
DELETE /api/memory/:id?name=my-project
```

**Response:**
```json
{ "deleted": true }
```

### Memory Stats

```
GET /api/memory/stats?name=my-project
```

**Response:**
```json
{
  "total": 42,
  "by_tier": {
    "Working": 5,
    "Short-term": 12,
    "Long-term": 20,
    "External": 5
  },
  "facts": 8
}
```

### Add Project Fact

```
POST /api/memory/fact?name=my-project
```

**Request:**
```json
{
  "fact": "Uses snake_case for file names",
  "category": "convention",
  "confidence": 0.9,
  "sources": ["card-naming"]
}
```

### List Project Facts

```
GET /api/memory/facts?name=my-project&category=convention
```

## Specs Endpoints

### List Specs

```
GET /api/specs?name=my-project
```

**Response:**
```json
{
  "specs": [
    {
      "id": "auth-system",
      "title": "Authentication System",
      "description": "User login and registration",
      "status": "in-progress",
      "priority": "high",
      "requirements": [...],
      "tags": ["security"],
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### Create Spec

```
POST /api/specs?name=my-project
```

**Request:**
```json
{
  "title": "Authentication System",
  "description": "User login and registration",
  "priority": "high",
  "tags": ["security"]
}
```

### Update Spec

```
PUT /api/specs/:spec_id?name=my-project
```

**Request:**
```json
{
  "status": "implemented",
  "priority": "critical"
}
```

### Delete Spec

```
DELETE /api/specs/:spec_id?name=my-project
```

### Add Requirement

```
POST /api/specs/:spec_id/requirements?name=my-project
```

**Request:**
```json
{
  "title": "Password hashing with bcrypt",
  "description": "All passwords must be hashed",
  "acceptance_criteria": ["Uses bcrypt", "Salt rounds >= 12"]
}
```

### Update Requirement

```
PUT /api/specs/:spec_id/requirements/:req_id?name=my-project
```

**Request:**
```json
{
  "status": "implemented"
}
```

### Get Traceability

```
GET /api/specs/:spec_id/trace?name=my-project
```

### Get Coverage

```
GET /api/specs/coverage?name=my-project
```

**Response:**
```json
{
  "total_requirements": 24,
  "implemented": 18,
  "verified": 12,
  "stale": 2,
  "coverage_percent": 75.0
}
```

### Scan Stale Requirements

```
POST /api/specs/scan-stale
```

**Request:**
```json
{
  "name": "my-project",
  "modified_files": ["src/auth.rs", "src/crypto.rs"]
}
```

## Checkpoint Endpoints

### List Checkpoints

```
GET /api/checkpoints?name=my-project
```

**Response:**
```json
{
  "checkpoints": [
    { "kind": "manual", "id": "pre-release", "saved_at": "2025-01-15 10:30" },
    { "kind": "auto", "id": "my-project-a1b2c3d4e5f6", "saved_at": "2025-01-15 09:00" }
  ]
}
```

### Save Checkpoint

```
POST /api/checkpoints?name=my-project
```

**Request:**
```json
{ "label": "pre-release" }
```

### Restore Checkpoint

```
POST /api/checkpoints/:id/restore?name=my-project
```

## Undo/Diff/Blame Endpoints

### Undo Last Change

```
POST /api/undo?name=my-project
```

**Response:**
```json
{ "ok": true, "undid": "card-move", "card_id": "fix-login" }
```

### Show Diff

```
GET /api/diff?name=my-project
```

**Response:**
```json
{
  "added": [{ "id": "new-card", "title": "New feature", "column": "todo" }],
  "removed": [{ "id": "old-card", "title": "Removed", "column": "done" }],
  "moved": [{ "id": "moved-card", "title": "Moved", "from": "todo", "to": "doing" }]
}
```

### Blame Card

```
GET /api/blame/:card_id?name=my-project
```

**Response:**
```json
{
  "card_id": "fix-login",
  "entries": [
    { "at": "2025-01-15T10:30:00Z", "op": "card-move" },
    { "at": "2025-01-15T09:00:00Z", "op": "card-create" }
  ]
}
```

### Save Snapshot

```
POST /api/snapshot?name=my-project
```

**Request:**
```json
{ "label": "v1.0-release" }
```

## Import/Export Endpoints

### Export Board

```
GET /api/export?name=my-project&format=yaml
```

Returns the board as YAML or JSON with `Content-Disposition: attachment` header.

### Import Board

```
POST /api/import?name=my-project
```

**Request (YAML):**
```json
{ "yaml": "title: My Project\ncolumns:\n  - id: todo\n    name: To Do\ncards: []" }
```

**Request (JSON):**
```json
{ "json": "{\"title\":\"My Project\",\"columns\":[{\"id\":\"todo\",\"name\":\"To Do\"}],\"cards\":[]}" }
```

## Validate/Doctor Endpoints

### Validate Boards

```
GET /api/validate
```

**Response:**
```json
{
  "boards": [
    { "name": "my-project", "valid": true, "errors": [] },
    { "name": "backend", "valid": false, "errors": ["missing required field 'title'"] }
  ],
  "all_valid": false
}
```

### Doctor (Auto-fix)

```
POST /api/doctor
```

**Response:**
```json
{
  "boards": [
    { "name": "backend", "errors_before": 1, "errors_after": 0, "fixed": ["added missing 'title'"] }
  ],
  "fixed": 1
}
```

## Management Endpoints

### Task Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks?name=&status=&card_id=&agent_id=` | List tasks |
| `POST` | `/api/tasks` | Create task |
| `GET` | `/api/tasks/:id` | Get task |
| `PUT` | `/api/tasks/:id` | Update task |
| `DELETE` | `/api/tasks/:id` | Delete task |
| `POST` | `/api/tasks/:id/claim?agent_id=` | Claim task |
| `POST` | `/api/tasks/:id/complete` | Complete task |
| `POST` | `/api/tasks/:id/fail` | Fail task |

### Agent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents` | List agents |
| `POST` | `/api/agents` | Register agent |
| `GET` | `/api/agents/:id` | Get agent |
| `DELETE` | `/api/agents/:id` | Remove agent |
| `GET` | `/api/agents/:id/status` | Agent status + stats |

### Orchestration Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/orchestrate/cycle` | Run orchestration cycle |
| `GET` | `/api/orchestrate/status` | Orchestration status |

## Other Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/history?name=&card=&limit=&since=` | Operation history |
| `GET` | `/api/sessions?name=&limit=&since=` | Agent sessions |
| `GET` | `/api/context?name=` | Code context (file->card mapping) |
| `POST` | `/api/context/sync?name=` | Git-aware context refresh |
| `POST` | `/api/context/clear?name=` | Clear context |
| `GET` | `/api/code?name=&q=&top=` | Symbol search |
| `GET` | `/api/config` | AI settings from config.json |
| `WS` | `/ws` | WebSocket for live reload |

## WebSocket Events

Connect to `ws://localhost:4321/ws` to receive live reload notifications.

**Messages received:**
```json
{ "type": "reload", "version": 42 }
```

The `version` field increments on each change. The frontend should re-fetch the board when it receives a `reload` message with a newer version.

## Authentication

When `--token` is used, all `/api/*` and `/ws` endpoints require authentication:

**Option 1: Query parameter**
```
GET /api/boards?token=mysecret
```

**Option 2: Authorization header**
```
Authorization: Bearer mysecret
```

Static assets (HTML, JS, CSS) are always public.
