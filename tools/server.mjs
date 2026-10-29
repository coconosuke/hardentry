// テスト用の小さな静的サーバー: node tools/server.mjs [port] [root]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.bin': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

export function startServer(root, port = 0) {
  const srv = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      let p = decodeURIComponent(u.pathname);
      if (p.endsWith('/')) p += 'index.html';
      const fp = path.join(root, p);
      if (!fp.startsWith(path.resolve(root))) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(fp).toLowerCase();
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
      const st = fs.statSync(fp);
      const etag = '"' + st.size + '-' + st.mtimeMs + '"';
      headers.ETag = etag;
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
      res.writeHead(200, headers);
      fs.createReadStream(fp).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise(resolve => srv.listen(port, '127.0.0.1', () => resolve({ srv, port: srv.address().port, close: () => new Promise(r => srv.close(r)) })));
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  const port = +(process.argv[2] || 8765);
  const root = process.argv[3] || process.cwd();
  startServer(root, port).then(({ port }) => console.log('serving', root, 'on', port));
}
