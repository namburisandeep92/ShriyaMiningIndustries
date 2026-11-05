const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const page = path.join(__dirname, 'Invoice_Generator.html');
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!['/', '/Invoice_Generator.html'].includes(pathname)) {
    response.writeHead(404).end('Not found');
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  fs.createReadStream(page).pipe(response);
});

server.listen(8765, '127.0.0.1', () => {
  console.log('Invoice Generator: http://localhost:8765/Invoice_Generator.html');
  console.log('Stop with Ctrl+C.');
});
