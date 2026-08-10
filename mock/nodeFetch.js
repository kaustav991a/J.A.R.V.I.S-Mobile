// A fetch-shaped client built on node:http.
//
// Why this exists: under `jest-expo`, the global `fetch` is Expo's winter
// fetch, which is backed by a native module. In the jest environment that
// module is a stub, so every real request comes back with `status: undefined`
// and an undefined body. Tests that must talk to `mock/server.js` over a real
// socket use this instead. App code still uses the platform `fetch`.
const http = require('http');

/** the slice of Response the app and the tests actually read */
function makeResponse(status, bodyText) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => bodyText,
    json: async () => JSON.parse(bodyText),
  };
}

function nodeFetch(url, init = {}) {
  const { method = 'GET', headers = {}, body, signal } = init;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));

    const target = new URL(String(url));
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers: body ? { 'Content-Length': Buffer.byteLength(body), ...headers } : headers,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => resolve(makeResponse(res.statusCode ?? 0, raw)));
      }
    );

    const abort = () => {
      req.destroy(new Error('aborted'));
    };
    signal?.addEventListener?.('abort', abort);

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { nodeFetch };
