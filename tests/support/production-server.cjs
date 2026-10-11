const http = require('node:http');
const next = require('next');

// proxy.ts sets the page CSP with a per-request script nonce, so this server
// needs no header injection; browser CSP enforcement stays enabled in tests.
const port = Number(process.env.PORT || 3100);
const app = next({ dev: false, hostname: 'localhost', port });
app.prepare().then(() => {
  const handle = app.getRequestHandler();
  http.createServer((request, response) => {
    handle(request, response);
  }).listen(port, () => {
    console.log('Isolated production server ready');
  });
});
