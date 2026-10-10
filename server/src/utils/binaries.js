import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standalone binaries stored in server/bin/
export const BIN_DIR = path.resolve(__dirname, '..', '..', 'bin');

export function isCommandInPath(cmd) {
  try {
    const checkTool = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${checkTool} ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Downloads a binary with redirect handling and sets executable permissions
 */
export async function downloadBinary(url, destPath) {
  console.log(`[SyncCast Binaries] Downloading executable from: ${url}`);
  if (!fs.existsSync(path.dirname(destPath))) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download binary from ${url} (${res.status} ${res.statusText})`);
  }

  const arrayBuf = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuf));

  if (process.platform !== 'win32') {
    fs.chmodSync(destPath, 0o755);
  }
  console.log(`[SyncCast Binaries] Successfully installed: ${destPath} (${(arrayBuf.byteLength / 1024 / 1024).toFixed(2)} MB)`);
  return destPath;
}

/**
 * Resolves path to ffmpeg if available in system PATH or server/bin/
 */
export function getFfmpegPath() {
  if (isCommandInPath('ffmpeg')) {
    return 'ffmpeg';
  }
  const localBin = path.join(BIN_DIR, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return null;
}

/**
 * Ensures required standalone binaries exist on startup / build time
 */
export async function ensureBinaries() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  // Prepend BIN_DIR to process.env.PATH so child processes inherit it
  if (!process.env.PATH.includes(BIN_DIR)) {
    process.env.PATH = `${BIN_DIR}${path.delimiter}${process.env.PATH}`;
  }

  // On Linux (e.g. Render), download static ffmpeg if not present in PATH
  if (process.platform === 'linux' && !getFfmpegPath()) {
    const ffmpegBin = path.join(BIN_DIR, 'ffmpeg');
    const ffmpegUrl = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b5.0.1/linux-x64';
    try {
      console.log('[SyncCast Binaries] Downloading static ffmpeg for Linux...');
      await downloadBinary(ffmpegUrl, ffmpegBin);
    } catch (err) {
      console.warn('[SyncCast Binaries] Could not download static ffmpeg:', err.message);
    }
  }
}
