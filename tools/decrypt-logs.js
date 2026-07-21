#!/usr/bin/env node
/**
 * Outil CLI pour lire les logs chiffrés du système.
 * Usage: node tools/decrypt-logs.js
 * Nécessite: ENCRYPTION_KEY (32+ caractères) dans l'environnement ou .env
 */

const fs = require('fs');
const path = require('path');
const { decrypt, looksEncrypted } = require('../lib/crypto-utils');

const logFilePath = path.join(__dirname, '..', 'data', 'system.log');

function decryptLine(line) {
  if (!looksEncrypted(line)) return `[UNENCRYPTED] ${line}`;
  const plain = decrypt(line);
  return plain === line ? `[DECRYPT_ERROR] ${line}` : plain;
}

if (!fs.existsSync(logFilePath)) {
  console.log('Aucun fichier de log trouvé à:', logFilePath);
  process.exit(0);
}

const lines = fs.readFileSync(logFilePath, 'utf8').split('\n').filter(Boolean);
console.log(`=== Logs Système (${lines.length} entrées) ===\n`);
lines.forEach((line, i) => {
  console.log(`[${i + 1}] ${decryptLine(line)}`);
});
