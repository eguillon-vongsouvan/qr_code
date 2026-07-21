/**
 * Émargement par QR — local (Wi-Fi) ou Internet (PUBLIC_URL).
 */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const db = require('./lib/db');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const { getAllLocalIps } = require('./lib/get-local-ip');
const { getBaseUrl, isPublicMode, isHttpsPublicUrl } = require('./lib/base-url');
const {
  buildStudentToken,
  buildSessionToken,
  verifyStudentQuery,
  verifySessionQuery,
  secondsUntilNextWindow,
  WINDOW_MS,
} = require('./lib/qr-token');
const nonceStore = require('./lib/nonce-store');
const { getGeofenceConfig, insideGeofence } = require('./lib/geo');
const { emargerFormPage } = require('./lib/emarger-page');
const { escapeHtml, errorPage, presenceSuccessPage } = require('./lib/html');
const { layoutAppPage, layoutPage } = require('./lib/ui-shell');
const presenceLog = require('./lib/presence-log');
const classSession = require('./lib/class-session');
const classRosters = require('./lib/class-rosters');
const { buildAttendancePdf } = require('./lib/pdf-export');
const { buildReport, toExportRows } = require('./lib/attendance-report');
const { renderReportHtml } = require('./lib/report-page');
const {
  renderSeanceSetupBody,
  renderSeanceQrBody,
} = require('./lib/seance-pages');
const { renderAdminPage } = require('./lib/admin-page');
const multer = require('multer');
const { isPasswordPwned } = require('./lib/password-check');

// Configuration multer pour l'upload de fichiers
const upload = multer({ dest: path.join(__dirname, 'data', 'classes') });

const app = express();

// --- Configuration Sécurité ---
const QR_SECRET = process.env.QR_SECRET;
if (!QR_SECRET) {
  console.error('[FATAL] La variable QR_SECRET n\'est pas définie dans le .env. Le serveur refuse de démarrer.');
  process.exit(1);
}
const COOKIE_SECRET_ENV = process.env.COOKIE_SECRET;
if (!COOKIE_SECRET_ENV) {
  console.error('[FATAL] La variable COOKIE_SECRET n\'est pas définie dans le .env. Le serveur refuse de démarrer.');
  process.exit(1);
}
const ENCRYPTION_KEY_ENV = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY_ENV || ENCRYPTION_KEY_ENV.length < 32) {
  console.error('[FATAL] ENCRYPTION_KEY (32+ caractères) requis dans .env pour chiffrer la BDD et les logs.');
  process.exit(1);
}
const cookieSecure = isHttpsPublicUrl();

// Validation UUID pour prévenir les attaques IDOR
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/;
function isValidId(id) {
  return typeof id === 'string' && (UUID_RE.test(id) || ISO_DATE_RE.test(id));
}

// 1. Protection des en-têtes HTTP avec Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "blob:"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "upgrade-insecure-requests": null,
    },
  },
  strictTransportSecurity: cookieSecure,
}));

app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// 2. Limiteurs de débit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de requêtes, veuillez réessayer plus tard.',
});

const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Trop de tentatives. Attendez une minute.',
});

