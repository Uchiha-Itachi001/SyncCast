import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config/constants.js';

const router = express.Router();

// Ensure upload directory exists
if (!fs.existsSync(CONFIG.AUDIO_UPLOAD_DIR)) {
  fs.mkdirSync(CONFIG.AUDIO_UPLOAD_DIR, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, CONFIG.AUDIO_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size for local streaming
});

// Upload endpoint
router.post('/upload', upload.single('audio'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  const trackInfo = {
    id: path.parse(req.file.filename).name,
    originalName: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size,
    url: `/api/audio/stream/${req.file.filename}`,
    mimeType: req.file.mimetype
  };

  res.status(201).json(trackInfo);
});

// Static audio streaming / download endpoint
router.get('/stream/:filename', (req, res) => {
  const filePath = path.join(CONFIG.AUDIO_UPLOAD_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  // Support range requests for partial streaming and Web Audio byte buffering
  res.sendFile(filePath);
});

// Proxy endpoint for external audio streams with CORS & SSRF protection (Phase 4.3)
router.get('/proxy', async (req, res) => {
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

  const hostname = parsed.hostname.toLowerCase();
  // SSRF Protection: Block localhost, cloud metadata, and loopback
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '::1'];
  if (blockedHosts.includes(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return res.status(403).json({ error: 'Access to local/private network addresses is forbidden' });
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'SyncCast-AudioRelay/1.0'
      }
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: `Remote stream responded with ${upstreamRes.status}: ${upstreamRes.statusText}`
      });
    }

    const contentType = upstreamRes.headers.get('content-type') || 'audio/mpeg';
    const contentLength = upstreamRes.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Stream native web stream into Node response
    const reader = upstreamRes.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
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
      res.status(502).json({ error: `Proxy fetch failed: ${err.message}` });
    }
  }
});

export const audioRouter = router;

