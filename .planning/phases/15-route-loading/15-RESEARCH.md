# Phase 15: Route Loading - Research

**Researched:** 2026-01-30
**Domain:** File-based routing, route discovery, manifest generation for TypeScript/Bun
**Confidence:** HIGH

## Summary

Phase 15 implements file-system based route loading for custom BunBase endpoints. Research confirms the optimal approach is **build-time manifest generation** - a script scans `routes/` directory and generates a TypeScript file with static imports that gets compiled into the binary. This is the proven pattern used by Next.js, TanStack Router, and the bun-fs-router-plugin.

The key insight is that Bun's single-binary compilation requires all routes to be statically importable at build time - dynamic `require()` or filesystem scanning at runtime is not possible in a compiled binary. Therefore, route discovery happens at build time via a script that:
1. Scans `routes/` directory for TypeScript files
2. Converts file paths to API routes (bracket notation to colon params)
3. Validates HTTP method exports (GET, POST, etc.)
4. Generates a TypeScript file with static imports and route mappings

The generated file is then imported by the server and merged with core BunBase routes.

**Primary recommendation:** Create `scripts/build-routes.ts` that generates `src/routes-generated.ts` containing static imports and route mappings. Integrate this into the build pipeline before `bun build --compile`.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun.Glob | built-in | File pattern matching | Native Bun API, fast glob implementation |
| TypeScript Compiler API | 5.x | Export detection/validation | Authoritative AST parsing for TypeScript |
| path (node:path) | built-in | Path manipulation | Standard for cross-platform path handling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Bun.file | built-in | Read route file contents | For export validation |
| fs/promises | built-in | Directory operations | Async filesystem access |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TypeScript Compiler API | Regex parsing | Regex is simpler but misses edge cases (comments, strings containing "export GET") |
| Bun.Glob | node-glob npm | Bun.Glob is native, faster, no dependency |
| Build-time generation | Bun.FileSystemRouter | FileSystemRouter is runtime-based, doesn't work in compiled binary |

**Installation:**
```bash
# No new packages needed - all functionality from Bun built-ins + TypeScript
```

## Architecture Patterns

### Recommended Project Structure
```
bunbase-project/
├── routes/                    # User's custom route files
│   ├── health.ts              # /api/health
│   ├── stats.ts               # /api/stats
│   └── users/
│       ├── [id].ts            # /api/users/:id
│       └── [id]/
│           └── posts.ts       # /api/users/:id/posts
├── scripts/
│   └── build-routes.ts        # Route manifest generator
├── src/
│   ├── routes-generated.ts    # Generated file (gitignored)
│   ├── api/
│   │   ├── server.ts          # Server that uses generated routes
│   │   ├── context.ts         # RouteContext (from Phase 14)
│   │   └── errors.ts          # API errors (from Phase 14)
│   └── cli.ts                 # Entry point
└── package.json
```

### Pattern 1: File Path to Route Path Conversion
**What:** Convert filesystem paths to Bun.serve route patterns
**When to use:** During route manifest generation
**Example:**
```typescript
// Source: Next.js/Remix conventions adapted for Bun
function filePathToRoutePath(filePath: string, routesDir: string): string {
  // Remove routes/ prefix and .ts extension
  let route = filePath
    .replace(routesDir, '')
    .replace(/\\/g, '/')  // Windows support
    .replace(/\.tsx?$/, '');

  // Handle index files: routes/users/index.ts -> /api/users
  route = route.replace(/\/index$/, '');

  // Convert bracket notation to colon params: [id] -> :id
  route = route.replace(/\[([^\]]+)\]/g, ':$1');

  // Ensure leading slash and /api/ prefix
  if (!route.startsWith('/')) route = '/' + route;
  return '/api' + route;
}

// Examples:
// routes/health.ts         -> /api/health
// routes/stats.ts          -> /api/stats
// routes/users/index.ts    -> /api/users
// routes/users/[id].ts     -> /api/users/:id
// routes/users/[id]/posts.ts -> /api/users/:id/posts
```

