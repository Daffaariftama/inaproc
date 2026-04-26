const TARGET_ORIGIN = 'https://sirup.inaproc.id';
const TARGET_PATH = '/sirup/caripaketctr/search';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, ngrok-skip-browser-warning');
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const targetUrl = `${TARGET_ORIGIN}${TARGET_PATH}${queryString}`;

    // SiRUP blocks many server-to-server/default fetch requests. These headers
    // make the Vercel function look like the same browser XHR used by the site.
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': `${TARGET_ORIGIN}/sirup/ro/rekap/kldi/K10`,
        'Origin': TARGET_ORIGIN,
        'X-Requested-With': 'XMLHttpRequest',
      },
      redirect: 'follow',
    });

    const body = await response.text();
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(response.status).send(body);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown proxy error' });
  }
}
