import { useEffect, useState } from 'react';
import { useAppearanceStore } from '../store/appearance';
import { useThemeStore, themes } from '../store/theme';

const fontSizeOptions = [
  { label: '작게 (14px)', value: 14 },
  { label: '보통 (16px)', value: 16 },
  { label: '크게 (18px)', value: 18 },
  { label: '아주 크게 (20px)', value: 20 },
];

const fontFamilyOptions = [
  {
    label: '시스템 기본',
    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen'," +
      " 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
  },
  { label: 'Segoe UI', value: "'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif" },
  { label: 'Noto Sans KR', value: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" },
  { label: 'Nanum Gothic', value: "'Nanum Gothic', 'Apple SD Gothic Neo', sans-serif" },
  { label: 'Malgun Gothic', value: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" },
];

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
    return '#0F172A';
  }
  const luminance = getRelativeLuminance(rgb);
  return luminance > 0.5 ? '#0F172A' : '#F8FAFC';
}

function resolveThemeTextColor(themeId: string | null, currentThemeId: string) {
  const resolvedId = themeId ?? currentThemeId;
  const theme = themes.find((item) => item.id === resolvedId);
  return theme ? getReadableTextColor(theme.colors.background) : '#0F172A';
}

export default function AppearanceSettings() {
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const {
    fontSize,
    fontFamily,
    textColorGlobal,
    textColorSidebar,
    textColorHeader,
    setFontSize,
    setFontFamily,
    setTextColorGlobal,
    setTextColorSidebar,
    setTextColorHeader,
  } = useAppearanceStore();
  const { currentTheme } = useThemeStore();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.closest('.appearance-dropdown')) {
        setOpenRowId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const colorRows = [
    {
      id: 'global',
      label: '전체',
      value: textColorGlobal,
      onChange: setTextColorGlobal,
    },
    {
      id: 'sidebar',
      label: '사이드바',
      value: textColorSidebar,
      onChange: setTextColorSidebar,
    },
    {
      id: 'header',
      label: '헤더',
      value: textColorHeader,
      onChange: setTextColorHeader,
    },
  ];

  return (
    <div>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="w-24 text-sm theme-text-secondary">글자 크기</label>
          <select
            value={String(fontSize)}
            onChange={(event) => setFontSize(Number(event.target.value))}
            className="flex-1 px-3 py-2 text-sm theme-text theme-surface border border-gray-300 rounded-md"
          >
            {fontSizeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-start gap-3">
          <label className="w-24 text-sm theme-text-secondary pt-2">글자 색</label>
          <div className="flex flex-col gap-3">
            {colorRows.map((row) => {
              const selectedThemeId = row.value ?? currentTheme.id;
              const selectedColor = resolveThemeTextColor(selectedThemeId, currentTheme.id);
              const selectedName = row.value
                ? themes.find((theme) => theme.id === selectedThemeId)?.name ?? '테마 선택'
                : `기본값 (${currentTheme.name})`;
              return (
                <div key={row.id} className="flex items-center gap-3">
                  <span className="w-16 text-xs theme-text-secondary">{row.label}</span>
                  <div className="relative flex-1 appearance-dropdown">
                    <button
                      type="button"
                      onClick={() => setOpenRowId(openRowId === row.id ? null : row.id)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm theme-text theme-surface border border-gray-300 rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-full border border-gray-300 shadow-sm"
                          style={{ backgroundColor: selectedColor }}
                        />
                        <span>{selectedName}</span>
                      </div>
                      <svg
                        className={`w-4 h-4 theme-text-secondary transition-transform ${openRowId === row.id ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {openRowId === row.id && (
                      <div className="absolute z-50 mt-2 w-full max-h-64 overflow-y-auto theme-surface border border-gray-200 rounded-md shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            row.onChange(null);
                            setOpenRowId(null);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm theme-text hover:bg-gray-50"
                        >
                          <span
                            className="w-4 h-4 rounded-full border border-gray-300 shadow-sm"
                            style={{ backgroundColor: currentTheme.colors.text }}
                          />
                          <span className="flex-1 text-left">기본값 (현재 테마)</span>
                        </button>
                        {themes.map((theme) => (
                          <button
                            key={`${row.id}-${theme.id}`}
                            type="button"
                            onClick={() => {
                              row.onChange(theme.id);
                              setOpenRowId(null);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm theme-text hover:bg-gray-50"
                          >
                            <span
                              className="w-4 h-4 rounded-full border border-gray-300 shadow-sm"
                              style={{ backgroundColor: theme.colors.text }}
                            />
                            <span className="flex-1 text-left">{theme.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="w-24 text-sm theme-text-secondary">폰트</label>
          <select
            value={fontFamily}
            onChange={(event) => setFontFamily(event.target.value)}
            className="flex-1 px-3 py-2 text-sm theme-text theme-surface border border-gray-300 rounded-md"
          >
            {fontFamilyOptions.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1 text-xs theme-text-secondary">
          <p style={{ fontFamily, fontSize: `${fontSize}px`, color: resolveThemeTextColor(textColorGlobal, currentTheme.id) }}>
            미리보기(전체): 가나다라마바사 ABC 123
          </p>
          <p style={{ fontFamily, fontSize: `${fontSize}px`, color: resolveThemeTextColor(textColorSidebar, currentTheme.id) }}>
            미리보기(사이드바): 가나다라마바사 ABC 123
          </p>
          <p style={{ fontFamily, fontSize: `${fontSize}px`, color: resolveThemeTextColor(textColorHeader, currentTheme.id) }}>
            미리보기(헤더): 가나다라마바사 ABC 123
          </p>
        </div>
      </div>
    </div>
  );
}

