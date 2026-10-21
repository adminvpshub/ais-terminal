import { io, Socket } from "socket.io-client";

const socketUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3001';

// Singleton socket instance
export const socket: Socket = io(socketUrl, {
  autoConnect: false,
  // Behind Cloudflare Tunnel long-polling is extremely slow and drops large binary
  // packets (file uploads), so go straight to WebSocket and keep polling as fallback.
  transports: ['websocket', 'polling'],
});

export const connectSocket = () => {
  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};