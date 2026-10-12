import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const temp = await mkdtemp(join(tmpdir(), 'novanex-smoke-'));
const port = 18987;
const key = 'smoke-test-key-1234567890';
const child = spawn(process.execPath, ['server/productionServer.js'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    ACCOUNT_LEDGER_PATH: join(temp, 'ledger.json'),
    ACCOUNT_WRITE_API_KEY: key,
    REQUIRE_WRITE_API_KEY: 'true',
  },
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${base}/api/system/health`);
      if (res.ok) return;
    } catch { /* retry */ }
    await sleep(100);
  }
  throw new Error(`Server failed to start.\n${output}`);
}
function assert(condition, message) { if (!condition) throw new Error(message); }

try {
  await waitForHealth();
  const page = await fetch(base);
  const html = await page.text();
  assert(page.ok && html.includes('NovaNex MSME Liquidity Engine'), 'Dashboard HTML did not load.');

  const js = await fetch(`${base}/web/app.js`);
  assert(js.ok && (await js.text()).includes('reconcileAccountCredits'), 'Dashboard JavaScript did not load.');

  const moduleResponse = await fetch(`${base}/src/lib/gapDetection.js`);
  assert(moduleResponse.ok, 'Financial engine module was not served.');

  const initial = await (await fetch(`${base}/api/account/snapshot`)).json();
  assert(initial.current_balance === 235000, `Expected initial balance 235000, got ${initial.current_balance}.`);
  assert(initial.write_auth_required === true, 'Expected write authentication to be required.');

  const denied = await fetch(`${base}/api/account/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction_id: 'SMOKE-001', amount: 50000 }) });
  assert(denied.status === 401, `Expected unauthenticated write to return 401, got ${denied.status}.`);

  const headers = { 'Content-Type': 'application/json', 'X-API-Key': key };
  const post = await fetch(`${base}/api/account/transactions`, { method: 'POST', headers, body: JSON.stringify({ transaction_id: 'SMOKE-001', amount: 50000, direction: 'credit', invoice_number: 'INV-101', payer: 'Arun Retail' }) });
  const posted = await post.json();
  assert(post.status === 201, `Expected credit write 201, got ${post.status}: ${JSON.stringify(posted)}`);
  assert(posted.snapshot.current_balance === 285000, `Expected balance 285000, got ${posted.snapshot.current_balance}.`);

  const duplicate = await fetch(`${base}/api/account/transactions`, { method: 'POST', headers, body: JSON.stringify({ transaction_id: 'SMOKE-001', amount: 50000 }) });
  assert(duplicate.status === 409, `Expected duplicate to return 409, got ${duplicate.status}.`);

  console.log('Production smoke test passed:');
  console.log('  ✓ dashboard HTML served');
  console.log('  ✓ browser financial modules served');
  console.log('  ✓ health endpoint passed');
  console.log('  ✓ account ledger snapshot passed');
  console.log('  ✓ write API key enforced');
  console.log('  ✓ ₹50,000 credit changed ₹235,000 → ₹285,000');
  console.log('  ✓ duplicate transaction rejected with HTTP 409');
} finally {
  child.kill('SIGTERM');
  await sleep(150);
  await rm(temp, { recursive: true, force: true });
}
