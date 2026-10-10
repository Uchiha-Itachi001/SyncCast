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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');

const app = express();
const server = http.createServer(app);

// Enable CORS for LAN and cloud access
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));

app.use(express.json());

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

// Attach socket handlers
setupSocketHandlers(io);

// Start server listening on all network interfaces (0.0.0.0)
server.listen(CONFIG.PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`[SyncCast] Server running:`);
  console.log(` - Local:    http://localhost:${CONFIG.PORT}`);
  console.log(` - LAN / WiFi: http://${localIp}:${CONFIG.PORT}`);
  console.log(` - Client:   http://${localIp}:${CONFIG.CLIENT_PORT}`);
});
