import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import axios from 'axios';
import { purgeUserOfflineCache } from '../services/offlineDb';

const AuthContext = createContext();

const USER_CACHE_KEY = 'rural_learning_cached_user';

let storageRestricted = false;

const safeStorageGet = (key) => {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch (_e) {
    storageRestricted = true;
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(key);
    }
  } catch (_e) {
    storageRestricted = true;
  }
  return null;
};

const safeStorageSet = (key, value) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch (_e) {
    storageRestricted = true;
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, value);
    }
  } catch (_e) {
    storageRestricted = true;
  }
};

const safeStorageRemove = (key) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (_e) {
    // ignore
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(key);
    }
  } catch (_e) {
    // ignore
  }
};

let activeAuthToken = safeStorageGet('token');
let activeCachedUserRaw = safeStorageGet(USER_CACHE_KEY);

const applyAxiosAuthToken = (tok) => {
  activeAuthToken = tok || null;
  if (tok) {
    axios.defaults.headers.common.Authorization = `Bearer ${tok}`;
    axios.defaults.headers.common['X-Auth-Token'] = tok;
  } else {
    delete axios.defaults.headers.common.Authorization;
    delete axios.defaults.headers.common['X-Auth-Token'];
  }
};

if (activeAuthToken) {
  applyAxiosAuthToken(activeAuthToken);
}

// Attach both standard Authorization and proxy-resilient X-Auth-Token on every request
if (!axios.__dlpAuthInterceptorInstalled) {
  axios.__dlpAuthInterceptorInstalled = true;
  axios.interceptors.request.use((config) => {
    const nextConfig = config;
    nextConfig.headers = nextConfig.headers || {};
    if (!nextConfig.headers['X-Requested-With']) {
      nextConfig.headers['X-Requested-With'] = 'XMLHttpRequest';
    }
    const tok = activeAuthToken || safeStorageGet('token');
    if (tok) {
      if (!nextConfig.headers.Authorization) {
        nextConfig.headers.Authorization = `Bearer ${tok}`;
      }
      if (!nextConfig.headers['X-Auth-Token']) {
        nextConfig.headers['X-Auth-Token'] = tok;
      }
    }
    return nextConfig;
  });
}

const decodeJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json);
  } catch (_e) {
    return null;
  }
};

const isJwtUnexpired = (token) => {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.userId) return false;
  if (!payload.exp) return true;
  return payload.exp * 1000 > Date.now();
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(() => {
    const stored = safeStorageGet('token');
    applyAxiosAuthToken(stored);
    return stored;
  });
  const verifiedTokenRef = useRef(null);

  const persistUserSnapshot = useCallback((userData) => {
    const serialized = JSON.stringify(userData);
    activeCachedUserRaw = serialized;
    safeStorageSet(USER_CACHE_KEY, serialized);
  }, []);

  const performSecureLocalCleanup = useCallback(async (previousUserId) => {
    verifiedTokenRef.current = null;
    activeCachedUserRaw = null;
    safeStorageRemove('token');
    safeStorageRemove(USER_CACHE_KEY);
    applyAxiosAuthToken(null);
    setToken(null);
    setUser(null);
    await purgeUserOfflineCache(previousUserId, { preservePendingSync: false }).catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    const prevUserId = user?.id;
    const activeToken = token || activeAuthToken;
    if ((activeToken || user) && typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        await axios.post(
          '/api/auth/logout',
          {},
          activeToken
            ? {
                headers: {
                  Authorization: `Bearer ${activeToken}`,
                  'X-Auth-Token': activeToken,
                },
              }
            : undefined
        );
      } catch (_e) {
        // Proceed with local cleanup even if network is unreachable
      }
    }
    await performSecureLocalCleanup(prevUserId);
  }, [performSecureLocalCleanup, token, user]);

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      if (!token) {
        applyAxiosAuthToken(null);
        // When browser storage is blocked in a restricted iframe, recover session from HttpOnly cookie if present
        if (storageRestricted && typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            const cookieRes = await axios.get('/api/auth/me');
            if (!cancelled && cookieRes.data?.user) {
              setUser(cookieRes.data.user);
            }
          } catch (_e) {
            // Unauthenticated guest
          }
        }
        if (!cancelled) setLoading(false);
        return;
      }

      if (!isJwtUnexpired(token)) {
        const decoded = decodeJwtPayload(token);
        if (!cancelled) {
          await performSecureLocalCleanup(decoded?.userId);
          setLoading(false);
        }
        return;
      }

      applyAxiosAuthToken(token);

      // Skip redundant /api/auth/me check when token was just issued by login/register
      if (verifiedTokenRef.current === token) {
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get('/api/auth/me');
        if (!cancelled) {
          verifiedTokenRef.current = token;
          setUser(response.data.user);
          persistUserSnapshot(response.data.user);
        }
      } catch (error) {
        if (cancelled) return;
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          const decoded = decodeJwtPayload(token);
          await performSecureLocalCleanup(decoded?.userId);
        } else {
          // Offline / network outage: restore cached user profile matching unexpired JWT
          try {
            const cachedRaw = safeStorageGet(USER_CACHE_KEY) || activeCachedUserRaw;
            const cachedUser = cachedRaw ? JSON.parse(cachedRaw) : null;
            const decoded = decodeJwtPayload(token);
            if (cachedUser && decoded && Number(cachedUser.id) === Number(decoded.userId)) {
              setUser(cachedUser);
            } else {
              await performSecureLocalCleanup(decoded?.userId);
            }
          } catch (_e) {
            await performSecureLocalCleanup(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, [token, performSecureLocalCleanup, persistUserSnapshot]);

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', { username, password });
      const { token: newToken, user: userData } = response.data;

      verifiedTokenRef.current = newToken;
      safeStorageSet('token', newToken);
      persistUserSnapshot(userData);
      applyAxiosAuthToken(newToken);
      flushSync(() => {
        setUser(userData);
        setToken(newToken);
        setLoading(false);
      });

      return { success: true, user: userData };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed. Check your credentials or internet connection.',
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await axios.post('/api/auth/register', userData);
      const { token: newToken, user: newUser } = response.data;

      verifiedTokenRef.current = newToken;
      safeStorageSet('token', newToken);
      persistUserSnapshot(newUser);
      applyAxiosAuthToken(newToken);
      flushSync(() => {
        setUser(newUser);
        setToken(newToken);
        setLoading(false);
      });

      return { success: true, user: newUser };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Registration failed',
      };
    }
  };

  const updateUserState = useCallback((updatedUser, newToken = null) => {
    if (newToken) {
      verifiedTokenRef.current = newToken;
      safeStorageSet('token', newToken);
      applyAxiosAuthToken(newToken);
      setToken(newToken);
    }
    if (updatedUser) {
      persistUserSnapshot(updatedUser);
      setUser(updatedUser);
    }
  }, [persistUserSnapshot]);

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    updateUserState,
    isAuthenticated: Boolean(user),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
