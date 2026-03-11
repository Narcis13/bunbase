# BunBase Improvements: Lessons from Real AI Agent Usage

> Session: Building a Trello-like backend using the BunBase skill.
> Date: 2026-03-10
> Methodology: Use the skill → hit friction → trace root cause in code → propose fix.

---

## Executive Summary

An AI agent attempted to bootstrap a complete Trello backend using the BunBase skill documentation. **What should have taken ~2 minutes took ~15 minutes** due to 5 distinct friction points. Two are real bugs in the codebase, two are skill documentation errors, and one is a missing feature.

---

## Issue 1: API Keys Don't Work on Admin Endpoints (BUG — Critical)

### What happened
The skill says *"API keys bypass all access rules"* and shows examples like:
```bash
curl http://HOST:PORT/_/api/collections -H "X-API-Key: bb_..."
```
This returns `{"error":"Unauthorized"}` every time. The agent spent **10+ minutes** creating keys, restarting servers, trying different DB paths — assuming a database path mismatch was the problem.

### Root cause
`requireAdmin()` in `src/auth/middleware.ts:49-68` **only checks Bearer JWT tokens**. It never checks `X-API-Key`. API keys are only checked in `buildAuthContext()` which handles `/api/...` (data) routes, not `/_/api/...` (admin) routes.

```typescript
// src/auth/middleware.ts — current code
export async function requireAdmin(req: Request): Promise<Admin | Response> {
  const token = extractBearerToken(req);  // ← Only checks Bearer token
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... verifies admin JWT only
}
```

### Proposed fix — `src/auth/middleware.ts`

```typescript
export async function requireAdmin(req: Request): Promise<Admin | Response> {
  // 1. Check API key first (highest priority, as documented)
  const apiKey = req.headers.get("X-API-Key");
  if (apiKey) {
    const verified = await verifyApiKey(apiKey);
    if (verified) {
      // API keys have admin-level access — return a synthetic admin object
      return { id: `apikey:${verified.id}`, email: `apikey:${verified.name}` } as Admin;
    }
    // Invalid API key — fall through to JWT check
  }

  // 2. Check Bearer token (admin JWT)
  const token = extractBearerToken(req);
  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... rest unchanged
}
```

### Impact
This is the #1 blocker for AI agents. The entire skill workflow says "create an API key, then use it for everything." But it only works for data CRUD, not for the setup phase (creating collections, setting rules, managing fields) — which is the part agents need most.

---

## Issue 2: Collection Creation Ignores `rules` from Request Body (BUG)

### What happened
The skill documents creating a collection with rules in one call:
```bash
curl -X POST /_/api/collections -d '{
  "name": "tasks",
  "fields": [...],
  "rules": {"listRule": "", "viewRule": "", ...}
}'
```
The collection is created successfully, but **rules are silently discarded**. A separate `PATCH /_/api/collections/{name}/rules` call is needed.

### Root cause
`src/api/server.ts:1307`:
```typescript
const { name, fields, type } = await req.json();
//                              ^^^ rules not destructured
```
The `createCollection()` function in `src/core/schema.ts:134` **does accept rules** via `options.rules` — they're just never passed from the HTTP handler.

### Proposed fix — `src/api/server.ts`

```typescript
// Line 1307: add rules to destructuring
const { name, fields, type, rules } = await req.json();

// Line 1311-1312: pass rules into options
const options = { ...(type ? { type } : {}), ...(rules ? { rules } : {}) };
const collection = createCollection(name, fields || [], options);
```

### Impact
Forces agents into a two-step process (create collection + patch rules) when one step should work. Also means there's a window where collections exist with default (admin-only) rules, which can cause confusing access-denied errors during setup.

---

## Issue 3: Signup Doesn't Accept Custom Fields (MISSING FEATURE)

### What happened
Created a `users` auth collection with `display_name` (required). Signup fails:
```
{"error":"NOT NULL constraint failed: users.display_name"}
```

### Root cause
`src/auth/user.ts:84` — `createUser()` only accepts `(collectionName, email, password)`. No mechanism to pass custom field values during signup.

`src/api/server.ts:606` — The signup handler only destructures `{email, password}` from the request body.

### Proposed fix — `src/api/server.ts` and `src/auth/user.ts`

```typescript
// server.ts signup handler
const { email, password, ...extraFields } = await req.json();
const result = await createUser(name, email, password, extraFields);

// user.ts createUser — add optional 4th param
export async function createUser(
  collectionName: string,
  email: string,
  password: string,
  extraFields?: Record<string, unknown>
): Promise<SignupResult> {
  // ... existing validation ...
  // When inserting, merge extraFields into the INSERT statement
}
```

### Workaround (current)
Make custom fields optional, then update the user record after signup via a separate PATCH call. This is fragile and requires admin auth.

---

## Issue 4: `JWT_SECRET` Silently Not Set (DX)

### What happened
Server starts fine without `JWT_SECRET`. API keys are created successfully. But key verification fails silently because token hashing depends on the JWT infrastructure being properly initialized.

### Proposed fix
Print a clear warning on startup if `JWT_SECRET` is not set:
```
⚠️  JWT_SECRET not set — using random secret (tokens won't persist across restarts)
```

This already happens for the admin password — do the same for JWT_SECRET.

