# Developer B - 프론트엔드 전문가 작업 지시서

## 담당 영역
- React 컴포넌트 개발
- P2P 프론트엔드 통합
- UI/UX 개선
- 상태 관리

---

## 🔴 Sprint 1 - Week 1-2

### Task B-1: P2P 이벤트 리스너 훅 구현 (예상 2일)

#### 목표
Tauri P2P 이벤트를 수신하고 상태를 관리하는 React 훅 생성

#### 작업 파일
- `src/hooks/useP2PNetwork.ts` (신규)
- `src/types/p2p.ts` (신규)

#### 상세 작업

**1. 타입 정의 (src/types/p2p.ts)**

```typescript
export interface PeerInfo {
  peerId: string;
  userId: string;
  userName?: string;
  schoolId?: string;
  ipAddress: string;
  port: number;
  lastSeen: string;
  isOnline: boolean;
  hostname?: string;
  platform?: string;
}

export interface FileTransfer {
  id: string;
  peerId: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'failed' | 'rejected';
  direction: 'incoming' | 'outgoing';
  totalChunks: number;
}

export interface P2PMessage {
  from: string;
  data: any;
  timestamp: string;
}

export interface FileOffer {
  transferId: string;
  from: string;
  fileName: string;
  fileSize: number;
}
```

**2. P2P 훅 구현 (src/hooks/useP2PNetwork.ts)**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { PeerInfo, FileTransfer, P2PMessage, FileOffer } from '../types/p2p';

export interface UseP2PNetworkOptions {
  autoStart?: boolean;
  userId?: string;
  userName?: string;
  schoolId?: string;
}

export interface UseP2PNetworkReturn {
  // 상태
  isRunning: boolean;
  isInitializing: boolean;
  peers: PeerInfo[];
  transfers: FileTransfer[];
  pendingOffers: FileOffer[];
  error: Error | null;

  // 액션
  start: (userId: string, userName: string, schoolId?: string) => Promise<void>;
  stop: () => Promise<void>;
  sendMessage: (peerId: string, message: any) => Promise<boolean>;
  broadcast: (message: any) => Promise<boolean>;
  offerFile: (peerId: string, filePath: string) => Promise<string | null>;
  acceptFile: (transferId: string) => Promise<boolean>;
  rejectFile: (transferId: string) => Promise<boolean>;

  // 피어 관련
  getPeerByUserId: (userId: string) => PeerInfo | undefined;
  isUserOnline: (userId: string) => boolean;
}

