const { escapeHtml } = require('./escape-html');
const classRosters = require('./class-rosters');

function flowSteps(activeStep) {
  const items = [
    { n: 1, label: 'Configuration', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' },
    { n: 2, label: 'Code QR', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>' },
  ];
  const parts = [];
  items.forEach((item, i) => {
    if (i > 0) parts.push('<span class="flow-connector" aria-hidden="true"></span>');
    const cls = [
      'flow-step',
      item.n === activeStep ? 'is-active' : '',
      item.n < activeStep ? 'is-done' : '',
    ].filter(Boolean).join(' ');
    
    parts.push(`<div class="${cls}">
      <span class="flow-step-num">${item.icon}</span>
      <span class="flow-step-label">${escapeHtml(item.label)}</span>
    </div>`);
  });
  return `<nav class="flow-steps" aria-label="Étapes de la séance">${parts.join('')}</nav>`;
}

function classSelectField(currentClasse) {
  const classes = classRosters.listClasses();
  const options = classes
    .map(
      (c) =>
        `<option value="${escapeHtml(c.label)}"${currentClasse === c.label ? ' selected' : ''}>${escapeHtml(c.label)} (${c.count} élèves)</option>`
    )
    .join('');
  return `<div class="field-box">
    <label for="classe">
      <span class="field-icon" aria-hidden="true"></span>
      Classe
    </label>
    <div class="input-wrapper">
      <select class="field-input field-select" id="classe" name="classe" required>
        <option value="" disabled${currentClasse ? '' : ' selected'}>Choisir une classe…</option>
        ${options}
        <option value="__autre__"${currentClasse && !classes.some((c) => c.label === currentClasse) ? ' selected' : ''}>Autre (saisie libre)</option>
      </select>
    </div>
    <input class="field-input field-input--alt" type="text" id="classe-autre" name="classe_autre" maxlength="80"
      placeholder="Nom de classe personnalisé" value="${escapeHtml(
        currentClasse && !classes.some((c) => c.label === currentClasse) ? currentClasse : ''
      )}" hidden>
  </div>`;
}

function field(name, label, placeholder, value, icon, maxLength = 120) {
  return `<div class="field-box">
    <label for="${name}">
      <span class="field-icon" aria-hidden="true">${icon}</span>
      ${escapeHtml(label)}
    </label>
    <div class="input-wrapper">
      <input class="field-input" type="text" id="${name}" name="${name}" required maxlength="${maxLength}"
        placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}"
        ${name === 'cours' ? 'autofocus' : ''}>
    </div>
  </div>`;
}

function renderSeanceSetupBody({ current = {}, error = '', publicMode = false }) {
  const v = (k) => current[k] || '';
  const errBlock = error
    ? `<div class="form-error" role="alert"><span class="error-icon">⚠️</span> ${escapeHtml(error)}</div>`
    : '';
  const modeBadge = '';

  return `
  ${flowSteps(1)}
  <div class="seance-layout">
    <div class="seance-card seance-card--form">
      <div class="seance-card-head">
        <div>
          <h2 class="seance-title">Paramètres du cours</h2>
          <p class="seance-subtitle">Préparez l'appel pour votre classe</p>
        </div>
        ${modeBadge}
      </div>
      ${errBlock}
      <form class="form-stack" action="/seance" method="post">
        ${field('cours', 'Nom du Cours', 'Ex. Cybersécurité - Réseaux', v('cours'), '')}
        ${classSelectField(v('classe'))}
        ${field('intervenant', 'Enseignant', 'Ex. Jean Dupont', v('intervenant'), '', 80)}
        <div class="field-box">
          <label for="late_threshold">
            <span class="field-icon" aria-hidden="true">⏱️</span>
            Tolérance de retard (minutes)
          </label>
          <div class="input-wrapper">
            <input class="field-input" type="number" id="late_threshold" name="late_threshold" min="0" max="180" step="1" placeholder="Ex. 15 (0 pour désactiver)" value="${v('late_threshold') || ''}">
          </div>
        </div>
        <button type="submit" class="btn-primary btn-green btn-wide">
          Démarrer l'appel
          <span class="btn-arrow" aria-hidden="true">→</span>
        </button>
      </form>
    </div>
    <aside class="seance-card seance-card--preview" aria-live="polite">
      <h3 class="preview-title">Aperçu de l'appel</h3>
      <div class="preview-content">
        <div class="preview-hero">
          <span class="preview-label">COURS</span>
          <p id="preview-cours" class="preview-v">${escapeHtml(v('cours') || 'Non défini')}</p>
        </div>
        <div class="preview-grid">
          <div class="preview-item">
            <span class="preview-label">CLASSE</span>
            <p id="preview-classe" class="preview-v">${escapeHtml(v('classe') || '—')}</p>
          </div>
          <div class="preview-item">
            <span class="preview-label">PROFESSEUR</span>
            <p id="preview-intervenant" class="preview-v">${escapeHtml(v('intervenant') || '—')}</p>
          </div>
        </div>
      </div>
    </aside>
  </div>
  <script>
    (function () {
      var map = {
        cours: 'preview-cours',
        classe: 'preview-classe',
        intervenant: 'preview-intervenant'
      };
      var defaults = { cours: 'Non défini', classe: '—', intervenant: '—' };
      Object.keys(map).forEach(function (id) {
        var input = document.getElementById(id);
        var out = document.getElementById(map[id]);
        if (!input || !out) return;
        function sync() {
          var val = input.value.trim();
          if (id === 'classe' && val === '__autre__') {
            var alt = document.getElementById('classe-autre');
            val = alt ? alt.value.trim() : '';
          }
          out.textContent = val || defaults[id];
        }
        input.addEventListener('input', sync);
        input.addEventListener('change', sync);
      });
      var sel = document.getElementById('classe');
      var alt = document.getElementById('classe-autre');
      if (sel && alt) {
        function toggleAlt() {
          var other = sel.value === '__autre__';
          alt.hidden = !other;
          alt.required = other;
          if (other) alt.focus();
        }
        sel.addEventListener('change', toggleAlt);
        toggleAlt();
      }
    })();
  </script>`;
}

function renderSeanceQrBody({ session, baseUrl, windowMs, publicMode = false }) {
  const testUrl = `${baseUrl}/test`;
  const modeBadge = '';
  const networkHint = '';

  return `
  ${flowSteps(2)}
  <div class="qr-layout">
    <div class="qr-info-panel">
      <div class="qr-info-head">
        <h2 class="qr-info-title">${escapeHtml(session.cours)}</h2>
        ${modeBadge}
      </div>
      ${networkHint}
      <div class="qr-info-grid">
        <div class="qr-info-item">
          <span class="qr-info-label">CLASSE</span>
          <p class="qr-info-v">${escapeHtml(session.classe)}</p>
        </div>
        <div class="qr-info-item">
          <span class="qr-info-label">PROFESSEUR</span>
          <p class="qr-info-v">${escapeHtml(session.intervenant)}</p>
        </div>
      </div>
      <div class="qr-info-footer">
        <a class="btn-ghost" href="/seance">Modifier</a>
      </div>
      <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-direction: column;">
        <button id="btn-finish" onclick="endSession()" style="display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;padding:0.75rem 1rem;border-radius:10px;background:rgba(239,68,68,0.08);color:#f87171;border:1px solid rgba(239,68,68,0.18);cursor:pointer;font-weight:600;font-size:0.9rem;font-family:inherit;transition:all 0.15s;letter-spacing:0.01em;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 9l6 6M15 9l-6 6"/></svg>
          Clôturer la séance
        </button>
      </div>
    </div>
    
    <div class="qr-stage" id="affiche-qr">
      <div class="qr-stage-main">
        <div class="qr-frame">
          <img id="qr" class="qr-img" alt="QR code séance" width="360" height="360">
          <div class="qr-overlay">
            <span class="qr-timer-ring" id="sec">45</span>
          </div>
        </div>
        <div class="qr-status-bar">
          <p class="qr-status-text">Scannez pour émarger</p>
          <div class="qr-progress-track">
            <div class="qr-progress-bar" id="qr-progress"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
    (function () {
      var img = document.getElementById('qr');
      var secEl = document.getElementById('sec');
      var prog = document.getElementById('qr-progress');
      var WINDOW = ${windowMs};
      function refreshQr() {
        img.src = '/qr-session.png?_=' + Date.now();
        img.onload = function() { img.classList.add('loaded'); };
      }
      function update() {
        var elapsed = Date.now() % WINDOW;
        var left = Math.ceil((WINDOW - elapsed) / 1000);
        var pct = (elapsed / WINDOW) * 100;
        secEl.textContent = left;
        if (prog) prog.style.width = pct + '%';
        if (left <= 1) refreshQr();
      }
      refreshQr();
      setInterval(update, 100);
      setInterval(refreshQr, WINDOW);
      
      var btnFinish = document.getElementById('btn-finish');

      function endSession() {
        if (!confirm("Clôturer la séance ? Le PDF et l'Excel seront générés automatiquement.")) return;
        btnFinish.disabled = true;
        btnFinish.textContent = 'Clôture en cours...';
        fetch('/api/sessions/${session.startedAt}/close', { method: 'POST' })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.ok || data.error === 'Session introuvable') {
              window.location.href = '/admin';
            } else {
              alert('Erreur lors de la clôture.');
              btnFinish.disabled = false;
              btnFinish.textContent = 'Clôturer la séance';
            }
          })
          .catch(function() {
            alert('Erreur de connexion.');
            btnFinish.disabled = false;
          });
      }

      if (btnFinish) btnFinish.addEventListener('click', endSession);
    })();
  </script>`;
}

module.exports = { renderSeanceSetupBody, renderSeanceQrBody };
