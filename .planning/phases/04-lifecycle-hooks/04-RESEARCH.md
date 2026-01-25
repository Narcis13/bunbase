# Phase 4: Lifecycle Hooks - Research

**Researched:** 2026-01-25
**Domain:** Event-driven lifecycle hooks for CRUD operations
**Confidence:** HIGH

## Summary

Lifecycle hooks enable custom logic execution at specific points during CRUD operations. This research establishes the standard patterns for implementing a type-safe, middleware-style hook system in TypeScript that integrates with the existing BunBase records module and HTTP server.

The recommended approach follows PocketBase's proven middleware chain pattern where hooks execute sequentially, each receiving context and a `next()` function to continue the chain. Before hooks can cancel operations by throwing errors or not calling `next()`, while after hooks execute post-database persistence for side effects.

**Primary recommendation:** Implement a standalone HookManager class with typed events, middleware chain execution, collection-scoped registration, and clear error semantics (before errors cancel with rollback, after errors are logged but don't fail the response).

## Standard Stack

This phase requires no external libraries. The hook system is implemented using pure TypeScript patterns already present in the codebase.

### Core
| Component | Source | Purpose | Why Standard |
|-----------|--------|---------|--------------|
| TypedEventEmitter | Custom implementation | Type-safe event registration | Built-in TypeScript generics provide compile-time safety |
| Middleware chain | Custom implementation | Sequential hook execution with `next()` | PocketBase-proven pattern, familiar to developers |
| HookContext | Custom interface | Pass data between hooks and operations | Standard context pattern in middleware systems |

### Supporting
| Pattern | Purpose | When to Use |
|---------|---------|-------------|
| Generic constraints | Type-safe event names and handlers | All hook registration and triggering |
| Async/await | Support external API calls in hooks | All hook execution |
| Error propagation | Cancel operations from before hooks | Before hook failures |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom EventEmitter | Node.js EventEmitter | Node's EventEmitter lacks type safety without wrappers; custom is cleaner |
| Middleware chain | Simple event emit | Simple emit doesn't support abort/cancel; middleware allows control flow |
| `next()` function | Return value chaining | `next()` is familiar pattern from Express/Hono/PocketBase; more ergonomic |

**No installation required** - pure TypeScript implementation using existing patterns.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── core/
│   └── hooks.ts           # HookManager implementation
├── types/
│   └── hooks.ts           # Hook event types and context interfaces
└── api/
    └── server.ts          # Integration point (calls hooks)
```

### Pattern 1: Typed Event Map with Generic Constraints

**What:** Define all hook events as a TypeScript type map where keys are event names and values are context types.

**When to use:** Always - provides compile-time safety for hook registration and triggering.

**Example:**
```typescript
// Source: Type-safe EventEmitter pattern
// https://danilafe.com/blog/typescript_typesafe_events/

type HookEventMap = {
  beforeCreate: { collection: string; data: Record<string, unknown> };
  afterCreate: { collection: string; record: Record<string, unknown> };
  beforeUpdate: { collection: string; id: string; data: Record<string, unknown>; existing: Record<string, unknown> };
  afterUpdate: { collection: string; record: Record<string, unknown> };
  beforeDelete: { collection: string; id: string; existing: Record<string, unknown> };
  afterDelete: { collection: string; id: string };
};

type HookEvent = keyof HookEventMap;
```

### Pattern 2: Middleware Chain Execution

**What:** Hooks execute as a chain where each hook receives context and a `next()` function. Hooks can modify context, call `next()` to continue, or throw to abort.

**When to use:** For before hooks that need to modify data or abort operations.

**Example:**
```typescript
// Source: Generic middleware pattern
// https://evertpot.com/generic-middleware/

type Next = () => Promise<void>;
type HookHandler<T> = (context: T, next: Next) => Promise<void> | void;

async function executeChain<T>(
  context: T,
  handlers: HookHandler<T>[]
): Promise<void> {
  if (handlers.length === 0) return;

  const [handler, ...rest] = handlers;
  await handler(context, async () => {
    await executeChain(context, rest);
  });
}
```

### Pattern 3: Collection-Scoped Registration

**What:** Allow hooks to be registered globally (all collections) or for specific collections.

**When to use:** Always - users need to scope hooks to specific collections.

**Example:**
```typescript
// Source: PocketBase hook system
// https://pocketbase.io/docs/js-event-hooks/

// Global hook (all collections)
hooks.on('beforeCreate', async (ctx, next) => {
  console.log(`Creating in ${ctx.collection}`);
  await next();
});

// Collection-specific hook
hooks.on('beforeCreate', 'users', async (ctx, next) => {
  // Only runs for users collection
  ctx.data.createdBy = 'system';
  await next();
});
```

### Pattern 4: Context Object with Request Details

**What:** Hook context includes record data, collection info, and optionally HTTP request details.

**When to use:** For hooks that need request context (auth, headers, etc.).

**Example:**
```typescript
// Source: PocketBase HookContext pattern

interface HookContext<T = Record<string, unknown>> {
  collection: string;
  data?: T;                           // Input data (before hooks)
  record?: T;                         // Output record (after hooks)
  existing?: T;                       // Existing record (update/delete)
  id?: string;                        // Record ID (update/delete)
  request?: {                         // HTTP context (optional)
    method: string;
    path: string;
    headers: Headers;
  };
}
```

### Anti-Patterns to Avoid

- **Forgetting `next()`:** Not calling `next()` silently stops the chain. Document this clearly and consider logging warnings.
- **Modifying context in after hooks:** After hooks should be for side effects only; the record is already committed.
- **Synchronous-only hooks:** Always support async hooks for external API calls, webhooks, etc.
- **Global state in hooks:** Hooks should be pure functions operating on context, not relying on module-level state.
- **Circular dependencies:** Ensure hooks module doesn't import records module (records imports hooks, not vice versa).

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type-safe events | Raw string event names | TypeScript generic event map | Catches typos at compile time |
| Execution order | Random/undefined order | Registration order (FIFO) | Predictable, debuggable behavior |
| Error handling | try/catch in every handler | Centralized chain executor | Consistent semantics across all hooks |
| Collection filtering | Manual if/else in handlers | Built-in collection parameter | Cleaner API, less boilerplate |

**Key insight:** The middleware chain pattern is battle-tested in Express, Hono, Koa, and PocketBase. Don't invent a new execution model.

## Common Pitfalls

### Pitfall 1: Hook Execution Order Chaos
**What goes wrong:** Multiple hooks registered for the same event execute in unpredictable order, causing race conditions or unexpected behavior.
**Why it happens:** Using Set or Map without preserving insertion order, or allowing plugins/user code to register at different times.
**How to avoid:**
- Use arrays to store handlers (preserves insertion order)
- Document that hooks execute in registration order
- Consider optional priority parameter for advanced use cases
**Warning signs:** Test failures that are order-dependent; "flaky" hook behavior.

### Pitfall 2: Before Hook Errors Don't Roll Back
**What goes wrong:** A before hook throws after partial state has been modified, leaving system in inconsistent state.
**Why it happens:** Not wrapping the entire create/update operation in a transaction.
**How to avoid:**
- Before hooks execute before ANY database operation
- Wrap the entire operation (validation + hooks + DB) in a transaction
- On any before hook error, the transaction rolls back automatically
**Warning signs:** Partial records created when hooks fail.

### Pitfall 3: After Hook Errors Fail the Request
**What goes wrong:** An after hook throws (e.g., webhook fails), causing the API to return 500 even though the record was successfully created.
**Why it happens:** Not distinguishing between before (can abort) and after (side effects only) semantics.
**How to avoid:**
- After hook errors are logged but don't fail the response
- The record is already committed; client should see success
- Consider separate `onError` hook for centralized error handling
**Warning signs:** 500 errors on successful creates; inconsistent client-server state.

### Pitfall 4: Forgetting to Call `next()`
**What goes wrong:** Developer writes a before hook, forgets `next()`, and wonders why nothing happens.
**Why it happens:** Coming from simple event emitters where `next()` isn't needed.
**How to avoid:**
- Document prominently that `next()` is required to continue
- Consider logging a warning if hook returns without calling `next()`
- Provide examples showing both "continue" and "abort" patterns
**Warning signs:** Silent hook chain termination; operations that mysteriously don't complete.

### Pitfall 5: Infinite Hook Loops
**What goes wrong:** An afterCreate hook triggers another create, which triggers afterCreate, etc.
**Why it happens:** User creates related records in hooks without awareness of recursion.
**How to avoid:**
- Provide a way to bypass hooks when needed (e.g., `createRecordNoHooks`)
- Document this risk prominently
- Consider max recursion depth safeguard
**Warning signs:** Stack overflow errors; exponential record creation.

## Code Examples

Verified patterns based on research.

### HookManager Class Implementation
```typescript
// Source: Composite of typed-emitter pattern + middleware chain
// https://github.com/andywer/typed-emitter
// https://evertpot.com/generic-middleware/

type Next = () => Promise<void>;

type HookHandler<T> = (context: T, next: Next) => Promise<void> | void;

interface HandlerEntry<T> {
  handler: HookHandler<T>;
  collection?: string;  // undefined = all collections
}

class HookManager<EventMap extends Record<string, { collection: string }>> {
  private handlers: {
    [K in keyof EventMap]?: HandlerEntry<EventMap[K]>[];
  } = {};

  /**
   * Register a hook handler.
   * @param event - The event name
   * @param handlerOrCollection - Handler function or collection name
   * @param handler - Handler function (if collection provided)
   */
  on<K extends keyof EventMap>(
    event: K,
    handlerOrCollection: HookHandler<EventMap[K]> | string,
    handler?: HookHandler<EventMap[K]>
  ): () => void {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }

    const entry: HandlerEntry<EventMap[K]> =
      typeof handlerOrCollection === 'string'
        ? { handler: handler!, collection: handlerOrCollection }
        : { handler: handlerOrCollection };

    this.handlers[event]!.push(entry);

    // Return unsubscribe function
    return () => {
      const idx = this.handlers[event]!.indexOf(entry);
      if (idx >= 0) this.handlers[event]!.splice(idx, 1);
    };
  }

  /**
   * Execute all handlers for an event as a middleware chain.
   */
  async trigger<K extends keyof EventMap>(
    event: K,
    context: EventMap[K]
  ): Promise<void> {
    const entries = this.handlers[event] || [];

    // Filter to matching collection (or global handlers)
    const matching = entries.filter(
      (e) => !e.collection || e.collection === context.collection
    );

    await this.executeChain(context, matching.map((e) => e.handler));
  }

  private async executeChain<T>(
    context: T,
    handlers: HookHandler<T>[]
  ): Promise<void> {
    if (handlers.length === 0) return;

    const [handler, ...rest] = handlers;
    await handler(context, async () => {
      await this.executeChain(context, rest);
    });
  }
}
```

### Hook Event Types
```typescript
// Source: Requirements HOOK-08

