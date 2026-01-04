import { getCurrentWindow } from '@tauri-apps/api/window';

export default function TitleBar() {
  const appWindow = getCurrentWindow();

  const handleMinimize = async () => {
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  };

  const handleClose = async () => {
    await appWindow.close();
  };

  // 드래그 가능 영역 스타일
  const dragStyle = {
    WebkitAppRegion: 'drag' as const,
  };

  // 드래그 불가능 영역 스타일 (버튼 등)
  const noDragStyle = {
    WebkitAppRegion: 'no-drag' as const,
  };

  return (
    <div
      className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-50 select-none theme-app-bg-translucent"
      style={{
        ...dragStyle,
      }}
    >
      <div className="flex items-center gap-3">
        <img src="/favicon.svg" alt="edulinker" className="w-6 h-6" style={noDragStyle} />
        <h1 className="theme-text-header font-semibold text-sm">edulinker - messenger</h1>
      </div>

      <div className="flex items-center gap-1 theme-text-header" style={noDragStyle}>
        <button
          onClick={handleMinimize}
          className="w-10 h-8 flex items-center justify-center hover:bg-white/10 rounded transition-colors opacity-80 hover:opacity-100"
          aria-label="최소화"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-10 h-8 flex items-center justify-center hover:bg-white/10 rounded transition-colors opacity-80 hover:opacity-100"
          aria-label="최대화"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2" fill="none"/>
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-10 h-8 flex items-center justify-center hover:bg-red-500 rounded transition-colors opacity-80 hover:opacity-100"
          aria-label="닫기"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
