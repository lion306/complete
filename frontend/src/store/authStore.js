import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../utils/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,

      login: async (email, passwort) => {
        set({ isLoading: true });
        try {
          const res = await authApi.login({ email, passwort });
          const { accessToken, refreshToken, user } = res.data;
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
          set({ user, accessToken, refreshToken, isLoading: false });
          return true;
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try { await authApi.logout(); } catch {}
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, accessToken: null, refreshToken: null });
      },

      refreshUser: async () => {
        try {
          const res = await authApi.me();
          set({ user: res.data });
        } catch {}
      },

      hasPermission: (flag) => {
        const { user } = get();
        return !!(user?.perm_admin || user?.[flag]);
      },

      hasRole: (...roles) => {
        const { user } = get();
        return !!(user?.perm_admin || roles.includes(user?.rolle));
      },
    }),
    {
      name: 'dms-auth',
      partialize: state => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

export default useAuthStore;
