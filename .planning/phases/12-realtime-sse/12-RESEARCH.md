# Phase 12: Realtime/SSE - Research

**Researched:** 2026-01-27
**Domain:** Server-Sent Events (SSE), realtime subscriptions, event broadcasting
**Confidence:** HIGH

## Summary

This phase implements realtime/SSE functionality for BunBase, enabling clients to subscribe to record changes and receive live updates. The implementation follows the PocketBase protocol pattern:

1. **SSE connection** - Client establishes connection via `GET /api/realtime`, receives client ID
2. **Subscription management** - Client sends subscriptions via `POST /api/realtime` with topics like `collection/*` or `collection/recordId`
3. **Event broadcasting** - Server broadcasts create/update/delete events to relevant subscribers
4. **Permission filtering** - Events are filtered based on collection view/list rules

The existing hooks system (`afterCreate`, `afterUpdate`, `afterDelete`) provides the integration point for broadcasting events. Bun.serve() natively supports streaming responses for SSE via `ReadableStream` with `type: "direct"`.

**Primary recommendation:** Use Bun's `ReadableStream` with `type: "direct"` for SSE streaming. Implement a `RealtimeManager` class to track connections, subscriptions, and handle event broadcasting. Hook into the existing `afterCreate`, `afterUpdate`, `afterDelete` hooks to trigger broadcasts. Apply collection view/list rules to filter events per subscriber.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun.serve() | Built-in | SSE streaming via ReadableStream | Native support, type: "direct" for immediate flush |
| nanoid | ^5.0.9 | Client ID generation | Already in use, cryptographically secure, URL-safe |
| EventEmitter | Node.js built-in | Internal event routing | Simple pub/sub for decoupled broadcasting |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing HookManager | Internal | Hook into record lifecycle | afterCreate/Update/Delete events |
| Existing auth middleware | Internal | Extract user context | Permission-filtered subscriptions |
| Existing rules.ts | Internal | Evaluate collection rules | Filter events by access |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ReadableStream | better-sse npm | More features but external dependency; native sufficient |
| EventEmitter | Custom pub/sub | EventEmitter is battle-tested, built-in |
| In-memory Map | Redis | Overkill for single-process; defer scaling to v0.3+ |

**Installation:**
```bash
# No new dependencies required - all libraries already present
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  realtime/
    manager.ts          # RealtimeManager class - connection and subscription tracking
    manager.test.ts     # Tests for connection/subscription management
    sse.ts              # SSE response helpers and formatting
    sse.test.ts         # Tests for SSE message formatting
    hooks.ts            # Hook registration for broadcasting
    hooks.test.ts       # Tests for hook-triggered broadcasts
  api/
    server.ts           # Add /api/realtime routes
```

### Pattern 1: SSE Response with Direct Streaming
**What:** Create long-lived SSE connection using Bun's direct streaming
**When to use:** `GET /api/realtime` endpoint
**Example:**
```typescript
// Source: Bun GitHub issue #2443, verified working pattern
function createSSEResponse(
  clientId: string,
  signal: AbortSignal,
  realtimeManager: RealtimeManager
): Response {
  return new Response(
    new ReadableStream({
      type: "direct",
      async pull(controller: ReadableStreamDirectController) {
        // Send initial PB_CONNECT event
        await sendSSEEvent(controller, "PB_CONNECT", { clientId });

        // Register client with manager
        const client = realtimeManager.registerClient(clientId, controller);

        // Keep connection alive with periodic pings
        while (!signal.aborted) {
          await Bun.sleep(30000); // 30 second ping interval
          if (!signal.aborted) {
            await sendSSEComment(controller, "ping");
          }
        }

        // Cleanup on disconnect
        realtimeManager.removeClient(clientId);
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    }
  );
}
```

