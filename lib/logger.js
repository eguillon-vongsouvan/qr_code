const fs = require('fs');
const path = require('path');
const db = require('./db');
const { encrypt } = require('./crypto-utils');

const logFilePath = path.join(__dirname, '..', 'data', 'system.log');

function logEvent(userId, action, details = null) {
  try {
    let username = 'Système';
    if (userId) {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
      if (user) username = user.username;
    }
    const timestamp = new Date().toISOString();
    const detailsStr = details ? JSON.stringify(details) : '';
    const plainLine = `[${timestamp}] USER:${username} ACTION:${action} DETAILS:${detailsStr}`;
    const encryptedLine = encrypt(plainLine);
    fs.appendFileSync(logFilePath, encryptedLine + '\n');
  } catch (err) {
    console.error('Failed to write log:', err);
  }
}

function getLogs() {
  return [];
}

module.exports = { logEvent, getLogs };
