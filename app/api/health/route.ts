/**
 * GET /api/health
 * Comprobación mínima de que el servidor responde. No toca la base de datos.
 */
export function GET() {
  return Response.json({ ok: true });
}
