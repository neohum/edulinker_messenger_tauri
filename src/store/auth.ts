import { create } from 'zustand';

export type UserStatus = 'online' | 'away' | 'offline';

export interface User {
  id: string;
  email?: string;
  name?: string;
  role: string;
  schoolId?: string;
  profileCompleted?: boolean;
  organizationGroup?: string;
  grade?: number;
  class?: string;
  classroom?: string;
  workplace?: string;
  jobTitle?: string;
  adminDuties?: string;
  extensionNumber?: string;
  phoneNumber?: string;
  subjects?: string[];
}

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: User | null;
  /** 사용자 상태: online, away, offline */
  status: UserStatus;
  /** 자리 비움 여부 (5분 이상 활동 없음) */
  isAway: boolean;
  setAuth: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  /** 상태 변경 (online, away, offline) */
  setStatus: (status: UserStatus) => void;
  /** 자리 비움 상태 설정 */
  setAway: (isAway: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  token: null,
  user: null,
  status: 'offline',
  isAway: false,
  setAuth: (token, user) => set({ isAuthenticated: true, token, user, status: 'online', isAway: false }),
  updateUser: (user) => set((state) => ({
    user: state.user ? { ...state.user, ...user } : user
  })),
  setStatus: (status) => set({ status, isAway: status === 'away' }),
  setAway: (isAway) => set({ isAway, status: isAway ? 'away' : 'online' }),
  logout: async () => {
    await window.electronAPI?.logout?.();
    set({ isAuthenticated: false, token: null, user: null, status: 'offline', isAway: false });
  },
}));

