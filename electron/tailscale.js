// ==========================================
// Tailscale Manager Module
// ==========================================
// Wraps the `tailscale` CLI to detect connection status,
// get IP addresses, and list available peers.

const { execFile, exec } = require('child_process');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development' || !process.env.ELECTRON_IS_PACKAGED;

function findTailscale() {
  // Common Tailscale installation paths on Windows
  const candidates = [
    'tailscale',
    'C:\\Program Files\\Tailscale\\tailscale.exe',
    'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Tailscale', 'tailscale.exe'),
  ];
  return candidates[0]; // rely on PATH
}

const TAILSCALE_BIN = findTailscale();

function runTailscale(args, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const cmd = `"${TAILSCALE_BIN}" ${args.join(' ')}`;
    exec(cmd, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.toString().trim());
      }
    });
  });
}

async function isInstalled() {
  try {
    await runTailscale(['--version'], 5000);
    return true;
  } catch {
    return false;
  }
}

async function getStatus() {
  try {
    const output = await runTailscale(['status', '--json'], 8000);
    const data = JSON.parse(output);
    return {
      connected: data.CurrentTailnet?.Name != null,
      self: {
        id: data.Self?.ID || '',
        dnsName: data.Self?.DNSName || '',
        ip: data.Self?.TailscaleIPs?.[0] || '',
        online: data.Self?.Online || false,
        hostname: data.Self?.HostName || '',
      },
      tailnet: data.CurrentTailnet?.Name || '',
      version: data.Version || '',
    };
  } catch (e) {
    return {
      connected: false,
      self: { id: '', dnsName: '', ip: '', online: false, hostname: '' },
      tailnet: '',
      version: '',
      error: e.message,
    };
  }
}

async function getIP() {
  try {
    const ip = await runTailscale(['ip', '-4'], 5000);
    return ip;
  } catch {
    return null;
  }
}

async function getPeers() {
  try {
    const output = await runTailscale(['status', '--json'], 8000);
    const data = JSON.parse(output);
    const peers = [];

    if (data.Peer) {
      for (const [key, peer] of Object.entries(data.Peer)) {
        peers.push({
          id: peer.ID || key,
          dnsName: peer.DNSName || '',
          ip: peer.TailscaleIPs?.[0] || '',
          online: peer.Online || false,
          hostname: peer.HostName || '',
        });
      }
    }
    return peers;
  } catch (e) {
    return [];
  }
}

module.exports = { isInstalled, getStatus, getIP, getPeers };
