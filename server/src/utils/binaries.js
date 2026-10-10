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
 * Resolves the path to yt-dlp. If not found in PATH or bin/, auto-downloads it for the platform.
 */
export async function getYtDlpPath() {
  // 1. Check if yt-dlp is in system PATH
  if (isCommandInPath('yt-dlp')) {
    return 'yt-dlp';
  }

  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const localBin = path.join(BIN_DIR, binaryName);

  // 2. Check if already cached in server/bin/
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  // 3. Auto-download standalone executable for current OS
  let downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
  if (process.platform === 'win32') {
    downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
  } else if (process.platform === 'darwin') {
    downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
  }

  try {
    await downloadBinary(downloadUrl, localBin);
    return localBin;
  } catch (err) {
    console.error('[SyncCast Binaries] Error downloading yt-dlp:', err.message);
    throw new Error(`yt-dlp is not installed and auto-download failed: ${err.message}. Please install yt-dlp on the host system.`);
  }
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

  // 1. Check/Install yt-dlp
  try {
    const ytPath = await getYtDlpPath();
    console.log(`[SyncCast Binaries] yt-dlp ready: ${ytPath}`);
  } catch (err) {
    console.warn(`[SyncCast Binaries] Warning checking yt-dlp:`, err.message);
  }

  // 2. On Linux (e.g. Render), download static ffmpeg if not present
  if (process.platform === 'linux' && !getFfmpegPath()) {
    const ffmpegBin = path.join(BIN_DIR, 'ffmpeg');
    const ffmpegUrl = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b5.0.1/linux-x64';
    try {
      console.log('[SyncCast Binaries] Downloading static ffmpeg for Linux...');
      await downloadBinary(ffmpegUrl, ffmpegBin);
    } catch (err) {
      console.warn('[SyncCast Binaries] Could not download static ffmpeg, will use native stream extraction:', err.message);
    }
  }
}

import os from 'os';

/**
 * Returns bypass arguments for cloud/datacenter IPs and optional cookies
 */
export function getYtDlpBypassArgs() {
  const args = [
    '--no-warnings',
    '--force-ipv4',
    '--no-check-certificates',
    '--extractor-retries', '3'
  ];

  // Cloud/Render support: check multiple cookie locations
  const possibleCookieLocations = [
    path.resolve(os.tmpdir(), 'synccast_yt_cookies.txt'),
    '/etc/secrets/cookies.txt', // Render Secret File standard path
    '/etc/secrets/youtube_cookies.txt',
    path.resolve(process.cwd(), 'cookies.txt'),
    path.resolve(__dirname, '..', '..', 'cookies.txt')
  ];

  const envCookies = process.env.YOUTUBE_COOKIES;
  if (envCookies && envCookies.trim()) {
    try {
      const tempPath = path.resolve(os.tmpdir(), 'synccast_yt_cookies.txt');
      fs.writeFileSync(tempPath, envCookies.trim(), 'utf8');
      args.push('--cookies', tempPath);
      return args;
    } catch (err) {
      console.warn('[SyncCast Binaries] Could not write YOUTUBE_COOKIES to tmp:', err.message);
    }
  }

  for (const cookiePath of possibleCookieLocations) {
    if (fs.existsSync(cookiePath)) {
      console.log(`[SyncCast Binaries] Using YouTube cookies from: ${cookiePath}`);
      args.push('--cookies', cookiePath);
      break;
    }
  }

  return args;
}