interface BaseHookContext {
  collection: string;
  request?: {
    method: string;
    path: string;
    headers: Headers;
  };
}

interface BeforeCreateContext extends BaseHookContext {
  data: Record<string, unknown>;
}

interface AfterCreateContext extends BaseHookContext {
  record: Record<string, unknown>;
}

interface BeforeUpdateContext extends BaseHookContext {
  id: string;
  data: Record<string, unknown>;
  existing: Record<string, unknown>;
}

interface AfterUpdateContext extends BaseHookContext {
  record: Record<string, unknown>;
}

interface BeforeDeleteContext extends BaseHookContext {
  id: string;
  existing: Record<string, unknown>;
}

interface AfterDeleteContext extends BaseHookContext {
  id: string;
}

type HookEventMap = {
  beforeCreate: BeforeCreateContext;
  afterCreate: AfterCreateContext;
  beforeUpdate: BeforeUpdateContext;
  afterUpdate: AfterUpdateContext;
  beforeDelete: BeforeDeleteContext;
  afterDelete: AfterDeleteContext;
};
```

### Integration with Records Module
```typescript
// Source: BunBase records.ts pattern

// In records.ts - wrap createRecord with hooks
export async function createRecordWithHooks(
  collectionName: string,
  data: Record<string, unknown>,
  hooks: HookManager<HookEventMap>,
  request?: Request
): Promise<Record<string, unknown>> {
  const beforeContext: BeforeCreateContext = {
    collection: collectionName,
    data: { ...data },
    request: request ? {
      method: request.method,
      path: new URL(request.url).pathname,
      headers: request.headers,
    } : undefined,
  };

  // Execute before hooks (can throw to cancel)
  await hooks.trigger('beforeCreate', beforeContext);

  // Create record with potentially modified data
  const record = createRecord(collectionName, beforeContext.data);

  // Execute after hooks (errors logged, don't fail response)
  try {
    await hooks.trigger('afterCreate', {
      collection: collectionName,
      record,
      request: beforeContext.request,
    });
  } catch (error) {
    console.error('afterCreate hook error:', error);
  }

  return record;
}
```

### Canceling Operations
```typescript
// Source: PocketBase pattern - throw error or don't call next()

