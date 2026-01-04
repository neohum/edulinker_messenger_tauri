import { useEffect, useCallback } from 'react';
import { useNetworkStore } from '../store/network';

const NETWORK_CHECK_INTERVAL = 30000; // 30 seconds

export function useNetworkMonitor() {
  const { setRealNetworkStatus, addNetworkLog } = useNetworkStore();

  const checkNetworkStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI?.checkNetworkStatus?.();
      if (result) {
        setRealNetworkStatus(result.internal, result.online);

        if (!result.internal && !result.online) {
          addNetworkLog({
            type: 'error',
            source: 'external',
            message: '네트워크 연결이 끊겼습니다. 오프라인 모드로 전환합니다.'
          });
        } else if (!result.online && result.internal) {
          addNetworkLog({
            type: 'warning',
            source: 'external',
            message: '외부 네트워크 연결이 끊겼습니다. 내부 P2P 통신만 가능합니다.'
          });
        }
      }
    } catch (error) {
      console.error('네트워크 상태 확인 실패:', error);
    }
  }, [setRealNetworkStatus, addNetworkLog]);

  useEffect(() => {
    checkNetworkStatus();

    const networkCheckInterval = setInterval(checkNetworkStatus, NETWORK_CHECK_INTERVAL);

    const handleOnline = () => {
      addNetworkLog({
        type: 'success',
        source: 'external',
        message: '네트워크 연결이 복구되었습니다.'
      });
      checkNetworkStatus();
    };

    const handleOffline = () => {
      addNetworkLog({
        type: 'warning',
        source: 'external',
        message: '네트워크 연결이 끊어졌습니다.'
      });
      checkNetworkStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(networkCheckInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkNetworkStatus, addNetworkLog]);

  useEffect(() => {
    const handleDiscoveryPortChanged = (data: {
      port: number;
      requestedPort: number;
      isFallback: boolean;
    }) => {
      if (!data || typeof data.port !== 'number') return;

      if (data.isFallback) {
        addNetworkLog({
          type: 'warning',
          source: 'internal',
          message: `디스커버리 포트 충돌로 ${data.requestedPort} -> ${data.port}로 변경되었습니다.`
        });
      } else {
        addNetworkLog({
          type: 'info',
          source: 'internal',
          message: `디스커버리 포트 ${data.port} 사용 중입니다.`
        });
      }
    };

    if (window.electronAPI?.onNetworkDiscoveryPortChanged) {
      window.electronAPI.onNetworkDiscoveryPortChanged(handleDiscoveryPortChanged);
      return () => {
        window.electronAPI?.removeNetworkDiscoveryPortListener?.();
      };
    }
  }, [addNetworkLog]);

  return { checkNetworkStatus };
}
