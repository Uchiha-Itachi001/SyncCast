import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';
import util from 'util';
import { CONFIG } from '../config/constants.js';
import {
  isPrivateOrBlockedHost,
  isSafeFilename,
  ALLOWED_AUDIO_EXTS,
  ALLOWED_AUDIO_MIMES
} from '../utils/security.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';
import { getYtDlpPath, getFfmpegPath, getYtDlpBypassArgs } from '../utils/binaries.js';

const execFilePromise = util.promisify(execFile);
const router = express.Router();

// Ensure upload directory exists
if (!fs.existsSync(CONFIG.AUDIO_UPLOAD_DIR)) {
  fs.mkdirSync(CONFIG.AUDIO_UPLOAD_DIR, { recursive: true });
}

// Rate limiters for resource-intensive endpoints
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Upload rate limit reached. Please wait before uploading more files.'
});

const youtubeLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'YouTube extractor rate limit reached. Please wait a minute.'
});

const proxyLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Stream proxy rate limit reached.'
});

// Multer storage configuration with sanitized filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, CONFIG.AUDIO_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_AUDIO_EXTS.has(ext)) {
      ext = '.mp3';
    }
    const cleanExt = ext.replace(/[^a-z0-9.]/gi, '');
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${cleanExt}`;
    cb(null, uniqueName);
  }
});

// Auto-clean audio files older than 1 hour to prevent filling cloud disk
export function cleanupOldUploads(maxAgeMs = 60 * 60 * 1000) {
  try {
    if (!fs.existsSync(CONFIG.AUDIO_UPLOAD_DIR)) return;
    const now = Date.now();
    const files = fs.readdirSync(CONFIG.AUDIO_UPLOAD_DIR);
    for (const file of files) {
      if (file === '.gitkeep') continue;
      const filePath = path.join(CONFIG.AUDIO_UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`[SyncCast Storage] Auto-cleaned expired audio: ${file}`);
      }
    }
  } catch (err) {
    console.warn('[SyncCast Storage] Cleanup warning:', err.message);
  }
}

// Run storage cleanup every 20 minutes
setInterval(() => cleanupOldUploads(), 20 * 60 * 1000);
cleanupOldUploads();

// Multer instance with strict fileFilter and size limits
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_AUDIO_EXTS.has(ext)) {
      return cb(new Error(`Invalid file extension "${ext}". Allowed: ${Array.from(ALLOWED_AUDIO_EXTS).join(', ')}`));
    }
    if (!ALLOWED_AUDIO_MIMES.has(file.mimetype)) {
      return cb(new Error(`Invalid audio MIME type "${file.mimetype}".`));
    }
    cb(null, true);
  }
});

// Middleware wrapper for multer to catch and format errors cleanly
function handleUploadMiddleware(req, res, next) {
  upload.single('audio')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size allowed is 50MB.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

function isYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url.trim());
}

// 1. Upload endpoint (Rate-limited, validated, with exact ffprobe duration detection)
router.post('/upload', uploadLimiter, handleUploadMiddleware, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  // Detect audio duration using ffprobe
  let duration = 0;
  try {
    const { stdout } = await execFilePromise('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      req.file.path
    ], { timeout: 8000 });
    duration = Math.round(parseFloat(stdout.trim())) || 0;
  } catch (_) {}

  const trackInfo = {
    id: path.parse(req.file.filename).name,
    originalName: req.file.originalname.slice(0, 100),
    filename: req.file.filename,
    size: req.file.size,
    url: `/api/audio/stream/${req.file.filename}`,
    mimeType: req.file.mimetype,
    duration,
    source: 'upload'
  };

  res.status(201).json(trackInfo);
});

// 2. YouTube audio extraction endpoint (Real-time download telemetry over Socket.io)
router.post('/youtube', youtubeLimiter, async (req, res) => {
  const { url, socketId } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing YouTube URL' });
  }

  const trimmedUrl = url.trim();
  if (!isYouTubeUrl(trimmedUrl)) {
    return res.status(400).json({
      error: 'Invalid YouTube URL. Please provide a standard link (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)'
    });
  }

  const io = req.app.get('io');
  const emitProgress = (payload) => {
    if (io && socketId) {
      io.to(socketId).emit('youtube:progress', payload);
    }
  };

  try {
    console.log(`[SyncCast YouTube] Extracting info for URL: ${trimmedUrl}`);
    emitProgress({
      percent: 10,
      step: 'metadata',
      message: 'Step 1/3: Resolving video stream metadata from YouTube...'
    });

    // Step 1: Resolve binary path (system PATH or auto-downloaded server/bin/)
    const ytDlpBinary = await getYtDlpPath();
    const ffmpegBinary = getFfmpegPath();

    // Resilient metadata resolution with mobile/embedded client profiles (completely avoids blocked desktop web player)
    const clientProfiles = [
      'youtube:player_client=android_embedded',
      'youtube:player_client=android_music',
      'youtube:player_client=android_creator',
      'youtube:player_client=android',
      'youtube:player_client=tv'
    ];

    let meta = null;
    let winningClient = 'youtube:player_client=android_embedded';
    let lastMetaError = null;

    for (const clientProfile of clientProfiles) {
      try {
        const bypassArgs = getYtDlpBypassArgs();
        const args = [
          '--dump-json',
          '--no-playlist',
          '--extractor-args', clientProfile,
          ...bypassArgs,
          trimmedUrl
        ];
        const { stdout: metaJson } = await execFilePromise(ytDlpBinary, args, { timeout: 25000 });
        meta = JSON.parse(metaJson);
        winningClient = clientProfile;
        break;
      } catch (err) {
        lastMetaError = err;
        console.warn(`[SyncCast YouTube] Metadata profile (${clientProfile}) failed: ${err.message}. Retrying fallback client...`);
      }
    }

    if (!meta) {
      throw lastMetaError || new Error('Failed to resolve video stream metadata from YouTube');
    }

    const title = meta.title || 'YouTube Audio';
    const author = meta.uploader || meta.channel || 'YouTube Creator';
    const duration = parseInt(meta.duration, 10) || 0;

    // Security DoS defense: Block overly long videos (> 30 mins)
    if (duration > 1800) {
      return res.status(400).json({
        error: 'Video duration exceeds 30 minutes. Please select a shorter song to conserve server resources.'
      });
    }

    const rawVideoId = meta.id || `${Date.now()}`;
    const safeVideoId = rawVideoId.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32);
    const uniqueTimestamp = Date.now();
    const outTemplate = path.join(CONFIG.AUDIO_UPLOAD_DIR, `yt-${safeVideoId}-${uniqueTimestamp}.%(ext)s`);

    console.log(`[SyncCast YouTube] Spawning streaming download for: ${title}`);
    emitProgress({
      percent: 25,
      step: 'downloading',
      title,
      author,
      duration,
      total: '',
      speed: '',
      eta: '',
      message: `Step 2/3: Downloading stream for "${title.slice(0, 35)}..."`
    });

    // Step 2: Build yt-dlp arguments with datacenter bot bypass and fallback formats
    const ytArgs = [
      '--no-playlist',
      '--max-filesize', '50M',
      '--newline',
      '-o', outTemplate,
      '--extractor-args', winningClient,
      ...getYtDlpBypassArgs()
    ];

    if (ffmpegBinary) {
      ytArgs.push('-x', '--audio-format', 'mp3');
      if (path.isAbsolute(ffmpegBinary)) {
        ytArgs.push('--ffmpeg-location', ffmpegBinary);
      }
    } else {
      ytArgs.push('-f', 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best');
    }
    ytArgs.push(trimmedUrl);

    await new Promise((resolve, reject) => {
      const child = spawn(ytDlpBinary, ytArgs);

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        for (const line of text.split(/[\r\n]+/)) {
          if (!line.trim()) continue;
          const match = line.match(/\[download\]\s+([\d\.]+)%\s+of\s+~?([\w\.]+)\s+(?:at\s+([\w\.\/]+))?\s+(?:ETA\s+([\d:]+))?/);
          if (match) {
            const rawPct = parseFloat(match[1]) || 0;
            // Map download 0-100% to overall progress 25%-90%
            const overallPct = Math.round(25 + (rawPct * 0.65));
            emitProgress({
              percent: overallPct,
              downloadPercent: rawPct,
              total: match[2] || '',
              speed: match[3] || '',
              eta: match[4] || '',
              step: 'downloading',
              message: `Downloading: ${rawPct.toFixed(0)}% of ${match[2]} (${match[3] || ''}) - ETA ${match[4] || ''}`
            });
          } else if (line.includes('[ExtractAudio]')) {
            emitProgress({
              percent: 92,
              step: 'converting',
              message: 'Step 3/3: Converting raw audio stream into standard MP3...'
            });
          }
        }
      });

      child.stderr.on('data', (chunk) => {
        const errText = chunk.toString();
        if (errText.includes('ERROR:')) {
          console.error('[SyncCast yt-dlp stderr]', errText.trim());
        }
      });

      child.on('error', (err) => reject(err));

      child.on('close', (code) => {
        if (code === 0) {
          emitProgress({
            percent: 100,
            step: 'complete',
            message: 'Audio extraction complete!'
          });
          resolve();
        } else {
          reject(new Error(`yt-dlp extraction failed with exit code ${code}`));
        }
      });
    });

    // Locate the exact file that was written to disk
    const allFiles = fs.readdirSync(CONFIG.AUDIO_UPLOAD_DIR);
    const matchedFile = allFiles.find(f => f.startsWith(`yt-${safeVideoId}-${uniqueTimestamp}`));
    if (!matchedFile) {
      throw new Error('Downloaded audio file not found on disk');
    }

    const finalFilename = matchedFile;
    const finalFilePath = path.join(CONFIG.AUDIO_UPLOAD_DIR, finalFilename);
    const stats = fs.statSync(finalFilePath);
    const ext = path.extname(finalFilename).toLowerCase();
    const mimeType = ext === '.mp3' ? 'audio/mpeg' : ext === '.m4a' || ext === '.aac' ? 'audio/mp4' : ext === '.webm' || ext === '.opus' ? 'audio/webm' : 'audio/mpeg';

    const trackInfo = {
      id: `yt-${safeVideoId}`,
      originalName: `${title} - ${author}`.slice(0, 100),
      filename: finalFilename,
      size: stats.size,
      url: `/api/audio/stream/${finalFilename}`,
      mimeType,
      duration,
      source: 'youtube',
      artist: author.slice(0, 60)
    };

    console.log(`[SyncCast YouTube] Extraction successful: ${trackInfo.originalName} (${(stats.size / 1024 / 1024).toFixed(2)} MB, format: ${ext})`);
    res.status(201).json(trackInfo);
  } catch (err) {
    console.error('[SyncCast YouTube] Extraction error:', err.message);

    let clientFacingError = err.message;
    if (err.message.includes('confirm you’re not a bot') || err.message.includes('Sign in to confirm')) {
      clientFacingError = 'YouTube requires verification for cloud server IPs. To fix on Render: add your exported cookies to the YOUTUBE_COOKIES environment variable, or upload the MP3 directly.';
    }

    emitProgress({
      percent: 0,
      step: 'error',
      message: clientFacingError
    });
    res.status(500).json({
      error: `Failed to extract YouTube audio: ${clientFacingError}`
    });
  }
});

// 3. Static audio streaming / download endpoint (Path Traversal protected)
router.get('/stream/:filename', (req, res) => {
  const filename = req.params.filename;

  // Path Traversal Defense
  if (!isSafeFilename(filename, CONFIG.AUDIO_UPLOAD_DIR)) {
    return res.status(400).json({ error: 'Invalid or forbidden filename' });
  }

  const filePath = path.join(CONFIG.AUDIO_UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  // Support range requests for partial streaming and Web Audio byte buffering
  res.sendFile(filePath);
});

// 4. Proxy endpoint for external audio streams with full SSRF protection (Phase 4.3)
router.get('/proxy', proxyLimiter, async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid url query parameter' });
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    return res.status(400).json({ error: 'Malformed URL' });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Protocol must be http or https' });
  }

  // Full Comprehensive SSRF Protection
  if (isPrivateOrBlockedHost(parsed.hostname)) {
    return res.status(403).json({ error: 'Access to local or private network addresses is forbidden (SSRF protection)' });
  }

  try {
    // 20-second timeout on remote stream fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const upstreamRes = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SyncCast-AudioRelay/1.0',
        'Accept': 'audio/*, application/ogg, application/octet-stream;q=0.9'
      }
    });

    clearTimeout(timeoutId);

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: `Remote stream responded with ${upstreamRes.status}: ${upstreamRes.statusText}`
      });
    }

    const contentType = (upstreamRes.headers.get('content-type') || '').toLowerCase();

    // Verify upstream content is actually audio (prevent proxying internal HTML or sensitive data)
    const isAudioType = contentType.startsWith('audio/') ||
      contentType.includes('ogg') ||
      contentType.includes('octet-stream');

    if (!isAudioType) {
      return res.status(415).json({
        error: `Target content-type "${contentType}" is not a recognized audio stream.`
      });
    }

    const contentLength = upstreamRes.headers.get('content-length');
    // Block excessive downloads > 100MB
    if (contentLength && parseInt(contentLength, 10) > 100 * 1024 * 1024) {
      return res.status(413).json({ error: 'Remote audio file exceeds 100MB limit.' });
    }

    res.setHeader('Content-Type', contentType || 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Stream native web stream into Node response with byte counter limit
    const reader = upstreamRes.body.getReader();
    let totalBytesStreamed = 0;
    const MAX_PROXY_BYTES = 100 * 1024 * 1024; // 100MB hard limit

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytesStreamed += value.length;
        if (totalBytesStreamed > MAX_PROXY_BYTES) {
          reader.cancel();
          res.destroy(new Error('Proxy stream exceeded 100MB limit'));
          return;
        }

        if (!res.write(value)) {
          await new Promise(resolve => res.once('drain', resolve));
        }
      }
      res.end();
    };

    req.on('close', () => {
      reader.cancel();
    });

    await pump();
  } catch (err) {
    if (!res.headersSent) {
      const isTimeout = err.name === 'AbortError';
      res.status(isTimeout ? 504 : 502).json({
        error: isTimeout ? 'Remote stream fetch timed out (20s)' : `Proxy fetch failed: ${err.message}`
      });
    }
  }
});

export const audioRouter = router;
