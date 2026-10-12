import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
  }

  connect(serverUrl) {
    if (this.socket) {
      this.socket.disconnect();
    }

    // Connect to server (explicit VITE_SERVER_URL, origin if deployed, or LAN IP:3001)
    const defaultUrl = import.meta.env.VITE_SERVER_URL || (import.meta.env.PROD
      ? window.location.origin
      : `http://${window.location.hostname}:3001`);

    const url = serverUrl || defaultUrl;
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      timeout: 8000
    });


    return this.socket;
  }

  getSocket() {
    if (!this.socket) {
      return this.connect();
    }
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
