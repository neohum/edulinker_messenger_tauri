import { useState, useEffect, useCallback } from 'react';

// 동적 import로 Tauri 플러그인 로드 (웹 환경에서 에러 방지)
let check: any = null;
let relaunch: any = null;

const loadTauriPlugins = async () => {
  try {
    const updater = await import('@tauri-apps/plugin-updater');
    const process = await import('@tauri-apps/plugin-process');
    check = updater.check;
    relaunch = process.relaunch;
    return true;
  } catch (e) {
    console.debug('[UpdateChecker] Tauri plugins not available (web mode)');
    return false;
  }
};

type Update = Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>>;

interface UpdateCheckerProps {
  /** 자동 체크 간격 (밀리초). 0이면 자동 체크 안 함 */
  autoCheckInterval?: number;
  /** 앱 시작 시 자동 체크 여부 */
  checkOnMount?: boolean;
}

export default function UpdateChecker({
  autoCheckInterval = 0,
  checkOnMount = true
}: UpdateCheckerProps) {
  const [updateInfo, setUpdateInfo] = useState<Update | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pluginsLoaded, setPluginsLoaded] = useState(false);

  // Tauri 플러그인 로드
  useEffect(() => {
    loadTauriPlugins().then(setPluginsLoaded);
  }, []);

  const checkForUpdates = useCallback(async (showNoUpdateMessage = false) => {
    if (!pluginsLoaded || !check) {
      console.debug('[UpdateChecker] Plugins not loaded, skipping update check');
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const update = await check();

      if (update) {
        setUpdateInfo(update);
        setShowModal(true);
      } else if (showNoUpdateMessage) {
        // 수동 체크 시 최신 버전임을 알림
        setError('현재 최신 버전을 사용 중입니다.');
        setTimeout(() => setError(null), 3000);
      }
    } catch (err: any) {
      console.error('업데이트 확인 실패:', err);
      if (showNoUpdateMessage) {
        setError(`업데이트 확인 실패: ${err.message || '알 수 없는 오류'}`);
      }
    } finally {
      setIsChecking(false);
    }
  }, [pluginsLoaded]);

  const downloadAndInstall = async () => {
    if (!updateInfo) return;

    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      let downloaded = 0;
      let contentLength = 0;

      await updateInfo.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            console.log(`다운로드 시작: ${contentLength} bytes`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              const progress = Math.round((downloaded / contentLength) * 100);
              setDownloadProgress(progress);
            }
            break;
          case 'Finished':
            console.log('다운로드 완료');
            setDownloadProgress(100);
            break;
        }
      });

      // 설치 완료 후 재시작
      await relaunch();
    } catch (err: any) {
      console.error('업데이트 설치 실패:', err);
      setError(`업데이트 설치 실패: ${err.message || '알 수 없는 오류'}`);
      setIsDownloading(false);
    }
  };

  const dismissUpdate = () => {
    setShowModal(false);
    setUpdateInfo(null);
  };

  // 앱 시작 시 자동 체크
  useEffect(() => {
    if (checkOnMount && pluginsLoaded) {
      // 약간의 지연 후 체크 (앱 초기화 완료 후)
      const timer = setTimeout(() => {
        checkForUpdates(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [checkOnMount, pluginsLoaded, checkForUpdates]);

  // 주기적 자동 체크
  useEffect(() => {
    if (autoCheckInterval > 0 && pluginsLoaded) {
      const interval = setInterval(() => {
        checkForUpdates(false);
      }, autoCheckInterval);
      return () => clearInterval(interval);
    }
  }, [autoCheckInterval, pluginsLoaded, checkForUpdates]);

  // 에러 메시지 표시
  if (error && !showModal) {
    return (
      <div className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg bg-gray-800 text-white max-w-sm">
        <div className="flex items-center space-x-2">
          <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  // 업데이트 모달
  if (!showModal || !updateInfo) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="theme-surface-translucent rounded-lg p-6 w-full max-w-md mx-4 shadow-2xl border border-white/20">
        {/* 헤더 */}
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold theme-text">새 버전 사용 가능</h3>
            <p className="text-sm theme-text-secondary">
              v{updateInfo.version}
            </p>
          </div>
        </div>

        {/* 업데이트 내용 */}
        {updateInfo.body && (
          <div className="mb-4 p-3 rounded-lg bg-white/10 max-h-40 overflow-auto">
            <p className="text-sm theme-text whitespace-pre-wrap">{updateInfo.body}</p>
          </div>
        )}

        {/* 다운로드 진행률 */}
        {isDownloading && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm theme-text-secondary mb-1">
              <span>다운로드 중...</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex justify-end space-x-3">
          {!isDownloading && (
            <button
              onClick={dismissUpdate}
              className="px-4 py-2 rounded-lg theme-text-secondary hover:bg-white/10 transition-colors"
            >
              나중에
            </button>
          )}
          <button
            onClick={downloadAndInstall}
            disabled={isDownloading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isDownloading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>설치 중...</span>
              </>
            ) : (
              <span>지금 업데이트</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// 업데이트 체크 버튼 컴포넌트 (설정 페이지용)
export function UpdateCheckButton() {
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [pluginsLoaded, setPluginsLoaded] = useState(false);

  useEffect(() => {
    loadTauriPlugins().then(setPluginsLoaded);
  }, []);

  const handleCheck = async () => {
    if (!pluginsLoaded || !check) {
      setMessage('업데이트 기능을 사용할 수 없습니다.');
      return;
    }

    setIsChecking(true);
    setMessage(null);

    try {
      const update = await check();

      if (update) {
        setUpdateAvailable(update);
        setMessage(`새 버전 v${update.version}이(가) 있습니다.`);
      } else {
        setMessage('현재 최신 버전입니다.');
      }
    } catch (err: any) {
      console.error('업데이트 확인 실패:', err);
      setMessage(`확인 실패: ${err.message || '알 수 없는 오류'}`);
    } finally {
      setIsChecking(false);
    }
  };

  const handleInstall = async () => {
    if (!updateAvailable || !relaunch) return;

    try {
      await updateAvailable.downloadAndInstall();
      await relaunch();
    } catch (err: any) {
      setMessage(`설치 실패: ${err.message || '알 수 없는 오류'}`);
    }
  };

  return (
    <div className="flex items-center space-x-3">
      <button
        onClick={handleCheck}
        disabled={isChecking}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
      >
        {isChecking ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>확인 중...</span>
          </>
        ) : (
          <span>업데이트 확인</span>
        )}
      </button>

      {updateAvailable && (
        <button
          onClick={handleInstall}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          지금 설치
        </button>
      )}

      {message && (
        <span className={`text-sm ${updateAvailable ? 'text-green-400' : 'theme-text-secondary'}`}>
          {message}
        </span>
      )}
    </div>
  );
}