app.set('trust proxy', 1);
app.use(cookieParser(COOKIE_SECRET_ENV));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Middleware d'authentification global avec Session Token
function authMiddleware(req, res, next) {
  const token = req.signedCookies.session_token;
  if (token) {
    const session = db.prepare('SELECT user_id, expires_at FROM user_sessions WHERE token = ?').get(token);
    if (session && new Date(session.expires_at) > new Date()) {
      const user = db.prepare('SELECT username, role, force_password_change FROM users WHERE id = ?').get(session.user_id);
      if (user) {
        req.userRole = user.role;
        req.userId = session.user_id;
        req.username = user.username;
        
        // Check for forced password change
        if (user.force_password_change) {
          if (req.path !== '/change-password' && req.path !== '/logout' && !req.path.startsWith('/api/')) {
            return res.redirect('/change-password');
          }
          if (req.path.startsWith('/api/') && req.path !== '/api/change-password') {
             return res.status(403).json({ error: 'Changement de mot de passe requis' });
          }
        }
        
        return next();
      }
    }
  }
  if (req.xhr || req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  res.redirect('/login');
}

// Middleware admin
function adminMiddleware(req, res, next) {
  if (req.userRole === 'admin') {
    return next();
  }
  if (req.xhr || req.path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  res.redirect(profHomePath());
}

/** Page d'accueil professeur : configuration / génération de QR. */
function profHomePath(userId) {
  return classSession.get(userId) ? '/affiche' : '/seance';
}

/** Redirection après connexion selon le rôle. */
function postLoginPath(role, userId) {
  if (role === 'admin') return '/admin';
  return profHomePath(userId);
}

// Routes publiques
app.use('/static/css', express.static(path.join(__dirname, 'static/css')));
app.use('/static/img', express.static(path.join(__dirname, 'static/img')));
app.use('/static/js', express.static(path.join(__dirname, 'static/js')));
// scan_result.html est public pour les élèves
app.get('/static/scan_result.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'static/scan_result.html'));
});

function showLoginPage(req, res) {
  let role = null;
  const token = req.signedCookies.session_token;
  if (token) {
    const session = db.prepare('SELECT user_id, expires_at FROM user_sessions WHERE token = ?').get(token);
    if (session && new Date(session.expires_at) > new Date()) {
      const user = db.prepare('SELECT role FROM users WHERE id = ?').get(session.user_id);
      if (user) {
        role = user.role;
      }
    }
  }

  if (role === 'admin') return res.redirect('/admin');
  if (role === 'prof') return res.redirect(profHomePath(session.user_id));

  res.send(layoutPage({
    title: 'Connexion — Émargement QR',
    headerTitle: 'Émargement QR',
    headerSubtitle: 'Connexion sécurisée',
    bodyHtml: `
      <div style="display: flex; justify-content: center; align-items: center; min-height: 60vh;">
        <div class="panel" style="width: 100%; max-width: 420px; padding: 2.5rem; border-radius: var(--radius); box-shadow: var(--shadow-xl);">
          
          <div style="text-align: center; margin-bottom: 2rem;">
            <div style="width: 64px; height: 64px; background: var(--primary); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1rem; box-shadow: 0 8px 16px rgba(99, 102, 241, 0.25);">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0 0 0.25rem; font-weight: 800; color: var(--text-main);">Bienvenue</h2>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0;">Connectez-vous pour accéder à l'application</p>
          </div>

          <form action="/login" method="POST">
            <div style="margin-bottom: 1.25rem;">
              <label for="username" style="display:block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem; color: var(--text-main);">Identifiant</label>
              <input type="text" id="username" name="username" autofocus required placeholder="Votre identifiant" autocomplete="username" style="width:100%; padding: 0.85rem 1rem; border-radius: 10px; border: 1.5px solid var(--border); font-size: 1rem; background: #f8fafc; color: #000000; transition: all 0.2s;">
            </div>
            <div style="margin-bottom: 2rem;">
              <label for="password" style="display:block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem; color: var(--text-main);">Mot de passe</label>
              <input type="password" id="password" name="password" required placeholder="••••••••" autocomplete="current-password" style="width:100%; padding: 0.85rem 1rem; border-radius: 10px; border: 1.5px solid var(--border); font-size: 1rem; background: #f8fafc; color: #000000; transition: all 0.2s;">
            </div>
            <button type="submit" class="btn-primary" style="width:100%; padding: 0.9rem; font-size: 1rem; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.05em;">Se connecter →</button>
            ${req.query.err ? `<p style="color: #dc2626; margin-top: 1.25rem; text-align: center; font-weight: 600; background: #fef2f2; padding: 0.75rem; border-radius: 10px; border: 1px solid #fecaca; font-size: 0.9rem;">Identifiant ou mot de passe incorrect.</p>` : ''}
          </form>
        </div>
      </div>
    `
  }));
}

app.get('/', showLoginPage);
app.get('/login', showLoginPage);

async function handleLogin(req, res) {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (user && bcrypt.compareSync(password, user.password_hash)) {
    console.log(`[AUTH] Connexion réussie pour: ${username} (rôle: ${user.role})`);
    
    // Nettoyer les anciennes sessions
    db.prepare('DELETE FROM user_sessions WHERE expires_at < ?').run(new Date().toISOString());

    // Créer un nouveau token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString(); // 24h
    db.prepare('INSERT INTO user_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(token, user.id, new Date().toISOString(), expiresAt);

    res.cookie('session_token', token, {
      httpOnly: true,
      signed: true,
      secure: cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 3600000 // 24h
    });
    const { logEvent } = require('./lib/logger');
    logEvent(user.id, 'LOGIN', { ip: req.socket.remoteAddress });

    if (user.force_password_change) {
      return res.redirect('/change-password');
    }
    return res.redirect(postLoginPath(user.role, user.id));
  }

  console.warn(`[AUTH] Échec de connexion - User: ${username}`);
  const { logEvent } = require('./lib/logger');
  logEvent(null, 'LOGIN_FAILED', { username, ip: req.socket.remoteAddress });
  return res.redirect('/login?err=1');
}

app.post('/', handleLogin);
app.post('/login', handleLogin);

app.get('/logout', (req, res) => {
  const token = req.signedCookies.session_token;
  let userId;
  if (token) {
    const session = db.prepare('SELECT user_id FROM user_sessions WHERE token = ?').get(token);
    if (session) userId = session.user_id;
    db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
  }
  res.clearCookie('session_token', {
    signed: true,
    path: '/',
    secure: cookieSecure,
    sameSite: 'lax',
  });
  if (userId && classSession.get(userId)) {
    const closed = classSession.close(userId);
    if (closed && closed.startedAt) {
      emitSessionEvent(closed.startedAt, 'session_closed', { closed_at: closed.closedAt });
    }
  }
  res.redirect('/login');
});

// Route changement de mot de passe obligatoire
app.get('/change-password', (req, res) => {
  const token = req.signedCookies.session_token;
  if (!token) return res.redirect('/login');
  
  const session = db.prepare('SELECT user_id, expires_at FROM user_sessions WHERE token = ?').get(token);
  if (!session || new Date(session.expires_at) <= new Date()) return res.redirect('/login');
  
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(session.user_id);
  
  res.send(layoutPage({
    title: 'Nouveau mot de passe',
    headerTitle: 'Sécurité du compte',
    headerSubtitle: 'Changement obligatoire',
    bodyHtml: `
      <div style="display: flex; justify-content: center; align-items: center; min-height: 60vh;">
        <div class="panel" style="width: 100%; max-width: 420px; padding: 2.5rem; border-radius: var(--radius); box-shadow: var(--shadow-xl);">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <h2 style="font-family: var(--font-display); font-size: 1.5rem; margin: 0 0 0.5rem; font-weight: 800; color: var(--text-main);">Mettre à jour votre mot de passe</h2>
            <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0;">Par mesure de sécurité, veuillez définir un nouveau mot de passe fort.</p>
          </div>
          
          <form action="/change-password" method="POST" id="pwdForm">
            <div style="margin-bottom: 1.25rem;">
              <label for="old_password" style="display:block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem; color: var(--text-main);">Ancien mot de passe</label>
              <input type="password" id="old_password" name="old_password" required placeholder="Mot de passe actuel" style="width:100%; padding: 0.85rem 1rem; border-radius: 10px; border: 1.5px solid var(--border); font-size: 1rem; background: #f8fafc; color: #000000;">
            </div>
            <div style="margin-bottom: 1.25rem;">
              <label for="new_password" style="display:block; margin-bottom: 0.5rem; font-weight: 600; font-size: 0.9rem; color: var(--text-main);">Nouveau mot de passe</label>
              <input type="password" id="new_password" name="new_password" required placeholder="8+ caractères, 1 Maj, 1 Min, 1 chiffre, 1 spécial" style="width:100%; padding: 0.85rem 1rem; border-radius: 10px; border: 1.5px solid var(--border); font-size: 1rem; background: #f8fafc; color: #000000;">
              
              <ul style="margin: 0.75rem 0 0 0; padding-left: 1.2rem; font-size: 0.8rem; color: var(--text-muted); list-style-type: none; padding: 0;" id="pwdRules">
                <li id="rule-len">❌ Au moins 8 caractères</li>
                <li id="rule-upper">❌ Au moins 1 majuscule</li>
                <li id="rule-lower">❌ Au moins 1 minuscule</li>
                <li id="rule-num">❌ Au moins 1 chiffre</li>
                <li id="rule-spec">❌ Au moins 1 caractère spécial (@$!%*?&._-)</li>
              </ul>
            </div>
            
            <button type="submit" id="btnSubmit" class="btn-primary" style="width:100%; padding: 0.9rem; font-size: 1rem; border-radius: 10px; opacity: 0.5; pointer-events: none;">Changer le mot de passe</button>
            ${req.query.err ? `<p style="color: #dc2626; margin-top: 1.25rem; text-align: center; font-weight: 600; background: #fef2f2; padding: 0.75rem; border-radius: 10px; border: 1px solid #fecaca; font-size: 0.9rem;">${escapeHtml(req.query.err)}</p>` : ''}
          </form>
          
          <script>
            const pwd = document.getElementById('new_password');
            const btn = document.getElementById('btnSubmit');
            const rLen = document.getElementById('rule-len');
            const rUpper = document.getElementById('rule-upper');
            const rLower = document.getElementById('rule-lower');
            const rNum = document.getElementById('rule-num');
            const rSpec = document.getElementById('rule-spec');
            
            pwd.addEventListener('input', () => {
              const v = pwd.value;
              let ok = 0;
              
              if(v.length >= 8) { rLen.textContent = '✅ Au moins 8 caractères'; rLen.style.color = '#16a34a'; ok++; }
              else { rLen.textContent = '❌ Au moins 8 caractères'; rLen.style.color = 'var(--text-muted)'; }
              
              if(/[A-Z]/.test(v)) { rUpper.textContent = '✅ Au moins 1 majuscule'; rUpper.style.color = '#16a34a'; ok++; }
              else { rUpper.textContent = '❌ Au moins 1 majuscule'; rUpper.style.color = 'var(--text-muted)'; }
              
              if(/[a-z]/.test(v)) { rLower.textContent = '✅ Au moins 1 minuscule'; rLower.style.color = '#16a34a'; ok++; }
              else { rLower.textContent = '❌ Au moins 1 minuscule'; rLower.style.color = 'var(--text-muted)'; }
              
              if(/[0-9]/.test(v)) { rNum.textContent = '✅ Au moins 1 chiffre'; rNum.style.color = '#16a34a'; ok++; }
              else { rNum.textContent = '❌ Au moins 1 chiffre'; rNum.style.color = 'var(--text-muted)'; }
              
              if(/[@$!%*?&._-]/.test(v)) { rSpec.textContent = '✅ Au moins 1 caractère spécial (@$!%*?&._-)'; rSpec.style.color = '#16a34a'; ok++; }
              else { rSpec.textContent = '❌ Au moins 1 caractère spécial (@$!%*?&._-)'; rSpec.style.color = 'var(--text-muted)'; }
              
              if(ok === 5) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
              } else {
                btn.style.opacity = '0.5';
                btn.style.pointerEvents = 'none';
              }
            });
          </script>
        </div>
      </div>
    `
  }));
});

app.post('/change-password', async (req, res) => {
  const token = req.signedCookies.session_token;
  if (!token) return res.redirect('/login');
  
  const session = db.prepare('SELECT user_id, expires_at FROM user_sessions WHERE token = ?').get(token);
  if (!session || new Date(session.expires_at) <= new Date()) return res.redirect('/login');
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  if (!user) return res.redirect('/login');
  
  const oldPwd = req.body.old_password;
  const newPwd = req.body.new_password;
  
  if (!bcrypt.compareSync(oldPwd, user.password_hash)) {
    return res.redirect("/change-password?err=L'ancien mot de passe est incorrect.");
  }
  
  // Validation côté serveur au cas où JS est désactivé ou contourné
  const isComplex = newPwd.length >= 8 && /[A-Z]/.test(newPwd) && /[a-z]/.test(newPwd) && /[0-9]/.test(newPwd) && /[@$!%*?&._-]/.test(newPwd);
  if (!isComplex) {
    return res.redirect('/change-password?err=Le nouveau mot de passe ne respecte pas les critères de sécurité.');
  }
  
  if (await isPasswordPwned(newPwd)) {
    return res.redirect('/change-password?err=Ce mot de passe a été détecté dans une fuite de données connue. Par sécurité, veuillez en choisir un autre.');
  }
  
  const { logEvent } = require('./lib/logger');
  
  db.prepare('UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?')
    .run(bcrypt.hashSync(newPwd, 10), user.id);
    
  logEvent(user.id, 'PASSWORD_CHANGE', { msg: 'Utilisateur a défini son mot de passe' });
    
  res.redirect(postLoginPath(user.role));
});

// Appliquer le rate limit
app.use('/api/', apiLimiter);
app.use('/emarger', scanLimiter);
app.use('/presence', scanLimiter);

// --- Rapports Publics (sans auth) ---
app.get('/rapport/:sessionId', (req, res) => {
  const current = getCurrentSession();
  if (!current || current.startedAt !== req.params.sessionId) {
    return res.status(404).send(errorPage('Session introuvable', 'Cette session n\'existe pas ou a expiré.'));
  }
  res.send(renderReportHtml({ session: current, sessionId: req.params.sessionId }));
});

app.get('/rapport/:sessionId/csv', (req, res) => {
  const current = getCurrentSession();
  if (!current || current.startedAt !== req.params.sessionId) {
    return res.status(404).json({ error: 'Session introuvable' });
  }
  const report = buildReport({ session: current, sessionId: req.params.sessionId });
  const rows = toExportRows(report);
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="presences-${req.params.sessionId}.csv"`
  );
  res.send(`\uFEFF${csv}`);
});

// Protection des routes prof et admin
app.use('/seance', authMiddleware);
app.use('/affiche', authMiddleware);
app.use('/api/sessions', authMiddleware);
app.use('/api/class-session', authMiddleware);
app.use('/static/teacher.html', authMiddleware);
app.get('/static/teacher.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'static/teacher.html'));
});

// --- Routes Admin ---
app.use('/admin', authMiddleware, adminMiddleware);

app.get('/admin', (req, res) => {
  res.send(layoutAppPage({
    title: 'Administration',
    headerTitle: 'Panel Administration',
    headerSubtitle: 'Gestion des listes et historique',
    isTeacher: true,
    isAdmin: true,
    username: req.username,
    bodyHtml: renderAdminPage({ error: req.query.err, message: req.query.msg }, req.userId, req.username)
  }));
});

const fs = require('fs');

app.post('/admin/upload', authMiddleware, adminMiddleware, upload.single('classFile'), (req, res) => {
  if (!req.file) {
    return res.redirect('/admin?err=' + encodeURIComponent('Aucun fichier sélectionné.'));
  }
  try {
    const origName = req.file.originalname;
    const label = origName.replace(/\.(csv|json)$/i, '');
    const raw = fs.readFileSync(req.file.path, 'utf8');
    const students = [];

    if (origName.endsWith('.json')) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) students.push(...data);
    } else {
      const lines = raw.split(/\r?\n/).filter((l) => l.trim());
      const classRosters = require('./lib/class-rosters');
      
      if (lines.length > 0) {
        // Détecter le séparateur
        const firstLine = lines[0];
        const sep = firstLine.includes(';') ? ';' : ',';
        
        // Chercher les colonnes nom/prenom dans la première ligne
        let header = firstLine.split(sep).map(h => classRosters.normalizeKey(h.replace(/^"|"$/g, '')));
        let idxPrenom = header.indexOf('prenom');
        if (idxPrenom === -1) idxPrenom = header.findIndex(h => h.includes('prenom'));
        let idxNom = header.indexOf('nom');
        if (idxNom === -1) idxNom = header.findIndex(h => h === 'nom' || h.includes('nom'));
        
        let startIdx = 1;
        // Si on n'a pas trouvé de header explicite, on suppose 0=prenom, 1=nom et on lit dès la 1ère ligne
        if (idxPrenom === -1 || idxNom === -1) {
          idxPrenom = 0;
          idxNom = 1;
          startIdx = 0;
          // Sauf si la ligne 0 ressemble vraiment à un header générique
          if (header[0].includes('prenom') || header[1].includes('nom')) {
            startIdx = 1;
          }
        }
        
        for (let i = startIdx; i < lines.length; i++) {
          const parts = lines[i].split(sep);
          if (parts.length <= Math.max(idxPrenom, idxNom)) continue;
          
          const prenom = parts[idxPrenom].replace(/^"|"$/g, '').trim();
          const nom = parts[idxNom].replace(/^"|"$/g, '').trim();
          
          if (!prenom && !nom) continue;
          students.push({ prenom, nom });
        }
      }
    }

    const classRosters = require('./lib/class-rosters');
    classRosters.saveClass(label, students);

    fs.unlinkSync(req.file.path);

    const { logEvent } = require('./lib/logger');
    logEvent(req.userId, 'UPLOAD_CLASS', { class_name: label, count: students.length });

    res.redirect('/admin?msg=' + encodeURIComponent(`Classe ${label} importée avec succès.`));
  } catch (err) {
    console.error(err);
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.redirect('/admin?err=' + encodeURIComponent('Erreur lors de l\'importation.'));
  }
});

app.use((req, res, next) => {
  const from = req.socket.remoteAddress || '?';
  console.log(`[HTTP] ${from} ${req.method} ${req.originalUrl}`);
  next();
});

const PORT = process.env.PORT || 3000;
const allIps = getAllLocalIps();
const publicMode = isPublicMode();
const liveClients = new Set();

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const text = String(v == null ? '' : v);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  return [headers.join(',')]
    .concat(rows.map((row) => headers.map((h) => escape(row[h])).join(',')))
    .join('\n');
}

function emitSessionEvent(sessionId, type, payload = {}) {
  const frame = `event: ${type}\ndata: ${JSON.stringify({
    session_id: sessionId,
    ...payload,
  })}\n\n`;
  for (const client of liveClients) {
    if (client.sessionId === sessionId) client.res.write(frame);
  }
}

function baseUrl() {
  return getBaseUrl(PORT);
}

/** URL de présence signée (créneau 45 s + jeton à usage unique). */
function presenceUrl(req, nom, prenom) {
  const { slot, sig, nonce } = buildStudentToken(nom, prenom);
  nonceStore.issue(nonce, slot);
  const params = new URLSearchParams({
    nom: String(nom),
    prenom: String(prenom),
    t: String(slot),
    n: nonce,
    sig,
  });
  
  let origin = baseUrl();
  if (req && req.headers && req.headers.host) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    origin = `${protocol}://${req.headers.host}`;
  }
  return `${origin}/presence?${params.toString()}`;
}

/** URL d'émargement via QR de séance (affiche classe). */
function sessionScanUrl(req, sessionId) {
  const { slot, sig, nonce } = buildSessionToken();
  nonceStore.issue(nonce, slot);
  const params = new URLSearchParams({
    session_id: sessionId,
    t: String(slot),
    n: nonce,
    sig,
  });
  
  let origin = baseUrl();
  if (req && req.headers && req.headers.host) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    origin = `${protocol}://${req.headers.host}`;
  }
  return `${origin}/emarger?${params.toString()}`;
}

function startClassSession(meta, userId) {
  const session = classSession.start({ ...meta, userId });
  console.log(
    `[SÉANCE] ${meta.cours} · ${meta.classe} · ${meta.intervenant} — ${session.startedAt}`
  );
  return session;
}

function startClassSessionFromBody(body, userId) {
  const cours = (body?.cours || '').trim();
  let classe = (body?.classe || '').trim();
  const intervenant = (body?.intervenant || '').trim();
  const late_threshold = parseInt(body?.late_threshold) || 0;
  if (classe === '__autre__') {
    classe = (body?.classe_autre || '').trim();
  }
  if (!cours || !classe || !intervenant) {
    return { error: 'Les champs cours, classe et intervenant sont requis.' };
  }
  return { session: startClassSession({ cours, classe, intervenant, late_threshold }, userId) };
}

function parseSessionMetaFromBody(body) {
  const cours = String(body?.cours || body?.room_name || '').trim();
  const classe = String(body?.classe || '').trim();
  const intervenant = String(body?.intervenant || '').trim();
  if (!cours) return null;
  return {
    cours,
    classe: classe || 'Classe non précisée',
    intervenant: intervenant || 'Enseignant',
  };
}

function getCurrentSession(userId) {
  return classSession.get(userId);
}

function currentSessionId(userId) {
  const current = getCurrentSession(userId);
  return current ? current.startedAt : null;
}

app.get('/api/presence', authMiddleware, (req, res) => {
  const current = getCurrentSession(req.userId);
  if (req.query.all === '1') {
    return res.json(presenceLog.list());
  }
  if (current && current.startedAt) {
    return res.json(presenceLog.list({ sessionId: current.startedAt }));
  }
  res.json([]);
});

app.get('/api/classes', (req, res) => {
  res.json(classRosters.listClasses());
});

app.get('/api/class-session/students', (req, res) => {
  const current = getCurrentSession(req.userId);
  if (!current || !current.classe) {
    return res.json([]);
  }
  const roster = classRosters.findByClasseName(current.classe);
  if (!roster || !roster.students) {
    return res.json([]);
  }
  const students = roster.students.map(s => ({
    prenom: s.prenom,
    nom: s.nom,
  }));
  students.sort((a, b) => {
    const cmp = a.nom.localeCompare(b.nom, 'fr');
    return cmp !== 0 ? cmp : a.prenom.localeCompare(b.prenom, 'fr');
  });
  res.json(students);
});

app.get('/api/class-session', (req, res) => {
  res.json(classSession.get(req.userId) || {});
});

app.post('/api/class-session', (req, res) => {
  const result = startClassSessionFromBody(req.body, req.userId);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  emitSessionEvent(result.session.startedAt, 'attendance_cleared');
  res.json(result.session);
});

app.post('/api/sessions', (req, res) => {
  const meta = parseSessionMetaFromBody(req.body);
  if (!meta) {
    return res.status(400).json({ error: 'cours ou room_name requis' });
  }
  const session = startClassSession(meta, req.userId);
  emitSessionEvent(session.startedAt, 'session_started', { room: meta.cours });
  emitSessionEvent(session.startedAt, 'attendance_cleared');
  res.json({
    session_id: session.startedAt,
    room: meta.cours,
    cours: session.cours,
    classe: session.classe,
    intervenant: session.intervenant,
    started_at: session.startedAt,
    is_closed: false,
  });
});

app.get('/api/sessions/:sessionId/info', (req, res) => {
  const current = classSession.getClosedSession(req.params.sessionId);
  if (!current || (current.userId !== req.userId && req.userRole !== 'admin')) {
    return res.status(404).json({ error: 'Session introuvable' });
  }
  res.json({
    session_id: current.startedAt,
    room: classSession.label(req.userId) || current.cours,
    cours: current.cours,
    classe: current.classe,
    intervenant: current.intervenant,
    started_at: current.startedAt,
    closed_at: current.closedAt,
    is_closed: !!current.isClosed,
  });
});

app.get('/api/sessions/:sessionId/token', (req, res) => {
  const current = classSession.getClosedSession(req.params.sessionId);
  if (!current || (current.userId !== req.userId && req.userRole !== 'admin')) {
    return res.status(404).json({ error: 'Session introuvable' });
  }
  if (current.isClosed) {
    return res.status(409).json({ error: 'Session clôturée' });
  }
  res.json({
    refresh_in: Math.ceil(WINDOW_MS / 1000),
    expires_in: Math.ceil(WINDOW_MS / 1000),
  });
});

app.get('/api/sessions/:sessionId/qr.png', async (req, res) => {
  const current = classSession.getClosedSession(req.params.sessionId);
  if (!current || (current.userId !== req.userId && req.userRole !== 'admin')) {
    return res.status(404).send('Session introuvable');
  }
  if (current.isClosed) {
    return res.status(409).send('Session clôturée');
  }
  try {
    const url = sessionScanUrl(req, req.params.sessionId);
    res.type('png');
    res.set('Cache-Control', 'no-store');
    await QRCode.toFileStream(res, url, { width: 400, margin: 2 });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/sessions/:sessionId/attendance', (req, res) => {
  res.json(presenceLog.list({ sessionId: req.params.sessionId }));
});

app.patch('/api/sessions/:sessionId/attendance/:entryId', (req, res) => {
  const updated = presenceLog.updateStatus({
    id: req.params.entryId,
    sessionId: req.params.sessionId,
    status: req.body?.status,
    lateMinutes: req.body?.late_minutes,
    excuseNote: req.body?.excuse_note,
  });
  if (!updated) {
    return res.status(404).json({ error: 'Présence introuvable ou statut invalide' });
  }
  emitSessionEvent(req.params.sessionId, 'attendance_updated', {
    entry_id: req.params.entryId,
  });
  res.json({ ok: true });
});

app.post('/api/sessions/:sessionId/close', authMiddleware, async (req, res) => {
  if (!isValidId(req.params.sessionId)) return res.status(400).json({ error: 'ID invalide' });
  const current = classSession.getClosedSession(req.params.sessionId);
  if (!current || (current.userId !== req.userId && req.userRole !== 'admin')) {
    return res.status(404).json({ error: 'Session introuvable' });
  }
  const closed = classSession.close(current.userId);
  emitSessionEvent(req.params.sessionId, 'session_closed', {
    closed_at: closed.closedAt,
  });

  const sessionId = req.params.sessionId;
  let xlsBuffer = null;
  let pdfBuffer = null;

  // Generate Excel
  try {
    const report = buildReport({ session: closed, sessionId });
    const rows = toExportRows(report);
    const wb = XLSX.utils.book_new();
    // Use header array to ensure columns are present even if rows is empty
    const header = ["section", "prénom", "nom", "élève", "heure", "statut", "cours", "classe", "intervenant", "date_séance", "heure_debut"];
    if (rows.length === 0) {
      // Add a dummy row to avoid empty spreadsheet warning
      rows.push({ section: "Aucun", prénom: "-", nom: "-", élève: "-", heure: "-", statut: "Aucun élève" });
    }
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    XLSX.utils.book_append_sheet(wb, ws, 'Presences');
    xlsBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  } catch (e) { console.error('[EXPORT] Excel error', e); }

  // Generate PDF
  try {
    pdfBuffer = await buildAttendancePdf({ session: closed, sessionId });
  } catch (e) { console.error('[EXPORT] PDF error', e); }

  // Save to Database
  try {
    classSession.saveExports(sessionId, pdfBuffer, xlsBuffer);
  } catch (e) { console.error('[EXPORT] DB save error', e); }

  res.json({ ok: true, closed_at: closed.closedAt });
});

app.delete('/api/sessions/:sessionId', authMiddleware, adminMiddleware, (req, res) => {
  const deleted = classSession.deleteSession(req.params.sessionId);
  if (deleted) {
    const { logEvent } = require('./lib/logger');
    logEvent(req.userId, 'DELETE_SESSION', { session_id: req.params.sessionId });
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Session introuvable' });
  }
});

app.delete('/api/classes/:id', authMiddleware, adminMiddleware, (req, res) => {
  const classRosters = require('./lib/class-rosters');
  const deleted = classRosters.deleteClass(req.params.id);
  if (deleted) {
    const { logEvent } = require('./lib/logger');
    logEvent(req.userId, 'DELETE_CLASS', { class_id: req.params.id });
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Classe introuvable' });
  }
});

app.get('/api/sessions/:sessionId/live', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  const client = { sessionId: req.params.sessionId, res };
  liveClients.add(client);
  res.write(`event: ready\ndata: {"session_id":"${req.params.sessionId}"}\n\n`);
  req.on('close', () => {
    liveClients.delete(client);
  });
});

function sessionExportRows(sessionId) {
  let session = classSession.getClosedSession(sessionId);
  if (!session) return null;
  const report = buildReport({ session, sessionId });
  return toExportRows(report);
}

// Serve saved Excel file
app.get('/api/sessions/:sessionId/export.xlsx', authMiddleware, adminMiddleware, (req, res) => {
  if (!isValidId(req.params.sessionId)) return res.status(400).json({ error: 'ID invalide' });
  try {
    const safeId = req.params.sessionId.replace(/[^a-zA-Z0-9]/g, '_');
    const closedSession = classSession.getClosedSession(req.params.sessionId, true);

    if (closedSession && closedSession.excelBlob) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="appel-${safeId}.xlsx"`);
      return res.end(closedSession.excelBlob);
    }

    // Fallback: generate on the fly
    const rows = sessionExportRows(req.params.sessionId);
    if (!rows) return res.status(404).json({ error: 'Session introuvable' });
    const wb = XLSX.utils.book_new();
    const header = ["section", "prénom", "nom", "élève", "heure", "statut", "cours", "classe", "intervenant", "date_séance", "heure_debut"];
    if (rows.length === 0) rows.push({ section: "Aucun", prénom: "-", nom: "-", élève: "-", heure: "-", statut: "Aucun élève" });
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    XLSX.utils.book_append_sheet(wb, ws, 'Presences');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="appel-${safeId}.xlsx"`);
    res.end(buffer);
  } catch (err) {
    console.error('[EXPORT] Excel Route Error:', err);
    res.status(500).send(`Erreur de génération Excel: ${err.message}\n${err.stack}`);
  }
});

