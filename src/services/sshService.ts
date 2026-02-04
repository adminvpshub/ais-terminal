import { io, Socket } from "socket.io-client";

const socketUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:3001';

// Singleton socket instance
export const socket: Socket = io(socketUrl, {
  autoConnect: false,
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