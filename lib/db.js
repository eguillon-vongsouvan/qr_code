const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'database.sqlite');
const db = new Database(dbPath, { verbose: null });

db.pragma('journal_mode = WAL'); // Better concurrency
db.pragma('foreign_keys = ON');   // Enable cascade deletes

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    prenom TEXT,
    nom TEXT,
    FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    cours TEXT NOT NULL,
    classe_id TEXT NOT NULL,
    intervenant TEXT NOT NULL,
    started_at TEXT NOT NULL,
    closed_at TEXT,
    is_closed INTEGER DEFAULT 0,
    pdf_blob BLOB,
    excel_blob BLOB,
    late_threshold INTEGER DEFAULT 0,
    user_id TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS presences (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    student_key TEXT NOT NULL,
    prenom TEXT,
    nom TEXT,
    email TEXT,
    auth TEXT,
    room TEXT,
    device_fingerprint TEXT,
    status TEXT NOT NULL,
    late_minutes INTEGER,
    excuse_note TEXT,
    scanned_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    force_password_change INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS system_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`);

// Migration automatique pour ajouter les nouvelles colonnes si la table sessions existait déjà
try {
  db.exec('ALTER TABLE sessions ADD COLUMN pdf_blob BLOB;');
} catch (err) {}

try {
  db.exec('ALTER TABLE sessions ADD COLUMN excel_blob BLOB;');
} catch (err) {}

try {
  db.exec('ALTER TABLE sessions ADD COLUMN late_threshold INTEGER DEFAULT 0;');
} catch (err) {}

try {
  db.exec('ALTER TABLE sessions ADD COLUMN user_id TEXT;');
} catch (err) {}

try {
  db.exec('ALTER TABLE users ADD COLUMN force_password_change INTEGER DEFAULT 1;');
} catch (err) {}

// Provisionnement des utilisateurs par défaut
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  const bcrypt = require('bcryptjs');
  const crypto = require('crypto');
  
  const adminPass = process.env.ADMIN_PASSWORD;
  const profPass = process.env.PROF_PASSWORD;
  if (!adminPass || !profPass) {
    console.error('[FATAL] ADMIN_PASSWORD et PROF_PASSWORD doivent être définis dans le .env pour initialiser la base.');
    process.exit(1);
  }
  
  const insertUser = db.prepare('INSERT INTO users (id, username, password_hash, role, force_password_change) VALUES (?, ?, ?, ?, 1)');
  
  const adminId = crypto.randomUUID();
  insertUser.run(adminId, 'admini', bcrypt.hashSync(adminPass, 10), 'admin');
  insertUser.run(crypto.randomUUID(), 'prof', bcrypt.hashSync(profPass, 10), 'prof');
  
  console.log('Utilisateurs par défaut créés (admini, prof)');
}

module.exports = db;
