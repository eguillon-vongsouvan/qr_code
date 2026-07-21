const { buildReport } = require('./attendance-report');
const { layoutPage, escapeHtml } = require('./ui-shell');

function renderReportHtml({ session, sessionId }) {
  const report = buildReport({ session, sessionId });
  const { meta, present, absent, extras } = report;

  const rows = [];

  // Present students
  present.forEach((p) => {
    rows.push({
      status: 'Présent',
      statusClass: 'status-present',
      name: `${p.prenom} ${p.nom}`,
      time: p.at ? report.formatTimeFr(p.at) : '—',
      detail: report.statusLabel(p.status, p.late_minutes),
    });
  });

  // Extras (present but not on roster)
  extras.forEach((e) => {
    rows.push({
      status: 'Présent (hors liste)',
      statusClass: 'status-extra',
      name: `${e.prenom} ${e.nom}`,
      time: report.formatTimeFr(e.at),
      detail: report.statusLabel(e.status, e.late_minutes),
    });
  });

  // Absent students
  absent.forEach((a) => {
    rows.push({
      status: 'Absent',
      statusClass: 'status-absent',
      name: `${a.prenom} ${a.nom}`,
      time: '—',
      detail: 'Absent',
    });
  });

  const tableRows = rows
    .map(
      (r) => `
    <tr>
      <td><span class="badge ${r.statusClass}">${escapeHtml(r.status)}</span></td>
      <td class="name-cell">${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.time)}</td>
      <td>${escapeHtml(r.detail)}</td>
    </tr>`
    )
    .join('');

  const bodyHtml = `
    <style>
      .report-container {
        padding: 2rem;
        max-width: 1000px;
        margin: 0 auto;
      }
      .report-header-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
        background: var(--bg-card);
        padding: 1.5rem;
        border-radius: 1rem;
        border: 1px solid var(--border);
      }
      .report-meta-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .report-meta-label {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--text-muted);
        letter-spacing: 0.05em;
      }
      .report-meta-value {
        font-weight: 600;
        color: var(--text-main);
      }
      .report-table-card {
        background: var(--bg-card);
        border-radius: 1rem;
        border: 1px solid var(--border);
        overflow: hidden;
      }
      .report-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }
      .report-table th {
        background: rgba(0,0,0,0.02);
        padding: 1rem 1.5rem;
        font-size: 0.85rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--text-muted);
        border-bottom: 2px solid var(--border);
      }
      .report-table td {
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--border);
        color: var(--text-main);
      }
      .name-cell {
        font-weight: 600;
      }
      .badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 2rem;
        font-size: 0.75rem;
        font-weight: 700;
      }
      .status-present { background: #e6fcf5; color: #0ca678; }
      .status-extra { background: #fff9db; color: #f08c00; }
      .status-absent { background: #fff5f5; color: #fa5252; }
      
      @media print {
        .site-header, .btn-ghost { display: none !important; }
        .report-container { padding: 0; }
        body { background: white; }
      }
    </style>
    <div class="report-container">
      <div class="report-header-grid">
        <div class="report-meta-item">
          <span class="report-meta-label">Cours</span>
          <span class="report-meta-value">${escapeHtml(meta.cours)}</span>
        </div>
        <div class="report-meta-item">
          <span class="report-meta-label">Classe</span>
          <span class="report-meta-value">${escapeHtml(meta.classe)}</span>
        </div>
        <div class="report-meta-item">
          <span class="report-meta-label">Intervenant</span>
          <span class="report-meta-value">${escapeHtml(meta.intervenant)}</span>
        </div>
        <div class="report-meta-item">
          <span class="report-meta-label">Date</span>
          <span class="report-meta-value">${escapeHtml(meta.date)} à ${escapeHtml(
    meta.heure
  )}</span>
        </div>
      </div>

      <div class="report-table-card">
        <table class="report-table">
          <thead>
            <tr>
              <th>Statut</th>
              <th>Nom de l'élève</th>
              <th>Heure</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      
      <div style="margin-top: 2rem; display: flex; gap: 1rem;">
        <button class="btn-ghost" onclick="window.print()">Imprimer / PDF</button>
        <a class="btn-ghost" href="/rapport/${sessionId}/csv" download>Télécharger CSV</a>
      </div>
    </div>
  `;

  return layoutPage({
    title: `Rapport de présence - ${meta.classe} - ${meta.date}`,
    headerTitle: 'Rapport de Présence',
    headerSubtitle: `${meta.cours} · ${meta.classe}`,
    bodyHtml,
  });
}

module.exports = { renderReportHtml };
