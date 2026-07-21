const { escapeHtml } = require('./escape-html');

const THEME_CSS = '/static/css/theme.css';
const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com" />' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />' +
  '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lexend:wght@600;700;800&display=swap" rel="stylesheet" />';

const IMG = {
  logo: '/static/img/guardia.jpg',
};

function textureLayers() {
  return `<div class="tex-layer tex-grid" aria-hidden="true"></div>`;
}

function themeHead(title) {
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  ${FONTS}
  <link rel="stylesheet" href="${THEME_CSS}" />
  <link rel="icon" type="image/png" href="${IMG.logo}" />`;
}

const ICONS = {
  seance: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  qr: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M7 7h.01"/><path d="M17 7h.01"/><path d="M17 17h.01"/><path d="M7 17h.01"/></svg>',
  history: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>',
  logout: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};

function pageHeader({ title, subtitle, isTeacher = false, isAdmin = false }) {
  const sub = subtitle ? `<p>${escapeHtml(subtitle)}</p>` : '';
  const adminLink = isAdmin ? `<a href="/admin" class="nav-link" style="color: var(--secondary);">${ICONS.history}<span>Admin</span></a>` : '';
  const badgeText = isAdmin ? 'Administrateur' : 'Professeur';
  const nav = isTeacher ? `
    <nav class="header-nav">
      <div class="nav-links">
        ${adminLink}
        <a href="/affiche" class="nav-link">${ICONS.seance}<span>Séance</span></a>
      </div>
      <div class="nav-divider"></div>
      <div class="user-profile">
        <span class="user-badge">${badgeText}</span>
        <a href="/logout" class="btn-logout" title="Déconnexion">${ICONS.logout}</a>
      </div>
    </nav>
  ` : '';
  return `<header class="site-header">
    <div class="site-header-content">
      <img class="site-logo" src="${IMG.logo}" alt="Logo" width="64" height="64" />
      <div class="site-header-text">
        <h1>${escapeHtml(title)}</h1>
        ${sub}
      </div>
    </div>
    ${nav}
  </header>`;
}

/** Sommaire : liens ancres (#) ou pages (/). */
function sommaireNav(items) {
  if (!items || !items.length) return '';
  const lis = items
    .map(
      (it) =>
        `<li><a href="${escapeHtml(it.href)}">${escapeHtml(it.label)}</a></li>`
    )
    .join('');
  return `<nav class="sommaire" aria-label="Sommaire">
    <p class="sommaire-title">Navigation</p>
    <ol class="sommaire-list">${lis}</ol>
  </nav>`;
}

function presenceSidebarHtml({ emptyHint }) {
  const hint =
    emptyHint ||
    'La liste se met à jour automatiquement quand un élève émerge.';
  return `<aside class="app-sidebar" aria-label="Personnes connectées">
    <div class="sidebar-head">
      <h2>Présences</h2>
      <span class="presence-count" id="presence-count">0</span>
    </div>
    <p class="sidebar-hint">Mise à jour en temps réel.</p>
    <p class="presence-empty" id="presence-empty" hidden>${escapeHtml(hint)}</p>
    <ul class="presence-list" id="presence-list"></ul>
  </aside>`;
}

function sidebarScript(initCode) {
  return `<script src="/static/js/presence-sidebar.js"></script>
  <script>${initCode}</script>`;
}

/**
 * Mise en page : contenu principal + barre latérale éloignée + sommaire optionnel.
 */
function layoutAppPage({
  title,
  headerTitle,
  headerSubtitle,
  bodyHtml,
  extraClass = '',
  sommaireItems = null,
  withSidebar = false,
  sidebarInit = 'initPresenceSidebar({ apiPath: "/api/presence" });',
  sidebarEmptyHint,
  isTeacher = false,
  isAdmin = false,
}) {
  const header = pageHeader({
    title: headerTitle || title,
    subtitle: headerSubtitle || '',
    isTeacher,
    isAdmin,
  });
  const sommaire = sommaireNav(sommaireItems);
  const sidebar = withSidebar
    ? presenceSidebarHtml({ emptyHint: sidebarEmptyHint }) +
      sidebarScript(sidebarInit)
    : '';

  const bodyClass = [
    withSidebar ? 'has-sidebar' : 'layout-single',
    extraClass,
  ]
    .filter(Boolean)
    .join(' ');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  ${themeHead(title)}
</head>
<body class="${bodyClass}">
  ${textureLayers()}
  <div class="app-shell">
    <div class="app-main">
      ${header}
      ${sommaire}
      ${bodyHtml}
    </div>
    ${sidebar}
  </div>
</body>
</html>`;
}

function layoutPage(opts) {
  return layoutAppPage({ ...opts, withSidebar: false, sommaireItems: null });
}

module.exports = {
  IMG,
  THEME_CSS,
  FONTS,
  themeHead,
  textureLayers,
  pageHeader,
  sommaireNav,
  presenceSidebarHtml,
  layoutAppPage,
  layoutPage,
};