export function useP2PNetwork(options: UseP2PNetworkOptions = {}): UseP2PNetworkReturn {
  const { autoStart = false, userId, userName, schoolId } = options;

  const [isRunning, setIsRunning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [pendingOffers, setPendingOffers] = useState<FileOffer[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const unlistenRefs = useRef<UnlistenFn[]>([]);

  // 이벤트 리스너 설정
  useEffect(() => {
    const setupListeners = async () => {
      const listeners = await Promise.all([
        // 피어 발견
        listen<PeerInfo>('p2p:peer-discovered', (event) => {
          setPeers((prev) => {
            const exists = prev.some((p) => p.peerId === event.payload.peerId);
            if (exists) {
              return prev.map((p) =>
                p.peerId === event.payload.peerId ? event.payload : p
              );
            }
            return [...prev, event.payload];
          });
        }),

        // 피어 연결 해제
        listen<{ peerId: string }>('p2p:peer-disconnected', (event) => {
          setPeers((prev) =>
            prev.map((p) =>
              p.peerId === event.payload.peerId
                ? { ...p, isOnline: false }
                : p
            )
          );
        }),

        // 메시지 수신
        listen<P2PMessage>('p2p:message-received', (event) => {
          // 메시지 처리는 외부 핸들러로 위임
          console.log('[P2P] Message received:', event.payload);
        }),

        // 파일 offer 수신
        listen<FileOffer>('p2p:file-offer', (event) => {
          setPendingOffers((prev) => [...prev, event.payload]);
        }),

        // 파일 전송 진행
        listen<FileTransfer>('p2p:file-progress', (event) => {
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === event.payload.id ? event.payload : t
            )
          );
        }),

        // 파일 전송 완료
        listen<{ transferId: string }>('p2p:file-complete', (event) => {
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === event.payload.transferId
                ? { ...t, status: 'completed' as const, progress: 100 }
                : t
            )
          );
        }),

        // 파일 전송 에러
        listen<{ transferId: string; error: string }>('p2p:file-error', (event) => {
          setTransfers((prev) =>
            prev.map((t) =>
              t.id === event.payload.transferId
                ? { ...t, status: 'failed' as const }
                : t
            )
          );
        }),
      ]);

      unlistenRefs.current = listeners;
    };

    setupListeners();

    return () => {
      unlistenRefs.current.forEach((unlisten) => unlisten());
    };
  }, []);

  // 자동 시작
  useEffect(() => {
    if (autoStart && userId && userName && !isRunning) {
      start(userId, userName, schoolId);
    }
  }, [autoStart, userId, userName, schoolId]);

  // P2P 시작
  const start = useCallback(
    async (userId: string, userName: string, schoolId?: string) => {
      if (isRunning || isInitializing) return;

      setIsInitializing(true);
      setError(null);

      try {
        await invoke('internal_p2p_start', {
          userId,
          userName,
          schoolId,
          discoveryPort: 41235,
        });

        await invoke('network_discovery_start', {
          port: 41235,
        });

        setIsRunning(true);
        console.log('[P2P] Started successfully');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        console.error('[P2P] Start failed:', error);
      } finally {
        setIsInitializing(false);
      }
    },
    [isRunning, isInitializing]
  );

  // P2P 중지
  const stop = useCallback(async () => {
    if (!isRunning) return;

    try {
      await invoke('internal_p2p_stop');
      await invoke('network_discovery_stop');
      setIsRunning(false);
      setPeers([]);
      setTransfers([]);
      setPendingOffers([]);
      console.log('[P2P] Stopped');
    } catch (err) {
      console.error('[P2P] Stop failed:', err);
    }
  }, [isRunning]);

  // 메시지 전송
  const sendMessage = useCallback(
    async (peerId: string, message: any): Promise<boolean> => {
      try {
        await invoke('internal_p2p_send_message', { peerId, message });
        return true;
      } catch (err) {
        console.error('[P2P] Send message failed:', err);
        return false;
      }
    },
    []
  );

  // 브로드캐스트
  const broadcast = useCallback(async (message: any): Promise<boolean> => {
    try {
      await invoke('internal_p2p_broadcast', { message });
      return true;
    } catch (err) {
      console.error('[P2P] Broadcast failed:', err);
      return false;
    }
  }, []);

  // 파일 전송 제안
  const offerFile = useCallback(
    async (peerId: string, filePath: string): Promise<string | null> => {
      try {
        const result = await invoke<{ success: boolean; transferId?: string }>(
          'internal_p2p_offer_file',
          { peerId, filePath }
        );

        if (result.success && result.transferId) {
          setTransfers((prev) => [
            ...prev,
            {
              id: result.transferId!,
              peerId,
              fileName: filePath.split('/').pop() || 'unknown',
              fileSize: 0,
              progress: 0,
              status: 'pending',
              direction: 'outgoing',
              totalChunks: 0,
            },
          ]);
          return result.transferId;
        }
        return null;
      } catch (err) {
        console.error('[P2P] Offer file failed:', err);
        return null;
      }
    },
    []
  );

  // 파일 수락
  const acceptFile = useCallback(async (transferId: string): Promise<boolean> => {
    try {
      await invoke('internal_p2p_accept_file', { transferId });
      setPendingOffers((prev) => prev.filter((o) => o.transferId !== transferId));

      // transfers에 추가
      const offer = pendingOffers.find((o) => o.transferId === transferId);
      if (offer) {
        setTransfers((prev) => [
          ...prev,
          {
            id: transferId,
            peerId: offer.from,
            fileName: offer.fileName,
            fileSize: offer.fileSize,
            progress: 0,
            status: 'transferring',
            direction: 'incoming',
            totalChunks: 0,
          },
        ]);
      }

      return true;
    } catch (err) {
      console.error('[P2P] Accept file failed:', err);
      return false;
    }
  }, [pendingOffers]);

  // 파일 거절
  const rejectFile = useCallback(async (transferId: string): Promise<boolean> => {
    try {
      await invoke('internal_p2p_reject_file', { transferId });
      setPendingOffers((prev) => prev.filter((o) => o.transferId !== transferId));
      return true;
    } catch (err) {
      console.error('[P2P] Reject file failed:', err);
      return false;
    }
  }, []);

  // userId로 피어 찾기
  const getPeerByUserId = useCallback(
    (userId: string) => peers.find((p) => p.userId === userId),
    [peers]
  );

  // 사용자 온라인 여부
  const isUserOnline = useCallback(
    (userId: string) => {
      const peer = peers.find((p) => p.userId === userId);
      return peer?.isOnline ?? false;
    },
    [peers]
  );

  return {
    isRunning,
    isInitializing,
    peers,
    transfers,
    pendingOffers,
    error,
    start,
    stop,
    sendMessage,
    broadcast,
    offerFile,
    acceptFile,
    rejectFile,
    getPeerByUserId,
    isUserOnline,
  };
}

