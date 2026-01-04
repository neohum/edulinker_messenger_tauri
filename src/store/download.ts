import { create } from 'zustand';

const DOWNLOAD_FOLDER_NAME = 'edulinker_file';

interface DownloadState {
  /** 다운로드 폴더 경로 (edulinker_file 포함) */
  downloadPath: string | null;
  /** 첫 실행 여부 (다운로드 폴더 설정 필요) */
  isFirstRun: boolean;
  /** 로딩 중 여부 */
  isLoading: boolean;

  /** 설정 로드 */
  loadSettings: () => Promise<void>;
  /** 다운로드 폴더 설정 (상위 폴더 선택 시 edulinker_file 하위 폴더 생성) */
  setDownloadPath: (parentPath: string) => Promise<void>;
  /** 다운로드 폴더 선택 다이얼로그 열기 */
  selectDownloadFolder: () => Promise<string | null>;
  /** 첫 실행 완료 처리 */
  completeFirstRun: () => void;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloadPath: null,
  isFirstRun: false,
  isLoading: true,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      // 저장된 다운로드 경로 가져오기
      const result = await window.electronAPI?.getSetting?.('downloadPath');

      if (result?.success && result.value) {
        set({ downloadPath: result.value, isFirstRun: false, isLoading: false });
      } else {
        // 저장된 경로가 없으면 기본 다운로드 폴더 확인
        const defaultPath = await window.electronAPI?.getDefaultDownloadPath?.();
        if (defaultPath?.success && defaultPath.path) {
          // 기본 경로 + edulinker_file 표시 (아직 생성하지 않음)
          const suggestedPath = `${defaultPath.path}${defaultPath.path.includes('\\') ? '\\' : '/'}${DOWNLOAD_FOLDER_NAME}`;
          set({ downloadPath: suggestedPath, isFirstRun: true, isLoading: false });
        } else {
          set({ downloadPath: null, isFirstRun: true, isLoading: false });
        }
      }
    } catch (error) {
      console.error('다운로드 설정 로드 실패:', error);
      set({ isLoading: false, isFirstRun: true });
    }
  },

  setDownloadPath: async (parentPath: string) => {
    try {
      // edulinker_file 하위 폴더 생성
      const result = await window.electronAPI?.createDownloadFolder?.(parentPath);

      if (result?.success && result.path) {
        // 생성된 폴더 경로 저장
        await window.electronAPI?.setSetting?.('downloadPath', result.path);
        set({ downloadPath: result.path, isFirstRun: false });
      } else {
        throw new Error(result?.error || '폴더 생성 실패');
      }
    } catch (error) {
      console.error('다운로드 경로 저장 실패:', error);
      throw error;
    }
  },

  selectDownloadFolder: async () => {
    try {
      const result = await window.electronAPI?.selectDownloadFolder?.();
      if (result?.success && result.path) {
        // 선택한 폴더 하위에 edulinker_file 폴더 생성
        await get().setDownloadPath(result.path);
        return get().downloadPath;
      }
      return null;
    } catch (error) {
      console.error('폴더 선택 실패:', error);
      return null;
    }
  },

  completeFirstRun: () => {
    set({ isFirstRun: false });
  },
}));
