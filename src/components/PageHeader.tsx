import { ReactNode, forwardRef, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/auth';

interface PageHeaderProps {
  title?: string;
  subtitle?: string;
  showUserInfo?: boolean;
  showLogout?: boolean;
  onProfileClick?: () => void;
  children?: ReactNode;
}

export default forwardRef<HTMLDivElement, PageHeaderProps>(function PageHeader({
  title = 'edulinker - messenger',
  subtitle,
  showUserInfo = true,
  showLogout = true,
  onProfileClick,
  children
}: PageHeaderProps, ref) {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      await logout();
    }
  };

  const handleMinimize = () => {
    window.electronAPI?.minimizeWindow?.();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow?.();
  };

  const handleToggleDevTools = () => {
    window.electronAPI?.toggleDevTools?.();
  };

  const handleClose = () => {
    window.electronAPI?.closeWindow?.();
  };

  const isDevelopment = import.meta.env.DEV;

  useEffect(() => {
    if (isDevelopment) {
      handleToggleDevTools();
    }
  }, []);

  return (
    <header ref={ref} className="fixed top-12 left-0 right-0 z-40">
      {/* 기존 헤더 내용 */}
      <div className="border-b shadow-lg theme-header-bg">
        <div className="flex items-center justify-between px-4 py-3 lg:px-3 lg:py-4">
          <div className="flex items-center space-x-3 lg:space-x-4">
            <div className="flex items-center space-x-2">
              <img src="/icon.svg" alt="edulinker" className="object-contain w-8 h-8 lg:w-10 lg:h-10" />
              <div>
                <h1 className="text-xl font-bold theme-text-header lg:text-2xl">{title}</h1>
                {showUserInfo && user && (
                  <div
                    onClick={onProfileClick}
                    className={`flex items-center space-x-2 text-xs theme-text-header lg:text-sm ${onProfileClick ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''}`}
                    title={onProfileClick ? '프로필 설정' : undefined}
                  >
                    <span className="font-medium">{user.name}</span>
                    {user.jobTitle && (
                      <span className="theme-text-header opacity-80">| {user.jobTitle}</span>
                    )}
                    {user.grade && user.class && (
                      <span className="theme-text-header opacity-80">| {user.grade}학년 {user.class}</span>
                    )}
                    {user.adminDuties && (
                      <span className="theme-text-header">| {user.adminDuties}</span>
                    )}
                    {onProfileClick && (
                      <svg className="w-4 h-4 theme-text-header opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 lg:space-x-4">
            {children}
            {showLogout && (
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm theme-text-header transition-all duration-200 border rounded-lg shadow-lg theme-surface border-white/30 hover:bg-white/30 hover:shadow-xl"
                title="로그아웃"
              >
                로그아웃
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
});

