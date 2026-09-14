import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socket;

export function getSocket() {
  if (!socket) {
    socket = io({
      // The callback form, not a returning function. socket.io-client
      // invokes this with a callback and ignores anything returned, so
      // `auth: () => ({ token })` leaves the namespace handshake waiting
      // forever: the engine opens, the transport reports websocket, and
      // `socket.connected` never becomes true.
      //
      // Reading the token here rather than closing over it means a
      // reconnect after a sign-in carries the new one.
      auth: (cb) => cb({ token: getToken() ?? undefined }),
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function resetSocket() {
  socket?.disconnect();
  socket = undefined;
}
