import http from 'node:http';
import handler from './api/sirup/caripaketctr/search.js';

const PORT = Number(process.env.PORT || 8787);
const N8N_ORIGIN = process.env.N8N_ORIGIN || 'http://127.0.0.1:5678';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, ngrok-skip-browser-warning');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function handleSirup(req, res) {
  req.body = await readBody(req);
  await handler(req, {
    setHeader: (key, value) => res.setHeader(key, value),
    status: (code) => {
      res.statusCode = code;
      return {
        send: (body) => res.end(body),
        json: (body) => {
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(body));
        },
        end: () => res.end(),
      };
    },
    send: (body) => res.end(body),
    json: (body) => {
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    },
    end: () => res.end(),
  });
}

async function handleN8n(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const body = await readBody(req);
  const targetUrl = new URL(req.url || '/', N8N_ORIGIN);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue;
    const lower = key.toLowerCase();
    if (['host', 'connection', 'content-length'].includes(lower)) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  if (body.length > 0 && !headers.has('content-type')) {
    headers.set('content-type', 'application/octet-stream');
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      redirect: 'manual',
    });

    setCorsHeaders(res);
    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers'].includes(lower)) return;
      res.setHeader(key, value);
    });

    const responseBody = Buffer.from(await upstream.arrayBuffer());
    res.end(responseBody);
  } catch (error) {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'Failed to reach local n8n',
      detail: error instanceof Error ? error.message : 'Unknown error',
      target: N8N_ORIGIN,
    }));
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/health') {
      setCorsHeaders(res);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, sirup: true, n8n: N8N_ORIGIN }));
      return;
    }

    if (req.url?.startsWith('/api/sirup/')) {
      await handleSirup(req, res);
      return;
    }

    if (req.url?.startsWith('/webhook-test/') || req.url?.startsWith('/webhook/')) {
      await handleN8n(req, res);
      return;
    }

    setCorsHeaders(res);
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    setCorsHeaders(res);
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown proxy error' }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Combined local proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`- /api/sirup/*       -> SiRUP proxy`);
  console.log(`- /webhook-test/*    -> ${N8N_ORIGIN}`);
  console.log(`- /webhook/*         -> ${N8N_ORIGIN}`);
});
