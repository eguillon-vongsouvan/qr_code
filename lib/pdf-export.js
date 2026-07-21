const { buildReport } = require('./attendance-report');
const { buildAttendancePdfBuffer } = require('./simple-pdf');

function formatExportDate(d) {
  try {
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch (_) {
    return '—';
  }
}

async function buildAttendancePdf({ session, sessionId }) {
  const report = buildReport({ session, sessionId });
  const exportAt = new Date();

  const presentRows = report.present.map((p) => [
    p.prenom || '',
    p.nom || '',
    p.at ? report.formatTimeFr(p.at) : '—',
    report.statusLabel(p.status, p.late_minutes),
  ]);
  report.extras.forEach((e) => {
    presentRows.push([
      e.prenom || '',
      e.nom || '',
      report.formatTimeFr(e.at),
      `${report.statusLabel(e.status, e.late_minutes)} (hors liste)`,
    ]);
  });

  const absentRows = report.absent.map((a) => [a.prenom || '', a.nom || '', '—', 'Absent']);

  const meta = [
    ['Date de séance', report.meta.date],
    ['Heure de début', report.meta.heure],
    ['Cours', report.meta.cours],
    ['Intervenant', report.meta.intervenant],
    ['Classe', report.meta.classe],
    ['Exporté le', `${formatExportDate(exportAt)} à ${report.formatTimeFr(exportAt)}`],
  ];

  if (!report.meta.rosterMatched) {
    meta.push([
      'Liste classe',
      'Indiquez « BTS SIO 2A » ou « BTS SIO 2B » pour calculer les absents',
    ]);
  }

  return buildAttendancePdfBuffer({ meta, presentRows, absentRows });
}

module.exports = { buildAttendancePdf };
