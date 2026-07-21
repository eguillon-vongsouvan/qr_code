const { escapeHtml } = require('./escape-html');
const classSession = require('./class-session');

function renderAdminPage({ error = '', message = '' }, userId = null, currentUsername = '') {
  const sessions = classSession.listClosedSessions();
  
  let msgHtml = '';
  if (error) {
    msgHtml = `<div style="margin-bottom:1.5rem;padding:0.85rem 1.2rem;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.15);border-radius:10px;color:#f87171;font-weight:600;font-size:0.9rem;">${escapeHtml(error)}</div>`;
  } else if (message) {
    msgHtml = `<div style="margin-bottom:1.5rem;padding:0.85rem 1.2rem;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.15);border-radius:10px;color:#34d399;font-weight:600;font-size:0.9rem;">${escapeHtml(message)}</div>`;
  }

  const rows = sessions.map(s => {
    const d = new Date(s.startedAt);
    const dateStr = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR');
    return `
      <tr id="row-${escapeHtml(s.startedAt)}" style="border-bottom: 1px solid var(--border);">
        <td style="padding:0.85rem 0.75rem;color:var(--text-main);font-weight:500;">${escapeHtml(s.cours)}</td>
        <td style="padding:0.85rem 0.75rem;color:var(--text-muted);">${escapeHtml(s.classe)}</td>
        <td style="padding:0.85rem 0.75rem;color:var(--text-muted);">${escapeHtml(s.intervenant)}</td>
        <td style="padding:0.85rem 0.75rem;color:var(--text-muted);font-size:0.85rem;white-space:nowrap;">${escapeHtml(dateStr)}</td>
        <td style="padding:0.85rem 0.75rem;">
          <div style="display:flex;gap:0.35rem;flex-wrap:wrap;align-items:center;">
            <a href="/api/sessions/${encodeURIComponent(s.startedAt)}/export.pdf" title="Télécharger le PDF" style="padding:0.3rem 0.7rem;font-size:0.78rem;font-weight:600;border-radius:6px;text-decoration:none;background:rgba(99,102,241,0.04);color:#818cf8;border:1px solid rgba(99,102,241,0.1);white-space:nowrap;">Télécharger PDF</a>
            <a href="/api/sessions/${encodeURIComponent(s.startedAt)}/export.xlsx" style="padding:0.3rem 0.7rem;font-size:0.78rem;font-weight:600;border-radius:6px;text-decoration:none;background:rgba(16,185,129,0.06);color:#34d399;border:1px solid rgba(16,185,129,0.15);white-space:nowrap;">Excel</a>
            <button class="btn-delete-session" style="padding:0.3rem 0.6rem;font-size:0.78rem;font-weight:600;border-radius:6px;background:transparent;color:var(--text-muted);border:1px solid var(--border);cursor:pointer;transition:all 0.15s;font-family:inherit;" data-session-id="${escapeHtml(s.startedAt)}" title="Supprimer">Supprimer</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const currentSession = classSession.get(userId);
  const sessionHtml = currentSession ? `
    <div style="display:flex;align-items:center;gap:1rem;padding:1rem 1.25rem;background:rgba(16,185,129,0.06);border-radius:12px;border:1px solid rgba(16,185,129,0.15);">
      <div style="width:10px;height:10px;background:#10b981;border-radius:50%;animation:pulse 2s infinite;box-shadow:0 0 8px rgba(16,185,129,0.4);"></div>
      <div style="flex:1;">
        <strong style="color:#34d399;font-size:0.95rem;">${escapeHtml(currentSession.cours)} — ${escapeHtml(currentSession.classe)}</strong>
        <p style="margin:0.15rem 0 0;font-size:0.82rem;color:var(--text-muted);">Intervenant : ${escapeHtml(currentSession.intervenant)}</p>
      </div>
      <a href="/affiche" style="padding:0.4rem 0.85rem;font-size:0.82rem;font-weight:600;border-radius:8px;text-decoration:none;background:var(--primary);color:#fff;transition:all 0.15s;">Voir le QR →</a>
    </div>
  ` : `
    <p style="color:var(--text-muted);margin:0;font-size:0.9rem;">Aucune séance en cours.</p>
  `;

  // Déterminer si l'utilisateur connecté est le SuperAdmin (admini)
  const isSuperAdmin = currentUsername === 'admini';

  return `
    <style>
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    </style>
    <div style="max-width:960px;margin:0 auto;padding:1.5rem 1rem;">
      ${msgHtml}

      <!-- Section QR / Séance -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.5rem;">
        <a href="/seance" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;align-items:center;text-align:center;padding:2rem 1.5rem;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);transition:all 0.2s;cursor:pointer;">
          <div style="width:48px;height:48px;background:var(--primary);border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:0.85rem;box-shadow:0 4px 12px var(--primary-glow);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </div>
          <h3 style="margin:0 0 0.2rem;font-family:var(--font-display);font-weight:700;font-size:1.05rem;color:var(--text-bright);">Générer un QR Code</h3>
          <p style="margin:0;color:var(--text-muted);font-size:0.82rem;">Configurer et lancer une séance</p>
        </a>
        <div style="padding:1.75rem;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);">
          <h3 style="margin:0 0 0.85rem;font-family:var(--font-display);font-weight:700;font-size:1.05rem;color:var(--text-bright);">Séance en cours</h3>
          ${sessionHtml}
        </div>
      </div>

      <!-- Gestion des Comptes -->
      <div style="padding:1.75rem;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:1.5rem;">
        <h2 style="margin:0 0 0.25rem;font-family:var(--font-display);font-size:1.2rem;font-weight:700;color:var(--text-bright);">Comptes Utilisateurs</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 1rem;">Gérer les accès professeurs et administrateurs.</p>
        
        <div style="margin-bottom:1.25rem;">
          ${(function(){
            const db = require('./db');
            const users = db.prepare('SELECT id, username, role FROM users ORDER BY role ASC, username ASC').all();
            if (users.length === 0) return '<p>Aucun compte.</p>';
            return '<div style="display:flex;flex-direction:column;gap:0.4rem;">' + users.map(u => {
              // Pas de bouton supprimer pour : son propre compte, le SuperAdmin, ou les admins si on n'est pas SuperAdmin
              const isCurrentUser = u.id === userId;
              const isSuperAdminAccount = u.username === 'admini';
              const isAdminAccount = u.role === 'admin';
              let showDelete = false;
              if (!isCurrentUser && !isSuperAdminAccount) {
                if (isAdminAccount) {
                  // Seul le SuperAdmin peut supprimer des admins
                  showDelete = isSuperAdmin;
                } else {
                  // Tous les admins peuvent supprimer des profs
                  showDelete = true;
                }
              }
              const youBadge = isCurrentUser ? '<span style="display:inline-block;padding:0.1rem 0.35rem;border-radius:4px;font-size:0.65rem;font-weight:700;margin-left:0.35rem;background:rgba(99,102,241,0.12);color:#818cf8;">VOUS</span>' : '';
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.7rem 1rem;border:1px solid var(--border);border-radius:10px;background:var(--bg-elevated);transition:all 0.15s;" id="user-row-${escapeHtml(u.id)}">
                 <div>
                   <strong style="color:var(--text-main);font-size:0.92rem;">${escapeHtml(u.username)}</strong>${youBadge}
                   <span style="display:inline-block;padding:0.15rem 0.4rem;border-radius:4px;font-size:0.7rem;font-weight:700;text-transform:uppercase;margin-left:0.5rem;background:${u.role==='admin'?'rgba(239,68,68,0.1)':'rgba(99,102,241,0.1)'};color:${u.role==='admin'?'#ef4444':'#6366f1'};">${escapeHtml(u.role)}</span>
                 </div>
                 ${showDelete ? `<button class="btn-delete-user" style="padding:0.3rem 0.7rem;font-size:0.78rem;font-weight:600;border-radius:6px;background:transparent;color:#f87171;border:1px solid rgba(239,68,68,0.2);cursor:pointer;transition:all 0.15s;font-family:inherit;" data-user-id="${escapeHtml(u.id)}">Supprimer</button>` : ''}
               </div>`;
            }).join('') + '</div>';
          })()}
        </div>

        <div style="border-top:1px solid var(--border);padding-top:1.25rem;">
          <h3 style="margin:0 0 0.35rem;font-family:var(--font-display);font-size:0.95rem;font-weight:700;color:var(--text-main);">Ajouter un compte</h3>
          <form action="/admin/users" method="POST" style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
            <input type="text" name="username" placeholder="Identifiant" required style="flex:1;min-width:120px;padding:0.5rem 0.75rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-elevated);color:var(--text-main);font-size:0.85rem;font-family:inherit;" />
            <input type="password" name="password" placeholder="Mot de passe" required style="flex:1;min-width:120px;padding:0.5rem 0.75rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-elevated);color:var(--text-main);font-size:0.85rem;font-family:inherit;" />
            <select name="role" style="padding:0.5rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-elevated);color:var(--text-main);font-size:0.85rem;font-family:inherit;">
              <option value="prof">Professeur</option>
              <option value="admin">Administrateur</option>
            </select>
            <button type="submit" style="padding:0.5rem 1.1rem;font-size:0.85rem;font-weight:600;border-radius:8px;background:var(--primary);color:#fff;border:none;cursor:pointer;transition:all 0.15s;font-family:inherit;">Créer</button>
          </form>
        </div>
      </div>

      <!-- Base de données des classes -->
      <div style="padding:1.75rem;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:1.5rem;">
        <h2 style="margin:0 0 0.25rem;font-family:var(--font-display);font-size:1.2rem;font-weight:700;color:var(--text-bright);">Base de données</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 1rem;">Classes et listes d'élèves enregistrées.</p>
        
        <div style="margin-bottom:1.25rem;">
          ${(function(){
            const classRosters = require('./class-rosters');
            const classes = classRosters.listClasses();
            if (classes.length === 0) return '<p style="color:var(--text-muted);font-size:0.88rem;">Aucune classe importée.</p>';
            return '<div style="display:flex;flex-direction:column;gap:0.4rem;">' + classes.map(c => 
              `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.7rem 1rem;border:1px solid var(--border);border-radius:10px;background:var(--bg-elevated);transition:all 0.15s;" id="class-row-${escapeHtml(c.id)}">
                 <div>
                   <strong style="color:var(--text-main);font-size:0.92rem;">${escapeHtml(c.label)}</strong>
                   <span style="color:var(--text-muted);font-size:0.82rem;margin-left:0.5rem;">${c.count} élève${c.count > 1 ? 's' : ''}</span>
                 </div>
                 <button class="btn-delete-class" style="padding:0.3rem 0.7rem;font-size:0.78rem;font-weight:600;border-radius:6px;background:transparent;color:#f87171;border:1px solid rgba(239,68,68,0.2);cursor:pointer;transition:all 0.15s;font-family:inherit;" data-class-id="${escapeHtml(c.id)}">Supprimer</button>
               </div>`
            ).join('') + '</div>';
          })()}
        </div>

        <div style="border-top:1px solid var(--border);padding-top:1.25rem;">
          <h3 style="margin:0 0 0.35rem;font-family:var(--font-display);font-size:0.95rem;font-weight:700;color:var(--text-main);">Importer une liste</h3>
          <p style="color:var(--text-muted);font-size:0.82rem;margin:0 0 0.75rem;">Fichier CSV (prenom,nom) ou JSON. Le nom du fichier = nom de la classe.</p>
          <form action="/admin/upload" method="POST" enctype="multipart/form-data" style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
            <input type="file" name="classFile" accept=".csv,.json" required style="flex:1;min-width:180px;padding:0.5rem 0.75rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-elevated);color:var(--text-main);font-size:0.85rem;font-family:inherit;" />
            <button type="submit" style="padding:0.5rem 1.1rem;font-size:0.85rem;font-weight:600;border-radius:8px;background:var(--primary);color:#fff;border:none;cursor:pointer;transition:all 0.15s;font-family:inherit;">Importer</button>
          </form>
        </div>
      </div>

      <!-- Historique -->
      <div style="padding:1.75rem;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);">
        <h2 style="margin:0 0 0.25rem;font-family:var(--font-display);font-size:1.2rem;font-weight:700;color:var(--text-bright);">Historique des appels</h2>
        <p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 1rem;">Sessions clôturées et exports.</p>
        ${sessions.length > 0 ? `
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;text-align:left;">
            <thead>
              <tr style="border-bottom:2px solid var(--border);">
                <th style="padding:0.65rem 0.75rem;color:var(--text-muted);font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em;">Cours</th>
                <th style="padding:0.65rem 0.75rem;color:var(--text-muted);font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em;">Classe</th>
                <th style="padding:0.65rem 0.75rem;color:var(--text-muted);font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em;">Intervenant</th>
                <th style="padding:0.65rem 0.75rem;color:var(--text-muted);font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em;">Date</th>
                <th style="padding:0.65rem 0.75rem;color:var(--text-muted);font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
        ` : '<p style="text-align:center;padding:2rem 1rem;color:var(--text-muted);font-size:0.9rem;">Aucun historique pour le moment.</p>'}
      </div>


    </div>
    <script>
      document.querySelectorAll('.btn-delete-session').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var sid = btn.getAttribute('data-session-id');
          if (!confirm('Supprimer cette séance ?')) return;
          fetch('/api/sessions/' + encodeURIComponent(sid), { method: 'DELETE' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (data.ok) {
                var row = document.getElementById('row-' + sid);
                if (row) row.remove();
                else window.location.reload();
              } else { alert('Erreur : ' + (data.error || 'inconnue')); }
            })
            .catch(function() { alert('Erreur de connexion.'); });
        });
      });
      document.querySelectorAll('.btn-delete-session').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const sid = e.target.dataset.sessionId;
          if (!confirm('Supprimer définitivement cette séance et son historique ?')) return;
          try {
            const res = await fetch('/api/sessions/' + encodeURIComponent(sid), { method: 'DELETE' });
            if (res.ok) {
              document.getElementById('row-' + sid).remove();
            } else {
              alert('Erreur lors de la suppression');
            }
          } catch (err) {
            console.error(err);
            alert('Erreur réseau');
          }
        });
      });

      document.querySelectorAll('.btn-delete-class').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const cid = e.target.dataset.classId;
          if (!confirm('Supprimer cette classe et tous ses élèves ?')) return;
          try {
            const res = await fetch('/api/classes/' + encodeURIComponent(cid), { method: 'DELETE' });
            if (res.ok) {
              const el = document.getElementById('class-row-' + cid);
              if (el) el.remove();
            } else {
              alert('Erreur lors de la suppression');
            }
          } catch (err) {
            console.error(err);
            alert('Erreur réseau');
          }
        });
      });

      document.querySelectorAll('.btn-delete-user').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const uid = e.target.dataset.userId;
          if (!confirm('Supprimer cet utilisateur ?')) return;
          try {
            const res = await fetch('/api/users/' + encodeURIComponent(uid), { method: 'DELETE' });
            if (res.ok) {
              const el = document.getElementById('user-row-' + uid);
              if (el) el.remove();
            } else {
              alert('Erreur lors de la suppression (impossible de supprimer le dernier admin).');
            }
          } catch (err) {
            console.error(err);
            alert('Erreur réseau');
          }
        });
      });
    </script>
  `;
}

module.exports = { renderAdminPage };
