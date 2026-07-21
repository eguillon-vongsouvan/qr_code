const { getLocalIp } = require('./get-local-ip');

function stripTrailingSlash(url) {
  return String(url).replace(/\/$/, '');
}

/**
 * URL publique forcée (Internet) — variable PUBLIC_URL ou hébergeur cloud.
 * Exemples :
 *   PUBLIC_URL=https://emargement.ngrok-free.app
 *   (Render définit RENDER_EXTERNAL_URL automatiquement)
 */
function getConfiguredPublicUrl() {
  if (process.env.PUBLIC_URL) {
    return stripTrailingSlash(process.env.PUBLIC_URL);
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return stripTrailingSlash(process.env.RENDER_EXTERNAL_URL);
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${stripTrailingSlash(process.env.RAILWAY_PUBLIC_DOMAIN)}`;
  }
  return null;
}

function isPublicMode() {
  return Boolean(getConfiguredPublicUrl());
}

/** Cookies « secure » uniquement si l’URL publique est en HTTPS. */
function isHttpsPublicUrl() {
  const configured = getConfiguredPublicUrl();
  return Boolean(configured && configured.startsWith('https://'));
}

/** URL de base pour les QR codes et liens affichés. */
function getBaseUrl(port = process.env.PORT || 3000) {
  const configured = getConfiguredPublicUrl();
  if (configured) return configured;

  const ip = getLocalIp();
  const host = ip || '127.0.0.1';
  return `http://${host}:${port}`;
}

module.exports = { getBaseUrl, getConfiguredPublicUrl, isPublicMode, isHttpsPublicUrl };