// Inline PDF view (opens in browser)
app.get('/api/sessions/:sessionId/view.pdf', authMiddleware, adminMiddleware, async (req, res) => {
  if (!isValidId(req.params.sessionId)) return res.status(400).json({ error: 'ID invalide' });
  const safeId = req.params.sessionId.replace(/[^a-zA-Z0-9]/g, '_');
  let pdfBuffer = null;
  
  const closedSession = classSession.getClosedSession(req.params.sessionId, true);
  if (closedSession && closedSession.pdfBlob) {
    pdfBuffer = closedSession.pdfBlob;
  } else {
    let session = closedSession || classSession.getClosedSession(req.params.sessionId);
    if (!session) return res.status(404).send('Session introuvable');
    try { pdfBuffer = await buildAttendancePdf({ session, sessionId: req.params.sessionId }); }
    catch(e) { return res.status(500).send('Erreur PDF'); }
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="appel-${safeId}.pdf"`);
  res.send(pdfBuffer);
});

// API: Supprimer un utilisateur
app.delete('/api/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const userId = req.params.id;
  try {
    // Interdire de supprimer son propre compte
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
    }
    const user = db.prepare('SELECT username, role FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }
    // Seul le SuperAdmin (admini) peut supprimer des admins
    if (user.role === 'admin') {
      const currentUser = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId);
      if (!currentUser || currentUser.username !== 'admini') {
        return res.status(403).json({ error: 'Seul le SuperAdmin (admini) peut supprimer des administrateurs.' });
      }
      const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Impossible de supprimer le dernier administrateur' });
      }
    }
    const { logEvent } = require('./lib/logger');
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    logEvent(req.userId, 'DELETE_USER', { targetId: userId, targetRole: user.role });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur de suppression' });
  }
});

// API: Créer un utilisateur
app.post('/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || (role !== 'admin' && role !== 'prof')) {
    return res.redirect('/admin?err=' + encodeURIComponent('Paramètres invalides pour la création du compte.'));
  }
  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.redirect('/admin?err=' + encodeURIComponent('Cet identifiant existe déjà.'));
    }
    if (await isPasswordPwned(password)) {
      return res.redirect('/admin?err=' + encodeURIComponent('Ce mot de passe a été détecté dans une fuite de données. Veuillez utiliser un mot de passe plus sécurisé.'));
    }
    const { logEvent } = require('./lib/logger');
    db.prepare('INSERT INTO users (id, username, password_hash, role, force_password_change) VALUES (?, ?, ?, ?, 1)')
      .run(crypto.randomUUID(), username, bcrypt.hashSync(password, 10), role);
    logEvent(req.userId, 'CREATE_USER', { username, role });
    res.redirect('/admin?msg=' + encodeURIComponent(`Utilisateur ${username} créé avec succès.`));
  } catch (err) {
    console.error(err);
    res.redirect('/admin?err=' + encodeURIComponent('Erreur lors de la création de l\'utilisateur.'));
  }
});

async function sendAttendancePdf(res, session, sessionId) {
  if (!session) {
    return res.status(404).send('Aucune séance active ou introuvable.');
  }
  try {
    const buffer = await buildAttendancePdf({ session, sessionId });
    const safeName = (session.classe || 'classe')
      .replace(/[^\w\-]+/g, '_')
      .slice(0, 40);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="appel-${safeName}-${Date.now()}.pdf"`
    );
    res.end(buffer);
  } catch (err) {
    console.error('[PDF]', err);
    res.status(500).send(`Erreur lors de la génération du PDF: ${err.message}\n${err.stack}`);
  }
}

