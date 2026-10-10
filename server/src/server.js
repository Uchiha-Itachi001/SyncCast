import http from 'http';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { CONFIG } from './config/constants.js';
import { getLocalIpAddress } from './utils/network.js';
import { setupSocketHandlers } from './socket/socketHandler.js';
import { audioRouter } from './routes/audioRoutes.js';
import { roomRouter } from './routes/roomRoutes.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { ensureBinaries } from './utils/binaries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

const app = express();
const server = http.createServer(app);

// Disable technology fingerprinting
app.disable('x-powered-by');

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Enable CORS for LAN and cloud access
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

// Restrict JSON payload size to 1MB to prevent memory exhaustion
app.use(express.json({ limit: '1mb' }));

// Global API rate limiter (200 requests per minute per IP)
const globalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 200,
  message: 'Global API request rate limit exceeded. Please wait a minute.'
});
app.use('/api', globalApiLimiter);

// Mount API routes
app.use('/api/audio', audioRouter);
app.use('/api/rooms', roomRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SyncCast LAN Audio Coordinator',
    timestamp: Date.now()
  });
});

// Serve frontend SPA bundle when built
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 5000,
  pingTimeout: 10000
});

// Provide io instance to Express routes
app.set('io', io);

// Attach socket handlers
setupSocketHandlers(io);

// Graceful EADDRINUSE handling
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [SyncCast Port Conflict] Port ${CONFIG.PORT} is already in use by another running process.`);
    console.error(`💡 Tip: To free port ${CONFIG.PORT}, run this in PowerShell:`);
    console.error(`   Stop-Process -Id (Get-NetTCPConnection -LocalPort ${CONFIG.PORT}).OwningProcess -Force\n`);
    process.exit(1);
  } else {
    console.error('[SyncCast Server Error]', err);
    process.exit(1);
  }
});

// Verify binaries and start server listening on all network interfaces (0.0.0.0)
ensureBinaries().finally(() => {
  server.listen(CONFIG.PORT, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log(`[SyncCast] Server running:`);
    console.log(` - Local:    http://localhost:${CONFIG.PORT}`);
    console.log(` - LAN / WiFi: http://${localIp}:${CONFIG.PORT}`);
    console.log(` - Client:   http://${localIp}:${CONFIG.CLIENT_PORT}`);
  });
});
