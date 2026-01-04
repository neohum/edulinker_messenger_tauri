import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';

const TOKEN_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

export function useAuthManager() {
  const { isAuthenticated, setAuth, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  // Check stored auth on mount
  useEffect(() => {
    const checkStoredAuth = async () => {
      try {
        const result = await window.electronAPI?.getStoredAuth?.();
        if (result?.success && result.token && result.user) {
          setAuth(result.token, result.user);
          if (window.electronAPI?.startDeviceRegistration && result.user?.id) {
            window.electronAPI.startDeviceRegistration(result.token, result.user.id);
          }
        }
      } catch (error) {
        console.error('Failed to load stored auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkStoredAuth();
  }, [setAuth]);

  // Auto-refresh token and manage device registration
  useEffect(() => {
    if (!isAuthenticated) {
      if (window.electronAPI?.stopDeviceRegistration) {
        window.electronAPI.stopDeviceRegistration();
      }
      return;
    }

    const refreshInterval = setInterval(async () => {
      try {
        const result = await window.electronAPI?.refreshToken?.();
        if (!result?.success) {
          // 외부 서버 연결 실패는 정상적인 상황 (오프라인/내부망 모드)
          // 로컬 토큰은 유지하고 로그아웃하지 않음
          console.debug('[AuthManager] Token refresh skipped - server not available');
        }
      } catch (error) {
        // 네트워크 오류는 오프라인 상태이므로 무시
        console.debug('[AuthManager] Token refresh skipped - network error');
      }
    }, TOKEN_REFRESH_INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [isAuthenticated, logout]);

  return { isLoading };
}
