import React, { useState, useEffect } from 'react';

interface DiscoveredDevice {
  deviceId: string;
  hostname: string;
  ipAddress: string;
  macAddress: string;
  os: string;
  platform: string;
  userId?: string;
  lastSeen: Date;
  discoveryVersion: string;
}

export const NetworkDiscovery: React.FC = () => {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInternalNetworkActive, setIsInternalNetworkActive] = useState(true);
  const [isExternalNetworkActive, setIsExternalNetworkActive] = useState(true);
  const [discoveryPort, setDiscoveryPort] = useState<number | null>(null);

  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

  console.log('NetworkDiscovery - isDevelopment:', isDevelopment, 'DEV:', import.meta.env.DEV, 'MODE:', import.meta.env.MODE);

  useEffect(() => {
    // 디바이스 발견 이벤트 리스너 등록
    if ((window as any).electronAPI?.onDeviceDiscovered) {
      (window as any).electronAPI.onDeviceDiscovered((device: any) => {
        console.log('Device discovered:', device);
        setDiscoveredDevices(prev => {
          const existingIndex = prev.findIndex(d => d.deviceId === device.deviceId);
          if (existingIndex >= 0) {
            // 기존 디바이스 업데이트
            const updated = [...prev];
            updated[existingIndex] = { ...device, lastSeen: new Date(device.lastSeen) };
            return updated;
          } else {
            // 새 디바이스 추가
            return [...prev, { ...device, lastSeen: new Date(device.lastSeen) }];
          }
        });
      });
    }

    // 컴포넌트 언마운트 시 리스너 제거
    return () => {
      if ((window as any).electronAPI?.removeDeviceDiscoveryListener) {
        (window as any).electronAPI.removeDeviceDiscoveryListener();
      }
    };
  }, []);

  const startDiscovery = async () => {
    try {
      setIsLoading(true);
      const result = await (window as any).electronAPI?.startNetworkDiscovery();
      if (result?.success) {
        setIsDiscovering(true);
        setIsInternalNetworkActive(true);
        setDiscoveryPort(typeof result.port === 'number' ? result.port : null);
        console.log('Network discovery started');
      } else {
        console.error('Failed to start discovery:', result?.error);
      }
    } catch (error) {
      console.error('Error starting discovery:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const stopDiscovery = async () => {
    try {
      setIsLoading(true);
      const result = await (window as any).electronAPI?.stopNetworkDiscovery();
      if (result?.success) {
        setIsDiscovering(false);
        setIsInternalNetworkActive(false);
        console.log('Network discovery stopped');
      } else {
        console.error('Failed to stop discovery:', result?.error);
      }
    } catch (error) {
      console.error('Error stopping discovery:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveDevice = async (device: DiscoveredDevice) => {
    try {
      const result = await (window as any).electronAPI?.saveDiscoveredDevice(device);
      if (result?.success) {
        console.log('Device saved to local DB:', device.hostname);
        // 로컬 상태 업데이트
        setDiscoveredDevices(prev =>
          prev.map(d =>
            d.deviceId === device.deviceId
              ? { ...d, synced: true }
              : d
          )
        );
      } else {
        console.error('Failed to save device:', result?.error);
      }
    } catch (error) {
      console.error('Error saving device:', error);
    }
  };

  const syncDatabases = async () => {
    try {
      setIsLoading(true);
      const result = await (window as any).electronAPI?.syncDatabases();
      if (result?.success) {
        console.log('Databases synced:', result.message);
        // 모든 디바이스를 동기화됨으로 표시
        setDiscoveredDevices(prev =>
          prev.map(d => ({ ...d, synced: true }))
        );
      } else {
        console.error('Failed to sync databases:', result?.error);
      }
    } catch (error) {
      console.error('Error syncing databases:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExternalNetwork = () => {
    setIsExternalNetworkActive(!isExternalNetworkActive);
    // 외부 네트워크 토글 로직 (예: API 호출 끄기/켜기)
    console.log('External network:', isExternalNetworkActive ? 'disabled' : 'enabled');
  };

  const formatLastSeen = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}시간 전`;

    return date.toLocaleDateString();
  };

  return (
    <div className="p-6 theme-surface-translucent rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">네트워크 디스커버리</h2>

      <div className="mb-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isInternalNetworkActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm">내부 네트워크: {isInternalNetworkActive ? '활성' : '비활성'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isExternalNetworkActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm">외부 네트워크: {isExternalNetworkActive ? '활성' : '비활성'}</span>
          </div>
        </div>
        {discoveryPort && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>디스커버리 포트: {discoveryPort}</span>
            {discoveryPort !== 41235 && (
              <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                기본 포트 사용 불가, 대체 포트 사용 중
              </span>
            )}
          </div>
        )}
        {true && ( // 개발자 메뉴에서 항상 표시
          <button
            onClick={toggleExternalNetwork}
            className={`px-3 py-1 text-xs rounded ${isExternalNetworkActive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white`}
          >
            외부 네트워크 {isExternalNetworkActive ? '끄기' : '켜기'}
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        {!isDiscovering ? (
          <button
            onClick={startDiscovery}
            disabled={isLoading}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {isLoading ? '시작 중...' : '디스커버리 시작'}
          </button>
        ) : (
          <button
            onClick={stopDiscovery}
            disabled={isLoading}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {isLoading ? '중지 중...' : '디스커버리 중지'}
          </button>
        )}

        <button
          onClick={syncDatabases}
          disabled={isLoading || discoveredDevices.length === 0}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {isLoading ? '동기화 중...' : 'DB 동기화'}
        </button>
      </div>

      {isDiscovering && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-blue-800">
            🔍 네트워크에서 다른 edulinker 인스턴스를 찾고 있습니다...
          </p>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">
          발견된 디바이스 ({discoveredDevices.length})
        </h3>

        {discoveredDevices.length === 0 ? (
          <p className="text-gray-500">아직 발견된 디바이스가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {discoveredDevices.map((device) => (
              <div
                key={device.deviceId}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{device.hostname}</h4>
                    <p className="text-sm text-gray-600">IP: {device.ipAddress}</p>
                    <p className="text-sm text-gray-600">OS: {device.os} ({device.platform})</p>
                    <p className="text-sm text-gray-600">MAC: {device.macAddress}</p>
                    <p className="text-sm text-gray-500">
                      마지막 발견: {formatLastSeen(device.lastSeen)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveDevice(device)}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 text-sm rounded"
                    >
                      로컬 DB 저장
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkDiscovery;
