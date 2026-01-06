import React, { useState, useEffect } from 'react';
import { useNetworkStore } from '../store/network';
import { getAppConfig, checkServerConnection } from '../services/appConfig';
import { getTeachers, getDataStats, refreshData, type Teacher } from '../services/dataService';

interface DevSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DevSidebar: React.FC<DevSidebarProps> = ({ isOpen, onClose }) => {
  const [activePanel, setActivePanel] = useState<'network' | 'logs' | 'tools' | 'data'>('network');
  const [dataStats, setDataStats] = useState<{
    totalTeachers: number;
    onlineTeachers: number;
    admins: number;
    mode: string;
    serverConnected: boolean;
  } | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const appConfig = getAppConfig();

  const {
    realInternalNetwork,
    realExternalNetwork,
    simulationEnabled,
    simulatedInternalNetwork,
    simulatedExternalNetwork,
    simulatedLatency,
    simulatedPacketLoss,
    simulatedBandwidth,
    networkLogs,
    toggleSimulation,
    setSimulatedInternalNetwork,
    setSimulatedExternalNetwork,
    setSimulatedLatency,
    setSimulatedPacketLoss,
    setSimulatedBandwidth,
    clearNetworkLogs,
    getEffectiveInternalNetwork,
    getEffectiveExternalNetwork,
  } = useNetworkStore();

  const effectiveInternal = getEffectiveInternalNetwork();
  const effectiveExternal = getEffectiveExternalNetwork();

  // 패널 열릴 때 데이터 로드
  useEffect(() => {
    if (isOpen) {
      loadStats();
      checkServer();
    }
  }, [isOpen]);

