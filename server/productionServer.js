import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { handleAccountRequest, sendJson } from './accountServer.js';
import { envNumber, loadDotEnv } from './config.js';

loadDotEnv();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_ROOT = resolve(ROOT, 'web');
const SRC_ROOT = resolve(ROOT, 'src');
const DATA_ROOT = resolve(ROOT, 'data');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = envNumber('PORT', 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  };
}

function safeResolve(root, requestPath) {
  const decoded = decodeURIComponent(requestPath).replace(/\\/g, '/');
  const cleaned = decoded.replace(/^\/+/, '');
  const candidate = resolve(root, cleaned);
  const rel = relative(root, candidate);

  // Cross-platform containment check. On Windows, comparing paths with a hard-coded
  // forward slash rejects valid files such as C:\project\web\app.js.
  if (rel === '') return candidate;
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return candidate;
}

async function sendFile(res, path, cache = false) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    const headers = {
      ...securityHeaders(),
      'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': cache ? 'public, max-age=3600' : 'no-cache',
    };
    res.writeHead(200, headers);
    createReadStream(path).pipe(res);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function staticRoute(pathname, res) {
  if (pathname === '/' || pathname === '/index.html') return sendFile(res, join(WEB_ROOT, 'index.html'));
  if (pathname === '/favicon.svg') return sendFile(res, join(ROOT, 'public', 'favicon.svg'), true);

  if (pathname.startsWith('/web/')) {
    const file = safeResolve(WEB_ROOT, pathname.slice('/web/'.length));
    return file ? sendFile(res, file, true) : false;
  }
  if (pathname.startsWith('/src/lib/')) {
    const file = safeResolve(resolve(SRC_ROOT, 'lib'), pathname.slice('/src/lib/'.length));
    return file ? sendFile(res, file, true) : false;
  }
  if (pathname.startsWith('/src/data/')) {
    const file = safeResolve(resolve(SRC_ROOT, 'data'), pathname.slice('/src/data/'.length));
    return file ? sendFile(res, file, true) : false;
  }
  if (pathname === '/data/invoices_template.csv') return sendFile(res, join(DATA_ROOT, 'invoices_template.csv'));
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const headers = securityHeaders();
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);

    if (url.pathname === '/api/system/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, service: 'novanex-msme', time: new Date().toISOString(), node: process.version }, headers);
      return;
    }

    const handled = await handleAccountRequest(req, res);
    if (handled !== false) return;

    if (!['GET', 'HEAD'].includes(req.method)) {
      sendJson(res, 405, { error: 'Method not allowed.' }, headers);
      return;
    }

    if (await staticRoute(url.pathname, res)) return;

    // SPA fallback for navigation URLs without a file extension.
    if (!extname(url.pathname) && await sendFile(res, join(WEB_ROOT, 'index.html'))) return;

    sendJson(res, 404, { error: 'Not found.' }, headers);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error.' }, securityHeaders());
    else res.destroy();
  }
});

server.requestTimeout = 15_000;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 5_000;

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('NovaNex MSME Working-Capital Engine');
  console.log(`Dashboard: http://${HOST}:${PORT}`);
  console.log(`Health:    http://${HOST}:${PORT}/api/system/health`);
  console.log('Press Ctrl+C to stop.');
  console.log('');
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received. Closing server...`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
