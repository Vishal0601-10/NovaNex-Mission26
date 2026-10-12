const API_ROOT = import.meta.env.VITE_ACCOUNT_API_URL || '/api/account';

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Account API request failed with ${response.status}.`);
  return body;
}

export function getAccountSnapshot() {
  return request('/snapshot');
}

export function recordAccountTransaction(transaction) {
  return request('/transactions', { method: 'POST', body: JSON.stringify(transaction) });
}

export function setAccountBaseBalance(baseBalance) {
  return request('/base-balance', { method: 'POST', body: JSON.stringify({ base_balance: Number(baseBalance) }) });
}

export function resetAccountFeed(baseBalance) {
  return request('/reset', { method: 'POST', body: JSON.stringify({ base_balance: Number(baseBalance) }) });
}
