# Phase 10: User Authentication - Research

**Researched:** 2026-01-27
**Domain:** User authentication, JWT tokens, email verification, password reset
**Confidence:** HIGH

## Summary

This phase implements user authentication for BunBase, building on the existing admin authentication infrastructure and email service. The codebase already has working patterns for JWT creation/verification (jose library), password hashing (Bun.password with argon2id), and email sending (nodemailer). User authentication follows the same patterns but adds:

1. **Auth collection type** - A special collection type with predefined fields for user accounts
2. **Token refresh strategy** - Short-lived access tokens (15 min) + long-lived refresh tokens (7 days)
3. **Email verification/reset flows** - Secure one-time tokens sent via email
4. **Collection-level auth rules** - PocketBase-style filter expressions for access control

The existing admin auth module (`src/auth/`) provides excellent templates to follow. The jose library and Bun.password APIs are already in use and well-suited for user authentication.

**Primary recommendation:** Implement two-token (access + refresh) strategy with 15 minute access tokens and 7-day refresh tokens. Store refresh tokens in database for revocation support. Use cryptographically secure random tokens for email verification and password reset (64+ characters, hash before storage, 1-hour expiration).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jose | ^6.1.3 | JWT creation/verification | Already in use for admin auth, zero dependencies, Bun-compatible |
| Bun.password | Built-in | Password hashing (argon2id) | Native Bun API, OWASP-compliant argon2id |
| nanoid | ^5.0.9 | Secure token generation | Already in use for IDs, cryptographically secure |
| nodemailer | ^7.0.12 | Email sending | Already configured in Phase 9 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^3.24.0 | Input validation | Already available, use for password rules validation |
| Bun.CryptoHasher | Built-in | Token hashing | Hash verification/reset tokens before storage |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jose | jsonwebtoken | jose is already in use, zero deps, better maintained |
| Bun.password | bcrypt npm | Bun.password is native, faster, supports argon2id |
| nanoid | crypto.randomBytes | nanoid already in use, URL-safe output, same security |

**Installation:**
```bash
# No new dependencies required - all libraries already present
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── auth/
│   ├── admin.ts           # Existing admin auth (keep as-is)
│   ├── admin.test.ts
│   ├── jwt.ts             # Existing JWT utils (extend for user tokens)
│   ├── jwt.test.ts
│   ├── middleware.ts      # Existing middleware (extend for user auth)
│   ├── middleware.test.ts
│   ├── user.ts            # NEW: User auth operations
│   ├── user.test.ts
│   ├── tokens.ts          # NEW: Verification/reset token management
│   └── tokens.test.ts
├── core/
│   ├── schema.ts          # Extend for auth collection type
│   └── records.ts         # Extend for auth-aware queries
├── types/
│   ├── collection.ts      # Extend with auth collection type + rules
│   └── auth.ts            # NEW: User auth types
└── api/
    └── server.ts          # Add user auth routes
```

### Pattern 1: Two-Token Authentication
**What:** Short-lived access tokens paired with long-lived refresh tokens
**When to use:** All user authentication scenarios
**Example:**
```typescript
// Source: Existing admin JWT pattern + security best practices
export interface UserTokenPayload extends JWTPayload {
  userId: string;
  collectionId: string;  // Auth collection this user belongs to
  type: 'access';
}

export interface RefreshTokenPayload extends JWTPayload {
  userId: string;
  collectionId: string;
  type: 'refresh';
  tokenId: string;  // Unique ID for revocation lookup
}

// Access token: 15 minutes
export async function createUserAccessToken(
  userId: string,
  collectionId: string
): Promise<string> {
  return await new SignJWT({ userId, collectionId, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(getSecret());
}

// Refresh token: 7 days, stored in DB for revocation
export async function createUserRefreshToken(
  userId: string,
  collectionId: string
): Promise<{ token: string; tokenId: string }> {
  const tokenId = nanoid();
  const token = await new SignJWT({ userId, collectionId, type: 'refresh', tokenId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());

  // Store tokenId in _refresh_tokens table for revocation
  storeRefreshToken(tokenId, userId, collectionId);

  return { token, tokenId };
}
```

### Pattern 2: Auth Collection Type
**What:** Special collection type with predefined auth fields
**When to use:** Creating user account collections
**Example:**
```typescript
// Source: Existing collection type pattern extended
export type CollectionType = 'base' | 'auth';

export interface AuthCollectionOptions {
  // Which fields are required at signup
  requiredFields?: string[];
  // Minimum password length (default: 8)
  minPasswordLength?: number;
  // Require email verification before login
  requireEmailVerification?: boolean;
}

// Auth collection has these system fields automatically:
// - email (TEXT UNIQUE NOT NULL)
// - password_hash (TEXT NOT NULL)
// - verified (INTEGER DEFAULT 0)
// - created_at (TEXT)
// - updated_at (TEXT)

// Plus optional user-defined fields from schema
```