---

## Issue 5: Generic "Unauthorized" Error With No Context (DX)

### What happened
Every auth failure returns the same `{"error":"Unauthorized"}`. When debugging the API key issue, there was no way to tell if:
- The key format was wrong
- The key wasn't found in the database
- The key was found but hash didn't match
- The endpoint doesn't support API keys at all

### Proposed fix
Add a `debug` mode (enabled via `BUNBASE_DEV=true`) that returns more specific errors:

```json
{"error": "Unauthorized", "hint": "API keys are not supported on admin endpoints. Use Bearer token from /_/api/auth/login"}
```

Or at minimum, differentiate between "no credentials provided" and "credentials invalid":
```json
{"error": "No authentication credentials provided"}
{"error": "Invalid API key"}
{"error": "Admin JWT expired"}
```

---

## Skill Documentation Fixes

### Fix 1: Bootstrap Workflow — Wrong endpoint examples

**Current (broken):**
```bash
# 4. Create collections, seed data, set rules
curl -X POST http://HOST:PORT/_/api/collections \
  -H "X-API-Key: bb_..." ...
```

**Until Issue 1 is fixed, should be:**
```bash
# 4. Get admin token first
TOKEN=$(curl -s -X POST http://HOST:PORT/_/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bunbase.local","password":"<password>"}' | jq -r .token)

# 5. Create collections using admin JWT
curl -X POST http://HOST:PORT/_/api/collections \
  -H "Authorization: Bearer $TOKEN" ...
```

**After Issue 1 is fixed:** the current examples become correct.

### Fix 2: Remove rules from collection creation example

**Current (silently ignored):**
```bash
curl -X POST ... -d '{
  "name": "tasks",
  ...
  "rules": { "listRule": "", ... }
}'
```

**Should be (until Issue 2 is fixed):**
```bash
# Step 1: Create collection
curl -X POST ... -d '{"name": "tasks", "fields": [...]}'

# Step 2: Set rules (separate call)
curl -X PATCH http://HOST:PORT/_/api/collections/tasks/rules \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"listRule": "", "viewRule": "", ...}'
```

### Fix 3: Document admin password capture

Add to bootstrap workflow:
```bash
# 2. Start instance — SAVE THE ADMIN PASSWORD from output
bunbase serve --port 8090 --db ./bunbase.db &
# Output: "Initial admin created: admin@bunbase.local"
# Output: "Generated password: xYzAbC123"  ← SAVE THIS
```

### Fix 4: Auth collection signup — document custom field limitation

Add to the auth collection section:
```
NOTE: Signup only accepts email + password. Custom fields on auth collections
should NOT be marked as required. Set them after signup via PATCH, or use the
admin endpoint to create users with all fields pre-populated.
```

### Fix 5: Add `/api/health` to the skill

The health check endpoint exists but isn't documented. Add:
```bash
# Health check (no auth required)
curl http://HOST:PORT/api/health
# → {"status":"ok","timestamp":"..."}
```

### Fix 6: Document two-tier endpoint structure clearly

Add a section:
```
## Endpoint Tiers

BunBase has two endpoint tiers with DIFFERENT auth requirements:

| Tier | Prefix | Auth | Purpose |
|------|--------|------|---------|
| Admin | `/_/api/...` | Admin JWT only* | Schema management, rules, user admin |
| Data | `/api/...` | API Key, Admin JWT, or User JWT | CRUD operations on records |

*API keys planned for admin tier in future release.

Admin JWT: POST /_/api/auth/login → {"token": "..."}
API Key: bunbase apikeys create --name "agent"
```

---

## Priority Matrix

| # | Issue | Type | Impact | Effort |
|---|-------|------|--------|--------|
| 1 | API keys on admin endpoints | Bug | **Critical** — blocks primary agent workflow | Small (10 lines) |
| 2 | Rules ignored in collection creation | Bug | High — forces 2x API calls | Tiny (2 lines) |
| 3 | Signup custom fields | Feature | Medium — workaround exists | Medium |
| 4 | JWT_SECRET warning | DX | Low — one-time confusion | Tiny |
| 5 | Generic auth errors | DX | Medium — wastes debug time | Small |

**Recommended order:** 1 → 2 → Skill docs → 3 → 5 → 4

---

## Broader Agent-Friendliness Recommendations

### 1. Single bootstrap command
```bash
bunbase init --collections trello-schema.json --seed trello-seed.json
```
Agents could generate a JSON schema file and apply it atomically instead of making 20+ HTTP calls.

### 2. `bunbase status` command
Show running instance info, database path, collection count, and whether JWT_SECRET is set. Agents waste time debugging when they can't introspect state.

### 3. Deterministic admin password via env
`BUNBASE_ADMIN_PASSWORD=admin123 bunbase serve` — already supported but the skill should emphasize it for agent use. Random passwords printed to stdout are impossible for agents to capture reliably from background processes.

### 4. Collection schema export/import
```bash
bunbase schema export --db ./app.db > schema.json
bunbase schema import --db ./app.db < schema.json
```
Enables reproducible setups without HTTP calls.

### 5. Transaction-safe bulk operations
Allow creating multiple collections + rules + seed data in a single atomic request, so partial failures don't leave the database in an inconsistent state.
