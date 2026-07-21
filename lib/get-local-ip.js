const os = require('os');

const VIRTUAL_IFACE = /vmware|vethernet|virtualbox|hyper-v|virtual|loopback|docker|wsl/i;
const VIRTUAL_IP_PREFIX = ['192.168.49.', '192.168.138.', '192.168.56.', '172.28.'];

function isVirtualCandidate(name, address) {
  if (VIRTUAL_IFACE.test(name)) return true;
  return VIRTUAL_IP_PREFIX.some((p) => address.startsWith(p));
}

/** Toutes les IP utilisables (Wi-Fi / Ethernet réels). */
function getAllLocalIps() {
  const interfaces = os.networkInterfaces();
  const preferred = ['Wi-Fi', 'WiFi', 'WLAN', 'Ethernet', 'eth0', 'wlan0'];
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      const isIpv4 = addr.family === 'IPv4' || addr.family === 4;
      if (!isIpv4 || addr.internal) continue;
      if (isVirtualCandidate(name, addr.address)) continue;
      candidates.push({ name, address: addr.address });
    }
  }

  candidates.sort((a, b) => {
    const score = (n) => {
      const lower = n.toLowerCase();
      if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wlan'))
        return 0;
      if (lower.includes('ethernet')) return 1;
      return 2;
    };
    return score(a.name) - score(b.name);
  });

  return candidates;
}

function getLocalIp() {
  return getAllLocalIps()[0]?.address ?? null;
}

module.exports = { getLocalIp, getAllLocalIps };
