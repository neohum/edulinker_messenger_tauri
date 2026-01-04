import { useState, useRef, useEffect } from 'react';
import { useThemeStore, themes } from '../store/theme';

export default function ThemeSettings() {
  const { currentTheme, setTheme } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center justify-between relative z-30">
      <div className="flex items-center space-x-3">
        <svg className="w-6 h-6 theme-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
        <div>
          <h3 className="font-medium theme-text">테마 설정</h3>
          <p className="text-sm theme-text-secondary">앱 색상 테마를 변경합니다</p>
        </div>
      </div>

      {/* 드롭다운 */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-2 px-4 py-2 theme-surface border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors min-w-[180px] justify-between"
        >
          <div className="flex items-center space-x-2">
            <div className="flex -space-x-1">
              <div
                className="w-4 h-4 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: currentTheme.colors.primary }}
              />
              <div
                className="w-4 h-4 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: currentTheme.colors.secondary }}
              />
              <div
                className="w-4 h-4 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: currentTheme.colors.accent }}
              />
            </div>
            <span className="text-sm theme-text">{currentTheme.name}</span>
          </div>
          <svg
            className={`w-4 h-4 theme-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* 드롭다운 메뉴 */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-64 theme-surface border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
            {themes.map((theme) => (
              <button
                key={theme.id}
                onClick={async () => {
                  await setTheme(theme.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                  currentTheme.id === theme.id ? 'bg-blue-50' : ''
                }`}
              >
                {/* 테마 색상 미리보기 */}
                <div className="flex -space-x-1">
                  <div
                    className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: theme.colors.primary }}
                  />
                  <div
                    className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: theme.colors.secondary }}
                  />
                  <div
                    className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: theme.colors.accent }}
                  />
                </div>

                {/* 테마 이름 */}
                <span className={`flex-1 text-left text-sm ${
                  currentTheme.id === theme.id ? 'text-blue-700 font-medium' : 'theme-text'
                }`}>
                  {theme.name}
                </span>

                {/* 선택 표시 */}
                {currentTheme.id === theme.id && (
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
