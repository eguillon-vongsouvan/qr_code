/**
 * Rafraîchit la liste des présents dans .app-sidebar
 * opts: { getUrl: () => string | null, intervalMs?: number }
 */
window.initPresenceSidebar = function initPresenceSidebar(opts) {
  const listEl = document.getElementById('presence-list');
  const countEl = document.getElementById('presence-count');
  const emptyEl = document.getElementById('presence-empty');
  if (!listEl) return;

  const getUrl =
    opts && typeof opts.getUrl === 'function'
      ? opts.getUrl
      : () => (opts && opts.apiPath) || '/api/presence';
  const intervalMs = (opts && opts.intervalMs) || 2500;

  function formatTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '';
    }
  }

  function label(row) {
    if (row.student_name) return row.student_name;
    if (row.prenom || row.nom) return [row.prenom, row.nom].filter(Boolean).join(' ');
    return row.student_id || row.email || 'Élève';
  }

  function sub(row) {
    if (row.email && row.student_name !== row.email) return row.email;
    if (row.auth === 'google') return 'Google';
    return row.room || '';
  }

  async function refresh() {
    const url = getUrl();
    if (!url) {
      listEl.innerHTML = '';
      if (countEl) countEl.textContent = '0';
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Démarrez une session pour voir les connectés.';
      }
      listEl.innerHTML = '';
      return;
    }

    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('fetch');
      const data = await r.json();
      const rows = Array.isArray(data) ? data : [];

      if (countEl) countEl.textContent = String(rows.length);
      if (emptyEl) emptyEl.hidden = rows.length > 0;

      listEl.innerHTML = rows
        .map(
          (row) =>
            `<li class="presence-item">
              <span class="presence-dot" aria-hidden="true"></span>
              <div class="presence-meta">
                <span class="presence-name">${escapeHtml(label(row))}</span>
                <span class="presence-sub">${escapeHtml(sub(row))} · ${formatTime(row.at)}</span>
              </div>
            </li>`
        )
        .join('');
    } catch (_) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Impossible de charger la liste.';
      }
    }
  }

  function escapeHtml(t) {
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  refresh();
  return setInterval(refresh, intervalMs);
};
