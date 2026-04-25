export default async function handler(req, res) {
  try {
    // Mengambil query string dari URL request
    const queryString = req.url.includes('?') ? req.url.split('?').slice(1).join('?') : '';
    const targetUrl = `https://sirup.inaproc.id/sirup/caripaketctr/search${queryString ? '?' + queryString : ''}`;

    // Meniru header browser asli agar tidak diblokir oleh Cloudflare WAF
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://sirup.inaproc.id/sirup/ro/rekap/kldi/K10',
      'X-Requested-With': 'XMLHttpRequest',
      'Connection': 'keep-alive'
    };

    const response = await fetch(targetUrl, {
      method: req.method || 'GET',
      headers: headers,
    });

    const data = await response.text();

    // Mengizinkan akses dari domain manapun (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    res.status(response.status).send(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
