import { io, Socket } from "socket.io-client";

// Singleton socket instance
export const socket: Socket = io('http://localhost:3001', {
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