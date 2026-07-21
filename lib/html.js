const { escapeHtml } = require('./escape-html');
const { layoutPage } = require('./ui-shell');

function errorPage(title, message) {
  return layoutPage({
    title,
    headerTitle: title,
    headerSubtitle: 'Une erreur est survenue',
    extraClass: 'result-page',
    bodyHtml: `
    <div class="result-main">
      <div class="result-card panel">
        <div class="result-icon err" aria-hidden="true">✕</div>
        <p>${message}</p>
        <p style="margin-top:1.25rem;"><a class="btn-ghost" href="javascript:history.back()">← Retour au choix du prénom</a></p>
      </div>
    </div>`,
  });
}

function presenceSuccessPage(prenom, nom, sessionMeta = null) {
  const fullName = `${escapeHtml(prenom)} ${escapeHtml(nom)}`;
  const time = new Date().toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const sessionBlock = sessionMeta
    ? `<p class="success-session">${escapeHtml(sessionMeta)}</p>`
    : `<p class="success-session" id="success-session" hidden></p>`;

  return layoutPage({
    title: `Présence enregistrée — ${fullName}`,
    headerTitle: 'C’est bon !',
    headerSubtitle: 'Vous pouvez ranger votre téléphone',
    extraClass: 'result-page page-mobile-success',
    bodyHtml: `
    <link rel="stylesheet" href="/static/css/mobile-emarger.css" />
    <ol class="mobile-steps" aria-label="Étapes">
      <li class="is-done">1 · Scan</li>
      <li class="is-done">2 · Identité</li>
      <li class="is-active">3 · Confirmé</li>
    </ol>
    <div class="result-main">
      <div class="result-card panel success-hero">
        <div class="success-check" aria-hidden="true">✓</div>
        <p class="hint" style="margin:0;text-transform:uppercase;letter-spacing:0.1em;font-size:0.72rem;font-weight:700;">Présence enregistrée</p>
        <p class="success-name">${fullName}</p>
        <p style="color:var(--success);font-weight:600;margin:0;">Merci, votre émargement est validé.</p>
        <p class="success-hint">${escapeHtml(time)}</p>
        ${sessionBlock}
      </div>
    </div>
    <script>
      fetch('/api/class-session', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (s) {
          if (!s || !s.cours) return;
          var el = document.getElementById('success-session');
          if (!el) return;
          el.hidden = false;
          el.textContent = s.cours + ' · ' + (s.classe || '') + ' · ' + (s.intervenant || '');
        })
        .catch(function () {});
    </script>`,
  });
}

module.exports = { escapeHtml, errorPage, presenceSuccessPage, layoutPage };