export default useP2PNetwork;
```

**3. P2P Context Provider (선택사항)**

```typescript
// src/contexts/P2PContext.tsx
import { createContext, useContext, ReactNode } from 'react';
import { useP2PNetwork, UseP2PNetworkReturn } from '../hooks/useP2PNetwork';

const P2PContext = createContext<UseP2PNetworkReturn | null>(null);

export function P2PProvider({ children }: { children: ReactNode }) {
  const p2p = useP2PNetwork();
  return <P2PContext.Provider value={p2p}>{children}</P2PContext.Provider>;
}

export function useP2P() {
  const context = useContext(P2PContext);
  if (!context) {
    throw new Error('useP2P must be used within P2PProvider');
  }
  return context;
}
```

#### 완료 기준
- [ ] 모든 P2P 이벤트 리스너 동작
- [ ] 상태 관리 정상 동작
- [ ] TypeScript 타입 완전
- [ ] 에러 핸들링 구현

---

### Task B-2: MessagingPanel P2P 통합 (예상 3일)

#### 목표
기존 MessagingPanel에 P2P 메시징 기능 통합

#### 작업 파일
- `src/components/MessagingPanel.tsx`

#### 상세 작업

**1. P2P 훅 통합**

```typescript
// MessagingPanel.tsx 상단에 추가
import { useP2PNetwork } from '../hooks/useP2PNetwork';
import { listen } from '@tauri-apps/api/event';