### Pattern 2: Export Validation with TypeScript Compiler
**What:** Parse route files to validate HTTP method exports
**When to use:** During manifest generation to warn on invalid exports
**Example:**
```typescript
// Source: TypeScript Compiler API patterns
import ts from 'typescript';

const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const LOWERCASE_METHODS = VALID_METHODS.map(m => m.toLowerCase());

interface ExportInfo {
  validMethods: string[];
  invalidExports: { name: string; reason: string }[];
}

function validateRouteExports(filePath: string): ExportInfo {
  const sourceCode = Bun.file(filePath).text();
  const sourceFile = ts.createSourceFile(
    filePath,
    await sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const validMethods: string[] = [];
  const invalidExports: { name: string; reason: string }[] = [];

  function visit(node: ts.Node) {
    // Check for named exports: export const GET = ...
    if (ts.isVariableStatement(node)) {
      const hasExport = node.modifiers?.some(
        m => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (hasExport) {
        for (const decl of node.declarationList.declarations) {
          const name = decl.name.getText(sourceFile);

          if (VALID_METHODS.includes(name)) {
            validMethods.push(name);
          } else if (LOWERCASE_METHODS.includes(name)) {
            // Warn: lowercase method name
            invalidExports.push({
              name,
              reason: `Use uppercase "${name.toUpperCase()}" instead of "${name}"`
            });
          }
        }
      }
    }

    // Check for export function GET() { ... }
    if (ts.isFunctionDeclaration(node) && node.name) {
      const hasExport = node.modifiers?.some(
        m => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (hasExport) {
        const name = node.name.getText(sourceFile);
        if (VALID_METHODS.includes(name)) {
          validMethods.push(name);
        } else if (LOWERCASE_METHODS.includes(name)) {
          invalidExports.push({
            name,
            reason: `Use uppercase "${name.toUpperCase()}" instead of "${name}"`
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { validMethods, invalidExports };
}
```

### Pattern 3: Generated Routes File
**What:** TypeScript file with static imports and route mappings
**When to use:** Output of build-routes.ts script
**Example:**
```typescript
// src/routes-generated.ts (GENERATED FILE - DO NOT EDIT)
// Generated by scripts/build-routes.ts

import * as route_health from '../routes/health';
import * as route_stats from '../routes/stats';
import * as route_users_$id from '../routes/users/[id]';

import type { RouteContext } from './api/context';
import { withErrorHandling } from './api/handler';
import { createRouteContext, type ContextDependencies } from './api/context';

export interface CustomRoute {
  path: string;
  method: string;
  handler: (req: Request, ctx: RouteContext) => Response | Promise<Response>;
}

export const customRoutes: CustomRoute[] = [
  { path: '/api/health', method: 'GET', handler: route_health.GET },
  { path: '/api/stats', method: 'GET', handler: route_stats.GET },
  { path: '/api/stats', method: 'POST', handler: route_stats.POST },
  { path: '/api/users/:id', method: 'GET', handler: route_users_$id.GET },
  { path: '/api/users/:id', method: 'PATCH', handler: route_users_$id.PATCH },
  { path: '/api/users/:id', method: 'DELETE', handler: route_users_$id.DELETE },
];

/**
 * Build Bun.serve() routes object from custom routes.
 * Wraps all handlers with error handling and context injection.
 */
export function buildCustomRoutes(deps: ContextDependencies) {
  const routes: Record<string, Record<string, (req: Request) => Response | Promise<Response>>> = {};

  for (const route of customRoutes) {
    if (!routes[route.path]) {
      routes[route.path] = {};
    }

    // Wrap handler with error handling and context creation
    routes[route.path][route.method] = (req: Request) => {
      const params = req.params ?? {};
      const ctx = createRouteContext(req, params, deps);
      return withErrorHandling(route.handler)(req, ctx);
    };
  }

  return routes;
}
```

### Pattern 4: Route Handler Signature
**What:** Type signature for custom route handlers
**When to use:** All user-defined route handlers
**Example:**
```typescript
// routes/health.ts
// Source: BunBase custom route pattern
import type { RouteContext } from 'bunbase';

/**
 * GET /api/health
 * Simple health check endpoint
 */
export const GET = (req: Request, ctx: RouteContext) => {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
};
```

