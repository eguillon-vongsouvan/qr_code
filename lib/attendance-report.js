const presenceLog = require('./presence-log');
const classRosters = require('./class-rosters');

function statusLabel(status, lateMinutes) {
  if (status === 'late') {
    return `En retard${lateMinutes ? ` (${lateMinutes} min)` : ''}`;
  }
  if (status === 'absent_excused') return 'Absent excusé';
  return 'Présent';
}

function formatDateFr(iso) {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Paris',
    });
  } catch (_) {
    return '—';
  }
}

function formatTimeFr(iso) {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch (_) {
    return '—';
  }
}

/** Rapport présents / absents pour une séance. */
function buildReport({ session, sessionId }) {
  const rows = presenceLog.list({ sessionId });
  const roster = classRosters.findByClasseName(session.classe);
  const sessionStart = session.startedAt || new Date().toISOString();

  let present = [];
  let absent = [];
  let extras = [];

  if (roster) {
    const matched = classRosters.matchPresent(roster.students, rows);
    // Aplatir les données de scan (log) dans chaque entrée présente
    present = matched.present.map(p => ({
      prenom: p.prenom,
      nom: p.nom,
      fullName: `${p.prenom || ''} ${p.nom || ''}`.trim(),
      at: p.log ? p.log.at : null,
      status: p.log ? p.log.status : 'present',
      late_minutes: p.log ? p.log.late_minutes : null,
    }));
    absent = matched.absent;
    extras = matched.extras.map(e => ({
      prenom: e.prenom,
      nom: e.nom,
      fullName: `${e.prenom || ''} ${e.nom || ''}`.trim(),
      at: e.log ? e.log.at : null,
      status: e.log ? e.log.status : 'present',
      late_minutes: e.log ? e.log.late_minutes : null,
    }));
  } else {
    present = rows.map((r) => ({
      prenom: r.prenom,
      nom: r.nom,
      fullName: r.student_name,
      at: r.at,
      status: r.status,
      late_minutes: r.late_minutes,
    }));
  }

  return {
    meta: {
      date: formatDateFr(sessionStart),
      heure: formatTimeFr(sessionStart),
      cours: session.cours || '—',
      intervenant: session.intervenant || '—',
      classe: session.classe || '—',
      rosterMatched: !!roster,
      rosterLabel: roster ? roster.label : null,
    },
    present,
    absent,
    extras,
    statusLabel,
    formatTimeFr,
  };
}

function toExportRows(report) {
  const rows = [];
  const push = (section, p, n, heure, statut) => {
    rows.push({
      section,
      prénom: p,
      nom: n,
      élève: `${p} ${n}`.trim(),
      heure,
      statut,
      cours: report.meta.cours,
      classe: report.meta.classe,
      intervenant: report.meta.intervenant,
      date_séance: report.meta.date,
      heure_debut: report.meta.heure,
    });
  };

  report.present.forEach((p) => {
    push(
      'Présent',
      p.prenom || '',
      p.nom || '',
      p.at ? report.formatTimeFr(p.at) : '—',
      report.statusLabel(p.status, p.late_minutes)
    );
  });
  report.absent.forEach((a) => {
    push('Absent', a.prenom || '', a.nom || '', '—', 'Absent');
  });
  report.extras.forEach((e) => {
    push(
      'Présent (hors liste)',
      e.prenom || '',
      e.nom || '',
      report.formatTimeFr(e.at),
      report.statusLabel(e.status, e.late_minutes)
    );
  });

  return rows;
}

module.exports = {
  buildReport,
  toExportRows,
  statusLabel,
  formatDateFr,
  formatTimeFr,
};
