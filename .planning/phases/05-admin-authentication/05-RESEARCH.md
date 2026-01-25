# Phase 5: Admin Authentication - Research

**Researched:** 2026-01-25
**Domain:** JWT-based authentication with Bun
**Confidence:** HIGH

## Summary

This phase implements JWT-based admin authentication for BunBase, securing all `/_/` admin routes. The research identified that Bun provides built-in password hashing (`Bun.password`) with argon2id/bcrypt support, eliminating the need for external dependencies. For JWT handling, the `jose` library is the standard choice as it is explicitly designed for Bun and other web-interoperable runtimes with zero dependencies.

The key architectural challenge is that Bun.serve's `routes` object does not have built-in middleware support, so authentication must be implemented either through a wrapper pattern, checking tokens within route handlers, or using a pre-route check in the `fetch` fallback. Following PocketBase's patterns, the implementation should use a stateless JWT approach with HS256 signing, where tokens are not stored server-side.

**Primary recommendation:** Use `jose` for JWT sign/verify with HS256, `Bun.password` for password hashing with argon2id (default), store admin credentials in a `_admins` table, and implement route protection via a utility function called before each protected handler.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jose | 6.x | JWT sign/verify | Zero dependencies, explicit Bun support, RFC-compliant, tree-shakeable ESM |
| Bun.password | built-in | Password hashing | Native Bun API, supports argon2id/bcrypt, no external deps |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Bun.env | built-in | JWT secret from environment | Always for secrets |
| nanoid | 5.x | Generate admin IDs | Already in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jose | jsonwebtoken | jsonwebtoken has issues with expiry in Bun, jose is explicitly Bun-compatible |
| jose | bun-jwt | bun-jwt is just a thin wrapper around jose, use jose directly |
| Bun.password (argon2id) | bcrypt | argon2id is more secure and modern, bcrypt has 72-byte password limit |

**Installation:**
```bash
bun add jose
```

Note: `nanoid` is already installed. `Bun.password` is built-in, no installation needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── auth/
│   ├── admin.ts        # Admin CRUD (create, verify password, update password)
│   ├── jwt.ts          # Token creation and verification utilities
│   └── middleware.ts   # Route protection helper function
├── api/
│   └── server.ts       # HTTP server (add auth routes here)
```

### Pattern 1: Stateless JWT Authentication (PocketBase-style)
**What:** JWTs contain admin identity, are signed with a secret, and verified on each request. No server-side session storage.
**When to use:** Always for this phase - matches PocketBase's approach
**Example:**
```typescript
// Source: jose npm documentation, PocketBase auth docs
import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(Bun.env.JWT_SECRET);

// Create token
const token = await new SignJWT({ adminId: admin.id })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("24h")
  .sign(secret);

// Verify token
const { payload } = await jwtVerify(token, secret, {
  algorithms: ["HS256"],
});
```

### Pattern 2: Password Hashing with Bun.password
**What:** Use Bun's built-in password hashing with automatic salt generation
**When to use:** Storing and verifying admin passwords
**Example:**
```typescript
// Source: https://bun.sh/docs/api/hashing
// Hash password (argon2id by default)
const hash = await Bun.password.hash(password);
// => $argon2id$v=19$m=65536,t=2,p=1$...

// Verify password
const isValid = await Bun.password.verify(password, hash);
// => true/false
```

### Pattern 3: Route Protection via Helper Function
**What:** Since Bun.serve routes don't have middleware, create a helper that extracts and validates JWT, returning admin or error response
**When to use:** Every protected `/_/` route
**Example:**
```typescript
// Source: Bun.serve routes pattern, no middleware support
async function requireAdmin(req: Request): Promise<Admin | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    const admin = getAdminById(payload.adminId as string);
    if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return admin;
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// In route handler:
"/api/admins/me": {
  GET: async (req) => {
    const adminOrError = await requireAdmin(req);
    if (adminOrError instanceof Response) return adminOrError;
    return Response.json(adminOrError);
  }
}
```

### Pattern 4: Admin Storage in Database
**What:** Store admin credentials in a `_admins` table following the existing `_collections` pattern
**When to use:** Persisting admin account
**Example:**
```sql
CREATE TABLE IF NOT EXISTS _admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Anti-Patterns to Avoid
- **Storing plain passwords:** Always hash with Bun.password
- **Storing JWT tokens server-side:** Use stateless verification, tokens are not stored
- **Using jsonwebtoken:** Has compatibility issues with Bun's runtime
- **Custom JWT implementation:** Use jose, don't hand-roll crypto
- **Hardcoding JWT secret:** Always use environment variable (Bun.env.JWT_SECRET)
- **Short token expiration without refresh:** Use 24h expiration for admin tokens, like PocketBase

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom bcrypt/argon2 wrapper | Bun.password | Built-in, handles salt, secure defaults |
| JWT creation | Manual base64 encoding | jose SignJWT | Proper RFC compliance, handles edge cases |
| JWT verification | String parsing | jose jwtVerify | Timing-safe comparison, proper algorithm verification |
| Secret key encoding | Custom buffer handling | TextEncoder | Standard Web API, jose-compatible |

**Key insight:** Cryptographic operations are notoriously easy to get wrong. Bun and jose provide battle-tested implementations that handle timing attacks, proper encoding, and algorithm constraints.

## Common Pitfalls

