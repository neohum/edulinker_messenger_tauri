import { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/auth';
import { useThemeStore, applyTheme } from './store/theme';
import { useAppearanceStore, applyAppearance } from './store/appearance';
import { useBackgroundStore, applyBackground } from './store/background';
import { useNetworkMonitor } from './hooks/useNetworkMonitor';
import { useAuthManager } from './hooks/useAuthManager';
import { useIdleDetection } from './hooks/useIdleDetection';
import { DeviceCheck } from './components/DeviceCheck';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ProfileSetupPage from './pages/ProfileSetupPage';
import TitleBar from './components/TitleBar';
import Footer from './components/Footer';
import LoadingScreen from './components/LoadingScreen';
import DevSidebar from './components/DevSidebar';
import DevFab from './components/DevFab';
import MessageCenterWindow from './pages/MessageCenterWindow';
import DownloadFolderSetup from './components/DownloadFolderSetup';
import UpdateChecker from './components/UpdateChecker';
import { useDownloadStore } from './store/download';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee2e2', color: '#991b1b', minHeight: '100vh' }}>
          <h1>앱 로딩 중 오류 발생</h1>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error?.message}
          </pre>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px' }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// 메시지 센터 전용 App 컴포넌트 (배경/테마/폰트 적용)
function MessageCenterApp() {
  const { currentTheme, loadTheme } = useThemeStore();
  const { fontSize, fontFamily, textColorGlobal, textColorSidebar, textColorHeader, loadAppearance } = useAppearanceStore();
  const { backgroundColor, backgroundImageUrl, cardOpacity, loadBackground } = useBackgroundStore();

  useEffect(() => {
    loadTheme();
    loadAppearance();
    loadBackground();
  }, []);

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    applyAppearance(fontSize, fontFamily, textColorGlobal, textColorSidebar, textColorHeader, currentTheme.id);
  }, [fontSize, fontFamily, textColorGlobal, textColorSidebar, textColorHeader, currentTheme.id]);

  useEffect(() => {
    applyBackground(backgroundColor, backgroundImageUrl, cardOpacity, currentTheme.colors.background);
  }, [backgroundColor, backgroundImageUrl, cardOpacity, currentTheme.colors.background]);

  return (
    <>
      <TitleBar />
      <div className="flex flex-col min-h-screen pt-12 theme-text">
        <div className="flex-1 min-h-0 overflow-auto">
          <MessageCenterWindow />
        </div>
      </div>
    </>
  );
}

