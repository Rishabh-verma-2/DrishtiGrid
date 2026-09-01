import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import useAuthStore from '../store/authStore';
import useSocketStore from '../store/socketStore';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001';

const useSocket = () => {
  const { accessToken, isAuthenticated } = useAuthStore();
  const { setSocket, setConnected, setOnlineUsers } = useSocketStore();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;
    setSocket(socket);

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      setConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setConnected(false);
    });

    socket.on('users:online', (count) => {
      setOnlineUsers(count);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    return () => {
      socket.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [isAuthenticated, accessToken]);

  return socketRef.current;
};

export default useSocket;
