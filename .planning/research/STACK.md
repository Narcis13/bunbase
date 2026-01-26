# Stack Additions: v0.2

> Research Date: January 2026
> Purpose: Define stack additions for user authentication, file uploads, and realtime/SSE

## Existing Stack (Validated in v0.1)

| Component | Technology | Notes |
|-----------|------------|-------|
| Runtime | Bun 1.3.6+ | Native SQLite, password hashing, single-binary |
| HTTP Server | Bun.serve() | Raw Bun routes (NOT Hono) |
| Database | bun:sqlite | Direct usage, no ORM |
| Auth (admin) | Bun.password + jose JWT | argon2id, HS256 tokens |
| Validation | Zod | Schema validation |
| IDs | nanoid | 21-char URL-safe IDs |
| Admin UI | React 19 + Tailwind CSS v4 + shadcn/ui | Embedded in binary |

---

## User Authentication

### What's Already There

The admin auth system in v0.1 provides a solid foundation:
- `Bun.password.hash()` with argon2id (OWASP recommended)
- `jose` library for JWT (HS256, 24h expiry)
- Bearer token middleware pattern

### New Requirements for User Auth

| Capability | Approach | Rationale |
|------------|----------|-----------|
| User registration | Reuse `Bun.password.hash()` pattern | Consistent with admin auth |
| User login | Reuse JWT pattern from admin | Same token flow |
| Session management | Short-lived access + refresh tokens | Balance security/UX |
| Password reset | Time-limited tokens + email | Industry standard |
| Email sending | External SMTP (nodemailer) | User-provided config |

### Stack Addition: nodemailer

**Version:** `^6.9.0` (latest stable)

**Why nodemailer:**
- Bun added official support in v0.6.13
- Most widely used Node.js email library
- Works with any SMTP provider
- Users configure their own SMTP (keeps binary dependency-free)

**Why NOT alternatives:**
- `@sendgrid/mail`, `resend`, etc. require API keys and vendor lock-in
- Built-in `fetch()` to email APIs could work but loses SMTP flexibility
- Cross-runtime libraries like Upyo are less mature

**Known Issues:**
- Historical loop-sending issues in Bun (connection drops) - use connection pooling
- Doesn't work in edge functions (not relevant - we run as server)

**Installation:**
```bash
bun add nodemailer@^6.9.0
bun add -D @types/nodemailer@^6.4.0
```

**Configuration Pattern:**
```typescript
// User-provided SMTP config (stored in _settings table)
const transporter = nodemailer.createTransport({
  host: settings.smtp_host,
  port: settings.smtp_port,
  secure: settings.smtp_secure,
  auth: {
    user: settings.smtp_user,
    pass: settings.smtp_pass,
  },
});
```

### Password Reset Token Strategy

Based on [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html):

| Requirement | Implementation |
|-------------|----------------|
| Token generation | `crypto.randomBytes(32).toString('hex')` - 64 chars |
| Token storage | Store HASHED token (Bun.password.hash not needed, SHA-256 sufficient) |
| Token expiration | 1 hour maximum |
| Single use | Delete token after use |
| Rate limiting | Max 3 requests per email per hour |

**No new dependencies needed** - use Bun's built-in `crypto` module.

### JWT Token Strategy

Extend existing jose setup:

| Token Type | Expiry | Purpose |
|------------|--------|---------|
| Access token | 15 minutes | API access |
| Refresh token | 7 days | Renew access tokens |
| Reset token | 1 hour | Password reset (not JWT) |

**No new dependencies needed** - jose ^6.1.3 already installed.

---

## File Uploads

### Bun Native Approach

Bun has built-in multipart/form-data parsing. **No additional libraries needed.**

**Key APIs:**
- `Request.formData()` - Parse multipart request
- `FormData.get()` - Extract file as `Blob`
- `Bun.write(path, blob)` - Write to filesystem

### File Handling Strategy

