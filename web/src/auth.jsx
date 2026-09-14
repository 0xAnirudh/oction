import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { resetSocket } from './socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const adopt = useCallback((res) => {
    setToken(res.token);
    setUser(res.user);
    // The socket carries the token in its handshake, so a new session
    // needs a new connection rather than the anonymous one already open.
    resetSocket();
    return res.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      signIn: (body) => api.post('/auth/login', body).then(adopt),
      signUp: (body) => api.post('/auth/register', body).then(adopt),
      signOut: () => {
        setToken(null);
        setUser(null);
        resetSocket();
      },
    }),
    [user, ready, adopt],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
