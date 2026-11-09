import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthApi, MeApi } from '../api/resources';
import { currentSession, loadSession, saveSession, setPaywallHandler, setSignedOutHandler } from '../api/client';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  const clear = useCallback(async () => {
    await saveSession(null);
    qc.clear();
    setUser(null);
  }, [qc]);

  // Restore a persisted session on launch.
  useEffect(() => {
    setSignedOutHandler(() => { qc.clear(); setUser(null); });
    // If the server says community access is needed (e.g. it lapsed), refresh the cached entitlement.
    setPaywallHandler(() => qc.invalidateQueries({ queryKey: ['membership'] }));
    (async () => {
      try {
        if (await loadSession()) {
          const { user: me } = await MeApi.get();
          setUser(me);
        }
      } catch (e) {
        // Offline at launch keeps the session; a real 401 was already handled by the client.
        if (e.status && e.status !== 0) await clear();
      } finally {
        setReady(true);
      }
    })();
  }, [clear, qc]);

  const adopt = useCallback(async (res) => {
    await saveSession(res);
    setUser(res.user);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      signedIn: Boolean(user),
      onboardingDone: Boolean(user?.preferences?.onboardingCompleted),
      async login(body) { await adopt(await AuthApi.login(body)); },
      async register(body) { await adopt(await AuthApi.register(body)); },
      async logout() {
        const s = currentSession();
        try { if (s) await AuthApi.logout(s.refreshToken); } catch { /* best effort */ }
        await clear();
      },
      /** Applies a server-returned user (after PATCH /me etc.). */
      setUser(u) { setUser(u); },
      async updateMe(patch) {
        const { user: u } = await MeApi.update(patch);
        setUser(u);
        return u;
      },
    }),
    [ready, user, adopt, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
