const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function resolveEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && raw.length >= 32) {
    return Buffer.from(raw.slice(0, 32), 'utf-8');
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] ENCRYPTION_KEY (32+ caractères) requis en production/Docker.');
    process.exit(1);
  }
  const hash = crypto.createHash('sha256');
  hash.update(process.env.ADMIN_PASSWORD || 'default_secret_key');
  return hash.digest();
}

const encryptionKey = resolveEncryptionKey();

function looksEncrypted(text) {
  if (!text || typeof text !== 'string') return false;
  const parts = text.split(':');
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}

/**
 * Chiffre un texte avec AES-256-GCM.
 * Retourne le format : iv:authTag:encryptedData (en hex)
 */
function encrypt(text) {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('Erreur de chiffrement:', err);
    return text; // Fallback
  }
}

/**
 * Déchiffre un texte chiffré au format iv:authTag:encryptedData.
 * Si le texte n'est pas chiffré (données existantes), le retourne tel quel.
 */
function decrypt(text) {
  if (!text || typeof text !== 'string') return text;

  // Vérification stricte : seules les données au format iv:authTag:encryptedData (hex) sont traitées
  if (!looksEncrypted(text)) {
    // Données non chiffrées (ancien format, texte clair)
    return text;
  }

  try {
    const [ivHex, authTagHex, encryptedHex] = text.split(':');
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      encryptionKey,
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('[crypto] Échec de déchiffrement pour les données — vérifiez que ENCRYPTION_KEY est identique à celle utilisée lors du chiffrement');
    // En cas d'échec (ex: clé changée), on ne retourne PAS le texte chiffré
    // car il serait illisible sur le site. On retourne plutôt un indicateur clair.
    return '?';
  }
}

module.exports = {
  encrypt,
  decrypt,
  looksEncrypted,
};
