import { useState } from 'react';
import { useDownloadStore } from '../store/download';

interface DownloadFolderSetupProps {
  onComplete: () => void;
}

export default function DownloadFolderSetup({ onComplete }: DownloadFolderSetupProps) {
  const { downloadPath, selectDownloadFolder } = useDownloadStore();
  const [isSelecting, setIsSelecting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleSelectFolder = async () => {
    setIsSelecting(true);
    try {
      await selectDownloadFolder();
    } finally {
      setIsSelecting(false);
    }
  };

  const handleConfirm = async () => {
    if (downloadPath) {
      setIsConfirming(true);
      try {
        // 이미 selectDownloadFolder에서 폴더가 생성되었으므로 바로 완료
        onComplete();
      } finally {
        setIsConfirming(false);
      }
    }
  };

  const handleSkip = async () => {
    // 기본 경로 사용 - 기본 다운로드 폴더에 edulinker_file 생성
    setIsConfirming(true);
    try {
      const defaultPath = await window.electronAPI?.getDefaultDownloadPath?.();
      if (defaultPath?.success && defaultPath.path) {
        await useDownloadStore.getState().setDownloadPath(defaultPath.path);
      }
      onComplete();
    } catch (error) {
      console.error('기본 폴더 생성 실패:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="theme-surface rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full theme-primary-bg/10 flex items-center justify-center">
            <svg className="w-8 h-8 theme-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <h2 className="text-xl font-bold theme-text mb-2">다운로드 폴더 설정</h2>
          <p className="text-sm theme-text-secondary">
            첨부 파일을 저장할 상위 폴더를 선택해주세요.<br />
            선택한 폴더 안에 <strong>edulinker_file</strong> 폴더가 생성됩니다.
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium theme-text mb-2">
            다운로드 폴더
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={downloadPath || '폴더를 선택해주세요'}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg theme-surface theme-text text-sm bg-gray-50"
            />
            <button
              type="button"
              onClick={handleSelectFolder}
              disabled={isSelecting || isConfirming}
              className="px-4 py-2 theme-primary-bg text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm whitespace-nowrap"
            >
              {isSelecting ? '...' : '찾아보기'}
            </button>
          </div>
          <p className="text-xs theme-text-secondary mt-2">
            파일은 위 경로에 저장됩니다.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isConfirming}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg theme-text hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
          >
            {isConfirming ? '처리 중...' : '기본값 사용'}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!downloadPath || isConfirming}
            className="flex-1 px-4 py-2.5 theme-primary-bg text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm font-medium"
          >
            {isConfirming ? '처리 중...' : '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
