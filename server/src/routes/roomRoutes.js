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

// Room details endpoint (Input validated: 4 digits)
router.get('/:code', (req, res) => {
  const { code } = req.params;
  if (!code || !/^\d{4}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid room code format. Must be 4 digits.' });
  }

  const room = roomService.getRoom(code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(room.toJSON());
});

export const roomRouter = router;
