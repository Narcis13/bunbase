/**
 * Tests for route discovery utilities.
 * Covers path conversion, import name generation, and export parsing.
 *
 * @module routes/discovery.test
 */

import { describe, test, expect } from 'bun:test';
import {
  filePathToRoutePath,
  generateImportName,
  parseRouteExports,
  VALID_METHODS,
} from './discovery';

describe('VALID_METHODS', () => {
  test('exports the correct HTTP methods', () => {
    expect(VALID_METHODS).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
  });
});

describe('filePathToRoutePath', () => {
  const routesDir = 'routes';

  describe('simple routes', () => {
    test('converts routes/health.ts to /api/health', () => {
      expect(filePathToRoutePath('routes/health.ts', routesDir)).toBe('/api/health');
    });

    test('converts routes/stats.ts to /api/stats', () => {
      expect(filePathToRoutePath('routes/stats.ts', routesDir)).toBe('/api/stats');
    });

    test('handles .tsx extension', () => {
      expect(filePathToRoutePath('routes/health.tsx', routesDir)).toBe('/api/health');
    });
  });

  describe('index files', () => {
    test('converts routes/users/index.ts to /api/users', () => {
      expect(filePathToRoutePath('routes/users/index.ts', routesDir)).toBe('/api/users');
    });

    test('converts routes/index.ts to /api', () => {
      expect(filePathToRoutePath('routes/index.ts', routesDir)).toBe('/api');
    });
  });

  describe('dynamic parameters', () => {
    test('converts routes/users/[id].ts to /api/users/:id', () => {
      expect(filePathToRoutePath('routes/users/[id].ts', routesDir)).toBe('/api/users/:id');
    });

    test('converts routes/users/[id]/posts.ts to /api/users/:id/posts', () => {
      expect(filePathToRoutePath('routes/users/[id]/posts.ts', routesDir)).toBe('/api/users/:id/posts');
    });

    test('converts routes/users/[userId]/posts/[postId].ts to /api/users/:userId/posts/:postId', () => {
      expect(filePathToRoutePath('routes/users/[userId]/posts/[postId].ts', routesDir))
        .toBe('/api/users/:userId/posts/:postId');
    });
  });

  describe('Windows paths', () => {
    test('converts routes\\health.ts to /api/health', () => {
      expect(filePathToRoutePath('routes\\health.ts', routesDir)).toBe('/api/health');
    });

    test('converts routes\\users\\[id].ts to /api/users/:id', () => {
      expect(filePathToRoutePath('routes\\users\\[id].ts', routesDir)).toBe('/api/users/:id');
    });
  });

  describe('nested directories', () => {
    test('converts deep nested paths', () => {
      expect(filePathToRoutePath('routes/admin/users/settings.ts', routesDir))
        .toBe('/api/admin/users/settings');
    });
  });
});

describe('generateImportName', () => {
  const routesDir = 'routes';

  test('generates route_health from routes/health.ts', () => {
    expect(generateImportName('routes/health.ts', routesDir)).toBe('route_health');
  });

  test('generates route_users_$id from routes/users/[id].ts', () => {
    expect(generateImportName('routes/users/[id].ts', routesDir)).toBe('route_users_$id');
  });

  test('generates route_users_$id_posts from routes/users/[id]/posts.ts', () => {
    expect(generateImportName('routes/users/[id]/posts.ts', routesDir)).toBe('route_users_$id_posts');
  });

  test('handles nested paths with multiple dynamic segments', () => {
    expect(generateImportName('routes/users/[userId]/posts/[postId].ts', routesDir))
      .toBe('route_users_$userId_posts_$postId');
  });

  test('replaces dashes with underscores', () => {
    expect(generateImportName('routes/my-route.ts', routesDir)).toBe('route_my_route');
  });

  test('handles Windows paths', () => {
    expect(generateImportName('routes\\users\\[id].ts', routesDir)).toBe('route_users_$id');
  });

  test('handles index files', () => {
    expect(generateImportName('routes/users/index.ts', routesDir)).toBe('route_users_index');
  });

  test('produces valid JavaScript identifiers', () => {
    const name = generateImportName('routes/some-path/[id].ts', routesDir);
    // Valid JS identifier: starts with letter/$, contains only letters/numbers/$/_
    expect(name).toMatch(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/);
  });
});

