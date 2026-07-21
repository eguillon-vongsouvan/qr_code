/**
 * Distance GPS (haversine) — même logique que app/geo.py
 */
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlmb = toRad(lon2 - lon1);
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dlmb / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getGeofenceConfig() {
  const lat = parseFloat(process.env.SCHOOL_LATITUDE);
  const lon = parseFloat(process.env.SCHOOL_LONGITUDE);
  const radius = parseFloat(process.env.GEOFENCE_RADIUS_METERS || '150');
  const enabled =
    process.env.GEOFENCE_ENABLED !== '0' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon);
  return { enabled, lat, lon, radius };
}

function insideGeofence(lat, lon) {
  const cfg = getGeofenceConfig();
  if (!cfg.enabled) return { ok: true, disabled: true };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, reason: 'Position GPS manquante.' };
  }
  const dist = haversineM(lat, lon, cfg.lat, cfg.lon);
  if (dist > cfg.radius) {
    return {
      ok: false,
      reason: `Vous êtes à ${Math.round(dist)} m du lieu d'appel (max ${cfg.radius} m).`,
      distance: dist,
    };
  }
  return { ok: true, distance: dist };
}

module.exports = { haversineM, getGeofenceConfig, insideGeofence };
