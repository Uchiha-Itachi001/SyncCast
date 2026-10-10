import os from 'os';

/**
 * Discovers the active local network IPv4 address (WiFi / Ethernet)
 * Used to print QR code link and guest access URL without typing IPs manually.
 */
export function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // Skip over non-IPv4 and internal (loopback 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}