### Pattern 2: SSE Message Formatting
**What:** Format SSE messages according to spec
**When to use:** All event sending
**Example:**
```typescript
// Source: MDN Server-Sent Events specification
interface SSEMessage {
  event?: string;      // Named event type
  data: unknown;       // JSON-serializable payload
  id?: string;         // Event ID for reconnection
  retry?: number;      // Reconnection time in ms
}

function formatSSEMessage(message: SSEMessage): string {
  const lines: string[] = [];

  if (message.event) {
    lines.push(`event: ${message.event}`);
  }
  if (message.id) {
    lines.push(`id: ${message.id}`);
  }
  if (message.retry !== undefined) {
    lines.push(`retry: ${message.retry}`);
  }

  // Data can span multiple lines
  const dataStr = JSON.stringify(message.data);
  lines.push(`data: ${dataStr}`);

  return lines.join("\n") + "\n\n";
}

// Keep-alive comment (ignored by clients but keeps connection alive)
function formatSSEComment(comment: string): string {
  return `: ${comment}\n\n`;
}

async function sendSSEEvent(
  controller: ReadableStreamDirectController,
  event: string,
  data: unknown
): Promise<void> {
  const message = formatSSEMessage({ event, data, id: nanoid() });
  await controller.write(message);
  await controller.flush();
}

async function sendSSEComment(
  controller: ReadableStreamDirectController,
  comment: string
): Promise<void> {
  await controller.write(formatSSEComment(comment));
  await controller.flush();
}
```

### Pattern 3: Subscription Topics
**What:** PocketBase-compatible subscription topic format
**When to use:** Subscribe/unsubscribe operations
**Example:**
```typescript
// Source: PocketBase API Realtime documentation

// Topic formats:
// - "collection/*" - All records in collection (uses listRule)
// - "collection/recordId" - Specific record (uses viewRule)

interface Subscription {
  collection: string;
  recordId: string | "*";  // "*" means entire collection
}

function parseTopic(topic: string): Subscription | null {
  const match = topic.match(/^([a-zA-Z0-9_]+)\/(\*|[a-zA-Z0-9]+)$/);
  if (!match) return null;

  return {
    collection: match[1],
    recordId: match[2],
  };
}

function matchesSubscription(
  sub: Subscription,
  collection: string,
  recordId: string
): boolean {
  if (sub.collection !== collection) return false;
  if (sub.recordId === "*") return true;
  return sub.recordId === recordId;
}
```

### Pattern 4: Client Connection Manager
**What:** Track active connections and their subscriptions
**When to use:** Managing SSE clients
**Example:**
```typescript
// Source: PocketBase realtime architecture patterns

interface RealtimeClient {
  id: string;
  controller: ReadableStreamDirectController;
  subscriptions: Subscription[];
  user: AuthenticatedUser | null;
  lastActivity: number;
}

class RealtimeManager {
  private clients = new Map<string, RealtimeClient>();
  private inactivityTimeout = 5 * 60 * 1000; // 5 minutes

  registerClient(
    clientId: string,
    controller: ReadableStreamDirectController
  ): RealtimeClient {
    const client: RealtimeClient = {
      id: clientId,
      controller,
      subscriptions: [],
      user: null,
      lastActivity: Date.now(),
    };
    this.clients.set(clientId, client);
    return client;
  }

  setClientAuth(clientId: string, user: AuthenticatedUser | null): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.user = user;
    }
  }

  setSubscriptions(clientId: string, topics: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions = topics
      .map(parseTopic)
      .filter((s): s is Subscription => s !== null);
    client.lastActivity = Date.now();
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getSubscribersForRecord(
    collection: string,
    recordId: string
  ): RealtimeClient[] {
    const subscribers: RealtimeClient[] = [];

    for (const client of this.clients.values()) {
      for (const sub of client.subscriptions) {
        if (matchesSubscription(sub, collection, recordId)) {
          subscribers.push(client);
          break;
        }
      }
    }

    return subscribers;
  }

  // Clean up inactive connections
  cleanupInactive(): void {
    const now = Date.now();
    for (const [clientId, client] of this.clients) {
      if (now - client.lastActivity > this.inactivityTimeout) {
        try {
          client.controller.close();
        } catch {
          // Controller may already be closed
        }
        this.clients.delete(clientId);
      }
    }
  }
}
```

