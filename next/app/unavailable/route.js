export const dynamic = 'force-dynamic';

// Live check for app-service: an app's own 5xx body must reach the client unchanged
// (ingress custom-http-errors "599" on app Ingresses).
export function GET() {
  return new Response(JSON.stringify({ error: 'maintenance', source: 'apps-canary' }), {
    status: 503,
    headers: { 'content-type': 'application/json', 'retry-after': '30' },
  });
}
