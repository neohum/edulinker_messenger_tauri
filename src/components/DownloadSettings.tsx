import { useEffect, useState } from 'react';
import { useDownloadStore } from '../store/download';

export default function DownloadSettings() {
  const { downloadPath, loadSettings, selectDownloadFolder } = useDownloadStore();
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSelectFolder = async () => {
    setIsSelecting(true);
    try {
      await selectDownloadFolder();
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold theme-text mb-4">다운로드 설정</h3>
        <p className="text-sm theme-text-secondary mb-4">
          메시지에 첨부된 파일을 다운로드할 폴더를 설정합니다.
        </p>
      </div>

      <div className="theme-surface-translucent rounded-lg p-4 border border-current/10">
        <label className="block text-sm font-medium theme-text mb-2">
          다운로드 폴더
        </label>
        <div className="flex gap-3">
          <div className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg bg-gray-50 theme-text text-sm truncate">
            {downloadPath || '폴더가 설정되지 않았습니다'}
          </div>
          <button
            type="button"
            onClick={handleSelectFolder}
            disabled={isSelecting}
            className="px-4 py-2.5 theme-primary-bg text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm whitespace-nowrap flex items-center gap-2"
          >
            {isSelecting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                선택 중...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                폴더 선택
              </>
            )}
          </button>
        </div>
        <p className="text-xs theme-text-secondary mt-2">
          첨부 파일을 다운로드하면 이 폴더에 저장됩니다.
        </p>
      </div>

      {/* 추가 다운로드 옵션 */}
      <div className="theme-surface-translucent rounded-lg p-4 border border-current/10">
        <h4 className="text-sm font-medium theme-text mb-3">다운로드 옵션</h4>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              defaultChecked={true}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm theme-text">다운로드 완료 시 알림 표시</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              defaultChecked={false}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm theme-text">다운로드 완료 후 폴더 열기</span>
          </label>
        </div>
      </div>
    </div>
  );
}