### Pattern 5: Event Broadcasting with Permission Filtering
**What:** Broadcast events only to authorized subscribers
**When to use:** afterCreate, afterUpdate, afterDelete hooks
**Example:**
```typescript
// Source: PocketBase auth-aware subscriptions pattern

async function broadcastRecordEvent(
  manager: RealtimeManager,
  action: "create" | "update" | "delete",
  collection: string,
  record: Record<string, unknown>
): Promise<void> {
  const recordId = record.id as string;
  const subscribers = manager.getSubscribersForRecord(collection, recordId);

  // Get collection for rule evaluation
  const collectionDef = getCollection(collection);
  if (!collectionDef) return;

  for (const client of subscribers) {
    // Determine which rule to check based on subscription type
    const sub = client.subscriptions.find(s =>
      matchesSubscription(s, collection, recordId)
    );
    if (!sub) continue;

    // Check access permissions
    const rule = sub.recordId === "*"
      ? collectionDef.rules?.listRule
      : collectionDef.rules?.viewRule;

    const authContext: RuleContext = {
      isAdmin: false, // SSE clients are never admin
      auth: client.user,
      record,
    };

    const hasAccess = evaluateRule(rule ?? null, authContext);
    if (!hasAccess) continue;

    // Send event
    const eventName = collection;
    const eventData = { action, record };

    try {
      await sendSSEEvent(client.controller, eventName, eventData);
    } catch (error) {
      // Client disconnected, remove from manager
      manager.removeClient(client.id);
    }
  }
}
```

### Anti-Patterns to Avoid
- **Blocking the event loop:** SSE handlers must be async and use `await Bun.sleep()` for intervals
- **Not flushing:** Always call `controller.flush()` after writes or messages won't reach client immediately
- **Ignoring AbortSignal:** Check `signal.aborted` to detect client disconnection
- **Sending events before auth check:** Always verify subscription permissions before broadcasting
- **Storing sensitive data in events:** Apply same rules as API responses (no password_hash, etc.)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client ID generation | Math.random/timestamp | nanoid | Cryptographically secure, collision-resistant |
| SSE message formatting | String concatenation | Proper formatter | Multi-line data, special chars, newline handling |
| Permission checking | Custom access logic | Existing evaluateRule | Consistent with API behavior |
| Connection tracking | Array of connections | Map with client IDs | O(1) lookup, proper cleanup |

**Key insight:** The existing auth rules system (`evaluateRule`) handles all permission logic. Reuse it exactly to ensure SSE events respect the same access controls as the REST API.

## Common Pitfalls

### Pitfall 1: Memory Leaks from Disconnected Clients
**What goes wrong:** Clients disconnect but server keeps references, accumulating memory
**Why it happens:** Not properly handling AbortSignal or connection errors
**How to avoid:** Always remove clients on signal abort, wrap sends in try/catch to detect disconnects
**Warning signs:** Memory usage grows over time, `clients.size` keeps increasing

### Pitfall 2: Browser Connection Limits (HTTP/1.1)
**What goes wrong:** Browsers limit 6 concurrent connections per domain on HTTP/1.1
**Why it happens:** SSE connections are long-lived, consume connection slots
**How to avoid:** Document limitation, suggest HTTP/2 deployment, single SSE connection per client
**Warning signs:** Users report "connection refused" when opening multiple tabs

### Pitfall 3: Reverse Proxy Buffering
**What goes wrong:** Events don't reach client immediately, arrive in batches
**Why it happens:** Nginx/Apache buffer responses by default
**How to avoid:** Set `X-Accel-Buffering: no` header, document proxy configuration
**Warning signs:** Events arrive in bursts after delays

### Pitfall 4: Inactivity Timeout Race Conditions
**What goes wrong:** Client gets disconnected while processing legitimate events
**Why it happens:** Activity timestamp not updated on subscription changes
**How to avoid:** Update `lastActivity` on any client action (subscribe, ping response)
**Warning signs:** Active clients randomly disconnect

### Pitfall 5: Event Ordering in Concurrent Updates
**What goes wrong:** Client receives delete event before create event for same record
**Why it happens:** Async broadcasts don't preserve order
**How to avoid:** Include event timestamp/sequence, accept eventual consistency
**Warning signs:** UI shows incorrect state after rapid changes