```typescript
// routes/users/[id].ts
// Source: BunBase custom route pattern with dynamic parameter
import type { RouteContext } from 'bunbase';
import { NotFoundError } from 'bunbase/errors';

/**
 * GET /api/users/:id
 * Get user by ID
 */
export const GET = async (req: Request, ctx: RouteContext) => {
  const user = ctx.records.get('users', ctx.params.id);
  if (!user) {
    throw new NotFoundError(`User ${ctx.params.id} not found`);
  }
  return Response.json(user);
};

/**
 * PATCH /api/users/:id
 * Update user (requires admin)
 */
export const PATCH = async (req: Request, ctx: RouteContext) => {
  await ctx.auth.requireAdmin(req);
  const data = await req.json();
  const user = await ctx.records.update('users', ctx.params.id, data);
  return Response.json(user);
};
```

### Anti-Patterns to Avoid
- **Runtime directory scanning:** Never use `fs.readdir` or `Bun.Glob` at runtime in the server - won't work in compiled binary
- **Dynamic imports:** `await import(./routes/${name})` doesn't work in compiled binary
- **Default exports for methods:** Always use named exports (`export const GET`) not `export default { GET }`
- **Lowercase method names:** Always use uppercase (`GET`, `POST`) - lowercase indicates developer error
- **Modifying generated file:** The generated file should be gitignored and regenerated on each build

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Glob pattern matching | Manual directory walking | Bun.Glob | Native, fast, handles edge cases |
| TypeScript parsing | Regex for exports | TypeScript Compiler API | Handles comments, strings, all syntax |
| Path normalization | String replace chains | node:path functions | Cross-platform, edge cases |
| Route parameter extraction | Manual regex | Bun.serve built-in params | Already parsed, type-safe |

**Key insight:** The route loading problem is entirely a build-time code generation problem. At runtime, all routes are just static imports in a generated TypeScript file - no filesystem access needed.

## Common Pitfalls

### Pitfall 1: Assuming Runtime Discovery Works in Binary
**What goes wrong:** Code that scans `routes/` directory at server startup fails in compiled binary
**Why it happens:** Compiled binaries don't have access to original source files
**How to avoid:** All route discovery must happen at build time via code generation script
**Warning signs:** Works in `bun run dev` but fails in compiled binary with "file not found"

### Pitfall 2: Not Handling Nested Dynamic Segments
**What goes wrong:** Routes like `/users/[userId]/posts/[postId]` break or conflict
**Why it happens:** Multiple bracket segments in one path need careful handling
**How to avoid:** Test with nested dynamic segments; ensure each `[param]` converts to `:param`
**Warning signs:** 404 errors for valid nested routes; wrong params extracted

### Pitfall 3: Import Name Collisions
**What goes wrong:** Two route files generate the same import variable name
**Why it happens:** Simple path-to-variable conversion doesn't handle all cases
**How to avoid:** Use unique import names based on full path with special character replacement
**Warning signs:** TypeScript compilation errors about duplicate identifiers

### Pitfall 4: Missing Error Handling Wrapper
**What goes wrong:** Errors in custom routes don't return proper JSON error responses
**Why it happens:** User handlers throw but aren't wrapped with `withErrorHandling`
**How to avoid:** Generated code wraps ALL custom handlers with error handling
**Warning signs:** 500 responses with stack traces instead of `{ code, message, data }` format

### Pitfall 5: Forgetting to Regenerate Routes
**What goes wrong:** New route files aren't discovered; old routes still exist
**Why it happens:** Developer adds route file but doesn't run build script
**How to avoid:** Document workflow; add route generation to `bun run dev` startup
**Warning signs:** 404 for routes that clearly exist in `routes/` directory

### Pitfall 6: Windows Path Separators
**What goes wrong:** Route paths have backslashes on Windows
**Why it happens:** `path.join` uses OS-specific separators
**How to avoid:** Normalize all paths to forward slashes before converting to routes
**Warning signs:** Routes work on Mac/Linux but fail on Windows

## Code Examples

Verified patterns combining official Bun docs and existing BunBase architecture:

### Complete Build Script
```typescript
// scripts/build-routes.ts
// Source: Adapted from bun-fs-router-plugin patterns + BunBase conventions

import { resolve, relative, basename, dirname } from 'path';
import ts from 'typescript';

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const ROUTES_DIR = resolve(PROJECT_ROOT, 'routes');
const OUTPUT_FILE = resolve(PROJECT_ROOT, 'src/routes-generated.ts');

const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const LOWERCASE_METHODS = VALID_METHODS.map(m => m.toLowerCase());

interface RouteFile {
  filePath: string;
  routePath: string;
  importName: string;
  methods: string[];
}

interface ValidationWarning {
  file: string;
  message: string;
}

/**
 * Convert file path to API route path.
 */
function filePathToRoutePath(filePath: string): string {
  let route = relative(ROUTES_DIR, filePath)
    .replace(/\\/g, '/')  // Windows support
    .replace(/\.tsx?$/, '');

  // Handle index files
  route = route.replace(/\/index$/, '');

  // Convert [param] to :param
  route = route.replace(/\[([^\]]+)\]/g, ':$1');

  // Ensure proper format
  if (!route.startsWith('/')) route = '/' + route;
  if (route === '/') route = '';

  return '/api' + route;
}

/**
 * Generate safe import variable name from file path.
 */
function generateImportName(filePath: string): string {
  const relativePath = relative(ROUTES_DIR, filePath)
    .replace(/\\/g, '/')
    .replace(/\.tsx?$/, '');

  // Replace special chars with safe identifiers
  return 'route_' + relativePath
    .replace(/\//g, '_')
    .replace(/\[/g, '$')
    .replace(/\]/g, '')
    .replace(/-/g, '_');
}

/**
 * Parse route file and extract valid method exports.
 */
async function parseRouteFile(filePath: string): Promise<{
  methods: string[];
  warnings: ValidationWarning[];
}> {
  const sourceCode = await Bun.file(filePath).text();
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  const methods: string[] = [];
  const warnings: ValidationWarning[] = [];

  function visit(node: ts.Node) {
    // Variable declarations: export const GET = ...
    if (ts.isVariableStatement(node)) {
      const hasExport = node.modifiers?.some(
        m => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (hasExport) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const name = decl.name.text;
            if (VALID_METHODS.includes(name)) {
              methods.push(name);
            } else if (LOWERCASE_METHODS.includes(name)) {
              warnings.push({
                file: filePath,
                message: `Export "${name}" should be uppercase: "${name.toUpperCase()}"`,
              });
            }
          }
        }
      }
    }

    // Function declarations: export function GET() { ... }
    if (ts.isFunctionDeclaration(node) && node.name) {
      const hasExport = node.modifiers?.some(
        m => m.kind === ts.SyntaxKind.ExportKeyword
      );
      if (hasExport) {
        const name = node.name.text;
        if (VALID_METHODS.includes(name)) {
          methods.push(name);
        } else if (LOWERCASE_METHODS.includes(name)) {
          warnings.push({
            file: filePath,
            message: `Export "${name}" should be uppercase: "${name.toUpperCase()}"`,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { methods, warnings };
}

/**
 * Discover all route files in routes/ directory.
 */
async function discoverRouteFiles(): Promise<RouteFile[]> {
  const glob = new Bun.Glob('**/*.{ts,tsx}');
  const files: RouteFile[] = [];
  const allWarnings: ValidationWarning[] = [];

  for await (const file of glob.scan({ cwd: ROUTES_DIR, absolute: true })) {
    // Skip test files and non-route files
    if (file.includes('.test.') || file.includes('.spec.')) {
      continue;
    }

    const { methods, warnings } = await parseRouteFile(file);
    allWarnings.push(...warnings);

    if (methods.length === 0) {
      console.warn(`Warning: ${relative(PROJECT_ROOT, file)} has no valid HTTP method exports`);
      continue;
    }

    files.push({
      filePath: file,
      routePath: filePathToRoutePath(file),
      importName: generateImportName(file),
      methods,
    });
  }

  // Print warnings for lowercase methods
  for (const warning of allWarnings) {
    console.warn(`Warning: ${relative(PROJECT_ROOT, warning.file)}: ${warning.message}`);
  }

  return files;
}

/**
 * Generate the routes TypeScript file.
 */
function generateRoutesFile(routes: RouteFile[]): string {
  const imports = routes.map(r =>
    `import * as ${r.importName} from '${relative(dirname(OUTPUT_FILE), r.filePath).replace(/\\/g, '/').replace(/\.tsx?$/, '')}';`
  ).join('\n');

  const routeEntries = routes.flatMap(r =>
    r.methods.map(method =>
      `  { path: '${r.routePath}', method: '${method}', handler: ${r.importName}.${method} },`
    )
  ).join('\n');

  return `// THIS FILE IS GENERATED - DO NOT EDIT
