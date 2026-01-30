import type { RouteContext } from '../src/api/context';

/**
 * GET /api/health
 * Simple health check endpoint
 */
export const GET = (req: Request, ctx: RouteContext) => {
  return Response.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
};