### Pitfall 6: Broadcasting to Stale Auth Context
**What goes wrong:** User logs out but still receives events on existing connection
**Why it happens:** Auth context captured at subscription time, not re-evaluated
**How to avoid:** Re-evaluate auth on each event, or force reconnect on auth change
**Warning signs:** Logged-out users seeing private data

## Code Examples

Verified patterns from official sources and existing codebase:

### SSE Route Handler
```typescript
// Source: Bun.serve pattern + PocketBase protocol

// GET /api/realtime - Establish SSE connection
async function handleRealtimeConnect(
  req: Request,
  realtimeManager: RealtimeManager
): Promise<Response> {
  const clientId = nanoid();
  const signal = req.signal;

  return new Response(
    new ReadableStream({
      type: "direct",
      async pull(controller: ReadableStreamDirectController) {
        // Send initial connect event
        await sendSSEEvent(controller, "PB_CONNECT", { clientId });

        // Register client
        realtimeManager.registerClient(clientId, controller);

        // Ping loop
        const pingInterval = 30000; // 30 seconds
        while (!signal.aborted) {
          await Bun.sleep(pingInterval);
          if (!signal.aborted) {
            try {
              await sendSSEComment(controller, "ping");
            } catch {
              break; // Connection error
            }
          }
        }

        // Cleanup
        realtimeManager.removeClient(clientId);
        try {
          controller.close();
        } catch {
          // Already closed
        }
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    }
  );
}
```

### Subscription Management Endpoint
```typescript
// Source: PocketBase POST /api/realtime

interface SubscriptionRequest {
  clientId: string;
  subscriptions?: string[];
}

// POST /api/realtime - Set subscriptions
async function handleRealtimeSubscribe(
  req: Request,
  realtimeManager: RealtimeManager
): Promise<Response> {
  const body = await req.json() as SubscriptionRequest;

  if (!body.clientId) {
    return Response.json(
      { error: "clientId is required" },
      { status: 400 }
    );
  }

  // Verify client exists
  const client = realtimeManager.getClient(body.clientId);
  if (!client) {
    return Response.json(
      { error: "Invalid client ID" },
      { status: 404 }
    );
  }

  // Extract and verify auth (optional)
  const user = await optionalUser(req);

  // Check for auth mismatch (same auth required across requests)
  if (client.user && user && client.user.id !== user.id) {
    return Response.json(
      { error: "Authorization mismatch" },
      { status: 403 }
    );
  }

  // Set auth context if provided
  if (user && !client.user) {
    realtimeManager.setClientAuth(body.clientId, user);
  }

  // Update subscriptions
  const subscriptions = body.subscriptions ?? [];
  realtimeManager.setSubscriptions(body.clientId, subscriptions);

  return new Response(null, { status: 204 });
}
```

### Hook Integration for Broadcasting
```typescript
// Source: Existing hooks pattern + PocketBase event model

function registerRealtimeHooks(
  hooks: HookManager,
  realtimeManager: RealtimeManager
): void {
  // afterCreate - broadcast to collection subscribers
  hooks.on("afterCreate", async (ctx, next) => {
    await next();

    // Fire and forget - don't block the response
    broadcastRecordEvent(
      realtimeManager,
      "create",
      ctx.collection,
      ctx.record
    ).catch(err => console.error("Broadcast error:", err));
  });

  // afterUpdate - broadcast to collection and record subscribers
  hooks.on("afterUpdate", async (ctx, next) => {
    await next();

    broadcastRecordEvent(
      realtimeManager,
      "update",
      ctx.collection,
      ctx.record
    ).catch(err => console.error("Broadcast error:", err));
  });

  // afterDelete - broadcast to collection and record subscribers
  hooks.on("afterDelete", async (ctx, next) => {
    await next();

    // For delete, we need to reconstruct minimal record info
    const record = { id: ctx.id };

    broadcastRecordEvent(
      realtimeManager,
      "delete",
      ctx.collection,
      record
    ).catch(err => console.error("Broadcast error:", err));
  });
}
```