### Pattern 3: Collection Auth Rules
**What:** Filter expressions that control record access
**When to use:** Defining who can list/view/create/update/delete records
**Example:**
```typescript
// Source: PocketBase API rules syntax
export interface CollectionRules {
  // null = locked (admin only), '' = public, string = filter expression
  listRule: string | null;
  viewRule: string | null;
  createRule: string | null;
  updateRule: string | null;
  deleteRule: string | null;
}

// Example rules:
const rules: CollectionRules = {
  listRule: '@request.auth.id != ""',           // Authenticated users only
  viewRule: '@request.auth.id != ""',           // Authenticated users only
  createRule: '',                                // Anyone can create (signup)
  updateRule: '@request.auth.id = id',          // Only own record
  deleteRule: null,                              // Admin only
};

// Available @request.auth fields:
// - @request.auth.id - User ID (empty string if not authenticated)
// - @request.auth.collectionId - Auth collection ID
// - @request.auth.collectionName - Auth collection name
// - @request.auth.email - User email
// - @request.auth.verified - Whether user verified email
```

### Pattern 4: Secure Token Generation
**What:** Cryptographically secure one-time tokens for email verification/password reset
**When to use:** Email verification, password reset flows
**Example:**
```typescript
// Source: OWASP and security best practices
import { nanoid } from 'nanoid';

// Generate 64-character token (sufficient entropy)
function generateSecureToken(): string {
  return nanoid(64);
}

// Hash token before storage (never store plain tokens)
async function hashToken(token: string): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(token);
  return hasher.digest('hex');
}

// Token record in database
interface VerificationToken {
  id: string;
  user_id: string;
  token_hash: string;  // Hashed, not plain!
  type: 'email_verification' | 'password_reset';
  expires_at: string;  // 1 hour from creation
  used: boolean;
}
```

### Anti-Patterns to Avoid
- **Storing plain tokens:** Always hash verification/reset tokens before storage
- **Long-lived access tokens:** Use 15-60 minutes max, not 24 hours
- **No token revocation:** Store refresh tokens to enable logout/revocation
- **Revealing user existence:** Return consistent messages for existing/non-existing accounts
- **Reusable reset tokens:** Tokens must be single-use and expire after use

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom hash function | Bun.password.hash (argon2id) | Timing attacks, salt generation, OWASP params |
| JWT signing | Manual Base64 + HMAC | jose SignJWT/jwtVerify | Edge cases, algorithm negotiation attacks |
| Token generation | Math.random | nanoid(64) | Not cryptographically secure |
| Filter parsing | Regex-based parser | Proper expression parser | SQL injection, operator precedence |

**Key insight:** Authentication has many subtle security pitfalls. The existing admin auth patterns use battle-tested approaches - extend rather than reinvent.

## Common Pitfalls

### Pitfall 1: Timing Attacks in Password Verification
**What goes wrong:** Early return on user not found vs wrong password reveals user existence
**Why it happens:** Checking user existence before password verification
**How to avoid:** Always call Bun.password.verify even for non-existent users
**Warning signs:** Different response times for existing vs non-existing emails

```typescript
// WRONG: Timing leak
if (!user) return { error: 'Invalid credentials' };
const valid = await Bun.password.verify(password, user.password_hash);

// CORRECT: Constant time (approximately)
const dummyHash = '$argon2id$v=19$m=65536,t=2,p=1$...'; // Pre-computed
const hashToVerify = user?.password_hash ?? dummyHash;
await Bun.password.verify(password, hashToVerify);
if (!user || !valid) return { error: 'Invalid credentials' };
```

### Pitfall 2: Token Reuse After Password Change
**What goes wrong:** Old JWTs still valid after password change/reset
**Why it happens:** JWTs are stateless, no revocation mechanism
**How to avoid:** Include password version in token, or use refresh token revocation
**Warning signs:** User reports still logged in after password change

### Pitfall 3: Email Enumeration
**What goes wrong:** Different responses for existing vs non-existing accounts
**Why it happens:** Helpful error messages like "Email not found"
**How to avoid:** Always return "If an account exists, an email will be sent"
**Warning signs:** Attackers can verify valid email addresses

### Pitfall 4: Storing Plain Verification Tokens
**What goes wrong:** Database breach exposes all pending reset tokens
**Why it happens:** Assuming tokens are "random enough"
**How to avoid:** Hash tokens with SHA-256 before storage
**Warning signs:** Plain tokens visible in database

### Pitfall 5: Missing Token Expiration Enforcement
**What goes wrong:** Old verification emails still work months later
**Why it happens:** Only checking token existence, not expiration
**How to avoid:** Always check expires_at in token lookup query
**Warning signs:** Old reset links still work

## Code Examples

Verified patterns from official sources and existing codebase:

### User Signup
```typescript
// Source: Existing admin.ts createAdmin pattern
export async function createUser(
  collectionName: string,
  email: string,
  password: string,
  additionalData?: Record<string, unknown>
): Promise<User> {
  const collection = getAuthCollection(collectionName);
  if (!collection) {
    throw new Error(`Auth collection "${collectionName}" not found`);
  }

  // Validate password
  validatePassword(password, collection.options?.minPasswordLength ?? 8);

  // Hash password using argon2id with OWASP-recommended params
  const password_hash = await Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 65536,  // 64MB
    timeCost: 2,
  });

  const id = generateId();
  const now = new Date().toISOString();

  // Insert user record
  const db = getDatabase();
  db.prepare(`
    INSERT INTO "${collectionName}" (id, email, password_hash, verified, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(id, email, password_hash, now, now);

  return { id, email, verified: false, created_at: now, updated_at: now };
}
```

### Login with Token Response
```typescript
// Source: Existing admin login pattern + refresh token strategy
export async function loginUser(
  collectionName: string,
  email: string,
  password: string
): Promise<LoginResult> {
  const user = getUserByEmail(collectionName, email);

  // Constant-time comparison (approx) to prevent timing attacks
  const dummyHash = DUMMY_ARGON2_HASH;
  const hashToVerify = user?.password_hash ?? dummyHash;
  const isValid = await Bun.password.verify(password, hashToVerify);

  if (!user || !isValid) {
    return { success: false, error: 'Invalid credentials' };
  }

  // Check email verification requirement
  const collection = getAuthCollection(collectionName);
  if (collection.options?.requireEmailVerification && !user.verified) {
    return { success: false, error: 'Email not verified' };
  }

  // Generate tokens
  const accessToken = await createUserAccessToken(user.id, collection.id);
  const { token: refreshToken, tokenId } = await createUserRefreshToken(user.id, collection.id);

  return {
    success: true,
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, verified: user.verified },
  };
}
```

### Token Refresh
```typescript
// Source: OAuth 2.0 refresh token best practices
export async function refreshTokens(
  refreshToken: string
): Promise<RefreshResult> {
  // Verify refresh token
  const payload = await verifyUserToken(refreshToken, 'refresh');
  if (!payload) {
    return { success: false, error: 'Invalid refresh token' };
  }

  // Check if refresh token is revoked
  const isValid = await checkRefreshTokenValid(payload.tokenId);
  if (!isValid) {
    return { success: false, error: 'Refresh token revoked' };
  }

  // Revoke old refresh token (rotation)
  await revokeRefreshToken(payload.tokenId);

  // Issue new tokens
  const accessToken = await createUserAccessToken(payload.userId, payload.collectionId);
  const { token: newRefreshToken } = await createUserRefreshToken(payload.userId, payload.collectionId);

  return {
    success: true,
    accessToken,
    refreshToken: newRefreshToken,
  };
}
```

### Email Verification Flow
```typescript
// Source: OWASP email verification best practices
export async function requestEmailVerification(userId: string): Promise<void> {
  const user = getUserById(userId);
  if (!user) throw new Error('User not found');
  if (user.verified) return; // Already verified, no-op

  // Generate secure token
  const token = nanoid(64);
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  // Store hashed token
  await storeVerificationToken({
    user_id: userId,
    token_hash: tokenHash,
    type: 'email_verification',
    expires_at: expiresAt,
  });

  // Send email with plain token
  await sendEmail({
    to: user.email,
    subject: 'Verify your email',
    text: 'Click here to verify: {{link}}',
    placeholders: {
      link: `${APP_URL}/verify-email?token=${token}`,
    },
  });
}

export async function confirmEmailVerification(token: string): Promise<boolean> {
  const tokenHash = await hashToken(token);

  // Find and validate token
  const tokenRecord = await findVerificationToken(tokenHash, 'email_verification');
  if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date() || tokenRecord.used) {
    return false;
  }

  // Mark token as used
  await markTokenUsed(tokenRecord.id);

  // Mark user as verified
  await setUserVerified(tokenRecord.user_id, true);

  return true;
}
```

### Password Reset Flow
```typescript
// Source: OWASP password reset best practices
export async function requestPasswordReset(email: string): Promise<void> {
  // Always return success to prevent email enumeration
  const user = getUserByEmail(email);
  if (!user) return; // Silent return, don't reveal user existence

  // Invalidate any existing reset tokens for this user
  await invalidateUserResetTokens(user.id);

  // Generate secure token
  const token = nanoid(64);
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  // Store hashed token
  await storeVerificationToken({
    user_id: user.id,
    token_hash: tokenHash,
    type: 'password_reset',
    expires_at: expiresAt,
  });

  // Send email
  await sendEmail({
    to: user.email,
    subject: 'Reset your password',
    text: 'Click here to reset: {{link}}\n\nThis link expires in 1 hour.',
    placeholders: {
      link: `${APP_URL}/reset-password?token=${token}`,
    },
  });
}