function App() {
  const { isAuthenticated, user, setAuth, setAway } = useAuthStore();
  const { currentTheme, loadTheme } = useThemeStore();
  const {
    fontSize,
    fontFamily,
    textColorGlobal,
    textColorSidebar,
    textColorHeader,
    loadAppearance,
    resetTextColorsToDefault,
  } = useAppearanceStore();
  const { backgroundColor, backgroundImageUrl, cardOpacity, loadBackground } = useBackgroundStore();
  const { isFirstRun, loadSettings: loadDownloadSettings, completeFirstRun } = useDownloadStore();
  const { isLoading } = useAuthManager();
  const [currentPage, setCurrentPage] = useState<'login' | 'signup'>('login');
  const [isDevSidebarOpen, setIsDevSidebarOpen] = useState(false);
  const [showDownloadSetup, setShowDownloadSetup] = useState(false);
  const isMessageCenterWindow = window.location.hash.startsWith('#/message-center');

  // 개발 모드 확인
  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

  // 네트워크 상태 모니터링
  useNetworkMonitor();

  // 비활성 상태 감지 (5분 후 자리 비움)
  useIdleDetection({
    timeout: 5 * 60 * 1000, // 5분
    onIdle: () => {
      if (isAuthenticated) {
        console.log('[IdleDetection] 5분 이상 활동 없음 - 자리 비움 상태로 전환');
        setAway(true);
        // TODO: P2P 네트워크에 상태 브로드캐스트
      }
    },
    onActive: () => {
      if (isAuthenticated) {
        console.log('[IdleDetection] 활동 감지 - 온라인 상태로 전환');
        setAway(false);
        // TODO: P2P 네트워크에 상태 브로드캐스트
      }
    },
  });

  // 테마 초기화 (SQLite에서 로드)
  useEffect(() => {
    loadTheme();
  }, []);

  useEffect(() => {
    loadBackground();
  }, []);

  // 글꼴/글자 설정 초기화
  useEffect(() => {
    loadAppearance();
  }, []);

  // 다운로드 설정 초기화
  useEffect(() => {
    loadDownloadSettings();
  }, []);

  // 첫 실행 시 다운로드 폴더 설정 다이얼로그 표시
  useEffect(() => {
    if (isFirstRun && isAuthenticated) {
      setShowDownloadSetup(true);
    }
  }, [isFirstRun, isAuthenticated]);

  // 테마 변경 시 적용
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    resetTextColorsToDefault(currentTheme.id);
  }, [currentTheme.id, resetTextColorsToDefault]);

  // 글꼴/글자 설정 변경 시 적용
  useEffect(() => {
    applyAppearance(
      fontSize,
      fontFamily,
      textColorGlobal,
      textColorSidebar,
      textColorHeader,
      currentTheme.id
    );
  }, [fontSize, fontFamily, textColorGlobal, textColorSidebar, textColorHeader, currentTheme.id]);

  useEffect(() => {
    applyBackground(backgroundColor, backgroundImageUrl, cardOpacity, currentTheme.colors.background);
  }, [backgroundColor, backgroundImageUrl, cardOpacity, currentTheme.colors.background]);

  // Test auto-login handler
  useEffect(() => {
    if (window.electronAPI?.on) {
      const handleTestAutoLogin = async (userType: string) => {
        console.log('Received test auto-login event for:', userType);
        try {
          const result = await window.electronAPI.autoLogin(userType);
          if (result.success) {
            console.log('Test auto-login successful:', result);
            // The auth store should be updated by the auto-login handler
          } else {
            console.error('Test auto-login failed:', result);
          }
        } catch (error) {
          console.error('Error during test auto-login:', error);
        }
      };

      window.electronAPI.on('test-auto-login', handleTestAutoLogin);

      return () => {
        // Cleanup listener
        if (window.electronAPI?.removeAllListeners) {
          window.electronAPI.removeAllListeners('test-auto-login');
        }
      };
    }
  }, []);

  if (isMessageCenterWindow) {
    return (
      <QueryClientProvider client={queryClient}>
        <MessageCenterApp />
      </QueryClientProvider>
    );
  }

  if (isLoading) {
    return (
      <QueryClientProvider client={queryClient}>
        <TitleBar />
        <div className="flex flex-col min-h-screen pt-12 overflow-auto theme-text">
          <LoadingScreen />
          <Footer />
        </div>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TitleBar />
      <div className="flex flex-col min-h-screen pt-12 theme-text">
        <div className="flex-1 min-h-0 overflow-auto">
          {isAuthenticated ? (
            user?.profileCompleted ? (
              <DeviceCheck>
                <DashboardPage />
              </DeviceCheck>
            ) : (
              <ProfileSetupPage />
            )
          ) : currentPage === 'login' ? (
            <LoginPage onSwitchToSignup={() => setCurrentPage('signup')} />
          ) : (
            <SignupPage onSwitchToLogin={() => setCurrentPage('login')} />
          )}
        </div>
        <Footer />
      </div>

      {/* 개발자 도구 - 개발 모드에서만 표시 */}
      {isDevelopment && (
        <>
          <DevFab onClick={() => setIsDevSidebarOpen(true)} />
          <DevSidebar
            isOpen={isDevSidebarOpen}
            onClose={() => setIsDevSidebarOpen(false)}
          />
        </>
      )}

      {/* 첫 실행 시 다운로드 폴더 설정 */}
      {showDownloadSetup && (
        <DownloadFolderSetup
          onComplete={() => {
            setShowDownloadSetup(false);
            completeFirstRun();
          }}
        />
      )}

      {/* 자동 업데이트 체커 - 1시간마다 체크 */}
      <UpdateChecker
        checkOnMount={true}
        autoCheckInterval={60 * 60 * 1000}
      />
    </QueryClientProvider>
  );
}

function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;

