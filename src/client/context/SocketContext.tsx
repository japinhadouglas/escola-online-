import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const { user, token } = useAuth();
  // Ref espelha o socket atual para evitar closures obsoletas (stale closures).
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user || !token) {
      const current = socketRef.current;
      socketRef.current = null;
      if (current) {
        current.disconnect();
        current.removeAllListeners();
      }
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const socketInstance = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      // Enviar token JWT no handshake para autenticação no socket server
      auth: {
        token: token,
      },
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      socketInstance.removeAllListeners();
      if (socketRef.current === socketInstance) {
        socketRef.current = null;
      }
    };
  }, [user?.id, token]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export function useSocket() {
  return useContext(SocketContext);
}
