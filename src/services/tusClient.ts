/**
 * tus 프로토콜 기반 재개 가능한 파일 업로드 클라이언트
 * https://tus.io/
 */

import * as tus from 'tus-js-client';
import { invoke } from '@tauri-apps/api/core';

export interface TusUploadOptions {
  file: File;
  recipientId: string;
  senderId: string;
  onProgress?: (percentage: number, bytesUploaded: number, bytesTotal: number) => void;
  onSuccess?: (uploadId: string, fileUrl: string) => void;
  onError?: (error: Error) => void;
}

export interface TusUploadHandle {
  abort: () => void;
  pause: () => void;
  resume: () => void;
  uploadId: string | null;
}

class TusClient {
  private endpoint: string | null = null;

  /**
   * 엔드포인트 초기화 (앱 시작 시 호출)
   */
  async init(): Promise<void> {
    try {
      const result = await invoke<{ success: boolean; endpoint: string }>('tus_get_endpoint');
      if (result.success) {
        this.endpoint = result.endpoint;
        console.log('[TusClient] Initialized with endpoint:', this.endpoint);
      }
    } catch (error) {
      console.error('[TusClient] Failed to initialize:', error);
    }
  }

  /**
   * 파일 업로드
   */
  upload(options: TusUploadOptions): TusUploadHandle {
    if (!this.endpoint) {
      throw new Error('TusClient not initialized. Call init() first.');
    }

    let uploadId: string | null = null;

    const upload = new tus.Upload(options.file, {
      endpoint: this.endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: 5 * 1024 * 1024, // 5MB 청크
      metadata: {
        filename: options.file.name,
        filetype: options.file.type || 'application/octet-stream',
        senderId: options.senderId,
        recipientId: options.recipientId,
      },
      onError: (error) => {
        console.error('[TusClient] Upload failed:', error);
        options.onError?.(error);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
        options.onProgress?.(percentage, bytesUploaded, bytesTotal);
      },
      onSuccess: () => {
        // URL에서 업로드 ID 추출
        if (upload.url) {
          const parts = upload.url.split('/');
          uploadId = parts[parts.length - 1];
        }
        console.log('[TusClient] Upload complete:', uploadId);
        options.onSuccess?.(uploadId || '', upload.url || '');
      },
      onAfterResponse: (req, res) => {
        // Location 헤더에서 업로드 ID 추출
        const location = res.getHeader('Location');
        if (location) {
          const parts = location.split('/');
          uploadId = parts[parts.length - 1];
        }
      },
    });

    // 업로드 시작
    upload.findPreviousUploads().then((previousUploads) => {
      // 이전 업로드가 있으면 재개
      if (previousUploads.length > 0) {
        console.log('[TusClient] Resuming previous upload');
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });

    return {
      abort: () => upload.abort(),
      pause: () => upload.abort(), // tus에서는 abort가 pause 역할
      resume: () => upload.start(),
      get uploadId() {
        return uploadId;
      },
    };
  }

  /**
   * 업로드 상태 조회
   */
  async getUploadStatus(uploadId: string): Promise<{
    success: boolean;
    upload?: {
      id: string;
      offset: number;
      length: number;
      isComplete: boolean;
      filename: string;
      finalPath?: string;
    };
    error?: string;
  }> {
    return await invoke('tus_get_upload_status', { uploadId });
  }

  /**
   * 엔드포인트 URL 반환
   */
  getEndpoint(): string | null {
    return this.endpoint;
  }
}

// 싱글톤 인스턴스
export const tusClient = new TusClient();
