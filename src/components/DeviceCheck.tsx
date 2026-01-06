import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';

interface DeviceCheckProps {
  children: React.ReactNode;
}

export function DeviceCheck({ children }: DeviceCheckProps) {
  const [status, setStatus] = useState<'CHECKING' | 'APPROVED' | 'PENDING' | 'DENIED'>('CHECKING');
  const [message, setMessage] = useState('');
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const checkDevice = async () => {
      try {
        // 내부 네트워크 전용 모드: 모든 기기 자동 승인
        console.log('[DeviceCheck] 내부 네트워크 전용 모드 - 기기 자동 승인');
        setStatus('APPROVED');
        return;

        // 아래 코드는 추후 서버 연결 시 활성화
        /*
        // Check if running in Electron
        if (!window.electronAPI?.getDeviceInfo) {
          console.log('Not running in Electron, skipping device check');
          setStatus('APPROVED');
          return;
        }

        // 개발 환경이거나 오프라인 모드에서는 자동 승인
        const isDevelopment = import.meta.env.DEV;
        const isOfflineMode = !navigator.onLine || localStorage.getItem('offline_mode') === 'true';

        if (isDevelopment || isOfflineMode) {
          console.log('Development/Offline mode: Auto-approving device');
          setStatus('APPROVED');
          return;
        }

        const deviceInfo = await window.electronAPI.getDeviceInfo();

        // Use environment variable for API URL
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

        const response = await fetch(`${apiUrl}/desktop/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(deviceInfo),
        });

        const data = await response.json();

        if (data.status === 'APPROVED') {
          setStatus('APPROVED');
          if (data.token && data.user) {
            setAuth(data.token, data.user);
          }
        } else if (data.status === 'PENDING') {
          setStatus('PENDING');
          setMessage(data.message || '기기 승인 대기 중입니다.');
        } else {
          setStatus('DENIED');
          setMessage(data.message || '접근이 거부되었습니다.');
        }
        */

      } catch (error) {
        console.error('[DeviceCheck] Error:', error);
        // 내부 네트워크 전용 모드: 에러 발생 시에도 자동 승인
        console.log('[DeviceCheck] 에러 발생, 자동 승인 처리');
        setStatus('APPROVED');
      }
    };

    checkDevice();
  }, [setAuth]);

  if (status === 'CHECKING') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">기기 인증 중...</p>
        </div>
      </div>
    );
  }

  if (status === 'PENDING') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">승인 대기 중</h2>
          <p className="text-gray-600 mb-6">{message}</p>
          <p className="text-sm text-gray-500">학교 관리자에게 문의해주세요.</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            다시 확인
          </button>
        </div>
      </div>
    );
  }

  if (status === 'DENIED') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-red-600 mb-2">접근 거부</h2>
          <p className="text-gray-600 mb-6">{message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
