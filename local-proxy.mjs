import http from 'node:http';
import handler from './api/sirup/caripaketctr/search.js';

const PORT = Number(process.env.PORT || 8787);

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url?.startsWith('/api/sirup/caripaketctr/search')) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    req.body = Buffer.concat(chunks);
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
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Local SiRUP proxy listening on http://127.0.0.1:${PORT}`);
});
