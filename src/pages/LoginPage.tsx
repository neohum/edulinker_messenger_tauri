import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';

interface LoginPageProps {
  onSwitchToSignup?: () => void;
}

export default function LoginPage({ onSwitchToSignup }: LoginPageProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [availableUsers, setAvailableUsers] = useState<Record<string, any[]>>({});
  const [selectedUser, setSelectedUser] = useState<any>(null);
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

  // 자동 로그인 확인
  useEffect(() => {
    const checkAutoLogin = async () => {
      // TEST_AUTO_LOGIN 환경 변수 대신, 직접 autoLogin 호출
      console.log('Attempting auto-login for teacher...');
      try {
        setIsLoading(true);
        const result = await window.electronAPI.autoLogin('teacher');
        if (result.success) {
          console.log('Auto-login successful:', result);
          // The auth store should be updated by the auto-login handler
        } else {
          console.error('Auto-login failed:', result);
          setError('자동 로그인 실패: ' + (result.error || '알 수 없는 오류'));
        }
      } catch (error: any) {
        console.error('Error during auto-login:', error);
        setError('자동 로그인 중 오류 발생: ' + error.message);
      } finally {
        setIsLoading(false);
      }
    };

    // 약간의 지연 후 자동 로그인 시도
    const timer = setTimeout(checkAutoLogin, 1000);
    return () => clearTimeout(timer);
  }, [setAuth]);

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
  const getFriendlyErrorMessage = (error: string) => {
    if (!error) return '';

    // 영어 에러 메시지를 한국어로 변환
    const errorMappings: Record<string, string> = {
      'required': '필수 항목을 입력해주세요.',
      'invalid': '입력하신 정보가 올바르지 않습니다.',
      'not found': '요청하신 정보를 찾을 수 없습니다.',
      'unauthorized': '접근 권한이 없습니다.',
      'forbidden': '이 작업을 수행할 권한이 없습니다.',
      'network': '네트워크 연결을 확인해주세요.',
      'fetch failed': '네트워크 연결을 확인해주세요.',
      'timeout': '요청 시간이 초과되었습니다. 다시 시도해주세요.',
      'server': '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      'database': '데이터베이스 오류가 발생했습니다.',
      'authentication': '인증에 실패했습니다.',
      'validation': '입력 정보를 확인해주세요.',
      'no handler registered': '필요한 기능이 아직 구현되지 않았습니다.',
      'auth:offline-login': '오프라인 로그인 기능이 아직 구현되지 않았습니다.',
      'auth:offline-register': '오프라인 회원가입 기능이 아직 구현되지 않았습니다.',
      'auth:get-offline-users': '오프라인 사용자 목록 기능이 아직 구현되지 않았습니다.',
    };

    // 대소문자 구분 없이 매핑
    const lowerError = error.toLowerCase();
    for (const [key, message] of Object.entries(errorMappings)) {
      if (lowerError.includes(key)) {
        return message;
      }
    }

    // 매핑되지 않은 에러는 그대로 표시하되, 너무 긴 메시지는 줄임
    if (error.length > 100) {
      return '오류가 발생했습니다. 다시 시도해주세요.';
    }

    return error;
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
    
    // 외부 네트워크 연결 실패 시 알림
    if (!externalAvailable && connectionChecked) {
      console.warn('외부 네트워크에 연결할 수 없습니다. 사내 네트워크에서 메시징 기능을 사용하세요.');
      // 알림은 메인 프로세스에서 처리
      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification({
          title: '네트워크 연결 알림',
          body: '외부 네트워크에 연결할 수 없습니다. 사내 네트워크에서 메시징 기능을 사용하세요.'
        });
      }
    }
    
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

  const handleAutoLogin = async (userType: 'teacher' | 'admin') => {
    setError('');
    setIsLoading(true);

    try {
      console.log('Auto login attempt for:', userType);

      const result = await window.electronAPI?.autoLogin?.(userType);

      if (result?.success) {
        console.log('Auto login successful:', result.user);

        // 인증 상태 설정
        setAuth(result.token, result.user);

        // 로그인 성공 후 대시보드로 이동 (부모 컴포넌트에서 처리)
        if (window.electronAPI?.showNotification) {
          window.electronAPI.showNotification({
            title: '자동 로그인 성공',
            body: `${result.user.name}님으로 로그인되었습니다.`
          });
        }
      } else {
        setError(result?.error || '자동 로그인 실패');
      }
    } catch (error: any) {
      console.error('Auto login error:', error);
      setError(`자동 로그인 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserSelectLogin = async () => {
    if (!selectedUser) {
      setError('사용자를 선택해주세요.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      let result;

      if (!isOnline) {
        // 오프라인 모드: 로컬 SQLite DB 사용
        console.log('Using offline authentication for user selection');
        result = await window.electronAPI?.offlineLogin?.({
          email: selectedUser.email,
          password: 'password123', // 기본 비밀번호 사용
        });

        if (result?.success) {
          // 오프라인 사용자 정보를 온라인 형식으로 변환
          const offlineUser = result.user;
          const onlineUser = {
            id: offlineUser.id,
            email: offlineUser.email,
            name: selectedUser.name,
            role: offlineUser.role,
          };

          setAuth(result.token, onlineUser);
          return;
        }
      } else {
        // 온라인 모드: API 서버 사용
        console.log('Using online authentication for user selection');
        // 연결 상태 재확인
        const apiAvailable = await checkConnection();
        
        if (!apiAvailable) {
          setError('서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.');
          return;
        }

        result = await window.electronAPI?.login?.({
          identifier: selectedUser.email,
          password: 'password123', // 기본 비밀번호 사용
          rememberMe: true
        });
      }

      console.log('User select login result:', result);

      if (!result) {
        setError('로그인 응답을 받지 못했습니다.');
        return;
      }

      if (result.success && result.token && result.user) {
        setAuth(result.token, result.user);
      } else {
        setError(getFriendlyErrorMessage(result.error) || '선택한 사용자로 로그인에 실패했습니다.');
      }
    } catch (err: any) {
      console.error('User select login error:', err);
      setError(getFriendlyErrorMessage(err.message) || '선택한 사용자로 로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 개발 환경인지 확인
  const isDevelopment = import.meta.env.DEV;

  // 오프라인 모드에서 사용할 기본 사용자들
  const getOfflineUsers = async () => {
    try {
      const result = await window.electronAPI?.getOfflineUsers?.();
      if (result?.success) {
        return result.users;
      }
      return [];
    } catch (error) {
      console.error('Failed to get offline users:', error);
      return [];
    }
  };

  // 오프라인 사용자 목록 가져오기 (온라인일 때는 API에서, 오프라인일 때는 로컬 DB에서)
  const fetchAvailableUsers = async () => {
    try {
      if (!isOnline) {
        // 오프라인 모드: 데모 데이터 시드 후 사용자 목록 가져오기
        console.log('Seeding demo data for offline mode...');
        const seedResult = await window.electronAPI?.seedDemoData?.();
        if (seedResult?.success) {
          console.log('Demo data seeded successfully');
        } else {
          console.error('Failed to seed demo data:', seedResult?.error);
        }

        // 시드된 사용자 목록 가져오기
        const offlineUsers = await getOfflineUsers();
        if (offlineUsers.length > 0) {
          // 기존 사용자들을 그룹화
          const groupedUsers: Record<string, any[]> = {};
          
          offlineUsers.forEach((user: any) => {
            const role = user.role || 'USER';
            if (!groupedUsers[role]) {
              groupedUsers[role] = [];
            }
            groupedUsers[role].push({
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              schoolName: user.school,
              grade: user.grade,
              class: user.class,
              classroom: user.classroom,
              workplace: user.workplace,
              jobTitle: user.job_title,
              adminDuties: user.admin_duties,
              extensionNumber: user.extension_number,
              phoneNumber: user.phone_number,
              profileCompleted: user.profile_completed
            });
          });

          setAvailableUsers(groupedUsers);
        } else {
          // 기본 사용자들 생성 (시드가 실패한 경우)
          const defaultUsers = [
            { email: 'teacher@demo.com', password: 'password123', role: 'TEACHER', name: '데모 교사', school: '테스트 학교' },
            { email: 'admin@demo.com', password: 'password123', role: 'ADMIN', name: '데모 관리자', school: '테스트 학교' },
          ];

          for (const user of defaultUsers) {
            await window.electronAPI?.offlineRegister?.(user);
          }

          // 다시 사용자 목록 가져오기
          const updatedUsers = await getOfflineUsers();
          const groupedUsers: Record<string, any[]> = {};
          
          updatedUsers.forEach((user: any) => {
            const role = user.role || 'USER';
            if (!groupedUsers[role]) {
              groupedUsers[role] = [];
            }
            groupedUsers[role].push({
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              schoolName: user.school,
            });
          });

          setAvailableUsers(groupedUsers);
        }
      } else {
        // 온라인 모드: API 서버에서 사용자 목록 가져오기
        const apiAvailable = await checkConnection();
        if (!apiAvailable) {
          console.debug('[LoginPage] API server not available, using offline mode');
          return;
        }

        const response = await fetch('http://localhost:3000/api/dev/users');
        const data = await response.json();
        if (data.success) {
          setAvailableUsers(data.users);
        }
      }
    } catch (error) {
      // 외부 서버 연결 실패는 오프라인/내부망 모드에서 정상
      console.debug('[LoginPage] Failed to fetch users from server:', error);
    }
  };

  // 컴포넌트 마운트 시 연결 상태 확인 및 사용자 목록 가져오기
  useEffect(() => {
    // 페이지 로드 시 스크롤을 상단으로 이동
    window.scrollTo(0, 0);

    // 네트워크 연결 확인
    checkConnection();

    if (isDevelopment) {
      fetchAvailableUsers();
    }

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
  }, [isDevelopment]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    console.log('Login attempt:', { identifier, password: '***', isOnline, networkStatus });

    try {
      let result;

      if (!isOnline) {
        // 오프라인 모드: 로컬 SQLite DB 사용
        console.log('Using offline authentication');
        
        // 데이터베이스 연결 상태 확인
        const dbConnected = await checkDatabaseConnection();
        if (!dbConnected) {
          console.log('Database not connected, falling back to online mode');
          setError('데이터베이스 연결에 실패했습니다. 온라인 모드로 시도합니다.');
          // 온라인 모드로 전환
          setIsOnline(true);
        } else {
          result = await window.electronAPI?.offlineLogin?.({
            email: identifier,
            password,
          });

          console.log('Offline login result:', result);
        }

        if (result?.success) {
          // 오프라인 사용자 정보를 온라인 형식으로 변환
          const offlineUser = result.user;
          const onlineUser = {
            id: offlineUser.id,
            email: offlineUser.email,
            name: offlineUser.email.split('@')[0], // 임시 이름
            role: offlineUser.role,
          };

          setAuth(result.token, onlineUser);
          return;
        }
      } else {
        // 온라인 모드: API 서버 사용
        console.log('Using online authentication');
        result = await window.electronAPI?.login?.({
          identifier,
          password,
          rememberMe
        });

        console.log('Online login result:', result);
      }

      console.log('Login result:', result);

      if (!result) {
        setError('로그인 응답을 받지 못했습니다.');
        return;
      }

      if (result.success && result.token && result.user) {
        // Check if user is teacher or admin
        const allowedRoles = ['TEACHER', 'ADMIN', 'SUPER_ADMIN'];
        if (!result.user.role || !allowedRoles.includes(result.user.role)) {
          setError('이 앱은 교사 및 관리자만 사용할 수 있습니다.');
          await window.electronAPI?.logout?.();
          return;
        }

        setAuth(result.token, result.user);
      } else {
        setError(getFriendlyErrorMessage(result.error) || '로그인에 실패했습니다.');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(getFriendlyErrorMessage(err.message) || '로그인 중 오류가 발생했습니다.');
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

        {/* 개발 환경에서만 표시되는 자동 로그인 */}
        {isDevelopment && (
          <div className="mt-6 space-y-4">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-3">🚀 개발자 환경 - 자동 로그인</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAutoLogin('teacher')}
                disabled={isLoading}
                className="py-2 px-3 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="교사 계정으로 자동 로그인"
              >
                👨‍🏫 교사
              </button>
              <button
                onClick={() => handleAutoLogin('admin')}
                disabled={isLoading}
                className="py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="관리자 계정으로 자동 로그인"
              >
                👑 관리자
              </button>
            </div>
          </div>
        )}

        {/* 개발 환경에서만 표시되는 사용자 선택 로그인 */}
        {isDevelopment && (
          <div className="mt-6 space-y-4">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-3">개발자 환경 - 사용자 선택 로그인</p>
            </div>

            {/* 사용자 선택 드롭다운 */}
            <div>
              <label htmlFor="userSelect" className="block text-sm font-medium text-gray-700 mb-2">
                로그인할 사용자 선택
              </label>
              <select
                id="userSelect"
                value={selectedUser?.id || ''}
                onChange={(e) => {
                  const userId = e.target.value;
                  // 모든 역할의 사용자 중에서 선택된 사용자 찾기
                  for (const role of Object.keys(availableUsers)) {
                    const user = availableUsers[role].find((u: any) => u.id === userId);
                    if (user) {
                      setSelectedUser(user);
                      break;
                    }
                  }
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                disabled={isLoading}
              >
                <option value="">사용자를 선택하세요</option>
                {Object.entries(availableUsers).map(([role, users]) => (
                  <optgroup key={role} label={`${role} (${users.length}명)`}>
                    {users.map((user: any) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email}) - {user.schoolName || '학교 없음'}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* 선택한 사용자 정보 표시 */}
            {selectedUser && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>선택된 사용자:</strong> {selectedUser.name} ({selectedUser.email})
                </p>
                {selectedUser.schoolName && (
                  <p className="text-sm text-blue-600 mt-1">
                    학교: {selectedUser.schoolName}
                  </p>
                )}
              </div>
            )}

            {/* 사용자 선택 로그인 버튼 */}
            <button
              onClick={handleUserSelectLogin}
              disabled={isLoading || !selectedUser}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '로그인 중...' : '선택한 사용자로 로그인'}
            </button>
          </div>
        )}

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

