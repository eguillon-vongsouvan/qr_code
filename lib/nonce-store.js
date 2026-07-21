/**
 * Jetons à usage unique : empêche la réutilisation d'une photo / capture du QR.
 */
const TTL_MS = 180_000; // 4 créneaux × 45 s

/** @type {Map<string, { slot: number, status: 'issued'|'used', at: number }>} */
const store = new Map();

function prune() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.at > TTL_MS) store.delete(k);
  }
}

function issue(nonce, slot) {
  prune();
  store.set(nonce, { slot, status: 'issued', at: Date.now() });
}

function canOpen(nonce) {
  prune();
  const e = store.get(nonce);
  return e && e.status === 'issued';
}

function consume(nonce) {
  prune();
  const e = store.get(nonce);
  if (!e || e.status !== 'issued') return false;
  e.status = 'used';
  e.at = Date.now();
  return true;
}

function isUsed(nonce) {
  prune();
  return store.get(nonce)?.status === 'used';
}

module.exports = { issue, canOpen, consume, isUsed };
