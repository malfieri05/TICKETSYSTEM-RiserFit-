'use client';

import { createContext, useCallback, useEffect, useState } from 'react';
import { authApi } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');

    const hydrateFromMe = async () => {
      try {
        if (!storedToken) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          setToken(null);
          setUser(null);
          return;
        }

        // Prefer live /auth/me payload so role/departments/scopes stay current.
        const res = await authApi.me();
        const me = res.data;
        localStorage.setItem('auth_token', storedToken);
        localStorage.setItem('auth_user', JSON.stringify(me));
        setToken(storedToken);
        setUser(me);
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    // If we have a stored token (and maybe a stored user), always refresh from /auth/me.
    if (storedToken) {
      hydrateFromMe();
    } else {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