  const loadStats = async () => {
    setIsLoadingData(true);
    try {
      const stats = await getDataStats();
      setDataStats(stats);
      const teacherList = await getTeachers();
      setTeachers(teacherList.slice(0, 20)); // 처음 20명만
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  const checkServer = async () => {
    setServerStatus('checking');
    const connected = await checkServerConnection();
    setServerStatus(connected ? 'connected' : 'disconnected');
  };

  const handleRefreshData = async () => {
    setIsLoadingData(true);
    try {
      await refreshData();
      await loadStats();
      alert('데이터가 새로고침되었습니다.');
    } catch (error) {
      alert('새로고침 실패: ' + error);
    } finally {
      setIsLoadingData(false);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getLogTypeStyle = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'warning':
        return 'text-yellow-400';
      case 'success':
        return 'text-green-400';
      default:
        return 'text-gray-300';
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      default:
        return 'ℹ️';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed top-0 right-0 h-full w-96 bg-gray-900 text-white z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛠️</span>
            <h2 className="text-lg font-bold">개발자 도구</h2>
            <span className="px-2 py-0.5 text-xs bg-orange-600 rounded-full">DEV</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Current Status Bar */}
        <div className="px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="text-xs text-gray-400 mb-2">현재 유효 상태</div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${effectiveInternal ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">내부: {effectiveInternal ? '연결됨' : '끊김'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${effectiveExternal ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm">외부: {effectiveExternal ? '연결됨' : '끊김'}</span>
            </div>
          </div>
          {simulationEnabled && (
            <div className="mt-2 text-xs text-orange-400">
              ⚠️ 시뮬레이션 모드 활성화됨
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActivePanel('network')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activePanel === 'network'
                ? 'bg-gray-800 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            🌐 네트워크
          </button>
          <button
            onClick={() => setActivePanel('logs')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activePanel === 'logs'
                ? 'bg-gray-800 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            📋 로그 ({networkLogs.length})
          </button>
          <button
            onClick={() => setActivePanel('tools')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activePanel === 'tools'
                ? 'bg-gray-800 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            🔧 도구
          </button>
          <button
            onClick={() => setActivePanel('data')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activePanel === 'data'
                ? 'bg-gray-800 text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            📊 데이터
          </button>
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Network Panel */}
          {activePanel === 'network' && (
            <div className="p-4 space-y-6">
              {/* Real Network Status */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">📡 실제 네트워크 상태</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">내부 네트워크 (LAN)</span>
                    <div className={`px-2 py-1 rounded text-xs ${realInternalNetwork ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {realInternalNetwork ? '연결됨' : '끊김'}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">외부 네트워크 (WAN)</span>
                    <div className={`px-2 py-1 rounded text-xs ${realExternalNetwork ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {realExternalNetwork ? '연결됨' : '끊김'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Simulation Toggle */}
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300">🎭 시뮬레이션 모드</h3>
                    <p className="text-xs text-gray-500 mt-1">가상 네트워크 환경 테스트</p>
                  </div>
                  <button
                    onClick={toggleSimulation}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      simulationEnabled ? 'bg-orange-600' : 'bg-gray-600'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        simulationEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {simulationEnabled && (
                  <div className="space-y-4 pt-4 border-t border-gray-700">
                    {/* Simulated Network Status */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">내부 네트워크</span>
                        <button
                          onClick={() => setSimulatedInternalNetwork(!simulatedInternalNetwork)}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            simulatedInternalNetwork
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-red-600 hover:bg-red-700'
                          }`}
                        >
                          {simulatedInternalNetwork ? '연결됨' : '끊김'}
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">외부 네트워크</span>
                        <button
                          onClick={() => setSimulatedExternalNetwork(!simulatedExternalNetwork)}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            simulatedExternalNetwork
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-red-600 hover:bg-red-700'
                          }`}
                        >
                          {simulatedExternalNetwork ? '연결됨' : '끊김'}
                        </button>
                      </div>
                    </div>

                    {/* Latency Setting */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-300">지연시간 (Latency)</span>
                        <span className="text-gray-400">{simulatedLatency}ms</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="5000"
                        step="100"
                        value={simulatedLatency}
                        onChange={(e) => setSimulatedLatency(Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0ms</span>
                        <span>5000ms</span>
                      </div>
                    </div>

                    {/* Packet Loss Setting */}
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-300">패킷 손실률</span>
                        <span className="text-gray-400">{simulatedPacketLoss}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={simulatedPacketLoss}
                        onChange={(e) => setSimulatedPacketLoss(Number(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    {/* Bandwidth Setting */}
                    <div>
                      <label className="text-sm text-gray-300 block mb-2">대역폭 (Bandwidth)</label>
                      <select
                        value={simulatedBandwidth}
                        onChange={(e) => setSimulatedBandwidth(e.target.value as any)}
                        className="w-full bg-gray-700 text-white text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="unlimited">무제한</option>
                        <option value="fast">빠름 (100Mbps)</option>
                        <option value="medium">보통 (10Mbps)</option>
                        <option value="slow">느림 (1Mbps)</option>
                        <option value="2g">2G (256Kbps)</option>
                      </select>
                    </div>

                    {/* Quick Presets */}
                    <div>
                      <label className="text-sm text-gray-300 block mb-2">빠른 설정</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setSimulatedInternalNetwork(true);
                            setSimulatedExternalNetwork(true);
                            setSimulatedLatency(0);
                            setSimulatedPacketLoss(0);
                            setSimulatedBandwidth('unlimited');
                          }}
                          className="px-3 py-2 bg-green-700 hover:bg-green-600 rounded text-xs transition-colors"
                        >
                          🟢 정상 연결
                        </button>
                        <button
                          onClick={() => {
                            setSimulatedInternalNetwork(true);
                            setSimulatedExternalNetwork(false);
                            setSimulatedLatency(0);
                            setSimulatedPacketLoss(0);
                          }}
                          className="px-3 py-2 bg-yellow-700 hover:bg-yellow-600 rounded text-xs transition-colors"
                        >
                          🟡 외부 끊김
                        </button>
                        <button
                          onClick={() => {
                            setSimulatedInternalNetwork(false);
                            setSimulatedExternalNetwork(false);
                            setSimulatedLatency(0);
                            setSimulatedPacketLoss(0);
                          }}
                          className="px-3 py-2 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors"
                        >
                          🔴 완전 오프라인
                        </button>
                        <button
                          onClick={() => {
                            setSimulatedInternalNetwork(true);
                            setSimulatedExternalNetwork(true);
                            setSimulatedLatency(2000);
                            setSimulatedPacketLoss(30);
                            setSimulatedBandwidth('slow');
                          }}
                          className="px-3 py-2 bg-orange-700 hover:bg-orange-600 rounded text-xs transition-colors"
                        >
                          🟠 불안정 연결
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Logs Panel */}
          {activePanel === 'logs' && (
            <div className="p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-gray-300">네트워크 로그</h3>
                <button
                  onClick={clearNetworkLogs}
                  className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                >
                  로그 지우기
                </button>
              </div>
              {networkLogs.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <p>로그가 없습니다</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {networkLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-gray-800 rounded p-2 text-xs"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span>{getLogIcon(log.type)}</span>
                        <span className="text-gray-500">{formatTime(log.timestamp)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          log.source === 'internal' ? 'bg-blue-900 text-blue-300' :
                          log.source === 'external' ? 'bg-purple-900 text-purple-300' :
                          'bg-orange-900 text-orange-300'
                        }`}>
                          {log.source === 'internal' ? '내부' : log.source === 'external' ? '외부' : '시뮬'}
                        </span>
                      </div>
                      <p className={getLogTypeStyle(log.type)}>{log.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tools Panel */}
          {activePanel === 'tools' && (
            <div className="p-4 space-y-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">🔧 개발 도구</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => window.electronAPI?.toggleDevTools?.()}
                    className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-left transition-colors"
                  >
                    🔍 DevTools 열기
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-left transition-colors"
                  >
                    🔄 페이지 새로고침
                  </button>
                  <button
                    onClick={() => {
                      localStorage.clear();
                      sessionStorage.clear();
                      alert('로컬 스토리지가 초기화되었습니다.');
                    }}
                    className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-left transition-colors"
                  >
                    🗑️ 로컬 스토리지 초기화
                  </button>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">⚙️ 앱 설정</h3>
                <div className="space-y-2 text-xs text-gray-400">
                  <div className="flex justify-between items-center">
                    <span>운영 모드</span>
                    <span className={`px-2 py-1 rounded ${
                      appConfig.appMode === 'local' ? 'bg-yellow-900 text-yellow-300' :
                      appConfig.appMode === 'remote' ? 'bg-blue-900 text-blue-300' :
                      'bg-purple-900 text-purple-300'
                    }`}>
                      {appConfig.appMode === 'local' ? '로컬' :
                       appConfig.appMode === 'remote' ? '원격' : '하이브리드'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>서버 상태</span>
                    <span className={`px-2 py-1 rounded ${
                      serverStatus === 'checking' ? 'bg-gray-700 text-gray-300' :
                      serverStatus === 'connected' ? 'bg-green-900 text-green-300' :
                      'bg-red-900 text-red-300'
                    }`}>
                      {serverStatus === 'checking' ? '확인 중...' :
                       serverStatus === 'connected' ? '연결됨' : '연결 안됨'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>API URL</span>
                    <span className="text-gray-500 truncate max-w-[150px]" title={appConfig.apiUrl}>
                      {appConfig.apiUrl}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>자동 로그인</span>
                    <span className={appConfig.autoLogin ? 'text-green-400' : 'text-gray-500'}>
                      {appConfig.autoLogin ? '활성화' : '비활성화'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={checkServer}
                  className="w-full mt-3 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                >
                  🔄 서버 상태 재확인
                </button>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">📊 환경 정보</h3>
                <div className="space-y-1 text-xs text-gray-400">
                  <p><span className="text-gray-500">Mode:</span> {import.meta.env.MODE}</p>
                  <p><span className="text-gray-500">DEV:</span> {String(import.meta.env.DEV)}</p>
                  <p><span className="text-gray-500">PROD:</span> {String(import.meta.env.PROD)}</p>
                  <p><span className="text-gray-500">App Mode:</span> {appConfig.appMode}</p>
                </div>
              </div>
            </div>
          )}

          {/* Data Panel */}
          {activePanel === 'data' && (
            <div className="p-4 space-y-4">
              {/* Data Stats */}
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-gray-300">📊 데이터 통계</h3>
                  <button
                    onClick={handleRefreshData}
                    disabled={isLoadingData}
                    className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
                  >
                    {isLoadingData ? '로딩...' : '새로고침'}
                  </button>
                </div>
                {dataStats ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-700 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-blue-400">{dataStats.totalTeachers}</div>
                      <div className="text-xs text-gray-400">전체 교사</div>
                    </div>
                    <div className="bg-gray-700 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">{dataStats.onlineTeachers}</div>
                      <div className="text-xs text-gray-400">온라인</div>
                    </div>
                    <div className="bg-gray-700 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-purple-400">{dataStats.admins}</div>
                      <div className="text-xs text-gray-400">관리자</div>
                    </div>
                    <div className="bg-gray-700 rounded p-3 text-center">
                      <div className={`text-2xl font-bold ${
                        dataStats.serverConnected ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        {dataStats.mode === 'local' ? '로컬' : dataStats.serverConnected ? '온라인' : '오프라인'}
                      </div>
                      <div className="text-xs text-gray-400">데이터 소스</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    {isLoadingData ? '로딩 중...' : '데이터 없음'}
                  </div>
                )}
              </div>

              {/* Teacher List Preview */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">👥 교사 목록 (최근 20명)</h3>
                {teachers.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {teachers.map((teacher) => (
                      <div
                        key={teacher.id}
                        className="flex items-center gap-2 p-2 bg-gray-700 rounded text-xs"
                      >
                        <div className={`w-2 h-2 rounded-full ${teacher.isOnline ? 'bg-green-500' : 'bg-gray-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">{teacher.name}</div>
                          <div className="text-gray-400 truncate">{teacher.jobTitle} · {teacher.workplace}</div>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          teacher.role === 'ADMIN' ? 'bg-purple-900 text-purple-300' : 'bg-blue-900 text-blue-300'
                        }`}>
                          {teacher.role === 'ADMIN' ? '관리자' : '교사'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    {isLoadingData ? '로딩 중...' : '교사 데이터 없음'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 text-xs text-gray-500 text-center">
          개발자 모드 전용 · v{import.meta.env.VITE_APP_VERSION || '0.1.x'}
        </div>
      </div>
    </>
  );
};

export default DevSidebar;

