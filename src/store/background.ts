import { create } from 'zustand';

const SETTINGS_KEYS = {
  backgroundColor: 'appearance.backgroundColor',
  backgroundImageUrl: 'appearance.backgroundImageUrl',
  cardOpacity: 'appearance.cardOpacity',
};

interface BackgroundState {
  backgroundColor: string | null;
  backgroundImageUrl: string | null;
  cardOpacity: number; // 0-100
  isLoading: boolean;
  setBackgroundColor: (color: string | null) => Promise<void>;
  setBackgroundImageUrl: (url: string | null) => Promise<void>;
  setCardOpacity: (opacity: number) => Promise<void>;
  loadBackground: () => Promise<void>;
}

function applyBackgroundState(color: string | null, imageUrl: string | null, cardOpacity: number = 85, fallbackColor?: string) {
  const root = document.documentElement;
  const resolvedColor = color ?? fallbackColor ?? '#F8FAFC';
  root.style.setProperty('--app-bg-color', resolvedColor);
  if (imageUrl) {
    const escapedUrl = imageUrl.replace(/"/g, '\\"');
    root.style.setProperty('--app-bg-image', `url("${escapedUrl}")`);
  } else {
    root.style.setProperty('--app-bg-image', 'none');
  }
  // 카드 투명도 적용 (0-100 => 0%-100%)
  root.style.setProperty('--card-opacity', `${cardOpacity}%`);
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

export const useBackgroundStore = create<BackgroundState>((set, get) => ({
  backgroundColor: null,
  backgroundImageUrl: null,
  cardOpacity: 85,
  isLoading: true,

  setBackgroundColor: async (color: string | null) => {
    set({ backgroundColor: color });
    applyBackgroundState(color, get().backgroundImageUrl, get().cardOpacity);
    await saveSetting(SETTINGS_KEYS.backgroundColor, color ?? '');
  },

  setBackgroundImageUrl: async (url: string | null) => {
    set({ backgroundImageUrl: url });
    applyBackgroundState(get().backgroundColor, url, get().cardOpacity);
    await saveSetting(SETTINGS_KEYS.backgroundImageUrl, url ?? '');
  },

  setCardOpacity: async (opacity: number) => {
    set({ cardOpacity: opacity });
    applyBackgroundState(get().backgroundColor, get().backgroundImageUrl, opacity);
    await saveSetting(SETTINGS_KEYS.cardOpacity, String(opacity));
  },

  loadBackground: async () => {
    const [colorValue, imageValue, opacityValue] = await Promise.all([
      readSetting(SETTINGS_KEYS.backgroundColor),
      readSetting(SETTINGS_KEYS.backgroundImageUrl),
      readSetting(SETTINGS_KEYS.cardOpacity),
    ]);

    const backgroundColor = colorValue && colorValue.trim().length > 0 ? colorValue : null;
    const backgroundImageUrl = imageValue && imageValue.trim().length > 0 ? imageValue : null;
    const cardOpacity = opacityValue ? parseInt(opacityValue, 10) : 85;

    set({
      backgroundColor,
      backgroundImageUrl,
      cardOpacity,
      isLoading: false,
    });

    applyBackgroundState(backgroundColor, backgroundImageUrl, cardOpacity);
  },
}));

export function applyBackground(
  backgroundColor: string | null,
  backgroundImageUrl: string | null,
  cardOpacity: number = 85,
  fallbackColor?: string
) {
  applyBackgroundState(backgroundColor, backgroundImageUrl, cardOpacity, fallbackColor);
}