| Concern | Approach |
|---------|----------|
| Parse uploads | `await req.formData()` (native) |
| Extract file | `formData.get('file')` returns Blob |
| Save to disk | `await Bun.write(filepath, blob)` |
| Storage location | `./pb_data/storage/{collection}/{record_id}/` |
| Filename generation | `{nanoid()}.{originalExtension}` |
| Metadata storage | JSON field in record |

### File Validation

Use existing Zod for validation:

```typescript
const fileSchema = z.object({
  maxSize: z.number().default(5 * 1024 * 1024), // 5MB default
  allowedTypes: z.array(z.string()).default(['image/*', 'application/pdf']),
});
```

**No new dependencies needed.**

### Known Issues with Bun File Uploads

From research:
- Some users report intermittent "Stream ended unexpectedly" errors
- Recommendation: Add request timeout handling and retry logic
- FormData's non-standard `toJSON` can cause issues with other libraries

**Mitigation:** Keep file handling simple, use native APIs only.

---

## Realtime/SSE

### SSE vs WebSockets Decision

| Feature | SSE | WebSocket |
|---------|-----|-----------|
| Direction | Server -> Client | Bidirectional |
| Reconnection | Automatic | Manual |
| Complexity | Lower | Higher |
| Use case | Notifications, updates | Chat, gaming |

**Recommendation: SSE for record change subscriptions**

Why:
- Clients only need to receive updates (server -> client)
- Built-in automatic reconnection
- Simpler implementation
- HTTP/2 multiplexing friendly

### Implementation Approach

Use native Bun.serve with ReadableStream. **No framework needed.**

```typescript
// SSE endpoint
"/api/realtime": {
  GET: (req) => {
    const stream = new ReadableStream({
      start(controller) {
        // Subscribe to changes
        const unsubscribe = subscribeToChanges((event) => {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        });

        req.signal.addEventListener('abort', () => {
          unsubscribe();
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }
}
```

### Internal Pub/Sub

Implement simple in-process pub/sub for change notifications:

```typescript
// Internal event bus (no Redis needed for single-process)
const subscribers = new Map<string, Set<(event: ChangeEvent) => void>>();

function publish(collection: string, event: ChangeEvent) {
  subscribers.get(collection)?.forEach(cb => cb(event));
  subscribers.get('*')?.forEach(cb => cb(event)); // Wildcard
}
```

**No new dependencies needed.**

### WebSocket Option (Future)

If bidirectional communication is needed later, Bun.serve has native WebSocket support with pub/sub:

```typescript
Bun.serve({
  websocket: {
    open(ws) { ws.subscribe('changes'); },
    message(ws, msg) { /* handle client messages */ },
  }
});
```

**Defer WebSocket to v0.3** - SSE is sufficient for record change subscriptions.

---

## UI Polish

### Existing UI Stack

- React 19.2.3
- Tailwind CSS 4.1.18
- shadcn/ui components (via Radix primitives)
- lucide-react icons
- sonner (toast notifications)
- tw-animate-css (animations)

### Potential Additions for Polish

| Need | Option | Recommendation |
|------|--------|----------------|
| Loading skeletons | Already in shadcn/ui | Use existing |
| Transitions | tw-animate-css installed | Use existing |
| Better tables | @tanstack/react-table installed | Use existing |
| Charts/metrics | recharts | Defer - not needed for v0.2 |
| Rich text editing | tiptap | Defer - not needed for v0.2 |

**No new UI dependencies needed for v0.2.**

All polish work can be achieved with existing stack:
- Tailwind transitions/animations
- tw-animate-css for pre-built animations
- shadcn/ui skeleton components
- Refining existing components

---

## Summary: What to Add

### New Dependencies

| Package | Version | Purpose | Confidence |
|---------|---------|---------|------------|
| nodemailer | ^6.9.0 | Password reset emails | HIGH |
| @types/nodemailer | ^6.4.0 | TypeScript types (dev) | HIGH |

