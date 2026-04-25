export default async function handler(req, res) {
  try {
    const targetUrl = new URL('https://sirup.inaproc.id/sirup/caripaketctr/search');
    // copy query params
    for (const [key, value] of Object.entries(req.query)) {
      targetUrl.searchParams.append(key, value);
    }
    
    // Set headers that mimic a real browser
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://sirup.inaproc.id/sirup/ro/rekap/kldi/K10',
      'X-Requested-With': 'XMLHttpRequest',
      'Connection': 'keep-alive'
    };

    const response = await fetch(targetUrl.toString(), {
      method: req.method || 'GET',
      headers: headers,
    });

    const data = await response.text();
    
    // Set CORS headers so the browser can access this API route
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
    
    res.status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