// Pattern 1: Throw an error
hooks.on('beforeCreate', 'users', async (ctx, next) => {
  if (ctx.data.email?.endsWith('@spam.com')) {
    throw new Error('Spam emails not allowed');
  }
  await next();
});

// Pattern 2: Simply don't call next() (silent cancel)
hooks.on('beforeDelete', 'posts', async (ctx, next) => {
  if (ctx.existing.protected) {
    // Don't call next() - operation silently canceled
    return;
  }
  await next();
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String event names | Generic typed events | TypeScript 4.0+ (2020) | Compile-time safety for events |
| Callback hell | async/await chains | ES2017 | Cleaner async hook code |
| Global singletons | Dependency injection | Modern TS patterns | Testable, multiple instances |
| `e.Next()` (Go-style) | `await next()` (JS-style) | N/A | Idiomatic for TypeScript |

**Current best practice:**
- Type-safe event maps with generic constraints
- Async middleware chain with `next()` function
- Collection-scoped registration
- Clear error semantics (before=abort, after=log)

## Open Questions

Things that couldn't be fully resolved:

1. **Priority system**
   - What we know: PocketBase uses numeric priority (lower executes first)
   - What's unclear: Is priority needed for v0.1 or is registration order sufficient?
   - Recommendation: Start with registration order (FIFO), add priority in v0.2 if needed

2. **Request context availability**
   - What we know: Hooks should receive HTTP context for auth/header access
   - What's unclear: How to handle hooks triggered from non-HTTP contexts (CLI, tests, internal)?
   - Recommendation: Make request optional in context; undefined for non-HTTP triggers

3. **Transaction wrapping**
   - What we know: Before hook errors should roll back; after hooks run post-commit
   - What's unclear: Does current bun:sqlite usage support the required transaction model?
   - Recommendation: Verify transaction support in implementation; may need to wrap operations

## Sources

### Primary (HIGH confidence)
- [PocketBase JS Event Hooks](https://pocketbase.io/docs/js-event-hooks/) - Hook API patterns, context structure, cancellation
- [PocketBase Hook System (DeepWiki)](https://deepwiki.com/pocketbase/pocketbase/2.3-hook-system) - Architecture details, execution model
- [Type-Safe Event Emitter in TypeScript](https://danilafe.com/blog/typescript_typesafe_events/) - Generic event map pattern
- [Generic Middleware Pattern](https://evertpot.com/generic-middleware/) - Middleware chain implementation

### Secondary (MEDIUM confidence)
- [FeathersJS Hooks](https://github.com/feathersjs/hooks) - Async middleware patterns
- [typed-emitter](https://github.com/andywer/typed-emitter) - Type-safe emitter patterns
- BunBase existing architecture (`.planning/research/ARCHITECTURE.md`) - HookManager interface spec

### Tertiary (LOW confidence)
- General TypeScript event patterns from web search - cross-verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Pure TypeScript, well-documented patterns
- Architecture: HIGH - PocketBase provides proven blueprint, multiple sources agree
- Pitfalls: HIGH - Documented in existing `.planning/research/PITFALLS.md` and verified against PocketBase

**Research date:** 2026-01-25
**Valid until:** 60 days (patterns are stable, no external library dependencies to version)