### Inactivity Cleanup
```typescript
// Source: Best practices for connection management

function startInactivityCleanup(
  realtimeManager: RealtimeManager,
  intervalMs: number = 60000 // Check every minute
): () => void {
  const timer = setInterval(() => {
    realtimeManager.cleanupInactive();
  }, intervalMs);

  // Return cleanup function
  return () => clearInterval(timer);
}
```

### Client-Side Usage (Reference)
```typescript
// Source: MDN EventSource API
// Note: This is for documentation, not server implementation

const evtSource = new EventSource("/api/realtime");

evtSource.onopen = () => {
  console.log("Connection opened");
};

// Listen for PB_CONNECT to get client ID
evtSource.addEventListener("PB_CONNECT", (event) => {
  const { clientId } = JSON.parse(event.data);

  // Subscribe to collections
  fetch("/api/realtime", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer <token>", // Optional
    },
    body: JSON.stringify({
      clientId,
      subscriptions: ["posts/*", "comments/*"],
    }),
  });
});

// Listen for collection events
evtSource.addEventListener("posts", (event) => {
  const { action, record } = JSON.parse(event.data);
  console.log(`Post ${action}:`, record);
});

evtSource.onerror = () => {
  console.log("Connection error, will auto-reconnect");
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling every N seconds | SSE/WebSocket | 10+ years ago | Real-time updates, less server load |
| Custom streaming hacks | ReadableStream with type:"direct" | Bun v1.0.7+ | Proper SSE support in Bun |
| Global broadcast | Permission-filtered events | PocketBase standard | Security, no data leakage |
| No reconnection handling | EventSource auto-reconnect | Built into spec | Resilient connections |

**Deprecated/outdated:**
- Long polling: Replaced by SSE/WebSocket
- Returning entire response before streaming: Use `type: "direct"` in Bun
- Manual keep-alive in client: EventSource handles reconnection

## Open Questions

Things that couldn't be fully resolved:

1. **Event batching for rapid changes?**
   - What we know: Rapid create/update/delete can flood clients
   - What's unclear: Whether to batch events (debounce) or send immediately
   - Recommendation: Send immediately for v0.2, consider batching in v0.3

2. **Cross-process SSE with clustering?**
   - What we know: Single-process in-memory works for v0.2
   - What's unclear: How to scale with Redis pub/sub
   - Recommendation: Defer to v0.3+; document single-process limitation

3. **Custom event broadcasting from hooks?**
   - What we know: PocketBase allows custom events via SubscriptionsBroker
   - What's unclear: Whether to expose this in v0.2
   - Recommendation: Start with record events only, extend later

4. **Last-Event-ID reconnection support?**
   - What we know: EventSource sends Last-Event-ID header on reconnect
   - What's unclear: Whether to implement event replay
   - Recommendation: Not for v0.2; client re-fetches data on reconnect

## Sources

### Primary (HIGH confidence)
- [PocketBase API Realtime](https://pocketbase.io/docs/api-realtime/) - Protocol specification
- [MDN Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) - SSE message format
- [Bun GitHub Issue #2443](https://github.com/oven-sh/bun/issues/2443) - Bun SSE implementation pattern
- Existing codebase: src/core/hooks.ts, src/auth/rules.ts, src/auth/middleware.ts

### Secondary (MEDIUM confidence)
- [PocketBase Realtime Discussion](https://github.com/pocketbase/pocketbase/discussions/2709) - Implementation details
- [Server-Sent Events Guide](https://tigerabrodi.blog/server-sent-events-a-practical-guide-for-the-real-world) - Practical patterns
- [better-sse npm](https://www.npmjs.com/package/better-sse) - Alternative patterns (not recommended, reference only)

### Tertiary (LOW confidence)
- WebSearch results for SSE keep-alive best practices (multiple sources agree on 30s ping)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using native Bun APIs and existing codebase patterns
- Architecture: HIGH - Following well-documented PocketBase protocol
- SSE format: HIGH - MDN specification is authoritative
- Pitfalls: MEDIUM - Based on community experience, may have edge cases

**Research date:** 2026-01-27
**Valid until:** 2026-02-27 (stable domain, well-established patterns)
