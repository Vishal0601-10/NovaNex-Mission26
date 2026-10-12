import http from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendAccountTransaction, normalizeAccountTransaction, summarizeAccountLedger } from '../src/lib/accountLedger.js';
import { envBoolean, envNumber, loadDotEnv } from './config.js';

loadDotEnv();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = process.env.ACCOUNT_LEDGER_PATH || resolve(ROOT, 'data', 'account_ledger.local.json');
const PORT = envNumber('ACCOUNT_API_PORT', 8787);
const HOST = process.env.ACCOUNT_API_HOST || '127.0.0.1';
const WRITE_API_KEY = process.env.ACCOUNT_WRITE_API_KEY || '';
const REQUIRE_WRITE_KEY = envBoolean('REQUIRE_WRITE_API_KEY', false) || Boolean(WRITE_API_KEY);
const MAX_BODY_BYTES = Math.max(1024, envNumber('MAX_REQUEST_BODY_BYTES', 1024 * 1024));

let writeQueue = Promise.resolve();

function queueWrite(operation) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => {});
  return next;
}

async function persist(data) {
  const tmp = `${DATA_PATH}.tmp`;
  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, DATA_PATH);
}

async function ensureStore() {
  await mkdir(dirname(DATA_PATH), { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(DATA_PATH, 'utf8'));
    return {
      account_name: String(parsed.account_name || 'MSME Operating Account'),
      account_mask: String(parsed.account_mask || 'XXXX 4821'),
      currency: String(parsed.currency || 'INR'),
      base_balance: Number(parsed.base_balance) || 0,
      base_balance_as_of: String(parsed.base_balance_as_of || new Date().toISOString()),
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = {
      account_name: 'MSME Operating Account',
      account_mask: 'XXXX 4821',
      currency: 'INR',
      base_balance: 235000,
      base_balance_as_of: new Date().toISOString(),
      transactions: [],
    };
    await persist(initial);
    return initial;
  }
}

async function bodyJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

export function sendJson(res, status, payload, extraHeaders = {}) {
  if (status === 204) {
    res.writeHead(204, { 'Cache-Control': 'no-store', ...extraHeaders });
    res.end();
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function suppliedKey(req) {
  const header = req.headers['x-api-key'];
  if (Array.isArray(header)) return header[0] || '';
  return String(header || '');
}

function writeAuthorized(req) {
  if (!REQUIRE_WRITE_KEY) return true;
  return WRITE_API_KEY.length >= 16 && suppliedKey(req) === WRITE_API_KEY;
}

function snapshot(store) {
  return {
    account_name: store.account_name,
    account_mask: store.account_mask,
    currency: store.currency,
    base_balance_as_of: store.base_balance_as_of,
    transactions: store.transactions,
    ...summarizeAccountLedger({ baseBalance: store.base_balance, transactions: store.transactions }),
    synced_at: new Date().toISOString(),
    write_auth_required: REQUIRE_WRITE_KEY,
  };
}

function isWriteRoute(pathname, method) {
  return method === 'POST' && [
    '/api/account/transactions',
    '/api/account/webhook',
    '/api/account/base-balance',
    '/api/account/reset',
  ].includes(pathname);
}

export async function handleAccountRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  if (url.pathname === '/api/account/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'account-feed', time: new Date().toISOString() });
  }

  if (!url.pathname.startsWith('/api/account/')) return false;

  if (isWriteRoute(url.pathname, req.method) && !writeAuthorized(req)) {
    sendJson(res, 401, { error: 'A valid X-API-Key is required for account write operations.' });
    return true;
  }

  if (url.pathname === '/api/account/snapshot' && req.method === 'GET') {
    const store = await ensureStore();
    sendJson(res, 200, snapshot(store));
    return true;
  }

  if ((url.pathname === '/api/account/transactions' || url.pathname === '/api/account/webhook') && req.method === 'POST') {
    try {
      const body = await bodyJson(req);
      const transaction = normalizeAccountTransaction({ ...body, source: body.source || (url.pathname.endsWith('/webhook') ? 'external_webhook' : 'dashboard') });
      const result = await queueWrite(async () => {
        const store = await ensureStore();
        store.transactions = appendAccountTransaction(store.transactions, transaction);
        await persist(store);
        return { transaction, snapshot: snapshot(store) };
      });
      sendJson(res, 201, result);
    } catch (error) {
      const message = String(error.message || error);
      sendJson(res, message.startsWith('Duplicate') ? 409 : 400, { error: message });
    }
    return true;
  }

  if (url.pathname === '/api/account/base-balance' && req.method === 'POST') {
    try {
      const body = await bodyJson(req);
      const baseBalance = Number(body.base_balance);
      if (!Number.isFinite(baseBalance) || baseBalance < 0) throw new Error('base_balance must be a non-negative number.');
      const result = await queueWrite(async () => {
        const store = await ensureStore();
        store.base_balance = baseBalance;
        store.base_balance_as_of = new Date().toISOString();
        await persist(store);
        return snapshot(store);
      });
      sendJson(res, 200, { snapshot: result });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/account/reset' && req.method === 'POST') {
    try {
      const body = await bodyJson(req);
      const baseBalance = Number(body.base_balance ?? 235000);
      if (!Number.isFinite(baseBalance) || baseBalance < 0) throw new Error('base_balance must be a non-negative number.');
      const result = await queueWrite(async () => {
        const store = await ensureStore();
        store.base_balance = baseBalance;
        store.base_balance_as_of = new Date().toISOString();
        store.transactions = [];
        await persist(store);
        return snapshot(store);
      });
      sendJson(res, 200, { snapshot: result });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  sendJson(res, 404, { error: 'Account API route not found.' });
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = http.createServer((req, res) => {
    handleAccountRequest(req, res)
      .then((handled) => {
        if (handled === false) sendJson(res, 404, { error: 'Not found.' });
      })
      .catch((error) => sendJson(res, 500, { error: 'Internal server error.', detail: process.env.NODE_ENV === 'development' ? error.message : undefined }));
  });
  server.listen(PORT, HOST, () => {
    console.log(`Account feed listening on http://${HOST}:${PORT}`);
    console.log(`Ledger file: ${DATA_PATH}`);
    console.log(`Write API key required: ${REQUIRE_WRITE_KEY ? 'yes' : 'no'}`);
  });
}
