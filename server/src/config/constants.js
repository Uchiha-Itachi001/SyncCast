import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  PORT: process.env.PORT || 3001,
  CLIENT_PORT: process.env.CLIENT_PORT || 5173,
  MAX_DRIFT_MS: 20, // PRD target: <20ms playback drift
  RESYNC_THRESHOLD_MS: 15, // Auto-resync when drift exceeds 15ms
  NTP_CALIBRATION_PINGS: 10, // Number of pings for stable clock offset baseline
  SCHEDULE_AHEAD_MS: 2500, // Schedule playback 2500ms ahead for network distribution across all devices
  MAX_ROOM_DEVICES: 10, // Prevent WiFi broadcast storms on residential routers
  AUDIO_UPLOAD_DIR: path.resolve(__dirname, '../../uploads'),
  ALLOWED_AUDIO_TYPES: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/m4a']
};
