import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
  }

  connect(serverUrl) {
    if (this.socket) {
      this.socket.disconnect();
    }

    // Connect to server (LAN IP:3001 in dev, window.location.origin on Render / production)
    const defaultUrl = import.meta.env.PROD
      ? window.location.origin
      : (import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`);

    const url = serverUrl || defaultUrl;
    this.socket = io(url, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
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
