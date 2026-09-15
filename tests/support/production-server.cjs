const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const next = require('next');

// Supply configured headers to rendering so Next emits script nonces matching
// the observed deployed HTML; plain next start did not emit those attributes.
// Keep browser CSP enforcement enabled throughout the production test suite.
const manifest = JSON.parse(fs.readFileSync(path.join(process.env.NEXT_DIST_DIR, 'routes-manifest.json'), 'utf8'));
const csp = manifest.headers.flatMap(rule => rule.headers)
  .find(header => header.key.toLowerCase() === 'content-security-policy')?.value;
if (!csp) throw new Error('Production tests require the built CSP');
const port = Number(process.env.PORT || 3100);
const app = next({ dev: false, hostname: 'localhost', port });
app.prepare().then(() => {
  const handle = app.getRequestHandler();
  http.createServer((request, response) => {
    request.headers['content-security-policy'] = csp;
    handle(request, response);
  }).listen(port, () => {
    console.log('Isolated production server ready');
  });
});