export async function confirmPasswordReset(
  token: string,
  newPassword: string
): Promise<boolean> {
  const tokenHash = await hashToken(token);

  // Find and validate token
  const tokenRecord = await findVerificationToken(tokenHash, 'password_reset');
  if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date() || tokenRecord.used) {
    return false;
  }

  // Validate new password
  validatePassword(newPassword, 8);

  // Hash new password
  const password_hash = await Bun.password.hash(newPassword, {
    algorithm: 'argon2id',
    memoryCost: 65536,
    timeCost: 2,
  });

  // Update password
  await updateUserPassword(tokenRecord.user_id, password_hash);

  // Mark token as used
  await markTokenUsed(tokenRecord.id);

  // Revoke all refresh tokens for this user (force re-login)
  await revokeAllUserRefreshTokens(tokenRecord.user_id);

  return true;
}
```

### Auth Middleware for User Routes
```typescript
// Source: Existing requireAdmin pattern extended
export async function requireUser(req: Request): Promise<User | Response> {
  const token = extractBearerToken(req);
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await verifyUserToken(token, 'access');
  if (!payload) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = getUserById(payload.userId);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Return user without password_hash
  const { password_hash: _, ...safeUser } = user;
  return { ...safeUser, collectionId: payload.collectionId };
}

// Optional: middleware that attaches user to request without requiring auth
export async function optionalUser(req: Request): Promise<User | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  const payload = await verifyUserToken(token, 'access');
  if (!payload) return null;

  const user = getUserById(payload.userId);
  if (!user) return null;

  const { password_hash: _, ...safeUser } = user;
  return { ...safeUser, collectionId: payload.collectionId };
}
```

### Collection Auth Rules Evaluation
```typescript
// Source: PocketBase-style rule evaluation
export function evaluateRule(
  rule: string | null,
  context: RuleContext
): boolean {
  // null = locked (admin only)
  if (rule === null) {
    return context.isAdmin;
  }

  // Empty string = public access
  if (rule === '') {
    return true;
  }

  // Parse and evaluate filter expression
  return evaluateFilterExpression(rule, context);
}

interface RuleContext {
  isAdmin: boolean;
  auth: {
    id: string;
    collectionId: string;
    collectionName: string;
    email: string;
    verified: boolean;
  } | null;
  record?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

// Simple rule examples:
// '@request.auth.id != ""' - any authenticated user
// '@request.auth.id = id' - record owner only
// '@request.auth.verified = true' - verified users only
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt only | argon2id preferred | OWASP 2023 | Use Bun.password default |
| 24h single token | 15min access + 7d refresh | OAuth 2.0 best practices | Smaller attack window |
| MD5/SHA1 tokens | SHA-256 hashed tokens | Years ago | Required for security |
| Plain token storage | Always hash before storage | OWASP current | Prevents DB breach exploits |

**Deprecated/outdated:**
- bcrypt: Still supported but argon2id is recommended for new systems
- Long-lived single tokens: Use refresh token rotation instead
- Storing plain verification tokens: Always hash

## Open Questions

Things that couldn't be fully resolved:

1. **Multiple auth collections?**
   - What we know: PocketBase supports multiple auth collections (users, admins, etc.)
   - What's unclear: How to handle cross-collection auth rules
   - Recommendation: Start with single auth collection support, extend later

2. **Session management UI?**
   - What we know: Users should be able to see/revoke sessions
   - What's unclear: Exact UI requirements for v0.2
   - Recommendation: Defer to future (AAUTH-03 in requirements)

3. **Rate limiting for auth endpoints?**
   - What we know: Should prevent brute force attacks
   - What's unclear: Not in current requirements
   - Recommendation: Add basic rate limiting (5 attempts/15 min)

## Sources

### Primary (HIGH confidence)
- Bun.password API: https://bun.sh/docs/api/hashing - argon2id parameters, verify API
- jose library: https://github.com/panva/jose - JWT signing/verification
- Existing codebase: src/auth/admin.ts, src/auth/jwt.ts - working patterns

### Secondary (MEDIUM confidence)
- OWASP Password Storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP Forgot Password: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- PocketBase API Rules: https://pocketbase.io/docs/api-rules-and-filters/
- Auth0 Refresh Tokens: https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/

### Tertiary (LOW confidence)
- WebSearch results for token expiration strategies (multiple sources agree on 15min/7d)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing libraries already in codebase
- Architecture: HIGH - Extending existing admin auth patterns
- Pitfalls: HIGH - Well-documented security concerns, OWASP guidance
- Auth rules: MEDIUM - PocketBase-inspired, implementation details TBD

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (stable domain, well-established patterns)
