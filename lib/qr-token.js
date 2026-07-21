const crypto = require('crypto');

const WINDOW_MS = 45_000;

function getSecret() {
  return process.env.QR_SECRET || 'appel-qr-dev-changez-moi';
}

function currentSlot(now = Date.now()) {
  return Math.floor(now / WINDOW_MS);
}

function signPayload(payload) {
  return crypto
    .createHmac('sha256', getSecret())
    .update(payload)
    .digest('hex')
    .slice(0, 32); // 128 bits de sécurité
}

function newNonce() {
  return crypto.randomBytes(12).toString('hex');
}

/** Jeton pour un élève : nom + prénom + créneau + nonce (usage unique). */
function buildStudentToken(nom, prenom, slot = currentSlot(), nonce = newNonce()) {
  return {
    slot,
    nonce,
    sig: signPayload(`eleve|${nom}|${prenom}|${slot}|${nonce}`),
  };
}

/** Jeton séance affiché en classe (créneau + nonce unique). */
function buildSessionToken(slot = currentSlot(), nonce = newNonce()) {
  return {
    slot,
    nonce,
    sig: signPayload(`session|${slot}|${nonce}`),
  };
}

function safeEqualHex(expected, given) {
  const a = String(given);
  if (a.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(a));
}

function verifyStudentToken(nom, prenom, slot, nonce, sig) {
  if (!nom || !prenom || slot === undefined || !nonce || !sig) return false;
  const s = Number(slot);
  if (!Number.isFinite(s)) return false;
  return safeEqualHex(
    signPayload(`eleve|${nom}|${prenom}|${s}|${nonce}`),
    String(sig)
  );
}

function verifySessionToken(slot, nonce, sig) {
  if (slot === undefined || !nonce || !sig) return false;
  const s = Number(slot);
  if (!Number.isFinite(s)) return false;
  return safeEqualHex(signPayload(`session|${s}|${nonce}`), String(sig));
}

/** Créneau courant + 3 créneaux précédents (~120 s), plus tolérant en Internet. */
function isSlotValid(slot, now = Date.now()) {
  const s = Number(slot);
  const cur = currentSlot(now);
  return s === cur || s === cur - 1 || s === cur - 2 || s === cur - 3;
}

function verifyStudentQuery(nom, prenom, slot, nonce, sig, now = Date.now()) {
  return (
    isSlotValid(slot, now) &&
    verifyStudentToken(nom, prenom, Number(slot), nonce, sig)
  );
}

function verifySessionQuery(slot, nonce, sig, now = Date.now()) {
  return (
    isSlotValid(slot, now) &&
    verifySessionToken(Number(slot), nonce, sig)
  );
}

function secondsUntilNextWindow(now = Date.now()) {
  const elapsed = now % WINDOW_MS;
  return Math.ceil((WINDOW_MS - elapsed) / 1000);
}

module.exports = {
  WINDOW_MS,
  currentSlot,
  newNonce,
  buildStudentToken,
  buildSessionToken,
  verifyStudentQuery,
  verifySessionQuery,
  secondsUntilNextWindow,
};