describe('parseRouteExports', () => {
  describe('const exports', () => {
    test('detects export const GET', () => {
      const code = `export const GET = (req: Request) => new Response('ok');`;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toContain('GET');
    });

    test('detects export const POST', () => {
      const code = `export const POST = async (req: Request) => new Response('ok');`;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toContain('POST');
    });

    test('detects multiple method exports', () => {
      const code = `
        export const GET = (req: Request) => new Response('ok');
        export const POST = async (req: Request) => new Response('ok');
        export const PUT = (req: Request) => new Response('ok');
      `;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toEqual(expect.arrayContaining(['GET', 'POST', 'PUT']));
    });
  });

  describe('function exports', () => {
    test('detects export function GET', () => {
      const code = `export function GET(req: Request) { return new Response('ok'); }`;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toContain('GET');
    });

    test('detects export async function POST', () => {
      const code = `export async function POST(req: Request) { return new Response('ok'); }`;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toContain('POST');
    });
  });

  describe('all valid methods', () => {
    test('detects all valid HTTP methods', () => {
      const code = `
        export const GET = () => new Response('ok');
        export const POST = () => new Response('ok');
        export const PUT = () => new Response('ok');
        export const PATCH = () => new Response('ok');
        export const DELETE = () => new Response('ok');
        export const HEAD = () => new Response('ok');
        export const OPTIONS = () => new Response('ok');
      `;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toEqual([...VALID_METHODS]);
    });
  });

  describe('lowercase method warnings', () => {
    test('warns on lowercase get export', () => {
      const code = `export const get = (req: Request) => new Response('ok');`;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).not.toContain('get');
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]!.message).toContain('GET');
      expect(result.warnings[0]!.message).toContain('get');
    });

    test('warns on lowercase post function', () => {
      const code = `export function post(req: Request) { return new Response('ok'); }`;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).not.toContain('post');
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]!.message).toContain('POST');
    });

    test('warns on multiple lowercase methods', () => {
      const code = `
        export const get = () => new Response('ok');
        export const post = () => new Response('ok');
      `;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.warnings.length).toBe(2);
    });
  });

  describe('non-method exports', () => {
    test('ignores non-method exports', () => {
      const code = `
        export const helper = (x: number) => x * 2;
        export const GET = () => new Response('ok');
        export function utilityFn() { return 'utility'; }
        export const config = { timeout: 5000 };
      `;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toEqual(['GET']);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('edge cases', () => {
    test('handles empty file', () => {
      const result = parseRouteExports('', 'test.ts');
      expect(result.methods).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    test('handles file with no exports', () => {
      const code = `
        const GET = () => new Response('ok');
        function POST() { return new Response('ok'); }
      `;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toEqual([]);
    });

    test('ignores methods in comments', () => {
      const code = `
        // export const GET = () => new Response('ok');
        /* export const POST = () => new Response('ok'); */
        export const PUT = () => new Response('ok');
      `;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toEqual(['PUT']);
    });

    test('ignores methods in strings', () => {
      const code = `
        const str1 = "export const GET = () => new Response('ok')";
        const str2 = 'export function POST() { return new Response("ok"); }';
        export const PUT = () => new Response('ok');
      `;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toEqual(['PUT']);
    });

    test('handles TypeScript syntax (type annotations)', () => {
      const code = `
        import type { RouteContext } from '../api/context';

        export const GET = (req: Request, ctx: RouteContext): Response => {
          return Response.json({ status: 'ok' });
        };
      `;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toEqual(['GET']);
    });

    test('handles arrow function with type assertion', () => {
      const code = `
        export const GET = ((req: Request) => new Response('ok')) as Handler;
      `;
      const result = parseRouteExports(code, 'test.ts');
      expect(result.methods).toEqual(['GET']);
    });
  });
});
