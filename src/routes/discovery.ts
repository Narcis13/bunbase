/**
 * Route discovery utilities for file-based routing.
 * Converts filesystem paths to API routes and validates HTTP method exports.
 *
 * @module routes/discovery
 */

import ts from 'typescript';

/**
 * Valid HTTP methods that can be exported from route files.
 * These match the standard HTTP methods supported by Bun.serve.
 */
export const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

/**
 * Lowercase versions of valid methods for warning detection.
 */
const LOWERCASE_METHODS = VALID_METHODS.map(m => m.toLowerCase());

/**
 * Warning produced when parsing route exports.
 */
export interface ExportWarning {
  message: string;
}

/**
 * Result of parsing route file exports.
 */
export interface ParseResult {
  /** Valid uppercase HTTP methods found */
  methods: string[];
  /** Warnings about potential issues (e.g., lowercase methods) */
  warnings: ExportWarning[];
}

/**
 * Convert a file path to an API route path.
 *
 * Converts file-system based routes to URL paths:
 * - routes/health.ts -> /api/health
 * - routes/users/index.ts -> /api/users
 * - routes/users/[id].ts -> /api/users/:id
 * - routes/users/[id]/posts.ts -> /api/users/:id/posts
 *
 * @param filePath - Path to the route file (relative or absolute)
 * @param routesDir - Base directory name for routes (e.g., 'routes')
 * @returns API route path with /api prefix
 *
 * @example
 * filePathToRoutePath('routes/users/[id].ts', 'routes')
 * // Returns: '/api/users/:id'
 */
export function filePathToRoutePath(filePath: string, routesDir: string): string {
  // Normalize path separators (Windows support)
  let route = filePath.replace(/\\/g, '/');

  // Remove routes directory prefix
  const routesDirNormalized = routesDir.replace(/\\/g, '/');
  if (route.startsWith(routesDirNormalized + '/')) {
    route = route.slice(routesDirNormalized.length + 1);
  } else if (route.startsWith(routesDirNormalized)) {
    route = route.slice(routesDirNormalized.length);
  }

  // Remove .ts or .tsx extension
  route = route.replace(/\.tsx?$/, '');

  // Handle index files: users/index -> users, index -> '' (root)
  route = route.replace(/\/index$/, '');
  if (route === 'index') {
    route = '';
  }

  // Convert bracket notation to colon params: [id] -> :id
  route = route.replace(/\[([^\]]+)\]/g, ':$1');

  // Ensure leading slash
  if (route && !route.startsWith('/')) {
    route = '/' + route;
  }

  // Return /api for root, /api + route for others
  return '/api' + route;
}

/**
 * Generate a valid JavaScript import name from a file path.
 *
 * Converts file paths to valid JS identifiers:
 * - routes/health.ts -> route_health
 * - routes/users/[id].ts -> route_users_$id
 * - routes/my-route.ts -> route_my_route
 *
 * @param filePath - Path to the route file
 * @param routesDir - Base directory name for routes
 * @returns Valid JavaScript identifier for import
 *
 * @example
 * generateImportName('routes/users/[id]/posts.ts', 'routes')
 * // Returns: 'route_users_$id_posts'
 */
export function generateImportName(filePath: string, routesDir: string): string {
  // Normalize path separators
  let relativePath = filePath.replace(/\\/g, '/');

  // Remove routes directory prefix
  const routesDirNormalized = routesDir.replace(/\\/g, '/');
  if (relativePath.startsWith(routesDirNormalized + '/')) {
    relativePath = relativePath.slice(routesDirNormalized.length + 1);
  } else if (relativePath.startsWith(routesDirNormalized)) {
    relativePath = relativePath.slice(routesDirNormalized.length);
  }

  // Remove leading slash if any
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.slice(1);
  }

  // Remove .ts or .tsx extension
  relativePath = relativePath.replace(/\.tsx?$/, '');

  // Convert to valid JavaScript identifier
  const importName = 'route_' + relativePath
    .replace(/\//g, '_')      // Replace path separators with underscores
    .replace(/\[/g, '$')      // Replace [ with $ (for dynamic params)
    .replace(/\]/g, '')       // Remove ]
    .replace(/-/g, '_');      // Replace dashes with underscores

  return importName;
}

/**
 * Parse a TypeScript source file and extract valid HTTP method exports.
 *
 * Uses the TypeScript Compiler API for accurate AST parsing.
 * This correctly handles edge cases like:
 * - Methods in comments (ignored)
 * - Methods in strings (ignored)
 * - export const GET vs export function GET
 *
 * @param sourceCode - TypeScript source code to parse
 * @param filePath - Path to the file (for error messages)
 * @returns Parse result with valid methods and warnings
 *
 * @example
 * const code = `export const GET = () => new Response('ok');`;
 * const result = parseRouteExports(code, 'health.ts');
 * // result.methods = ['GET']
 * // result.warnings = []
 */
export function parseRouteExports(sourceCode: string, filePath: string): ParseResult {
  const methods: string[] = [];
  const warnings: ExportWarning[] = [];

  // Handle empty file
  if (!sourceCode.trim()) {
    return { methods, warnings };
  }

  // Parse the source code into an AST
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  /**
   * Visit AST nodes to find exports.
   */
  function visit(node: ts.Node) {
    // Handle: export const GET = ...
    if (ts.isVariableStatement(node)) {
      const hasExport = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );

      if (hasExport) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const name = decl.name.text;

            if (VALID_METHODS.includes(name as typeof VALID_METHODS[number])) {
              methods.push(name);
            } else if (LOWERCASE_METHODS.includes(name)) {
              warnings.push({
                message: `Use uppercase ${name.toUpperCase()} instead of ${name}`,
              });
            }
          }
        }
      }
    }

    // Handle: export function GET() { ... }
    if (ts.isFunctionDeclaration(node) && node.name) {
      const hasExport = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );

      if (hasExport && ts.isIdentifier(node.name)) {
        const name = node.name.text;

        if (VALID_METHODS.includes(name as typeof VALID_METHODS[number])) {
          methods.push(name);
        } else if (LOWERCASE_METHODS.includes(name)) {
          warnings.push({
            message: `Use uppercase ${name.toUpperCase()} instead of ${name}`,
          });
        }
      }
    }

    // Recursively visit children
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { methods, warnings };
}
