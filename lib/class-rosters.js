const db = require('./db');
const crypto = require('crypto');
const { encrypt, decrypt } = require('./crypto-utils');

function normalizeKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function studentKey(prenom, nom) {
  return normalizeKey(`${prenom}-${nom}`);
}

function listClasses() {
  const classes = db.prepare('SELECT * FROM classes ORDER BY label ASC').all();
  return classes.map(c => {
    const countRow = db.prepare('SELECT COUNT(*) as c FROM students WHERE class_id = ?').get(c.id);
    return {
      id: c.id,
      label: c.label,
      count: countRow.c
    };
  });
}

function findByClasseName(classeName) {
  if (!classeName) return null;
  const label = classeName.trim();
  const cls = db.prepare('SELECT * FROM classes WHERE label = ?').get(label);
  if (!cls) return null;

  const students = db.prepare('SELECT * FROM students WHERE class_id = ?').all(cls.id);
  return {
    id: cls.id,
    label: cls.label,
    students: students.map(s => {
      const prenom = decrypt(s.prenom);
      const nom = decrypt(s.nom);
      return {
        prenom,
        nom,
        key: studentKey(prenom, nom)
      };
    })
  };
}

function deleteClass(classId) {
  db.prepare('DELETE FROM students WHERE class_id = ?').run(classId);
  const info = db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
  return info.changes > 0;
}

function saveClass(label, studentsList) {
  const existing = db.prepare('SELECT * FROM classes WHERE label = ?').get(label);
  let classId = existing ? existing.id : crypto.randomUUID();

  const insertClass = db.prepare('INSERT OR REPLACE INTO classes (id, label) VALUES (?, ?)');
  insertClass.run(classId, label);

  const insertStudent = db.prepare('INSERT INTO students (id, class_id, prenom, nom) VALUES (?, ?, ?, ?)');
  
  const insertMany = db.transaction((students) => {
    // Si la classe existait, on nettoie ses élèves pour éviter les doublons
    if (existing) {
      db.prepare('DELETE FROM students WHERE class_id = ?').run(classId);
    }
    for (const student of students) {
      insertStudent.run(
        crypto.randomUUID(), 
        classId, 
        encrypt(student.prenom), 
        encrypt(student.nom)
      );
    }
  });

  insertMany(studentsList);
  return classId;
}

function matchPresent(rosterStudents, presenceLogList) {
  const present = [];
  const absent = [];
  const extras = [];

  const presenceByKey = {};
  for (const log of presenceLogList) {
    if (log.status !== 'present' && log.status !== 'late') continue;
    let key;
    if (log.prenom && log.nom) {
      key = studentKey(log.prenom, log.nom);
    } else {
      key = normalizeKey(log.email);
    }
    presenceByKey[key] = log;
  }

  const logEmails = presenceLogList.map((p) => normalizeKey(p.email)).filter(Boolean);
  const matchedLogIds = new Set();

  if (rosterStudents) {
    for (const s of rosterStudents) {
      const sk = studentKey(s.prenom, s.nom);
      
      let pLog = presenceByKey[sk];
      
      if (!pLog && logEmails.includes(sk)) {
        pLog = presenceLogList.find((p) => normalizeKey(p.email) === sk);
      }

      if (pLog) {
        present.push({ ...s, log: pLog });
        matchedLogIds.add(pLog.id);
      } else {
        absent.push(s);
      }
    }
  }

  for (const log of presenceLogList) {
    if (log.status === 'present' || log.status === 'late') {
      if (!matchedLogIds.has(log.id)) {
        extras.push({
          prenom: log.prenom,
          nom: log.nom,
          email: log.email,
          log: log,
        });
      }
    }
  }

  return { present, absent, extras };
}

module.exports = {
  normalizeKey,
  studentKey,
  listClasses,
  findByClasseName,
  deleteClass,
  saveClass,
  matchPresent
};