app.get('/api/class-session/export.pdf', authMiddleware, (req, res) => {
  const current = getCurrentSession(req.userId);
  if (!current) {
    return res.status(404).json({ error: 'Aucune séance en cours' });
  }
  return sendAttendancePdf(res, current, current.startedAt);
});

// Download PDF (attachment)
app.get('/api/sessions/:sessionId/export.pdf', authMiddleware, adminMiddleware, async (req, res) => {
  if (!isValidId(req.params.sessionId)) return res.status(400).json({ error: 'ID invalide' });
  const safeId = req.params.sessionId.replace(/[^a-zA-Z0-9]/g, '_');
  const closedSession = classSession.getClosedSession(req.params.sessionId, true);

  if (closedSession && closedSession.pdfBlob) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="appel-${safeId}.pdf"`);
    return res.end(closedSession.pdfBlob);
  }

  let session = closedSession || classSession.getClosedSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  return sendAttendancePdf(res, session, req.params.sessionId);
});

function rejectUsedOrInvalidQr(res) {
  return res
    .status(410)
    .send(
      errorPage(
        'QR invalide',
        'Ce code a expiré, a déjà été utilisé, ou provient d\'une photo. Scannez le QR affiché en direct à l\'écran.'
      )
    );
}

function phoneTestLinksHtml() {
  if (publicMode) {
    const u = baseUrl();
    return `<p class="ok-public">Mode Internet actif</p>
      <p>Test : <a href="${escapeHtml(u)}/test">${escapeHtml(u)}/test</a></p>`;
  }
  if (allIps.length === 0) {
    return '<p class="warn">Aucune IP locale. Utilisez PUBLIC_URL pour Internet.</p>';
  }
  return `<ul>${allIps
    .map(
      (c) =>
        `<li><strong>${escapeHtml(c.name)}</strong> — <a href="http://${escapeHtml(c.address)}:${PORT}/test">http://${escapeHtml(c.address)}:${PORT}/test</a></li>`
    )
    .join('')}</ul>`;
}

// Ancienne route d'accueil supprimée (remplacée par la connexion ci-dessus)

app.get('/diagnostic', (req, res) => {
  const client = req.socket.remoteAddress || '';
  res.send(
    layoutPage({
      title: 'Diagnostic',
      headerTitle: 'Diagnostic serveur',
      headerSubtitle: 'Vérification de la connexion',
      bodyHtml: `
  <div class="panel">
    <p style="color:var(--success);font-weight:600;">✓ Serveur actif sur le port <strong>${PORT}</strong></p>
    <p class="hint">Votre appareil : <code>${escapeHtml(client)}</code></p>
    <p class="hint">Heure serveur : ${new Date().toLocaleString('fr-FR')}</p>
    <h2 style="margin-top:1.5rem;font-size:1rem;">Adresses pour le téléphone</h2>
    ${phoneTestLinksHtml()}
    <h2 style="margin-top:1.5rem;font-size:1rem;">Commandes utiles (PC)</h2>
    <pre class="ip" style="white-space:pre-wrap;">npm run stop
npm start</pre>
    <p class="links"><a href="/seance">Configurer une séance</a> · <a href="/affiche">QR de séance</a> · <a href="/">Accueil</a></p>
  </div>`,
    })
  );
});

// ——— Test connexion téléphone ———
app.get('/test', (req, res) => {
  res.send(
    layoutPage({
      title: 'Test connexion',
      headerTitle: 'Test connexion',
      headerSubtitle: 'Vérification réseau',
      bodyHtml: `
  <div class="center-page panel">
    <div class="result-icon ok" style="font-size:2.5rem;">✓</div>
    <h1 style="font-family:var(--font-display);margin:0.5rem 0;">Connexion OK</h1>
    <p class="hint">Votre téléphone atteint bien le serveur.</p>
    <p class="hint">Vous pouvez scanner le QR d'émargement.</p>
  </div>`,
    })
  );
});

app.get('/aide', (req, res) => {
  const u = baseUrl();
  res.send(
    layoutPage({
      title: 'Aide téléphone',
      headerTitle: 'Aide',
      headerSubtitle: 'Connexion du téléphone au serveur',
      bodyHtml: `
  <div class="panel">
    <p class="hint">Le QR contient une URL avec l'<strong>IP du PC</strong>, par exemple :</p>
    <p class="ip">${escapeHtml(u)}/emarger?...</p>
    <p class="hint">Au scan, le navigateur du téléphone contacte le PC sur le Wi-Fi — comme un site local.</p>
    <h2 style="font-size:1rem;margin-top:1.5rem;">Checklist</h2>
    <ul class="hint">
      <li>Serveur lancé : <code>npm start</code></li>
      <li>Même Wi-Fi PC / téléphone</li>
      <li>Pas de VPN isolant le téléphone</li>
      <li>Pare-feu : autoriser Node.js sur réseau privé</li>
      <li>Test : <code>${escapeHtml(u)}/test</code></li>
    </ul>
    <p class="links"><a href="/">← Retour</a></p>
  </div>`,
    })
  );
});

// ——— Page 1 : configuration séance ———
app.get('/seance', authMiddleware, (req, res) => {
  res.send(
    layoutPage({
      title: 'Configurer la séance',
      headerTitle: 'Émargement QR',
      headerSubtitle: 'Étape 1 — informations du cours',
      extraClass: 'page-seance',
      isTeacher: true,
      isAdmin: req.userRole === 'admin',
      bodyHtml: renderSeanceSetupBody({
        current: classSession.get(req.userId) || {},
        error: req.query.err ? String(req.query.err) : '',
        publicMode,
      }),
    })
  );
});

app.post('/seance', authMiddleware, (req, res) => {
  const result = startClassSessionFromBody(req.body, req.userId);
  if (result.error) {
    return res.redirect(`/seance?err=${encodeURIComponent(result.error)}`);
  }
  const { logEvent } = require('./lib/logger');
  logEvent(req.userId, 'START_SESSION', { cours: result.session.cours, classe: result.session.classe });
  emitSessionEvent(result.session.startedAt, 'attendance_cleared');
  res.redirect(302, '/affiche');
});

// ——— Page 2 : QR de séance ———
app.get('/affiche', authMiddleware, (req, res) => {
  const session = classSession.get(req.userId);
  if (!session) {
    return res.redirect(302, '/seance');
  }

  res.send(
    layoutAppPage({
      title: `QR — ${session.cours}`,
      headerTitle: 'Appel en cours',
      headerSubtitle: `${session.classe} · ${session.intervenant}`,
      extraClass: 'page-affiche',
      withSidebar: true,
      sidebarInit: 'initPresenceSidebar({ apiPath: "/api/presence" });',
      sidebarEmptyHint: 'En attente du premier scan…',
      sommaireItems: null,
      isTeacher: true,
      isAdmin: req.userRole === 'admin',
      username: req.username,
      bodyHtml: renderSeanceQrBody({
        session,
        baseUrl: baseUrl(),
        windowMs: WINDOW_MS,
        publicMode,
      }),
    })
  );
});

// ——— PNG QR séance (créneau courant) ———
app.get('/qr-session.png', authMiddleware, async (req, res) => {
  const current = classSession.get(req.userId);
  if (!current) {
    return res.status(404).send('Aucune séance active.');
  }
  try {
    const url = sessionScanUrl(req, current.startedAt);
    res.type('png');
    res.set('Cache-Control', 'no-store');
    await QRCode.toFileStream(res, url, { width: 400, margin: 2 });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ——— Après scan du QR séance : formulaire nom / prénom + GPS ———
app.get('/emarger', (req, res) => {
  const { t, sig, n, session_id } = req.query;
  if (!verifySessionQuery(t, n, sig)) return rejectUsedOrInvalidQr(res);
  if (!n || nonceStore.isUsed(n) || !nonceStore.canOpen(n)) {
    return rejectUsedOrInvalidQr(res);
  }
  const active = classSession.getClosedSession(session_id);
  if (!active || active.isClosed) {
    return res
      .status(409)
      .send(errorPage('Session inactive', 'Aucune séance n’est ouverte ou l’appel est clôturé.'));
  }

  const geo = getGeofenceConfig();

  let students = [];
  if (active && active.classe) {
    const roster = classRosters.findByClasseName(active.classe);
    if (roster && roster.students) {
      students = roster.students.map(s => ({ prenom: s.prenom, nom: s.nom }));
      students.sort((a, b) => {
        const cmp = a.nom.localeCompare(b.nom, 'fr');
        return cmp !== 0 ? cmp : a.prenom.localeCompare(b.prenom, 'fr');
      });
    }
  }

  res.send(
    emargerFormPage({
      t,
      sig,
      n,
      geofenceEnabled: geo.enabled,
      radius: geo.radius,
      lat: geo.lat,
      lon: geo.lon,
      session: active || {},
      students,
    })
  );
});

app.post('/emarger', (req, res) => {
  const { t, sig, n, nom, prenom, latitude, longitude, session_id } = req.body;
  const nomTrim = (nom || '').trim();
  const prenomTrim = (prenom || '').trim();

  // 1. Vérification session
  const active = classSession.getClosedSession(session_id);
  if (!active || active.isClosed) {
    return res
      .status(409)
      .send(errorPage('Session inactive', 'Aucune séance n’est ouverte ou l’appel est clôturé.'));
  }

  // 2. Anti-double scan (par appareil via cookie ET empreinte hashée avec sel)
  const sessionId = active.startedAt;
  const rawId = req.headers['user-agent'] + req.ip;
  // Utilisation d'un HMAC avec la clé secrète pour plus de sécurité
  const deviceFingerprint = crypto.createHmac('sha256', QR_SECRET).update(rawId).digest('hex');
  const cookieName = `has_emarged_${String(sessionId).replace(/[^a-zA-Z0-9]/g, '_')}`;
  
  // Vérification cookie
  if (req.cookies[cookieName] || req.signedCookies[cookieName]) {
    return res
      .status(403)
      .send(
        errorPage(
          'Déjà émargé',
          'Vous avez déjà émargé pour cette séance. Un seul émargement par appareil est autorisé.'
        )
      );
  }

  // Vérification dans le journal des présences (par IP + User-Agent pour doubler le cookie)
  const allPresences = presenceLog.list({ sessionId });
  const alreadyPresent = allPresences.some(p => p.device_fingerprint === deviceFingerprint);
  if (alreadyPresent) {
    return res
      .status(403)
      .send(
        errorPage(
          'Déjà émargé',
          'Une présence a déjà été enregistrée pour cet appareil durant cette séance.'
        )
      );
  }

  // 3. Vérification signature QR
  if (!verifySessionQuery(t, n, sig)) return rejectUsedOrInvalidQr(res);
  if (!publicMode && (!n || !nonceStore.consume(n))) return rejectUsedOrInvalidQr(res);

  // 4. Validation identité
  if (!nomTrim || !prenomTrim) {
    return res.status(400).send(errorPage('Erreur', 'Nom et prénom requis.'));
  }

  // 5. Vérification stricte de la liste de classe
  const roster = classRosters.findByClasseName(active.classe);
  if (roster) {
    const isOnList = roster.students.some(
      (s) =>
        classRosters.studentKey(s.prenom, s.nom) === classRosters.studentKey(prenomTrim, nomTrim)
    );
    if (!isOnList) {
      return res
        .status(403)
        .send(
          errorPage(
            'Élève non trouvé',
            `Votre nom (${prenomTrim} ${nomTrim}) n’apparaît pas dans la liste de la classe ${active.classe}. Vérifiez l’orthographe ou contactez l’enseignant.`
          )
        );
    }
  }

  // 6. Géofencing
  const geoCheck = insideGeofence(parseFloat(latitude), parseFloat(longitude));
  if (!geoCheck.ok) {
    return res
      .status(403)
      .send(errorPage('Hors zone', geoCheck.reason || 'Géolocalisation refusée.'));
  }

  // 7. Enregistrement
  const roomLabel = active.cours + (active.classe ? ' — ' + active.classe : '');
  const recordResult = presenceLog.record({
    prenom: prenomTrim,
    nom: nomTrim,
    auth: 'form',
    room: roomLabel,
    sessionId: sessionId,
    device_fingerprint: deviceFingerprint,
  });

  if (recordResult && recordResult.duplicate) {
    return res
      .status(403)
      .send(
        errorPage(
          'Déjà émargé',
          `Le nom ${prenomTrim} ${nomTrim} a déjà été validé par un autre appareil pour cette séance.`
        )
      );
  }

  console.log(
    `[PRÉSENCE] ${prenomTrim} ${nomTrim} — ${new Date().toISOString()}` +
      (geoCheck.distance != null ? ` (${Math.round(geoCheck.distance)} m)` : '')
  );

  emitSessionEvent(sessionId, 'attendance_added');

  // 8. Fixation du cookie pour empêcher le double scan (4 heures)
  res.cookie(cookieName, '1', {
    maxAge: 4 * 3600000,
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    signed: true,
  });
  res.send(presenceSuccessPage(prenomTrim, nomTrim, roomLabel));
});

// ——— QR par élève (page avec rafraîchissement 45 s) ———
app.get('/qr', (req, res) => {
  const { nom, prenom } = req.query;
  if (!nom || !prenom) {
    return res.status(400).send('Paramètres : ?nom=...&prenom=...');
  }

  const n = escapeHtml(nom);
  const p = escapeHtml(prenom);

  res.send(
    layoutPage({
      title: `QR — ${p} ${n}`,
      headerTitle: `${p} ${n}`,
      headerSubtitle: 'QR valide 45 s — rescannez si expiré',
      bodyHtml: `
  <div class="qr-frame" style="margin:0 auto;max-width:400px;">
    <img id="qr" class="qr-img loaded" alt="QR présence" width="300" height="300">
    <p class="timer" style="color:#404040;margin-top:1rem;">Prochain QR dans <span id="sec" style="font-weight:700;color:#0a0a0a;">45</span> s</p>
  </div>
  <p class="links" style="text-align:center;margin-top:1.25rem;"><a href="/">← Retour</a></p>
  <script>
    const nom = ${JSON.stringify(String(nom))};
    const prenom = ${JSON.stringify(String(prenom))};
    const img = document.getElementById('qr');
    const secEl = document.getElementById('sec');
    const WINDOW = ${WINDOW_MS};
    function refreshQr() {
      img.src = '/qr.png?nom=' + encodeURIComponent(nom) +
        '&prenom=' + encodeURIComponent(prenom) + '&_=' + Date.now();
    }
    function updateCountdown() {
      const left = Math.ceil((WINDOW - (Date.now() % WINDOW)) / 1000);
      secEl.textContent = left;
      if (left <= 1) refreshQr();
    }
    refreshQr();
    setInterval(refreshQr, WINDOW);
    setInterval(updateCountdown, 250);
    updateCountdown();
  </script>`,
    })
  );
});

// ——— PNG QR élève (créneau courant) ———
app.get('/qr.png', async (req, res) => {
  const { nom, prenom } = req.query;
  if (!nom || !prenom) {
    return res.status(400).send('Paramètres : nom, prenom');
  }
  try {
    const url = presenceUrl(req, nom, prenom);
    res.type('png');
    res.set('Cache-Control', 'no-store');
    await QRCode.toFileStream(res, url, { width: 400, margin: 2 });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ——— Validation directe par scan (QR élève) ———
app.get('/presence', authMiddleware, (req, res) => {
  const active = classSession.get(req.userId);
  if (!active || active.isClosed) {
    return res
      .status(409)
      .send(errorPage('Session inactive', 'Aucune séance n’est ouverte ou l’appel est clôturé.'));
  }

  const nom = (req.query.nom || '').trim();
  const prenom = (req.query.prenom || '').trim();
  const { t, sig, n } = req.query;

  if (!nom || !prenom) {
    return res
      .status(400)
      .send(errorPage('Lien invalide', 'Nom et prénom manquants.'));
  }

  if (!verifyStudentQuery(nom, prenom, t, n, sig)) return rejectUsedOrInvalidQr(res);
  if (!n || !nonceStore.consume(n)) return rejectUsedOrInvalidQr(res);

  const row = presenceLog.record({
    prenom,
    nom,
    auth: 'qr-eleve',
    room: classSession.label(req.userId),
    sessionId: active ? active.startedAt : null,
  });

  if (row && row.duplicate) {
    return res.send(presenceSuccessPage(prenom, nom, classSession.label(req.userId)));
  }

  if (row && active && active.startedAt) {
    emitSessionEvent(active.startedAt, 'attendance_added');
  }
  console.log(`[PRÉSENCE] ${prenom} ${nom} — ${new Date().toISOString()}`);
  res.send(presenceSuccessPage(prenom, nom, classSession.label(req.userId)));
});

// ——— Démarrage ———
const server = app.listen(PORT, '0.0.0.0', () => {
  const sec = secondsUntilNextWindow();
  const url = baseUrl();
  console.log('');
  console.log('  Émargement QR — serveur démarré');
  console.log('  ─────────────────────────────────');
  if (publicMode) {
    console.log(`  Mode             : INTERNET (PUBLIC_URL)`);
    console.log(`  URL publique     : ${url}`);
    console.log(`  Config séance    : ${url}/seance`);
    console.log(`  QR / affiche     : ${url}/affiche`);
    console.log(`  Test             : ${url}/test`);
  } else {
    console.log(`  Mode             : LOCAL (Wi-Fi)`);
    console.log(`  PC (config)      : http://localhost:${PORT}/seance`);
    console.log(`  PC (QR)          : http://localhost:${PORT}/affiche`);
    for (const c of allIps) {
      console.log(`  Téléphone (${c.name}) : http://${c.address}:${PORT}/test`);
    }
    console.log('');
    console.log('  Internet ?  set PUBLIC_URL=https://votre-url  puis npm start');
  }
  console.log('');
  console.log('  Port bloqué ?  npm run stop');
  const geo = getGeofenceConfig();
  if (geo.enabled) {
    console.log(`  Géolocalisation : ON (${geo.radius} m autour de ${geo.lat}, ${geo.lon})`);
  } else {
    console.log('  Géolocalisation : OFF (définir SCHOOL_LATITUDE / SCHOOL_LONGITUDE)');
  }
  console.log('  Anti-photo      : jeton à usage unique par QR');
  console.log(`  QR : toutes les ${WINDOW_MS / 1000} s (prochain dans ${sec} s)`);
  if (require('fs').existsSync('/.dockerenv') && !publicMode) {
    console.log('');
    console.log('  ⚠ Docker sans PUBLIC_URL : les QR ne marcheront pas en 4G / autre réseau.');
    console.log('    → Créez .env avec PUBLIC_URL=https://votre-url-publique');
    console.log('    → Voir scripts/tunnel-ngrok.sh');
  }
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error(`  ERREUR : le port ${PORT} est déjà utilisé.`);
    console.error('  Tapez :  npm run stop');
    console.error('  Puis :   npm start');
    console.error('');
    process.exit(1);
  }
  throw err;
});
