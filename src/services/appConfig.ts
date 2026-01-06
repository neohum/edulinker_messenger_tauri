// 앱 환경설정 서비스
// .env 파일의 설정을 읽고 관리

export type AppMode = 'local' | 'remote' | 'hybrid';

export interface AppConfig {
  // 서버 연결
  apiUrl: string;
  socketUrl: string;

  // 운영 모드
  appMode: AppMode;
  isDevMode: boolean;

  // 네트워크
  discoveryPort: number;
  p2pPort: number;
  internalNetworkCheckUrl: string;

  // 인증
  autoLogin: boolean;
  autoLoginUserType: 'teacher' | 'admin' | 'student';
  tokenRefreshInterval: number;

  // 로깅
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  consoleLog: boolean;
}

// 환경변수에서 설정 로드
function loadConfig(): AppConfig {
  return {
    // 서버 연결
    apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
    socketUrl: import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000',

    // 운영 모드
    appMode: (import.meta.env.VITE_APP_MODE as AppMode) || 'local',
    isDevMode: import.meta.env.VITE_DEV_MODE === 'true' || import.meta.env.DEV,

    // 네트워크
    discoveryPort: parseInt(import.meta.env.VITE_DISCOVERY_PORT || '41234'),
    p2pPort: parseInt(import.meta.env.VITE_P2P_PORT || '41235'),
    internalNetworkCheckUrl: import.meta.env.VITE_INTERNAL_NETWORK_CHECK_URL || '',

    // 인증
    autoLogin: import.meta.env.VITE_AUTO_LOGIN === 'true',
    autoLoginUserType: (import.meta.env.VITE_AUTO_LOGIN_USER_TYPE as 'teacher' | 'admin' | 'student') || 'teacher',
    tokenRefreshInterval: parseInt(import.meta.env.VITE_TOKEN_REFRESH_INTERVAL || '3600000'),

    // 로깅
    logLevel: (import.meta.env.VITE_LOG_LEVEL as AppConfig['logLevel']) || 'debug',
    consoleLog: import.meta.env.VITE_CONSOLE_LOG !== 'false'
  };
}

// 싱글톤 인스턴스
let configInstance: AppConfig | null = null;

export function getAppConfig(): AppConfig {
  if (!configInstance) {
    configInstance = loadConfig();
    console.log('App config loaded:', {
      ...configInstance,
      apiUrl: configInstance.apiUrl.substring(0, 30) + '...' // URL 일부만 표시
    });
  }
  return configInstance;
}

// 모드 체크 헬퍼
export function isLocalMode(): boolean {
  return getAppConfig().appMode === 'local';
}

export function isRemoteMode(): boolean {
  return getAppConfig().appMode === 'remote';
}

export function isHybridMode(): boolean {
  return getAppConfig().appMode === 'hybrid';
}

export function isDevMode(): boolean {
  return getAppConfig().isDevMode;
}

// 서버 연결 가능 여부 확인
export async function checkServerConnection(): Promise<boolean> {
  const config = getAppConfig();

  if (config.appMode === 'local') {
    return false; // 로컬 모드에서는 서버 연결 시도 안함
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${config.apiUrl}/api/health`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.log('Server connection check failed:', error);
    return false;
  }
}

// 현재 유효한 API URL 반환 (하이브리드 모드용)
export async function getEffectiveApiUrl(): Promise<string | null> {
  const config = getAppConfig();

  if (config.appMode === 'local') {
    return null;
  }

  const isConnected = await checkServerConnection();
  return isConnected ? config.apiUrl : null;
}
