import type { RouteContext } from '../src/api/context';

/**
 * GET /api/stats
 * Return collection statistics
 */
export const GET = (req: Request, ctx: RouteContext) => {
  const stats = ctx.db.query(`
    SELECT name FROM _collections
  `).all() as { name: string }[];

  return Response.json({
    collections: stats.map(s => s.name),
    count: stats.length,
  });
};
