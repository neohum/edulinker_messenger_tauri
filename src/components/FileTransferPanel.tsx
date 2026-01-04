import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import { useNotificationStore } from '../store/notifications';
import { tusClient, TusUploadHandle } from '../services/tusClient';

interface FileTransfer {
  id: string;
  uploadId: string | null;
  peerId: string;
  peerName: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'paused';
  direction: 'send' | 'receive';
  handle?: TusUploadHandle;
  error?: string;
  completedAt?: string;
  filePath?: string;
}

interface Contact {
  userId: string;
  name: string;
  isOnline?: boolean;
}

export default function FileTransferPanel() {
  const { user } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<Contact | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // tus 클라이언트 초기화
  useEffect(() => {
    const init = async () => {
      try {
        await tusClient.init();
        const endpoint = tusClient.getEndpoint();
        setIsInitialized(!!endpoint);
        console.log('[FileTransferPanel] tus client initialized, endpoint:', endpoint);
        if (!endpoint) {
          console.error('[FileTransferPanel] tus endpoint is null - server may not be running');
        }
      } catch (error) {
        console.error('[FileTransferPanel] Failed to initialize tus client:', error);
        setIsInitialized(false);
      }
    };
    init();
  }, []);

  // 연락처 목록 (실제로는 주소록에서 가져옴)
  useEffect(() => {
    // TODO: 실제 연락처 로드
    setContacts([
      { userId: 'user-1', name: '김선생', isOnline: true },
      { userId: 'user-2', name: '이선생', isOnline: true },
      { userId: 'user-3', name: '박선생', isOnline: false },
    ]);
  }, []);

  const handleSelectFile = () => {
    if (!selectedRecipient) {
      addNotification({
        title: '수신자 선택 필요',
        message: '먼저 파일을 보낼 상대를 선택해주세요.',
        type: 'warning',
      });
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user || !selectedRecipient) return;

    for (const file of Array.from(files)) {
      await uploadFile(file);
    }

    // 입력 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFile = useCallback(async (file: File) => {
    if (!user || !selectedRecipient) {
      console.error('[FileTransferPanel] Cannot upload: user or recipient missing');
      return;
    }

    if (!isInitialized) {
      console.error('[FileTransferPanel] Cannot upload: tus client not initialized');
      addNotification({
        title: '업로드 실패',
        message: 'tus 서버에 연결되지 않았습니다.',
        type: 'error',
      });
      return;
    }

    const endpoint = tusClient.getEndpoint();
    if (!endpoint) {
      console.error('[FileTransferPanel] Cannot upload: tus endpoint is null');
      addNotification({
        title: '업로드 실패',
        message: 'tus 서버 엔드포인트를 가져올 수 없습니다.',
        type: 'error',
      });
      return;
    }

    const transferId = `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[FileTransferPanel] Starting upload:', file.name, 'to endpoint:', endpoint);

    // 전송 항목 추가
    const newTransfer: FileTransfer = {
      id: transferId,
      uploadId: null,
      peerId: selectedRecipient.userId,
      peerName: selectedRecipient.name,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      status: 'pending',
      direction: 'send',
    };

    setTransfers((prev) => [newTransfer, ...prev]);

    try {
      const handle = tusClient.upload({
        file,
        senderId: user.id,
        recipientId: selectedRecipient.userId,
        onProgress: (percentage, bytesUploaded, bytesTotal) => {
          console.log(`[FileTransferPanel] Progress: ${percentage}% (${bytesUploaded}/${bytesTotal})`);
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === transferId
                ? { ...t, progress: percentage, status: 'uploading' }
                : t
            )
          );
        },
        onSuccess: (uploadId, fileUrl) => {
          console.log('[FileTransferPanel] Upload success:', uploadId, fileUrl);
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === transferId
                ? {
                    ...t,
                    uploadId,
                    progress: 100,
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                  }
                : t
            )
          );

          addNotification({
            title: '파일 전송 완료',
            message: `${file.name} 파일이 ${selectedRecipient.name}님에게 전송되었습니다.`,
            type: 'success',
          });
        },
        onError: (error) => {
          console.error('[FileTransferPanel] Upload error:', error);
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === transferId
                ? { ...t, status: 'failed', error: error.message }
                : t
            )
          );

          addNotification({
            title: '파일 전송 실패',
            message: `${file.name}: ${error.message}`,
            type: 'error',
          });
        },
      });

      // 핸들 저장 및 상태를 uploading으로 변경
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId ? { ...t, handle, status: 'uploading' } : t
        )
      );
    } catch (error: any) {
      console.error('[FileTransferPanel] Upload exception:', error);
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId
            ? { ...t, status: 'failed', error: error.message || 'Unknown error' }
            : t
        )
      );

      addNotification({
        title: '업로드 오류',
        message: error.message || '알 수 없는 오류가 발생했습니다.',
        type: 'error',
      });
    }
  }, [user, selectedRecipient, isInitialized, addNotification]);

  const handlePauseResume = (transfer: FileTransfer) => {
    if (!transfer.handle) return;

    if (transfer.status === 'uploading') {
      transfer.handle.pause();
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transfer.id ? { ...t, status: 'paused' } : t
        )
      );
    } else if (transfer.status === 'paused') {
      transfer.handle.resume();
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transfer.id ? { ...t, status: 'uploading' } : t
        )
      );
    }
  };

  const handleCancel = (transfer: FileTransfer) => {
    if (transfer.handle) {
      transfer.handle.abort();
    }
    setTransfers((prev) => prev.filter((t) => t.id !== transfer.id));
  };

  const handleRetry = async (transfer: FileTransfer) => {
    // 전송 재시도 - 원본 파일이 필요하므로 새로 선택해야 함
    addNotification({
      title: '재시도',
      message: '파일을 다시 선택해주세요.',
      type: 'info',
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusColor = (status: FileTransfer['status']) => {
    const colors = {
      pending: 'text-gray-500',
      uploading: 'text-blue-600',
      completed: 'text-green-600',
      failed: 'text-red-600',
      paused: 'text-yellow-600',
    };
    return colors[status];
  };

  const getStatusLabel = (status: FileTransfer['status']) => {
    const labels = {
      pending: '대기 중',
      uploading: '전송 중',
      completed: '완료',
      failed: '실패',
      paused: '일시정지',
    };
    return labels[status];
  };

  const getFileIcon = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const icons: Record<string, string> = {
      pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
      ppt: '📽️', pptx: '📽️', txt: '📃',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️', svg: '🖼️',
      mp3: '🎵', wav: '🎵', mp4: '🎬', avi: '🎬', mov: '🎬',
      zip: '📦', rar: '📦', '7z': '📦',
    };
    return icons[ext || ''] || '📎';
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">파일 전송</h2>
            <p className="text-sm text-gray-600 mt-1">
              tus 프로토콜 기반 재개 가능한 파일 전송
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                isInitialized
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full mr-1 ${
                  isInitialized ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              {isInitialized ? '서버 연결됨' : '연결 중...'}
            </span>
          </div>
        </div>

        {/* 수신자 선택 */}
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              수신자 선택
            </label>
            <select
              value={selectedRecipient?.userId || ''}
              onChange={(e) => {
                const contact = contacts.find((c) => c.userId === e.target.value);
                setSelectedRecipient(contact || null);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- 수신자를 선택하세요 --</option>
              {contacts.map((contact) => (
                <option key={contact.userId} value={contact.userId}>
                  {contact.name} {contact.isOnline ? '(온라인)' : '(오프라인)'}
                </option>
              ))}
            </select>
          </div>
          <div className="pt-6">
            <button
              onClick={handleSelectFile}
              disabled={!isInitialized || !selectedRecipient}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              파일 선택
            </button>
          </div>
        </div>

        {/* 숨겨진 파일 입력 */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
        />
      </div>

      {/* Transfers List */}
      <div className="flex-1 overflow-auto p-6">
        {transfers.length === 0 ? (
          <div className="text-center text-gray-500 mt-12">
            <div className="text-6xl mb-4">📁</div>
            <p className="text-lg font-medium mb-2">파일 전송 내역이 없습니다</p>
            <p className="text-sm mb-6">
              수신자를 선택하고 파일을 보내보세요.
            </p>
            <div className="p-4 bg-blue-50 rounded-lg max-w-2xl mx-auto text-left">
              <h3 className="font-semibold text-blue-900 mb-2">tus 프로토콜 기능</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 네트워크 중단 시 자동 재개</li>
                <li>• 대용량 파일 청크 단위 전송</li>
                <li>• 전송 일시정지 및 재개 가능</li>
                <li>• 체크섬 기반 무결성 검증</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {transfers.map((transfer) => (
              <div
                key={transfer.id}
                className="p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{getFileIcon(transfer.fileName)}</span>
                    <div>
                      <p className="font-medium text-gray-800">{transfer.fileName}</p>
                      <p className="text-sm text-gray-600">
                        {transfer.direction === 'send' ? '→' : '←'}{' '}
                        {transfer.peerName}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${getStatusColor(transfer.status)}`}>
                      {getStatusLabel(transfer.status)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(transfer.fileSize)}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                {(transfer.status === 'pending' || transfer.status === 'uploading' || transfer.status === 'paused') && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                      <span>{transfer.status === 'pending' ? '준비 중...' : '진행률'}</span>
                      <span>{transfer.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          transfer.status === 'pending' ? 'bg-gray-400 animate-pulse' :
                          transfer.status === 'paused' ? 'bg-yellow-500' : 'bg-blue-600'
                        }`}
                        style={{ width: transfer.status === 'pending' ? '5%' : `${transfer.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {transfer.status === 'failed' && transfer.error && (
                  <p className="mt-2 text-sm text-red-600">{transfer.error}</p>
                )}

                {/* Action Buttons */}
                <div className="mt-3 flex justify-end space-x-2">
                  {transfer.status === 'pending' && (
                    <button
                      onClick={() => handleCancel(transfer)}
                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      취소
                    </button>
                  )}
                  {(transfer.status === 'uploading' || transfer.status === 'paused') && (
                    <>
                      <button
                        onClick={() => handlePauseResume(transfer)}
                        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        {transfer.status === 'paused' ? '재개' : '일시정지'}
                      </button>
                      <button
                        onClick={() => handleCancel(transfer)}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        취소
                      </button>
                    </>
                  )}
                  {transfer.status === 'failed' && (
                    <button
                      onClick={() => handleRetry(transfer)}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      다시 시도
                    </button>
                  )}
                  {transfer.status === 'completed' && (
                    <span className="text-sm text-green-600">
                      {transfer.completedAt
                        ? new Date(transfer.completedAt).toLocaleTimeString('ko-KR')
                        : '완료'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
