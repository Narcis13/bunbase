/**
 * Build script for route manifest generation.
 * Scans routes/ directory and generates src/routes-generated.ts with static imports.
 *
 * Usage: bun scripts/build-routes.ts
 */

import { resolve, relative } from 'path';
import { existsSync } from 'node:fs';
import {
  filePathToRoutePath,
  generateImportName,
  parseRouteExports,
  VALID_METHODS,
} from '../src/routes/discovery';

const projectRoot = resolve(import.meta.dir, '..');
const routesDir = resolve(projectRoot, 'routes');
const outputFile = resolve(projectRoot, 'src/routes-generated.ts');

/**
 * Route info collected from scanning route files.
 */
interface RouteInfo {
  /** Path to the route file relative to project root */
  filePath: string;
  /** API route path (e.g., /api/health) */
  routePath: string;
  /** Import variable name (e.g., route_health) */
  importName: string;
  /** HTTP methods exported by the file */
  methods: string[];
}

/**
 * Scan routes directory and collect route information.
 */
async function scanRoutes(): Promise<RouteInfo[]> {
  // Handle missing routes/ directory gracefully
  if (!existsSync(routesDir)) {
    console.log('No routes/ directory found. Generating empty manifest.');
    return [];
  }

  const routes: RouteInfo[] = [];
  const glob = new Bun.Glob('**/*.{ts,tsx}');

  for await (const file of glob.scan({ cwd: routesDir, absolute: false })) {
    // Skip test files
    if (file.endsWith('.test.ts') || file.endsWith('.spec.ts')) {
      continue;
    }

    const fullPath = resolve(routesDir, file);
    const relativePath = `routes/${file}`;

    // Read file and parse exports
    const content = await Bun.file(fullPath).text();
    const { methods, warnings } = parseRouteExports(content, file);

    // Print warnings for lowercase methods
    for (const warning of warnings) {
      console.warn(`Warning in ${relativePath}: ${warning.message}`);
    }

    // Skip files with no valid HTTP method exports
    if (methods.length === 0) {
      console.log(`Skipping ${relativePath}: no HTTP method exports found`);
      continue;
    }

    const routePath = filePathToRoutePath(relativePath, 'routes');
    const importName = generateImportName(relativePath, 'routes');

    routes.push({
      filePath: relativePath,
      routePath,
      importName,
      methods,
    });

    console.log(`Found route: ${routePath} [${methods.join(', ')}]`);
  }

  if (routes.length === 0) {
    console.log('No valid routes found. Generating empty manifest.');
  }

  return routes;
}

/**
 * Generate the routes-generated.ts content.
 */
function generateManifest(routes: RouteInfo[]): string {
  const lines: string[] = [];

  // Header comment
  lines.push('// THIS FILE IS GENERATED - DO NOT EDIT');
  lines.push('// Run `bun run build:routes` to regenerate');
  lines.push('');

  // Static imports for each route file
  if (routes.length > 0) {
    lines.push('// Route imports');
    for (const route of routes) {
      lines.push(`import * as ${route.importName} from '../${route.filePath}';`);
    }
    lines.push('');
  }

  // Import context and error handling
  lines.push('// BunBase imports');
  lines.push("import { createRouteContext, type ContextDependencies, type RouteContext } from './api/context';");
  lines.push("import { handleApiError } from './api/errors';");
  lines.push('');

  // Type definitions
  lines.push('/**');
  lines.push(' * Route handler function type.');
  lines.push(' */');
  lines.push('export type RouteHandler = (req: Request, ctx: RouteContext) => Response | Promise<Response>;');
  lines.push('');
  lines.push('/**');
  lines.push(' * Custom route definition.');
  lines.push(' */');
  lines.push('export interface CustomRoute {');
  lines.push('  path: string;');
  lines.push('  method: string;');
  lines.push('  handler: RouteHandler;');
  lines.push('}');
  lines.push('');

  // Route manifest for debugging
  lines.push('/**');
  lines.push(' * Route manifest for debugging and inspection.');
  lines.push(' */');
  lines.push('export const routeManifest = {');
  lines.push(`  generatedAt: '${new Date().toISOString()}',`);
  lines.push(`  routes: [`);
  for (const route of routes) {
    lines.push(`    { path: '${route.routePath}', methods: [${route.methods.map(m => `'${m}'`).join(', ')}] },`);
  }
  lines.push('  ],');
  lines.push('} as const;');
  lines.push('');

  // customRoutes array
  lines.push('/**');
  lines.push(' * Array of custom routes with path, method, and handler.');
  lines.push(' */');
  lines.push('export const customRoutes: CustomRoute[] = [');
  for (const route of routes) {
    for (const method of route.methods) {
      lines.push(`  { path: '${route.routePath}', method: '${method}', handler: ${route.importName}.${method} },`);
    }
  }
  lines.push('];');
  lines.push('');

  // wrapHandler function
  lines.push('/**');
  lines.push(' * Wrap a route handler with context creation and error handling.');
  lines.push(' */');
  lines.push('function wrapHandler(');
  lines.push('  handler: RouteHandler,');
  lines.push('  deps: ContextDependencies');
  lines.push('): (req: Request) => Promise<Response> {');
  lines.push('  return async (req: Request) => {');
  lines.push('    try {');
  lines.push('      // Extract params from request (Bun.serve adds them)');
  lines.push('      const params = (req as Request & { params?: Record<string, string> }).params ?? {};');
  lines.push('      const ctx = createRouteContext(req, params, deps);');
  lines.push('      return await handler(req, ctx);');
  lines.push('    } catch (error) {');
  lines.push('      return handleApiError(error);');
  lines.push('    }');
  lines.push('  };');
  lines.push('}');
  lines.push('');

  // buildCustomRoutes function
  lines.push('/**');
  lines.push(' * Build Bun.serve routes object from custom routes.');
  lines.push(' * Returns an object suitable for spreading into Bun.serve routes config.');
  lines.push(' *');
  lines.push(' * @param deps - Context dependencies (hooks, realtime)');
  lines.push(' * @returns Routes object for Bun.serve');
  lines.push(' */');
  lines.push('export function buildCustomRoutes(deps: ContextDependencies): Record<string, Record<string, (req: Request) => Promise<Response>>> {');
  lines.push('  const routes: Record<string, Record<string, (req: Request) => Promise<Response>>> = {};');
  lines.push('');
  lines.push('  for (const route of customRoutes) {');
  lines.push('    if (!routes[route.path]) {');
  lines.push('      routes[route.path] = {};');
  lines.push('    }');
  lines.push('    routes[route.path]![route.method] = wrapHandler(route.handler, deps);');
  lines.push('  }');
  lines.push('');
  lines.push('  return routes;');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// Main execution
async function main() {
  console.log('Scanning routes...');
  console.log('');

  const routes = await scanRoutes();

  console.log('');
  console.log(`Generating ${outputFile}...`);

  const content = generateManifest(routes);
  await Bun.write(outputFile, content);

  console.log('');
  console.log('Route manifest generated successfully:');
  console.log(`  - ${routes.length} route file(s)`);
  console.log(`  - ${customRoutes_count(routes)} route handler(s)`);
  console.log(`  - Output: ${relative(projectRoot, outputFile)}`);
}

function customRoutes_count(routes: RouteInfo[]): number {
  return routes.reduce((acc, r) => acc + r.methods.length, 0);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
