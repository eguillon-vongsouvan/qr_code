const db = require('./db');

function start({ cours, classe, intervenant, late_threshold = 0, userId }) {
  // S'assurer qu'aucune autre n'est ouverte pour ce prof
  db.prepare('UPDATE sessions SET is_closed = 1, closed_at = ? WHERE is_closed = 0 AND user_id = ?').run(new Date().toISOString(), userId);

  const startedAt = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO sessions (id, cours, classe_id, intervenant, started_at, is_closed, late_threshold, user_id) VALUES (?, ?, ?, ?, ?, 0, ?, ?)');
  stmt.run(startedAt, String(cours || '').trim(), String(classe || '').trim(), String(intervenant || '').trim(), startedAt, parseInt(late_threshold) || 0, userId);
  
  return get(userId);
}

function get(userId) {
  if (!userId) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE is_closed = 0 AND user_id = ? LIMIT 1').get(userId);
  if (!row) return null;
  return {
    cours: row.cours,
    classe: row.classe_id, // we used classe_id for the label
    intervenant: row.intervenant,
    startedAt: row.started_at,
    closedAt: row.closed_at,
    lateThreshold: row.late_threshold,
    isClosed: false,
    userId: row.user_id
  };
}

function clear(userId) {
  if (!userId) return;
  db.prepare('UPDATE sessions SET is_closed = 1, closed_at = ? WHERE is_closed = 0 AND user_id = ?').run(new Date().toISOString(), userId);
}

function close(userId) {
  const current = get(userId);
  if (!current) return null;
  const closedAt = new Date().toISOString();
  db.prepare('UPDATE sessions SET is_closed = 1, closed_at = ? WHERE is_closed = 0 AND user_id = ?').run(closedAt, userId);
  current.isClosed = true;
  current.closedAt = closedAt;
  return current;
}

function label(userId) {
  const current = get(userId);
  if (!current) return null;
  const parts = [current.cours, current.classe].filter(Boolean);
  return parts.length ? parts.join(' — ') : null;
}

function listClosedSessions(userId = null) {
  let rows;
  if (userId) {
    rows = db.prepare('SELECT * FROM sessions WHERE is_closed = 1 AND user_id = ? ORDER BY started_at DESC').all(userId);
  } else {
    rows = db.prepare('SELECT * FROM sessions WHERE is_closed = 1 ORDER BY started_at DESC').all();
  }
  return rows.map(row => ({
    cours: row.cours,
    classe: row.classe_id,
    intervenant: row.intervenant,
    startedAt: row.started_at,
    closedAt: row.closed_at,
    isClosed: true,
    userId: row.user_id
  }));
}

function getClosedSession(sessionId, includeBlobs = false) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!row) return null;
  return {
    cours: row.cours,
    classe: row.classe_id,
    intervenant: row.intervenant,
    startedAt: row.started_at,
    closedAt: row.closed_at,
    isClosed: row.is_closed === 1,
    pdfBlob: includeBlobs ? row.pdf_blob : null,
    excelBlob: includeBlobs ? row.excel_blob : null,
    userId: row.user_id
  };
}

function saveExports(sessionId, pdfBuffer, excelBuffer) {
  db.prepare('UPDATE sessions SET pdf_blob = ?, excel_blob = ? WHERE id = ?').run(pdfBuffer, excelBuffer, sessionId);
}

function deleteSession(sessionId) {
  db.prepare('DELETE FROM presences WHERE session_id = ?').run(sessionId);
  const info = db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  return info.changes > 0;
}

module.exports = { start, get, clear, close, label, listClosedSessions, getClosedSession, saveExports, deleteSession };