### Existing Dependencies (No Changes)

| Package | Current | Purpose |
|---------|---------|---------|
| jose | ^6.1.3 | JWT tokens (access + refresh) |
| nanoid | ^5.0.9 | File name generation |
| zod | ^3.24.0 | File validation schemas |

### Bun Native Features (Zero Dependencies)

| Feature | Bun API |
|---------|---------|
| File upload parsing | `Request.formData()` |
| File saving | `Bun.write()` |
| File reading | `Bun.file()` |
| SSE streaming | `ReadableStream` + Response |
| Reset token generation | `crypto.randomBytes()` |
| Token hashing | `crypto.createHash('sha256')` |

---

## Not Adding

| Technology | Why Not |
|------------|---------|
| **Hono** | v0.1 uses raw Bun.serve successfully; adding framework adds complexity |
| **multer** | Bun has native multipart parsing; multer is Node-specific |
| **ws** | Bun has native WebSocket; ws is Node-specific |
| **Redis** | Single-process pub/sub sufficient; Redis adds deployment complexity |
| **S3/cloud storage** | v0.2 scoped to local filesystem; cloud storage is v0.3+ |
| **@hono/streaming** | Not using Hono; native ReadableStream works fine |
| **socket.io** | Over-engineered for our needs; native SSE/WS sufficient |
| **passport.js** | Adds complexity; our auth is simple enough without it |
| **External auth (Auth0, Clerk)** | Adds runtime dependency; conflicts with single-binary goal |
| **rate-limit libraries** | Simple in-memory rate limiting sufficient for v0.2 |

---

## Installation Command

```bash
bun add nodemailer@^6.9.0
bun add -D @types/nodemailer@^6.4.0
```

---

## Rationale

### Why Minimal Additions?

BunBase's core value is being a **single-binary backend-in-a-box**. Every dependency:
1. Increases binary size
2. Adds potential security vulnerabilities
3. Increases maintenance burden
4. May have Bun compatibility issues

Bun 1.3+ provides excellent native APIs for:
- File handling (Bun.file, Bun.write, formData)
- Streaming (ReadableStream for SSE)
- Cryptography (crypto module)
- Password hashing (Bun.password)

The only justified addition is **nodemailer** because:
1. Email sending requires SMTP protocol implementation
2. Rolling our own SMTP client would be error-prone
3. nodemailer is battle-tested with 15+ years of development
4. It's user-configurable (no vendor lock-in)

### Why Not Hono?

The original research recommended Hono, but v0.1 shipped successfully with raw Bun.serve. Adding Hono now would:
1. Require refactoring all existing routes
2. Add ~12KB to bundle size
3. Introduce new patterns mid-project

Raw Bun.serve + native APIs is working well. If routing becomes unwieldy in v0.3+, reconsider then.

---

## Sources

### Verified (HIGH Confidence)
- [Bun File Uploads Guide](https://bun.com/docs/guides/http/file-uploads)
- [Bun WebSocket API](https://bun.com/docs/api/websockets)
- [jose npm package](https://www.npmjs.com/package/jose) - v6.1.3
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

### Researched (MEDIUM Confidence)
- [Nodemailer Bun Compatibility](https://bun.sh/blog/bun-v0.6.13) - Official support added
- [SSE with Bun](https://github.com/oven-sh/bun/issues/2443) - Community patterns
- [Password Reset Best Practices](https://www.authgear.com/post/authentication-security-password-reset-best-practices-and-more)

### Existing Codebase (HIGH Confidence)
- `/Users/narcisbrindusescu/newme/bunbase/src/auth/admin.ts` - Admin auth pattern
- `/Users/narcisbrindusescu/newme/bunbase/src/auth/jwt.ts` - JWT pattern with jose
- `/Users/narcisbrindusescu/newme/bunbase/src/api/server.ts` - Raw Bun.serve pattern
