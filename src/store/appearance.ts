import { create } from 'zustand';
import { themes } from './theme';

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen'," +
  " 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif";

const SETTINGS_KEYS = {
  fontSize: 'appearance.fontSize',
  fontFamily: 'appearance.fontFamily',
  textColorGlobal: 'appearance.textColor',
  textColorSidebar: 'appearance.textColorSidebar',
  textColorHeader: 'appearance.textColorHeader',
};

const themeIds = new Set(themes.map((theme) => theme.id));
const DEFAULT_TEXT_DARK = '#0F172A';
const DEFAULT_TEXT_LIGHT = '#F8FAFC';

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

interface AppearanceState {
  fontSize: number;
  fontFamily: string;
  textColorGlobal: string | null;
  textColorSidebar: string | null;
  textColorHeader: string | null;
  isLoading: boolean;
  setFontSize: (size: number) => Promise<void>;
  setFontFamily: (family: string) => Promise<void>;
  setTextColorGlobal: (color: string | null) => Promise<void>;
  setTextColorSidebar: (color: string | null) => Promise<void>;
  setTextColorHeader: (color: string | null) => Promise<void>;
  resetTextColorsToDefault: (fallbackThemeId?: string) => Promise<void>;
  loadAppearance: () => Promise<void>;
}

function resolveThemeTextColor(themeId: string | null) {
  if (!themeId) {
    return null;
  }
  const theme = themes.find((item) => item.id === themeId);
  return theme ? getReadableTextColor(theme.colors.background) : null;
}

function applyTextColorVariable(name: string, themeId: string | null, fallbackThemeId?: string) {
  const root = document.documentElement;
  const color = resolveThemeTextColor(themeId) ?? (fallbackThemeId ? resolveThemeTextColor(fallbackThemeId) : null);
  if (color) {
    root.style.setProperty(name, color);
  } else {
    root.style.removeProperty(name);
  }
}

function applyAppearanceState(
  fontSize: number,
  fontFamily: string,
  textColorGlobal: string | null,
  textColorSidebar: string | null,
  textColorHeader: string | null,
  fallbackThemeId?: string
) {
  const root = document.documentElement;
  root.style.setProperty('--font-size-base', `${fontSize}px`);
  root.style.setProperty('--font-family-base', fontFamily);
  applyTextColorVariable('--color-text-override', textColorGlobal, fallbackThemeId);
  applyTextColorVariable('--color-text-sidebar-override', textColorSidebar, fallbackThemeId);
  applyTextColorVariable('--color-text-header-override', textColorHeader, fallbackThemeId);
}

async function saveSetting(key: string, value: string) {
  try {
    await window.electronAPI?.setSetting?.(key, value);
  } catch (error) {
    console.error('Failed to save setting:', key, error);
  }
}

async function readSetting(key: string) {
  try {
    const result = await window.electronAPI?.getSetting?.(key);
    if (result?.success && result.value !== undefined) {
      return result.value;
    }
  } catch (error) {
    console.error('Failed to read setting:', key, error);
  }
  return null;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  fontSize: DEFAULT_FONT_SIZE,
  fontFamily: DEFAULT_FONT_FAMILY,
  textColorGlobal: null,
  textColorSidebar: null,
  textColorHeader: null,
  isLoading: true,

  setFontSize: async (size: number) => {
    set({ fontSize: size });
    applyAppearanceState(
      size,
      get().fontFamily,
      get().textColorGlobal,
      get().textColorSidebar,
      get().textColorHeader
    );
    await saveSetting(SETTINGS_KEYS.fontSize, String(size));
  },

  setFontFamily: async (family: string) => {
    set({ fontFamily: family });
    applyAppearanceState(
      get().fontSize,
      family,
      get().textColorGlobal,
      get().textColorSidebar,
      get().textColorHeader
    );
    await saveSetting(SETTINGS_KEYS.fontFamily, family);
  },

  setTextColorGlobal: async (color: string | null) => {
    set({ textColorGlobal: color });
    applyAppearanceState(
      get().fontSize,
      get().fontFamily,
      color,
      get().textColorSidebar,
      get().textColorHeader
    );
    await saveSetting(SETTINGS_KEYS.textColorGlobal, color ?? '');
  },

  setTextColorSidebar: async (color: string | null) => {
    set({ textColorSidebar: color });
    applyAppearanceState(
      get().fontSize,
      get().fontFamily,
      get().textColorGlobal,
      color,
      get().textColorHeader
    );
    await saveSetting(SETTINGS_KEYS.textColorSidebar, color ?? '');
  },

  setTextColorHeader: async (color: string | null) => {
    set({ textColorHeader: color });
    applyAppearanceState(
      get().fontSize,
      get().fontFamily,
      get().textColorGlobal,
      get().textColorSidebar,
      color
    );
    await saveSetting(SETTINGS_KEYS.textColorHeader, color ?? '');
  },

  resetTextColorsToDefault: async (fallbackThemeId?: string) => {
    set({
      textColorGlobal: null,
      textColorSidebar: null,
      textColorHeader: null,
    });
    applyAppearanceState(
      get().fontSize,
      get().fontFamily,
      null,
      null,
      null,
      fallbackThemeId
    );
    await Promise.all([
      saveSetting(SETTINGS_KEYS.textColorGlobal, ''),
      saveSetting(SETTINGS_KEYS.textColorSidebar, ''),
      saveSetting(SETTINGS_KEYS.textColorHeader, ''),
    ]);
  },

  loadAppearance: async () => {
    const [fontSizeValue, fontFamilyValue, textColorGlobalValue, textColorSidebarValue, textColorHeaderValue] = await Promise.all([
      readSetting(SETTINGS_KEYS.fontSize),
      readSetting(SETTINGS_KEYS.fontFamily),
      readSetting(SETTINGS_KEYS.textColorGlobal),
      readSetting(SETTINGS_KEYS.textColorSidebar),
      readSetting(SETTINGS_KEYS.textColorHeader),
    ]);

    const parsedFontSize = Number.parseInt(fontSizeValue ?? '', 10);
    const fontSize = Number.isFinite(parsedFontSize) ? parsedFontSize : DEFAULT_FONT_SIZE;
    const fontFamily = fontFamilyValue || DEFAULT_FONT_FAMILY;
    const textColorGlobal = textColorGlobalValue && themeIds.has(textColorGlobalValue) ? textColorGlobalValue : null;
    const textColorSidebar = textColorSidebarValue && themeIds.has(textColorSidebarValue) ? textColorSidebarValue : null;
    const textColorHeader = textColorHeaderValue && themeIds.has(textColorHeaderValue) ? textColorHeaderValue : null;

    set({
      fontSize,
      fontFamily,
      textColorGlobal,
      textColorSidebar,
      textColorHeader,
      isLoading: false,
    });

    applyAppearanceState(fontSize, fontFamily, textColorGlobal, textColorSidebar, textColorHeader);
  },
}));

export function applyAppearance(
  fontSize: number,
  fontFamily: string,
  textColorGlobal: string | null,
  textColorSidebar: string | null,
  textColorHeader: string | null,
  fallbackThemeId?: string
) {
  applyAppearanceState(
    fontSize,
    fontFamily,
    textColorGlobal,
    textColorSidebar,
    textColorHeader,
    fallbackThemeId
  );
}
