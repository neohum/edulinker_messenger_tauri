import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';

interface LoginPageProps {
  onSwitchToSignup?: () => void;
}

export default function LoginPage({ onSwitchToSignup }: LoginPageProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'internal' | 'local' | 'offline'>('offline');
  const [internalNetworkConnected, setInternalNetworkConnected] = useState(false);
  const [externalNetworkConnected, setExternalNetworkConnected] = useState(false);
  
  // 개발자 모드 네트워크 제어
  const [isDevMode, setIsDevMode] = useState(import.meta.env.DEV);
  const [forceExternalOffline, setForceExternalOffline] = useState(false);
  const [forceInternalOffline, setForceInternalOffline] = useState(false);
  
  const { setAuth } = useAuthStore();

  const checkDatabaseConnection = async () => {
    try {
      const result = await window.electronAPI?.checkDatabaseConnection?.();
      console.log('Database connection check:', result);
      return result?.connected || false;
    } catch (error) {
      console.error('데이터베이스 연결 확인 실패:', error);
      return false;
    }
  };

  // 에러 메시지를 친절한 한국어로 변환
  const getFriendlyErrorMessage = (error: string, isLocalAuthError: boolean = false) => {
    if (!error) return '';

    // 서버 연결 관련 에러는 무시 (내부 네트워크 전용 모드)
    const serverErrorPatterns = [
      'network', 'fetch failed', 'timeout', 'server',
      '서버 연결', '접근 거부', '네트워크 연결'
    ];

    const lowerError = error.toLowerCase();

    // 로컬 인증 에러가 아니고 서버 관련 에러인 경우 빈 문자열 반환
    if (!isLocalAuthError) {
      for (const pattern of serverErrorPatterns) {
        if (lowerError.includes(pattern)) {
          console.log('[LoginPage] 서버 연결 에러 무시:', error);
          return '';
        }
      }
    }

    // 영어 에러 메시지를 한국어로 변환 (로컬 인증 전용)
    const errorMappings: Record<string, string> = {
      'required': '필수 항목을 입력해주세요.',
      'invalid': '입력하신 정보가 올바르지 않습니다.',
      'not found': '이메일 또는 비밀번호가 일치하지 않습니다.',
      'unauthorized': '이메일 또는 비밀번호가 일치하지 않습니다.',
      'forbidden': '이 작업을 수행할 권한이 없습니다.',
      'database': '로컬 데이터베이스 오류가 발생했습니다.',
      'authentication': '이메일 또는 비밀번호가 일치하지 않습니다.',
      'validation': '입력 정보를 확인해주세요.',
      'no handler registered': '로그인 기능을 사용할 수 없습니다.',
      'auth:offline-login': '로컬 로그인 기능을 사용할 수 없습니다.',
    };

    // 대소문자 구분 없이 매핑
    for (const [key, message] of Object.entries(errorMappings)) {
      if (lowerError.includes(key)) {
        return message;
      }
    }

    // 로컬 인증 에러만 표시
    if (isLocalAuthError && error.length > 100) {
      return '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.';
    }

    return isLocalAuthError ? error : '';
  };

  // API 서버 연결 상태 확인 (외부 네트워크)
  const checkApiConnection = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3초 타임아웃

      const response = await fetch('http://localhost:3000/api/health', {
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      // API 서버 연결 실패는 정상적인 상황이므로 조용히 처리
      return false;
    }
  };

  // 사내 네트워크 연결 상태 확인 (IP 주소 기반)
  const checkInternalNetwork = async () => {
    try {
      const result = await window.electronAPI?.checkInternalNetworkIp?.();
      return result?.isInternal || false;
    } catch (error) {
      console.error('내부 네트워크 확인 실패:', error);
      return false;
    }
  };

  // 외부 네트워크 연결 상태 확인
  const checkExternalNetwork = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      // 외부 서비스 연결 확인 (구글, 클라우드플레어 등)
      await fetch('https://www.google.com/favicon.ico', {
        signal: controller.signal,
        mode: 'no-cors'
      });
      
      clearTimeout(timeoutId);
      return true; // no-cors 모드에서는 response 객체를 받지 못하지만 연결은 확인됨
    } catch (error) {
      // 외부 네트워크 연결 실패는 정상적인 상황이므로 조용히 처리
      return false;
    }
  };

  // 네트워크 상태 확인 및 설정
  const checkConnection = async () => {
    // 실제 네트워크 확인 (개발자 모드 강제 설정이 아닐 때만)
    const apiAvailable = isDevMode && forceExternalOffline ? false : await checkApiConnection();
    const internalAvailable = isDevMode && forceInternalOffline ? false : await checkInternalNetwork();
    const externalAvailable = isDevMode && forceExternalOffline ? false : await checkExternalNetwork();
    
    // 네트워크 상태 결정 로직
    let currentNetworkStatus: 'online' | 'internal' | 'local' | 'offline' = 'offline';
    
    if (externalAvailable && apiAvailable) {
      currentNetworkStatus = 'online';
    } else if (internalAvailable) {
      currentNetworkStatus = 'internal';
    } else if (apiAvailable) {
      currentNetworkStatus = 'local';
    } else {
      currentNetworkStatus = 'offline';
    }
    
    setNetworkStatus(currentNetworkStatus);
    setIsOnline(externalAvailable && apiAvailable);
    setConnectionChecked(true);
    setInternalNetworkConnected(internalAvailable);
    setExternalNetworkConnected(externalAvailable);

    // 내부 네트워크 전용 모드: 외부 네트워크 연결 실패 알림 제거
    // 조용히 로컬/내부 네트워크 모드로 동작
    console.log('[LoginPage] 네트워크 상태:', {
      networkStatus: currentNetworkStatus,
      internal: internalAvailable,
      external: externalAvailable,
      api: apiAvailable
    });

    return currentNetworkStatus !== 'offline';
  };

  // 개발자 모드 네트워크 토글 함수들
  const toggleExternalNetwork = () => {
    setForceExternalOffline(!forceExternalOffline);
    // 토글 후 연결 상태 재확인
    setTimeout(() => {
      checkConnection();
    }, 100);
  };

  const toggleInternalNetwork = () => {
    setForceInternalOffline(!forceInternalOffline);
    // 토글 후 연결 상태 재확인
    setTimeout(() => {
      checkConnection();
    }, 100);
  };

  

  // 컴포넌트 마운트 시 연결 상태 확인
  useEffect(() => {
    // 페이지 로드 시 스크롤을 상단으로 이동
    window.scrollTo(0, 0);

    // 네트워크 연결 확인
    checkConnection();

    // 메시징 상태 변경 감지
    const handleMessagingStatus = (_: any, status: any) => {
      console.log('Messaging status changed:', status);
    };

    // Electron IPC 이벤트 리스너 등록
    if (window.electronAPI) {
      // 메시징 상태 이벤트 리스너 (실제로는 main.ts에서 정의해야 함)
      // 임시로 window 객체에 이벤트 리스너 추가
      (window as any).addEventListener('messaging:status', handleMessagingStatus);
    }

    return () => {
      // 클린업
      if (window.electronAPI) {
        (window as any).removeEventListener('messaging:status', handleMessagingStatus);
      }
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    console.log('[LoginPage] 로그인 시도 - 내부 네트워크 전용 모드:', { identifier, networkStatus });

    try {
      let result;

      // 내부 네트워크 전용 모드: 서버 연결 시도 없이 바로 로컬 인증 사용
      console.log('[LoginPage] 로컬 SQLite DB 인증 사용');

      try {
        result = await window.electronAPI?.offlineLogin?.({
          email: identifier,
          password,
        });

        console.log('[LoginPage] 로컬 인증 결과:', result);

        if (result?.success) {
          // 오프라인 사용자 정보를 온라인 형식으로 변환
          const offlineUser = result.user;
          const onlineUser = {
            id: offlineUser.id,
            email: offlineUser.email,
            name: offlineUser.email.split('@')[0], // 임시 이름
            role: offlineUser.role,
          };

          console.log('[LoginPage] 로그인 성공:', onlineUser);
          setAuth(result.token, onlineUser);
          return;
        } else if (result?.error) {
          // 로컬 인증 실패 시에만 에러 표시
          const localErrorMessage = getFriendlyErrorMessage(result.error, true);
          if (localErrorMessage) {
            setError(localErrorMessage);
          } else {
            setError('이메일 또는 비밀번호가 일치하지 않습니다.');
          }
          return;
        } else {
          setError('로그인에 실패했습니다. 다시 시도해주세요.');
          return;
        }
      } catch (offlineError: any) {
        console.error('[LoginPage] 로컬 인증 실패:', offlineError);
        // 로컬 로그인 실패 시에만 에러 표시
        const localErrorMessage = getFriendlyErrorMessage(offlineError.message || String(offlineError), true);
        if (localErrorMessage) {
          setError(localErrorMessage);
        } else {
          setError('로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.');
        }
        return;
      }
    } catch (err: any) {
      console.error('[LoginPage] 로그인 에러:', err);
      // 예상치 못한 에러 처리
      setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary-500 to-primary-700 py-8">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-2xl">
        <div className="text-center mb-8 mt-20">
          <div className="flex items-center justify-center mb-2">
            <img src="/favicon.svg" alt="edulinker" className="w-16 h-16 mr-4" />
            <h1 className="text-4xl font-bold text-gray-800 ">edulinker</h1>
          </div>
          <p className="text-gray-600">교사용 통합 플랫폼</p>
          
          {/* 연결 상태 표시 */}
          {connectionChecked && (
            <div className="mt-3 space-y-2">
              
              {/* 개발자 모드 네트워크 제어 */}
              {isDevMode && (
                <div className="text-center mb-2 space-y-2">
                  <div className="flex justify-center space-x-2">
                    <button
                      type="button"
                      onClick={toggleExternalNetwork}
                      className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                        forceExternalOffline 
                          ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      🌐 외부 네트워크 {forceExternalOffline ? '오프라인' : '온라인'}
                    </button>
                    <button
                      type="button"
                      onClick={toggleInternalNetwork}
                      className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                        forceInternalOffline 
                          ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      🏢 내부 네트워크 {forceInternalOffline ? '오프라인' : '온라인'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">개발자 모드: 네트워크 상태 시뮬레이션</p>
                </div>
              )}
              
              {/* 내부/외부 네트워크 연결 상태 표시 */}
              <div className="text-center space-y-1">
                <div className="flex items-center justify-center space-x-4 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${internalNetworkConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className={internalNetworkConnected ? 'text-green-600' : 'text-red-600'}>
                      내부 네트워크: {internalNetworkConnected ? '연결됨' : '연결 안됨'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className={`w-2 h-2 rounded-full ${externalNetworkConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className={externalNetworkConnected ? 'text-green-600' : 'text-red-600'}>
                      외부 네트워크: {externalNetworkConnected ? '연결됨' : '연결 안됨'}
                    </span>
                  </div>
                </div>
              </div>
              
              

            </div>
          )}
        </div>

        {/* 네트워크 상태에 따른 큰 알림 배너 */}
        {connectionChecked && (
          <div className={`mb-6 p-4 rounded-lg border-2 ${
            networkStatus === 'online' 
              ? 'bg-green-50 border-green-200' 
              : networkStatus === 'internal' 
                ? 'bg-blue-50 border-blue-200'
                : networkStatus === 'local'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-center space-x-3">
              <div className={`w-4 h-4 rounded-full ${
                networkStatus === 'online' ? 'bg-green-500' :
                networkStatus === 'internal' ? 'bg-blue-500' :
                networkStatus === 'local' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></div>
              <div className="flex-1">
                <h3 className={`font-semibold text-lg ${
                  networkStatus === 'online' ? 'text-green-800' :
                  networkStatus === 'internal' ? 'text-blue-800' :
                  networkStatus === 'local' ? 'text-yellow-800' : 'text-red-800'
                }`}>
                  {networkStatus === 'online' ? '🌐 온라인 모드' :
                   networkStatus === 'internal' ? '🏢 내부망 모드' :
                   networkStatus === 'local' ? '💻 로컬 모드' : '📴 오프라인 모드'}
                </h3>
                <p className={`text-sm mt-1 ${
                  networkStatus === 'online' ? 'text-green-600' :
                  networkStatus === 'internal' ? 'text-blue-600' :
                  networkStatus === 'local' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {networkStatus === 'online' 
                    ? '외부 네트워크에 연결되어 있습니다. 모든 기능을 사용할 수 있습니다.'
                    : networkStatus === 'internal'
                      ? '내부망에 연결되어 있습니다. 사내 메시징 기능을 사용할 수 있습니다.'
                      : networkStatus === 'local'
                        ? '로컬 서버에 연결되어 있습니다. 제한된 기능을 사용할 수 있습니다.'
                        : '오프라인 상태입니다. 로컬 데이터만 사용할 수 있습니다.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-2">
              이메일 또는 아이디
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white text-black"
              placeholder="이메일 또는 아이디를 입력하세요"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white text-black"
              placeholder="비밀번호를 입력하세요"
              required
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center">
            <input
              id="rememberMe"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              disabled={isLoading}
            />
            <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-700">
              로그인 유지
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>교사 및 학교 관리자만 접근 가능합니다</p>
          {onSwitchToSignup && (
            <p className="mt-2">
              계정이 없으신가요?{' '}
              <button
                onClick={onSwitchToSignup}
                className="text-primary-600 hover:text-primary-500 font-medium"
              >
                회원가입하기
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}




