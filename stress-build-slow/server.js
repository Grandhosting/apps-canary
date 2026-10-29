const http = require('node:http');

const port = Number(process.env.PORT) || 3000;

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    res.setHeader('content-type', 'text/plain');
    if (pathname === '/health') return res.end('ok');
    if (pathname === '/') return res.end('Hello from the Dockerfile app');
    res.statusCode = 404;
    res.end('not found');
  })
  .listen(port, '0.0.0.0');