const MessagingPanel = () => {
  // 기존 훅들...
  const { user } = useAuthStore();
  const { sendMessage: sendStreamMessage } = useDurableStreams({ withUser: selectedContact?.id });

  // P2P 훅 추가
  const {
    isRunning: p2pRunning,
    peers,
    sendMessage: sendP2PMessage,
    isUserOnline,
    pendingOffers,
    acceptFile,
    rejectFile,
  } = useP2PNetwork({
    autoStart: true,
    userId: user?.id,
    userName: user?.name,
    schoolId: user?.schoolId,
  });

  // P2P 메시지 수신 핸들러
  useEffect(() => {
    const unlisten = listen<P2PMessage>('p2p:message-received', (event) => {
      const { from, data, timestamp } = event.payload;

      // 메시지 스토어에 추가
      if (data.type === 'text') {
        addMessage({
          id: crypto.randomUUID(),
          senderId: from,
          content: data.content,
          timestamp,
          isP2P: true,
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
```

**2. 하이브리드 메시지 전송**

```typescript
  // 메시지 전송 (P2P 우선, 실패시 Stream)
  const handleSendMessage = async (content: string) => {
    if (!selectedContact || !content.trim()) return;

    const messageData = {
      type: 'text',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    // 선택된 연락처의 피어 찾기
    const peer = peers.find((p) => p.userId === selectedContact.id);

    let sent = false;

    // P2P로 먼저 시도
    if (peer && peer.isOnline && p2pRunning) {
      sent = await sendP2PMessage(peer.peerId, messageData);
      console.log('[Messaging] P2P send result:', sent);
    }

    // P2P 실패 시 Stream으로 전송
    if (!sent) {
      console.log('[Messaging] Falling back to Stream');
      sent = await sendStreamMessage(selectedContact.id, content);
    }

    if (sent) {
      // 로컬 메시지 목록에 추가
      addLocalMessage({
        id: crypto.randomUUID(),
        senderId: user!.id,
        recipientId: selectedContact.id,
        content: content.trim(),
        timestamp: new Date().toISOString(),
        status: 'sent',
        isP2P: peer?.isOnline,
      });

      setInputValue('');
    }
  };
```

**3. 온라인 상태 표시**

```typescript
  // 연락처 목록 렌더링
  const renderContactItem = (contact: Contact) => {
    const isOnline = isUserOnline(contact.id);

    return (
      <div
        key={contact.id}
        className={`flex items-center p-3 cursor-pointer hover:bg-gray-100 ${
          selectedContact?.id === contact.id ? 'bg-blue-50' : ''
        }`}
        onClick={() => setSelectedContact(contact)}
      >
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
            {contact.name[0]}
          </div>
          {/* 온라인 상태 표시 */}
          <div
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
              isOnline ? 'bg-green-500' : 'bg-gray-400'
            }`}
          />
        </div>
        <div className="ml-3 flex-1">
          <div className="font-medium">{contact.name}</div>
          <div className="text-sm text-gray-500">
            {isOnline ? '온라인' : '오프라인'}
          </div>
        </div>
        {/* 읽지 않은 메시지 배지 */}
        {unreadCounts[contact.id] > 0 && (
          <div className="bg-red-500 text-white text-xs rounded-full px-2 py-1">
            {unreadCounts[contact.id]}
          </div>
        )}
      </div>
    );
  };
```

**4. 파일 전송 offer 모달**

```typescript
  // 파일 offer 모달
  const [fileOfferModal, setFileOfferModal] = useState<FileOffer | null>(null);

  // 새 파일 offer 감지
  useEffect(() => {
    if (pendingOffers.length > 0 && !fileOfferModal) {
      setFileOfferModal(pendingOffers[0]);
    }
  }, [pendingOffers]);

  const handleAcceptFile = async () => {
    if (fileOfferModal) {
      await acceptFile(fileOfferModal.transferId);
      setFileOfferModal(null);
    }
  };

  const handleRejectFile = async () => {
    if (fileOfferModal) {
      await rejectFile(fileOfferModal.transferId);
      setFileOfferModal(null);
    }
  };

  // 모달 렌더링
  {fileOfferModal && (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">파일 전송 요청</h3>
        <p className="mb-2">
          <strong>{getPeerName(fileOfferModal.from)}</strong>님이 파일을 보내려고 합니다.
        </p>
        <div className="bg-gray-100 rounded p-3 mb-4">
          <div className="font-medium">{fileOfferModal.fileName}</div>
          <div className="text-sm text-gray-500">
            {formatFileSize(fileOfferModal.fileSize)}
          </div>
        </div>
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleRejectFile}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
          >
            거절
          </button>
          <button
            onClick={handleAcceptFile}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            수락
          </button>
        </div>
      </div>
    </div>
  )}
```

**5. 메시지 전송 방식 표시**

```typescript
  // 메시지 아이템 렌더링
  const renderMessage = (message: Message) => {
    const isOwn = message.senderId === user?.id;

    return (
      <div
        key={message.id}
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}
      >
        <div
          className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
            isOwn ? 'bg-blue-500 text-white' : 'bg-gray-200'
          }`}
        >
          <div>{message.content}</div>
          <div className={`text-xs mt-1 flex items-center ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
            <span>{formatTime(message.timestamp)}</span>
            {/* P2P 전송 표시 */}
            {message.isP2P && (
              <span className="ml-2" title="P2P 전송">
                ⚡
              </span>
            )}
            {/* 전송 상태 표시 */}
            {isOwn && (
              <span className="ml-2">
                {message.status === 'sent' && '✓'}
                {message.status === 'delivered' && '✓✓'}
                {message.status === 'read' && '✓✓'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };
```

#### 완료 기준
- [ ] P2P 메시지 전송/수신 동작
- [ ] 온라인 상태 실시간 표시
- [ ] Stream 폴백 동작
- [ ] 파일 offer 모달 동작
- [ ] 메시지 전송 방식 표시

---

### Task B-3: 파일 전송 UI 완성 (예상 2일)

#### 작업 파일
- `src/components/FileTransferPanel.tsx`

#### 상세 작업

```typescript
import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useP2PNetwork } from '../hooks/useP2PNetwork';
import { useAddressBook } from '../hooks/useAddressBook';

const FileTransferPanel = () => {
  const { contacts } = useAddressBook();
  const {
    peers,
    transfers,
    pendingOffers,
    offerFile,
    acceptFile,
    rejectFile,
    isUserOnline,
  } = useP2PNetwork();

  const [selectedContact, setSelectedContact] = useState<string | null>(null);

  // 파일 선택 및 전송
  const handleSelectFile = async () => {
    if (!selectedContact) return;

    const filePath = await open({
      multiple: false,
      title: '전송할 파일 선택',
    });

    if (filePath && typeof filePath === 'string') {
      const peer = peers.find((p) => p.userId === selectedContact);
      if (peer) {
        const transferId = await offerFile(peer.peerId, filePath);
        if (transferId) {
          console.log('[FileTransfer] Offer sent:', transferId);
        }
      }
    }
  };

  // 온라인 연락처만 필터링
  const onlineContacts = contacts.filter((c) => isUserOnline(c.id));

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">파일 전송</h2>
      </div>

      <div className="flex-1 flex">
        {/* 연락처 목록 */}
        <div className="w-1/3 border-r">
          <div className="p-3 bg-gray-50 border-b">
            <span className="text-sm text-gray-600">
              온라인 ({onlineContacts.length})
            </span>
          </div>
          <div className="overflow-y-auto">
            {onlineContacts.map((contact) => (
              <div
                key={contact.id}
                className={`p-3 cursor-pointer hover:bg-gray-100 ${
                  selectedContact === contact.id ? 'bg-blue-50' : ''
                }`}
                onClick={() => setSelectedContact(contact.id)}
              >
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
                    {contact.name[0]}
                  </div>
                  <span className="ml-3">{contact.name}</span>
                </div>
              </div>
            ))}
            {onlineContacts.length === 0 && (
              <div className="p-4 text-center text-gray-500">
                온라인인 연락처가 없습니다
              </div>
            )}
          </div>
        </div>

        {/* 전송 영역 */}
        <div className="flex-1 flex flex-col">
          {selectedContact ? (
            <>
              {/* 파일 선택 버튼 */}
              <div className="p-6 border-b">
                <button
                  onClick={handleSelectFile}
                  className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition"
                >
                  <div className="text-center">
                    <span className="text-4xl">📁</span>
                    <p className="mt-2 text-gray-600">클릭하여 파일 선택</p>
                  </div>
                </button>
              </div>

              {/* 전송 목록 */}
              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-3">전송 중</h3>
                {transfers.map((transfer) => (
                  <TransferItem key={transfer.id} transfer={transfer} />
                ))}
                {transfers.length === 0 && (
                  <p className="text-center text-gray-400">전송 중인 파일 없음</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              연락처를 선택하세요
            </div>
          )}
        </div>
      </div>

      {/* 수신 요청 알림 */}
      {pendingOffers.length > 0 && (
        <div className="border-t p-4 bg-yellow-50">
          <h3 className="font-medium mb-2">파일 수신 요청</h3>
          {pendingOffers.map((offer) => (
            <div key={offer.transferId} className="flex items-center justify-between bg-white p-3 rounded mb-2">
              <div>
                <div className="font-medium">{offer.fileName}</div>
                <div className="text-sm text-gray-500">
                  {formatFileSize(offer.fileSize)}
                </div>
              </div>
              <div className="space-x-2">
                <button
                  onClick={() => rejectFile(offer.transferId)}
                  className="px-3 py-1 text-red-600 hover:bg-red-50 rounded"
                >
                  거절
                </button>
                <button
                  onClick={() => acceptFile(offer.transferId)}
                  className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  수락
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 전송 아이템 컴포넌트
const TransferItem = ({ transfer }: { transfer: FileTransfer }) => {
  const statusText = {
    pending: '대기 중',
    transferring: '전송 중',
    completed: '완료',
    failed: '실패',
    rejected: '거절됨',
  };

  const statusColor = {
    pending: 'bg-yellow-500',
    transferring: 'bg-blue-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    rejected: 'bg-gray-500',
  };

  return (
    <div className="bg-white border rounded-lg p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{transfer.fileName}</span>
        <span
          className={`px-2 py-1 text-xs text-white rounded ${statusColor[transfer.status]}`}
        >
          {statusText[transfer.status]}
        </span>
      </div>
      {transfer.status === 'transferring' && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${transfer.progress}%` }}
          />
        </div>
      )}
      <div className="text-xs text-gray-500 mt-1">
        {transfer.direction === 'outgoing' ? '보내는 중' : '받는 중'} •{' '}
        {formatFileSize(transfer.fileSize)}
      </div>
    </div>
  );
};

// 파일 크기 포맷
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default FileTransferPanel;
```

#### 완료 기준
- [ ] 실제 연락처 연동
- [ ] 파일 선택 및 전송 동작
- [ ] 전송 진행률 표시
- [ ] 수신 요청 알림 및 수락/거절

---

### Task B-4: 메시지 검색 UI (예상 2일)

#### 작업 파일
- `src/components/MessageSearch.tsx` (신규)

```typescript
import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import debounce from 'lodash/debounce';

interface SearchResult {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  timestamp: string;
  conversationId: string;
}

interface MessageSearchProps {
  conversationId?: string;
  onResultClick: (messageId: string, conversationId: string) => void;
  onClose: () => void;
}

const MessageSearch = ({ conversationId, onResultClick, onClose }: MessageSearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    senderId: '',
  });

  // 검색 실행 (디바운스)
  const performSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const searchResults = await invoke<SearchResult[]>('messages_search', {
          query: searchQuery,
          conversationId,
          filters,
        });
        setResults(searchResults);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300),
    [conversationId, filters]
  );

  useEffect(() => {
    performSearch(query);
  }, [query, performSearch]);

  // 검색어 하이라이트
  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200">{part}</mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center pt-20 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        {/* 검색 헤더 */}
        <div className="p-4 border-b">
          <div className="flex items-center">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="메시지 검색..."
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              onClick={onClose}
              className="ml-3 p-2 hover:bg-gray-100 rounded"
            >
              ✕
            </button>
          </div>

          {/* 필터 */}
          <div className="flex gap-3 mt-3">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="px-3 py-1 border rounded text-sm"
              placeholder="시작일"
            />
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="px-3 py-1 border rounded text-sm"
              placeholder="종료일"
            />
          </div>
        </div>

        {/* 검색 결과 */}
        <div className="max-h-96 overflow-y-auto">
          {isSearching ? (
            <div className="p-8 text-center text-gray-500">검색 중...</div>
          ) : results.length > 0 ? (
            results.map((result) => (
              <div
                key={result.id}
                className="p-4 border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => onResultClick(result.id, result.conversationId)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{result.senderName}</span>
                  <span className="text-sm text-gray-500">
                    {new Date(result.timestamp).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-gray-700">
                  {highlightText(result.content, query)}
                </p>
              </div>
            ))
          ) : query ? (
            <div className="p-8 text-center text-gray-500">검색 결과 없음</div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              검색어를 입력하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageSearch;
```

---

### Task B-5: 그룹 채팅 기능 완성 (예상 3일)

#### 작업 파일
- `src/components/GroupChatPanel.tsx`
- `src/components/CreateGroupModal.tsx` (신규)
- `src/components/GroupSettings.tsx` (신규)

(상세 구현은 기존 GroupChatPanel.tsx 기반으로 확장)

---

## 📋 체크리스트

### Week 1
- [ ] Task B-1: P2P Hook 구현
- [ ] Task B-2 시작: MessagingPanel 통합

### Week 2
- [ ] Task B-2 완료
- [ ] Task B-3: 파일 전송 UI
- [ ] Task B-4: 메시지 검색 UI
- [ ] Task B-5 시작: 그룹 채팅

### 코드 리뷰 요청
- P2P Hook 완료 시
- MessagingPanel 통합 완료 시

---

*작성일: 2026-01-03*
