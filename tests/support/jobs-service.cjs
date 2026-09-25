const http = require('node:http');

// The suite exercises the real jobs service and normalization over HTTP, using
// rows created by its SQL fixtures. This is a narrow PostgREST test double, not
// a replacement for testing Supabase itself in staging.
exports.startJobsService = async function startJobsService(sql, key) {
  const server = http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.headers.apikey !== key) {
        response.writeHead(401).end(JSON.stringify({ message: 'Invalid fixture key' }));
        return;
      }
      if (request.method !== 'GET' || url.pathname !== '/rest/v1/jobs') {
        response.writeHead(501).end(JSON.stringify({ message: 'Unsupported fixture request' }));
        return;
      }
      const id = url.searchParams.get('id');
      const rows = id?.startsWith('eq.')
        ? await sql`select * from public.jobs where id::text=${id.slice(3)}`
        : await sql`select * from public.jobs order by created_at desc`;
      const single = request.headers.accept?.includes('application/vnd.pgrst.object+json');
      response.end(JSON.stringify(single ? rows[0] ?? null : rows));
    } catch {
      response.writeHead(500).end(JSON.stringify({ message: 'Fixture database request failed' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
};
