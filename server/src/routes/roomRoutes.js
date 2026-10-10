import express from 'express';
import { roomService } from '../services/roomService.js';
import { getLocalIpAddress } from '../utils/network.js';
import { CONFIG } from '../config/constants.js';

const router = express.Router();

// Network info endpoint for QR code and LAN discovery
router.get('/network', (req, res) => {
  const localIp = getLocalIpAddress();
  res.json({
    localIp,
    serverPort: CONFIG.PORT,
    clientPort: CONFIG.CLIENT_PORT,
    clientUrl: `http://${localIp}:${CONFIG.CLIENT_PORT}`,
    serverUrl: `http://${localIp}:${CONFIG.PORT}`
  });
});

// Room details endpoint
router.get('/:code', (req, res) => {
  const room = roomService.getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(room.toJSON());
});

export const roomRouter = router;