### Pitfall 1: Missing JWT_SECRET Environment Variable
**What goes wrong:** Server crashes or uses insecure default
**Why it happens:** Forgetting to set up environment before starting
**How to avoid:** Check for JWT_SECRET on startup, fail fast with clear error message
**Warning signs:** "undefined" appearing in token operations, crypto errors

### Pitfall 2: Token in URL Query Parameters
**What goes wrong:** Token leaked in server logs, browser history, referrer headers
**Why it happens:** Trying to simplify implementation
**How to avoid:** Always use Authorization header with Bearer scheme
**Warning signs:** Tokens visible in URLs

### Pitfall 3: Not Checking Algorithm in Verification
**What goes wrong:** Algorithm confusion attack allows forged tokens
**Why it happens:** Using default jwtVerify without specifying algorithms
**How to avoid:** Always specify `{ algorithms: ["HS256"] }` in verification
**Warning signs:** None until exploited

### Pitfall 4: Synchronous Password Hashing Blocking Server
**What goes wrong:** Server becomes unresponsive during password operations
**Why it happens:** Using Bun.password.hashSync in request handlers
**How to avoid:** Always use async Bun.password.hash and Bun.password.verify
**Warning signs:** High latency on login/password change endpoints

### Pitfall 5: Initial Admin Setup Race Condition
**What goes wrong:** Multiple admins created on first startup
**Why it happens:** Checking "does admin exist" then inserting isn't atomic
**How to avoid:** Use UNIQUE constraint on email, handle conflict gracefully
**Warning signs:** Multiple admin records with same email

### Pitfall 6: Exposing Password Hash in Responses
**What goes wrong:** Password hash returned in API responses
**Why it happens:** Returning full admin record from database
**How to avoid:** Explicitly exclude password_hash from response objects
**Warning signs:** password_hash field visible in JSON responses

## Code Examples

Verified patterns from official sources:

### JWT Token Creation
```typescript
// Source: https://github.com/panva/jose
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(Bun.env.JWT_SECRET);

export async function createAdminToken(adminId: string): Promise<string> {
  return await new SignJWT({ adminId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}
```

### JWT Token Verification
```typescript
// Source: https://github.com/panva/jose
import { jwtVerify, JWTPayload } from "jose";

const secret = new TextEncoder().encode(Bun.env.JWT_SECRET);

interface AdminTokenPayload extends JWTPayload {
  adminId: string;
}

export async function verifyAdminToken(token: string): Promise<AdminTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    return payload as AdminTokenPayload;
  } catch {
    return null;
  }
}
```

### Password Hashing
```typescript
// Source: https://bun.sh/docs/api/hashing
export async function hashPassword(password: string): Promise<string> {
  // Default: argon2id with secure parameters
  return await Bun.password.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}
```

### Login Endpoint
```typescript
// Source: Composite from PocketBase patterns and Bun.serve docs
"/_/api/auth/login": {
  POST: async (req) => {
    const { email, password } = await req.json();

    const admin = getAdminByEmail(email);
    if (!admin) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await Bun.password.verify(password, admin.password_hash);
    if (!valid) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createAdminToken(admin.id);
    return Response.json({
      token,
      admin: { id: admin.id, email: admin.email }
    });
  }
}
```

### Extracting Bearer Token
```typescript
// Source: Standard HTTP pattern
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7); // "Bearer ".length === 7
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt only | argon2id (default) | Bun.password default | More secure, modern algorithm |
| jsonwebtoken | jose | 2023+ | Better Bun compatibility |
| Sessions with cookies | Stateless JWT | Industry trend | Simpler, scales better |
| MD5/SHA1 for passwords | argon2id/bcrypt | 2015+ | Critical security improvement |

**Deprecated/outdated:**
- jsonwebtoken: Has issues with Bun, use jose
- Manual salt generation: Bun.password handles this automatically
- Session-based auth: Use stateless JWT for API-first systems

## Open Questions

Things that couldn't be fully resolved:

1. **Initial Admin Password**
   - What we know: Need a way for first admin to be created
   - What's unclear: Should it be environment variable, CLI prompt, or auto-generated?
   - Recommendation: Use BUNBASE_ADMIN_PASSWORD env var for initial setup, if not set generate random password and log once on first startup

2. **Token Refresh Strategy**
   - What we know: PocketBase uses auth-refresh endpoint
   - What's unclear: Whether to implement refresh tokens or just new login
   - Recommendation: For MVP, use 24h tokens with re-login required. Add refresh later if needed.

3. **Rate Limiting on Login**
   - What we know: Login endpoints are common brute force targets
   - What's unclear: Whether to implement in this phase or defer
   - Recommendation: Defer to future security hardening phase, not core auth requirement

## Sources

### Primary (HIGH confidence)
- Bun.password hashing documentation: https://bun.sh/docs/api/hashing - Verified API, examples, algorithm support
- jose GitHub repository: https://github.com/panva/jose - Verified Bun support, API patterns
- PocketBase authentication docs: https://pocketbase.io/docs/authentication/ - Pattern reference

### Secondary (MEDIUM confidence)
- Bun.serve documentation: https://bun.sh/docs/api/http - Verified routes syntax, no middleware support
- GitHub issue #17608: https://github.com/oven-sh/bun/issues/17608 - Confirmed no built-in middleware for routes

### Tertiary (LOW confidence)
- Community blog posts on Bun JWT - Patterns verified against official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Direct from official Bun and jose documentation
- Architecture: HIGH - Based on existing codebase patterns and PocketBase reference
- Pitfalls: MEDIUM - Some from community sources, verified against known security practices

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (30 days - stable APIs)
