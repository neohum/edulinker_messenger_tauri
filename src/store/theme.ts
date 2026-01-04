import { create } from 'zustand';

export interface Theme {
  id: string;
  name: string;
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
  };
}

export const themes: Theme[] = [
  {
    id: 'blue',
    name: '파란색 (기본)',
    colors: {
      primary: '#3B82F6',
      primaryLight: '#60A5FA',
      primaryDark: '#2563EB',
      secondary: '#6366F1',
      accent: '#8B5CF6',
      background: '#F0F9FF',
      surface: '#FFFFFF',
      text: '#1E3A8A',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'green',
    name: '초록색',
    colors: {
      primary: '#10B981',
      primaryLight: '#34D399',
      primaryDark: '#059669',
      secondary: '#14B8A6',
      accent: '#06B6D4',
      background: '#ECFDF5',
      surface: '#FFFFFF',
      text: '#065F46',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'purple',
    name: '보라색',
    colors: {
      primary: '#8B5CF6',
      primaryLight: '#A78BFA',
      primaryDark: '#7C3AED',
      secondary: '#EC4899',
      accent: '#F472B6',
      background: '#FAF5FF',
      surface: '#FFFFFF',
      text: '#6B21A8',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'pink',
    name: '분홍색',
    colors: {
      primary: '#EC4899',
      primaryLight: '#F472B6',
      primaryDark: '#DB2777',
      secondary: '#F43F5E',
      accent: '#FB7185',
      background: '#FDF2F8',
      surface: '#FFFFFF',
      text: '#9D174D',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'orange',
    name: '주황색',
    colors: {
      primary: '#F97316',
      primaryLight: '#FB923C',
      primaryDark: '#EA580C',
      secondary: '#EF4444',
      accent: '#F59E0B',
      background: '#FFF7ED',
      surface: '#FFFFFF',
      text: '#9A3412',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'red',
    name: '빨간색',
    colors: {
      primary: '#EF4444',
      primaryLight: '#F87171',
      primaryDark: '#DC2626',
      secondary: '#F97316',
      accent: '#FB923C',
      background: '#FEF2F2',
      surface: '#FFFFFF',
      text: '#991B1B',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'teal',
    name: '청록색',
    colors: {
      primary: '#14B8A6',
      primaryLight: '#2DD4BF',
      primaryDark: '#0D9488',
      secondary: '#06B6D4',
      accent: '#22D3EE',
      background: '#F0FDFA',
      surface: '#FFFFFF',
      text: '#115E59',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'cyan',
    name: '하늘색',
    colors: {
      primary: '#06B6D4',
      primaryLight: '#22D3EE',
      primaryDark: '#0891B2',
      secondary: '#3B82F6',
      accent: '#60A5FA',
      background: '#ECFEFF',
      surface: '#FFFFFF',
      text: '#155E75',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'indigo',
    name: '남색',
    colors: {
      primary: '#6366F1',
      primaryLight: '#818CF8',
      primaryDark: '#4F46E5',
      secondary: '#8B5CF6',
      accent: '#A78BFA',
      background: '#EEF2FF',
      surface: '#FFFFFF',
      text: '#3730A3',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'yellow',
    name: '노란색',
    colors: {
      primary: '#EAB308',
      primaryLight: '#FACC15',
      primaryDark: '#CA8A04',
      secondary: '#F97316',
      accent: '#FB923C',
      background: '#FEFCE8',
      surface: '#FFFFFF',
      text: '#92400E',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'slate',
    name: '슬레이트',
    colors: {
      primary: '#64748B',
      primaryLight: '#94A3B8',
      primaryDark: '#475569',
      secondary: '#6B7280',
      accent: '#9CA3AF',
      background: '#F8FAFC',
      surface: '#FFFFFF',
      text: '#334155',
      textSecondary: '#6B7280',
    },
  },
  {
    id: 'dark',
    name: '다크 모드',
    colors: {
      primary: '#3B82F6',
      primaryLight: '#60A5FA',
      primaryDark: '#2563EB',
      secondary: '#6366F1',
      accent: '#8B5CF6',
      background: '#1F2937',
      surface: '#374151',
      text: '#F9FAFB',
      textSecondary: '#D1D5DB',
    },
  },
];

const DEFAULT_THEME_ID = 'slate';
const DEFAULT_TEXT_DARK = '#0F172A';
const DEFAULT_TEXT_LIGHT = '#F8FAFC';

function getDefaultTheme() {
  return themes.find((theme) => theme.id === DEFAULT_THEME_ID) ?? themes[0];
}

function hexToRgb(hex: string) {
  const value = hex.replace('#', '').trim();
  if (value.length !== 3 && value.length !== 6) {
    return null;
  }
  const normalized = value.length === 3
    ? value.split('').map((char) => char + char).join('')
    : value;
  const intValue = Number.parseInt(normalized, 16);
  if (Number.isNaN(intValue)) {
    return null;
  }
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
}

function getRelativeLuminance({ r, g, b }: { r: number; g: number; b: number }) {
  const toLinear = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  const rLin = toLinear(r);
  const gLin = toLinear(g);
  const bLin = toLinear(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function getReadableTextColor(background: string) {
  const rgb = hexToRgb(background);
  if (!rgb) {
    return DEFAULT_TEXT_DARK;
  }
  const luminance = getRelativeLuminance(rgb);
  return luminance > 0.5 ? DEFAULT_TEXT_DARK : DEFAULT_TEXT_LIGHT;
}

function getSecondaryTextColor(primaryText: string) {
  return primaryText === DEFAULT_TEXT_LIGHT
    ? 'rgba(248, 250, 252, 0.75)'
    : 'rgba(15, 23, 42, 0.7)';
}

interface ThemeState {
  currentTheme: Theme;
  isLoading: boolean;
  setTheme: (themeId: string) => Promise<void>;
  loadTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  currentTheme: getDefaultTheme(),
  isLoading: true,

  setTheme: async (themeId: string) => {
    const theme = themes.find((t) => t.id === themeId);
    if (theme) {
      set({ currentTheme: theme });
      applyTheme(theme);

      // SQLite에 테마 저장
      try {
        await window.electronAPI?.setTheme?.(themeId);
      } catch (error) {
        console.error('Failed to save theme to SQLite:', error);
      }
    }
  },

  loadTheme: async () => {
    try {
      const result = await window.electronAPI?.getTheme?.();
      if (result?.success && result.themeId) {
        const theme = themes.find((t) => t.id === result.themeId);
        if (theme) {
          set({ currentTheme: theme, isLoading: false });
          applyTheme(theme);
          return;
        }
      }
    } catch (error) {
      console.error('Failed to load theme from SQLite:', error);
    }

    // 기본 테마 적용
    set({ isLoading: false });
    applyTheme(getDefaultTheme());
  }
}));

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const textColor = getReadableTextColor(theme.colors.background);
  const textSecondaryColor = getSecondaryTextColor(textColor);
  root.style.setProperty('--color-primary', theme.colors.primary);
  root.style.setProperty('--color-primary-light', theme.colors.primaryLight);
  root.style.setProperty('--color-primary-dark', theme.colors.primaryDark);
  root.style.setProperty('--color-secondary', theme.colors.secondary);
  root.style.setProperty('--color-accent', theme.colors.accent);
  root.style.setProperty('--color-background', theme.colors.background);
  root.style.setProperty('--color-surface', theme.colors.surface);
  root.style.setProperty('--color-text', textColor);
  root.style.setProperty('--color-text-secondary', textSecondaryColor);
}