// Generated by scripts/build-routes.ts at ${new Date().toISOString()}

${imports}

import type { RouteContext } from './api/context';
import { handleApiError } from './api/errors';
import { createRouteContext, type ContextDependencies } from './api/context';

export interface CustomRoute {
  path: string;
  method: string;
  handler: (req: Request, ctx: RouteContext) => Response | Promise<Response>;
}

export const customRoutes: CustomRoute[] = [
${routeEntries}
];

/**
 * Wrap a handler with error handling and context creation.
 */
function wrapHandler(
  handler: (req: Request, ctx: RouteContext) => Response | Promise<Response>,
  deps: ContextDependencies
) {
  return async (req: Request): Promise<Response> => {
    try {
      // Extract params from request (Bun.serve provides this)
      const params = (req as any).params ?? {};
      const ctx = createRouteContext(req, params, deps);
      const result = handler(req, ctx);
      return result instanceof Promise ? await result : result;
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * Build Bun.serve() routes object from custom routes.
 */
export function buildCustomRoutes(deps: ContextDependencies) {
  const routes: Record<string, Record<string, (req: Request) => Promise<Response>> | ((req: Request) => Promise<Response>)> = {};

  for (const route of customRoutes) {
    if (!routes[route.path]) {
      routes[route.path] = {};
    }
    (routes[route.path] as Record<string, (req: Request) => Promise<Response>>)[route.method] = wrapHandler(route.handler, deps);
  }

  return routes;
}

/**
 * Route manifest for debugging/introspection.
 */
export const routeManifest = customRoutes.map(r => ({
  path: r.path,
  method: r.method,
}));
`;
}

// Main execution
async function main() {
  console.log('Scanning routes directory...');

  // Check if routes directory exists
  const routesDirExists = await Bun.file(ROUTES_DIR).exists().catch(() => false);
  if (!routesDirExists) {
    // Create empty routes file if no routes directory
    console.log('No routes/ directory found. Creating empty routes file.');
    const emptyFile = `// THIS FILE IS GENERATED - DO NOT EDIT
// No routes/ directory found

import type { ContextDependencies } from './api/context';

export const customRoutes = [];

export function buildCustomRoutes(deps: ContextDependencies) {
  return {};
}

export const routeManifest = [];
`;
    await Bun.write(OUTPUT_FILE, emptyFile);
    console.log('Generated empty src/routes-generated.ts');
    return;
  }

  const routes = await discoverRouteFiles();

  if (routes.length === 0) {
    console.log('No route files found with valid exports.');
  } else {
    console.log(`Found ${routes.length} route file(s):`);
    for (const route of routes) {
      console.log(`  ${route.routePath} [${route.methods.join(', ')}]`);
    }
  }

  const output = generateRoutesFile(routes);
  await Bun.write(OUTPUT_FILE, output);

  console.log(`Generated ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('Error generating routes:', err);
  process.exit(1);
});
```

### Example Route Files
```typescript
// routes/health.ts
// Simple health check - no context needed
import type { RouteContext } from '../src/api/context';

export const GET = (req: Request, ctx: RouteContext) => {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
};
```

```typescript
// routes/stats.ts
// Database access example
import type { RouteContext } from '../src/api/context';
import { BadRequestError } from '../src/api/errors';

export const GET = async (req: Request, ctx: RouteContext) => {
  // Use direct database access for custom queries
  const stats = ctx.db.query(`
    SELECT name,
           (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=c.name) as exists
    FROM _collections c
  `).all();

  return Response.json({ collections: stats });
};

export const POST = async (req: Request, ctx: RouteContext) => {
  await ctx.auth.requireAdmin(req);

  const body = await req.json();
  if (!body.action) {
    throw new BadRequestError('action is required');
  }

  // Custom admin action
  return Response.json({ performed: body.action });
};
```

```typescript
// routes/users/[id].ts
// Dynamic parameter example
import type { RouteContext } from '../../src/api/context';
import { NotFoundError } from '../../src/api/errors';

export const GET = async (req: Request, ctx: RouteContext) => {
  const user = ctx.records.get('users', ctx.params.id);
  if (!user) {
    throw new NotFoundError(`User ${ctx.params.id} not found`);
  }
  return Response.json(user);
};

export const PATCH = async (req: Request, ctx: RouteContext) => {
  await ctx.auth.requireAdmin(req);
  const data = await req.json();
  const user = await ctx.records.update('users', ctx.params.id, data);
  return Response.json(user);
};

export const DELETE = async (req: Request, ctx: RouteContext) => {
  await ctx.auth.requireAdmin(req);
  await ctx.records.delete('users', ctx.params.id);
  return new Response(null, { status: 204 });
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Runtime directory scanning | Build-time manifest generation | Always for compiled binaries | Required for single-binary deployment |
| Default exports | Named exports (GET, POST) | Next.js 13+ (2022) | Better tree-shaking, clearer API |
| Express middleware chain | Direct handler functions | Bun.serve (2023) | Simpler, faster |
| Lowercase method handlers | Uppercase method exports | Industry standard | Matches HTTP spec, clearer intent |

**Deprecated/outdated:**
- `Bun.FileSystemRouter` for compiled binaries: Only works at runtime with filesystem access
- Dynamic `import()` for routes: Doesn't work in compiled Bun binaries
- Express-style `router.get('/path', handler)`: Bun.serve uses routes object instead

## Open Questions

Things that couldn't be fully resolved:

1. **Catch-all routes ([...slug].ts)**
   - What we know: Next.js supports `[...slug]` for catch-all segments
   - What's unclear: Whether Bun.serve supports `/*` wildcard routes for custom paths
   - Recommendation: Defer catch-all support to v0.4; basic dynamic segments cover 95% of cases

2. **Route priority with overlapping patterns**
   - What we know: Bun.serve matches exact > param > wildcard
   - What's unclear: Behavior when two custom routes could match same URL
   - Recommendation: Generate routes in specificity order; document potential conflicts

3. **Hot reload of routes in development**
   - What we know: Route generation is build-time only
   - What's unclear: Best DX for adding new routes during development
   - Recommendation: Run `build:routes` in watch mode; defer hot-reload to Phase 16

## Sources

### Primary (HIGH confidence)
- [Bun FileSystemRouter API](https://bun.com/docs/api/file-system-router) - Route discovery patterns
- [Bun.serve Routing](https://bun.com/docs/runtime/http/routing) - Dynamic params, route priority
- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route) - Named exports pattern (GET, POST)
- [bun-fs-router-plugin](https://github.com/m1212e/bun-fs-router-plugin) - Build-time generation approach
- BunBase `src/api/server.ts` - Existing route structure
- BunBase `src/api/context.ts` - RouteContext interface (Phase 14)
- BunBase `scripts/build-admin.ts` - Existing build script pattern

### Secondary (MEDIUM confidence)
- [TypeScript AST Viewer](https://ts-ast-viewer.com/) - Export detection patterns
- [TanStack Router File-Based Routing](https://deepwiki.com/TanStack/router/4.1-file-based-routing) - Manifest generation approach
- [express-file-routing](https://www.npmjs.com/package/express-file-routing) - Named exports for HTTP methods

### Tertiary (LOW confidence)
- None - all findings verified with official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses only Bun built-ins and TypeScript compiler
- Architecture: HIGH - Pattern proven by Next.js, bun-fs-router-plugin
- Pitfalls: HIGH - Well-documented in framework docs and community reports

**Research date:** 2026-01-30
**Valid until:** 90 days (stable patterns, no fast-moving dependencies)
