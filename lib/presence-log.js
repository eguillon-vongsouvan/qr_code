const db = require('./db');
const crypto = require('crypto');
const { encrypt, decrypt } = require('./crypto-utils');

const STATUS = {
  PRESENT: 'present',
  LATE: 'late',
  ABSENT_EXCUSED: 'absent_excused',
};

function record({ prenom, nom, email, auth = 'form', room, sessionId, device_fingerprint = null }) {
  const p = String(prenom || '').trim();
  const n = String(nom || '').trim();
  const mail = String(email || '').trim().toLowerCase();
  
  // La clé étudiante est non-chiffrée car elle sert pour les correspondances rapides
  // Elle est hachée ou normalisée de façon irréversible si besoin, ici on la garde normalisée
  const key = mail || `${p.toLowerCase()}|${n.toLowerCase()}`;
  if (!key || key === '|') return null;

  const sid = sessionId || null;
  const at = new Date().toISOString();
  
  // Find existing
  let existing;
  if (sid) {
    existing = db.prepare('SELECT * FROM presences WHERE student_key = ? AND session_id = ?').get(key, sid);
  } else {
    existing = db.prepare('SELECT * FROM presences WHERE student_key = ? AND session_id IS NULL').get(key);
  }

  if (existing) {
    return {
      id: existing.id,
      key: existing.student_key,
      prenom: decrypt(existing.prenom),
      nom: decrypt(existing.nom),
      email: decrypt(existing.email),
      auth: existing.auth,
      room: existing.room,
      sessionId: existing.session_id,
      device_fingerprint: existing.device_fingerprint,
      status: existing.status,
      lateMinutes: existing.late_minutes,
      excuseNote: existing.excuse_note,
      at: existing.scanned_at,
      duplicate: true
    };
  }

  // Calcul du retard potentiel
  let finalStatus = STATUS.PRESENT;
  let finalLateMinutes = null;

  if (sid) {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sid);
    if (session && session.late_threshold > 0) {
      const startMs = new Date(session.started_at).getTime();
      const nowMs = new Date(at).getTime();
      const diffMins = Math.floor((nowMs - startMs) / 60000);
      
      if (diffMins > session.late_threshold) {
        finalStatus = STATUS.LATE;
        finalLateMinutes = diffMins - session.late_threshold; // Retard net
      }
    }
  }

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO presences 
    (id, session_id, student_key, prenom, nom, email, auth, room, device_fingerprint, status, late_minutes, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sid, key, encrypt(p), encrypt(n), encrypt(mail || null), auth, room || null, device_fingerprint, finalStatus, finalLateMinutes, at);

  return {
    id,
    key,
    prenom: p,
    nom: n,
    email: mail || null,
    auth,
    room: room || null,
    sessionId: sid,
    device_fingerprint,
    status: finalStatus,
    lateMinutes: finalLateMinutes,
    excuseNote: null,
    at
  };
}

function list({ sessionId } = {}) {
  let rows;
  if (sessionId) {
    rows = db.prepare('SELECT * FROM presences WHERE session_id = ? ORDER BY scanned_at DESC').all(sessionId);
  } else {
    rows = db.prepare('SELECT * FROM presences ORDER BY scanned_at DESC').all();
  }

  return rows.map((row) => {
    const prenom = decrypt(row.prenom);
    const nom = decrypt(row.nom);
    const email = decrypt(row.email);
    return {
      id: row.id,
      prenom,
      nom,
      student_name: [prenom, nom].filter(Boolean).join(' ') || email,
      student_id: email || `${prenom} ${nom}`.trim(),
      email,
      auth: row.auth,
      room: row.room,
      session_id: row.session_id,
      device_fingerprint: row.device_fingerprint,
      status: row.status,
      late_minutes: row.late_minutes,
      excuse_note: row.excuse_note,
      at: row.scanned_at,
    };
  });
}

function updateStatus({ id, sessionId, status, lateMinutes, excuseNote }) {
  let query = 'UPDATE presences SET status = ?, late_minutes = ?, excuse_note = ? WHERE id = ?';
  let params = [status, lateMinutes || null, excuseNote || null, id];
  if (sessionId) {
    query += ' AND session_id = ?';
    params.push(sessionId);
  }
  
  const info = db.prepare(query).run(...params);
  
  if (info.changes > 0) {
    const updated = db.prepare('SELECT * FROM presences WHERE id = ?').get(id);
    return {
      id: updated.id,
      status: updated.status,
      lateMinutes: updated.late_minutes,
      excuseNote: updated.excuse_note
    };
  }
  return null;
}

module.exports = { record, list, updateStatus, STATUS };
