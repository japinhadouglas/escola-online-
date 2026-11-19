import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserSession, UserRole } from '../../shared/types.js';

interface AuthContextType {
  user: UserSession | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: UserSession) => void;
  logout: () => void;
  updateUser: (user: Partial<UserSession>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function sanitizeUserSession(value: unknown): UserSession {
  if (!value || typeof value !== 'object') {
    throw new Error('Dados de sessão inválidos');
  }

  const parsed = value as Record<string, unknown>;
  const validRole: UserRole[] = ['STUDENT', 'TEACHER', 'COORDINATOR', 'ADMIN', 'SUPERADMIN'];
  if (
    typeof parsed.id !== 'string' ||
    typeof parsed.schoolId !== 'string' ||
    typeof parsed.name !== 'string' ||
    typeof parsed.registrationNumber !== 'string' ||
    typeof parsed.role !== 'string' ||
    !validRole.includes(parsed.role as UserRole)
  ) {
    throw new Error('Dados de sessão inválidos');
  }

  return {
    ...(parsed as unknown as UserSession),
    // Falhar fechado: "false", 0, null ou qualquer outro valor não libera a aba.
    isMonitor: parsed.isMonitor === true,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('escola_token');
    const savedUser = localStorage.getItem('escola_user');

    if (savedToken && savedUser) {
      try {
        const parsed = sanitizeUserSession(JSON.parse(savedUser));
        setToken(savedToken);
        // O status de monitor precisa ser confirmado novamente pelo /auth/me.
        // Nunca liberar a aba usando um valor antigo salvo no navegador.
        setUser({ ...parsed, isMonitor: false });
      } catch (err) {
        localStorage.removeItem('escola_token');
        localStorage.removeItem('escola_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newToken: string, newUser: UserSession) => {
    const sanitizedUser = sanitizeUserSession(newUser);
    setToken(newToken);
    setUser(sanitizedUser);
    localStorage.setItem('escola_token', newToken);
    localStorage.setItem('escola_user', JSON.stringify(sanitizedUser));
  };

  const logout = () => {
    if (token) {
      fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('escola_token');
    localStorage.removeItem('escola_user');
  };

  const updateUser = (updatedFields: Partial<UserSession>) => {
    if (user) {
      const updated = sanitizeUserSession({
        ...user,
        ...updatedFields,
        isMonitor: updatedFields.isMonitor === true,
      });
      setUser(updated);
      localStorage.setItem('escola_user', JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}
