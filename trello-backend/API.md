# Trello-like Task Management - API Reference

Base URL: `http://localhost:8090`

## Authentication

All data endpoints require authentication. Unauthenticated requests return empty results.

### Sign Up
```
POST /api/collections/users/auth/signup
Body: {"email": "...", "password": "..."}
→ 201 {"user": {"id", "email", "verified"}}
```

### Log In
```
POST /api/collections/users/auth/login
Body: {"email": "...", "password": "..."}
→ 200 {"token": "...", "refreshToken": "...", "user": {...}}
```

### Refresh Token
```
POST /api/collections/users/auth/refresh
Body: {"refreshToken": "..."}
→ 200 {"token": "...", "refreshToken": "..."}
```

Use `Authorization: Bearer <token>` header on all subsequent requests.

---

## Data Model

```
users (auth)
  ├── display_name: text
  └── avatar: file

boards
  ├── title: text (required)
  ├── description: text
  ├── background_color: text
  ├── owner: relation → users (required)
  └── is_archived: boolean

board_members
  ├── board: relation → boards (required)
  ├── user: relation → users (required)
  └── role: text (required) — "admin" | "member" | "viewer"

lists
  ├── title: text (required)
  ├── board: relation → boards (required)
  ├── position: number (required)
  └── is_archived: boolean

labels
  ├── name: text (required)
  ├── color: text (required) — hex color
  └── board: relation → boards (required)

cards
  ├── title: text (required)
  ├── description: text
  ├── list: relation → lists (required)
  ├── position: number (required)
  ├── assignee: relation → users
  ├── due_date: datetime
  ├── labels: json — array of label IDs
  ├── cover_color: text
  ├── is_archived: boolean
  └── attachment: file (max 5 files, 10MB each)

checklists
  ├── title: text (required)
  ├── card: relation → cards (required)
  └── items: json — [{text: string, done: boolean}]

comments
  ├── text: text (required)
  ├── card: relation → cards (required)
  └── author: relation → users (required)

activity
  ├── action: text (required)
  ├── entity_type: text (required)
  ├── entity_id: text
  ├── board: relation → boards (required)
  ├── user: relation → users (required)
  └── details: json
```

---

## CRUD Endpoints

All collections follow the same pattern:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/collections/{name}/records` | List records |
| GET | `/api/collections/{name}/records/{id}` | Get single record |
| POST | `/api/collections/{name}/records` | Create record |
| PATCH | `/api/collections/{name}/records/{id}` | Update record |
| DELETE | `/api/collections/{name}/records/{id}` | Delete record |

### Query Parameters

| Param | Example | Description |
|-------|---------|-------------|
| `filter` | `filter=list='abc123'` | Filter expression |
| `sort` | `sort=-created_at,position` | Sort (prefix `-` for desc) |
| `page` | `page=2` | Page number (1-based) |
| `perPage` | `perPage=50` | Items per page (max 500) |
| `expand` | `expand=assignee,list` | Expand relation fields |
| `search` | `search=login bug` | Full-text search across text fields |

### List Response Format
```json
{
  "page": 1,
  "perPage": 30,
  "totalItems": 42,
  "totalPages": 2,
  "items": [...]
}
```

---

## Common API Flows

### Load a Board View
```
1. GET /api/collections/lists/records?filter=board='{boardId}'&sort=position
2. GET /api/collections/cards/records?filter=list='{listId}'&sort=position&expand=assignee
3. GET /api/collections/labels/records?filter=board='{boardId}'
```

### Move a Card Between Lists
```
PATCH /api/collections/cards/records/{cardId}
Body: {"list": "{newListId}", "position": 3}
```

### Reorder Cards Within a List
```
PATCH /api/collections/cards/records/{cardId}
Body: {"position": 2}
```

### Get Card Details with Everything
```
GET /api/collections/cards/records/{cardId}?expand=assignee,list
GET /api/collections/checklists/records?filter=card='{cardId}'
GET /api/collections/comments/records?filter=card='{cardId}'&sort=-created_at&expand=author
```

### Add a Comment
```
POST /api/collections/comments/records
Body: {"text": "...", "card": "{cardId}", "author": "{userId}"}
```

### Update Checklist Item
```
PATCH /api/collections/checklists/records/{checklistId}
Body: {"items": [{text: "Task 1", done: true}, {text: "Task 2", done: false}]}
```

---

## Access Rules Summary

| Collection | List/View | Create | Update | Delete |
|-----------|-----------|--------|--------|--------|
| boards | Any user | Any user | Owner only | Owner only |
| board_members | Any user | Any user | Admin only | Admin only |
| lists | Any user | Any user | Any user | Any user |
| labels | Any user | Any user | Any user | Any user |
| cards | Any user | Any user | Any user | Admin only |
| checklists | Any user | Any user | Any user | Any user |
| comments | Any user | Any user | Author only | Author only |
| activity | Any user | Any user | Admin only | Admin only |
