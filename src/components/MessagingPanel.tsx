import { useEffect, useState, useRef, useCallback } from 'react';
import { useMessagingStore } from '../store/messaging';
import { useAuthStore } from '../store/auth';
import { useNotificationStore } from '../store/notifications';
import { isLocalMode } from '../services/appConfig';
import { addressBookService } from '../services/addressBook';
import { generateFakeMessages } from '../services/fakeDataGenerator';
import type { P2PStatus, PeerInfo, Contact, FormattedMessage } from '../types/messaging';
import { getRandomAutoReply } from '../types/messaging';

function mapEntryToContact(entry: any): Contact {
  return {
    userId: entry.userId,
    name: entry.name,
    email: entry.email,
    role: entry.role,
    schoolId: entry.schoolId,
    isOnline: entry.isOnline,
    lastSeen: entry.lastSeen,
    jobTitle: entry.jobTitle,
    workplace: entry.workplace
  };
}

function updateContactStatus(
  contacts: Contact[],
  userId: string,
  isOnline: boolean
): Contact[] {
  return contacts.map(c =>
    c.userId === userId ? { ...c, isOnline } : c
  );
}

function formatMessage(
  msg: any,
  getSenderName: (senderId: string) => string
): FormattedMessage {
  return {
    id: msg.id || msg.messageId,
    messageId: msg.messageId || msg.id,
    senderId: msg.senderId,
    senderName: msg.senderName || getSenderName(msg.senderId),
    recipientId: msg.receiverId || msg.recipientId,
    content: msg.content,
    type: msg.type || msg.messageType || 'text',
    timestamp: msg.timestamp,
    isRead: msg.isRead || false,
    readAt: msg.readAt,
    delivered: msg.delivered ?? true,
    deliveredAt: msg.deliveredAt
  };
}

export default function MessagingPanel() {
  const {
    messages,
    contacts,
    selectedContact,
    isLoading,
    addMessage,
    setMessages,
    setContacts,
    selectContact,
    markAsRead,
    markAsDelivered,
    setLoading
  } = useMessagingStore();

  const { user, token } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const [messageContent, setMessageContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // P2P 상태
  const [p2pStatus, setP2PStatus] = useState<P2PStatus>({
    isRunning: false,
    peerCount: 0
  });
  const [discoveredPeers, setDiscoveredPeers] = useState<Map<string, PeerInfo>>(new Map());
  const [isTyping, setIsTyping] = useState<Map<string, boolean>>(new Map());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFileTransfers, setPendingFileTransfers] = useState<Map<string, any>>(new Map());
  const [showFileTransferDialog, setShowFileTransferDialog] = useState(false);
  const [incomingFileOffer, setIncomingFileOffer] = useState<any>(null);

  // 첨부 파일 상태
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  // Initialize P2P service and load contacts on mount
  useEffect(() => {
    loadContacts();

    // P2P 서비스 시작 (사용자가 로그인된 경우)
    if (user?.id && user?.name) {
      initP2PService();
    }

    return () => {
      // 컴포넌트 언마운트 시 P2P 중지
      stopP2PService();
    };
  }, [user?.id, user?.name]);

  // P2P 서비스 초기화
  const initP2PService = useCallback(async () => {
    if (!user?.id || !user?.name) return;

    try {
      console.log('[MessagingPanel] Starting P2P service...');
      // schoolId를 전달하여 같은 학교 사용자만 연결되도록 함
      const result = await window.electronAPI?.startInternalP2P?.(user.id, user.name, user.schoolId);

      if (result?.success) {
        const info = result.info || result;
        setP2PStatus({
          isRunning: true,
          peerId: info.peerId,
          userId: user.id,
          userName: user.name,
          ipAddress: info.ipAddress,
          peerCount: 0
        });
        console.log('[MessagingPanel] P2P service started:', result);
      } else {
        console.error('[MessagingPanel] Failed to start P2P:', result?.error);
      }
    } catch (error) {
      console.error('[MessagingPanel] P2P init error:', error);
    }
  }, [user?.id, user?.name]);

  // P2P 서비스 중지
  const stopP2PService = useCallback(async () => {
    try {
      await window.electronAPI?.stopInternalP2P?.();
      setP2PStatus({ isRunning: false, peerCount: 0 });
    } catch (error) {
      console.error('[MessagingPanel] P2P stop error:', error);
    }
  }, []);

  // P2P 이벤트 리스너 설정
  useEffect(() => {
    // 피어 발견
    const handlePeerDiscovered = (peer: PeerInfo) => {
      console.log('[MessagingPanel] Peer discovered:', peer);
      setDiscoveredPeers(prev => new Map(prev).set(peer.userId, peer));
      setP2PStatus(prev => ({ ...prev, peerCount: prev.peerCount + 1 }));

      // 연락처에 온라인 상태 업데이트
      if (contacts.find(c => c.userId === peer.userId)) {
        setContacts(updateContactStatus(contacts, peer.userId, true));
      }
    };

    // 피어 온라인
    const handlePeerOnline = (peer: PeerInfo) => {
      console.log('[MessagingPanel] Peer online:', peer);
      setDiscoveredPeers(prev => new Map(prev).set(peer.userId, { ...peer, isOnline: true }));
      setContacts(updateContactStatus(contacts, peer.userId, true));
    };

    // 피어 오프라인
    const handlePeerOffline = (peer: PeerInfo) => {
      console.log('[MessagingPanel] Peer offline:', peer);
      setDiscoveredPeers(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(peer.userId);
        if (existing) {
          newMap.set(peer.userId, { ...existing, isOnline: false });
        }
        return newMap;
      });
      setContacts(updateContactStatus(contacts, peer.userId, false));
    };

    // P2P 메시지 수신
    const handleP2PMessage = (message: any) => {
      console.log('[MessagingPanel] P2P message received:', message);
      const messageData = formatMessage(message, getContactName);
      addMessage(messageData);

      // 새 메시지 알림
      if (message.senderId !== user?.id) {
        addNotification({
          title: `새 메시지: ${messageData.senderName}`,
          message: messageData.content,
          type: 'info',
        });

        // 시스템 알림
        window.electronAPI?.showNotification?.({
          title: `새 메시지: ${messageData.senderName}`,
          body: messageData.content
        });
      }
    };

    // 타이핑 상태
    const handleTyping = (data: { userId: string; isTyping: boolean }) => {
      setIsTyping(prev => {
        const newMap = new Map(prev);
        newMap.set(data.userId, data.isTyping);
        return newMap;
      });

      // 3초 후 타이핑 상태 자동 해제
      if (data.isTyping) {
        setTimeout(() => {
          setIsTyping(prev => {
            const newMap = new Map(prev);
            newMap.set(data.userId, false);
            return newMap;
          });
        }, 3000);
      }
    };

    // 읽음 확인
    const handleReadReceipt = (data: { messageId: string }) => {
      markAsRead(data.messageId);
    };

    // 전달 확인
    const handleDeliveryReceipt = (data: { messageId: string }) => {
      markAsDelivered(data.messageId);
    };

    // 파일 전송 제안 수신
    const handleFileOffer = (transfer: any) => {
      console.log('[MessagingPanel] File offer received:', transfer);
      setIncomingFileOffer(transfer);
      setShowFileTransferDialog(true);

      addNotification({
        title: '파일 전송 요청',
        message: `${transfer.senderName}님이 ${transfer.fileName} 파일을 보내려고 합니다.`,
        type: 'info',
      });
    };

    // 파일 전송 진행
    const handleFileProgress = (data: { transferId: string; progress: number }) => {
      setPendingFileTransfers(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(data.transferId);
        if (existing) {
          newMap.set(data.transferId, { ...existing, progress: data.progress });
        }
        return newMap;
      });
    };

    // 파일 전송 완료
    const handleFileComplete = (transfer: any) => {
      console.log('[MessagingPanel] File transfer complete:', transfer);
      setPendingFileTransfers(prev => {
        const newMap = new Map(prev);
        newMap.delete(transfer.transferId);
        return newMap;
      });

      // 파일 메시지로 추가
      const fileMessage = {
        id: `file-${transfer.transferId}`,
        messageId: `file-${transfer.transferId}`,
        senderId: transfer.senderId,
        senderName: transfer.senderName || getContactName(transfer.senderId),
        recipientId: transfer.receiverId,
        content: `파일: ${transfer.fileName} (${formatFileSize(transfer.fileSize)})`,
        type: 'file' as const,
        timestamp: new Date().toISOString(),
        isRead: false,
        delivered: true,
        deliveredAt: new Date().toISOString(),
        fileInfo: {
          fileName: transfer.fileName,
          fileSize: transfer.fileSize,
          filePath: transfer.savedPath
        }
      };
      addMessage(fileMessage);

      addNotification({
        title: '파일 전송 완료',
        message: `${transfer.fileName} 파일이 성공적으로 전송되었습니다.`,
        type: 'success',
      });
    };

    // 이벤트 리스너 등록
    window.electronAPI?.onInternalPeerDiscovered?.(handlePeerDiscovered);
    window.electronAPI?.onInternalPeerOnline?.(handlePeerOnline);
    window.electronAPI?.onInternalPeerOffline?.(handlePeerOffline);
    window.electronAPI?.onMessageReceived?.(handleP2PMessage);
    window.electronAPI?.onInternalTyping?.(handleTyping);
    window.electronAPI?.onReadReceipt?.(handleReadReceipt);
    window.electronAPI?.onDeliveryReceipt?.(handleDeliveryReceipt);
    window.electronAPI?.onInternalFileOffer?.(handleFileOffer);
    window.electronAPI?.onInternalFileProgress?.(handleFileProgress);
    window.electronAPI?.onInternalFileComplete?.(handleFileComplete);

    return () => {
      window.electronAPI?.removeInternalP2PListeners?.();
      window.electronAPI?.removeMessageListener?.();
      window.electronAPI?.removeReceiptListeners?.();
    };
  }, [addMessage, addNotification, markAsRead, markAsDelivered, user?.id, contacts, setContacts]);

  // 파일 크기 포맷팅
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Load messages when contact is selected
  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.userId);
    }
  }, [selectedContact]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Note: Message listeners are now handled in the P2P event listeners useEffect above

  const loadContacts = async () => {
    try {
      setLoading(true);

      // 로컬 모드에서는 AddressBookService 사용
      if (isLocalMode()) {
        const entries = await addressBookService.getAllEntries();
        const contactList = entries.map(mapEntryToContact);
        setContacts(contactList);
        console.log(`[MessagingPanel] 로컬 모드: ${contactList.length}명 연락처 로드`);
        return;
      }

      // 원격 모드
      if (!token) {
        console.warn('No token available for loading contacts');
        // 토큰이 없어도 로컬 캐시 시도
        const entries = await addressBookService.getAllEntries();
        const contactList = entries.map(mapEntryToContact);
        setContacts(contactList);
        return;
      }

      const addressBook = await window.electronAPI?.getAddressBook?.(token) || [];
      const contactList = Array.isArray(addressBook) ? addressBook.map(mapEntryToContact) : [];
      setContacts(contactList);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (otherUserId: string) => {
    try {
      if (!user?.id) return;
      setLoading(true);

      // 1. P2P 내부 메시지 로드 시도 (로컬 DB에서)
      try {
        const internalResult = await window.electronAPI?.getInternalMessages?.({
          userId: user.id,
          otherUserId: otherUserId,
          limit: 100
        });

        if (internalResult?.success && internalResult.messages?.length > 0) {
          const formattedMessages = internalResult.messages.map((msg: any) => ({
            id: msg.id,
            messageId: msg.messageId || msg.id,
            senderId: msg.senderId,
            senderName: msg.senderId === user.id ? (user.name || '나') : getContactName(msg.senderId),
            recipientId: msg.receiverId,
            content: msg.content,
            type: msg.type || 'text',
            timestamp: msg.timestamp,
            isRead: msg.isRead,
            readAt: msg.readAt,
            delivered: msg.delivered,
            deliveredAt: msg.deliveredAt
          }));

          setMessages(formattedMessages);
          console.log(`[MessagingPanel] P2P 메시지 로드: ${formattedMessages.length}개`);
          return;
        }
      } catch (p2pError) {
        console.warn('[MessagingPanel] P2P 메시지 로드 실패, 대체 방법 시도:', p2pError);
      }

      // 2. 로컬 모드에서는 페이크 메시지 생성
      if (isLocalMode()) {
        const contact = contacts.find(c => c.userId === otherUserId);
        const fakeMessages = generateFakeMessages(
          user.id,
          user.name || '나',
          otherUserId,
          Math.floor(Math.random() * 10) + 5 // 5-14개 랜덤 메시지
        );

        const formattedMessages = fakeMessages.map((msg) => ({
          id: msg.id,
          messageId: msg.id,
          senderId: msg.senderId,
          senderName: msg.senderId === user.id ? (user.name || '나') : (contact?.name || msg.senderName),
          recipientId: msg.recipientId,
          content: msg.content,
          type: msg.type,
          timestamp: msg.timestamp,
          isRead: msg.isRead,
          readAt: msg.isRead ? msg.timestamp : undefined,
          delivered: msg.delivered,
          deliveredAt: msg.delivered ? msg.timestamp : undefined
        }));

        setMessages(formattedMessages);
        console.log(`[MessagingPanel] 로컬 모드: ${formattedMessages.length}개 메시지 생성`);
        return;
      }

      // 3. 원격 모드 폴백
      const result = await window.electronAPI?.getOfflineMessages?.(user.id, otherUserId);
      if (result?.success && result.messages) {
        const formattedMessages = result.messages.map((msg: any) => ({
          id: msg.id,
          messageId: msg.messageId,
          senderId: msg.senderId,
          senderName: getContactName(msg.senderId),
          recipientId: msg.receiverId,
          content: msg.content,
          type: msg.messageType,
          timestamp: msg.timestamp,
          isRead: msg.isRead,
          readAt: msg.readAt,
          delivered: msg.delivered,
          deliveredAt: msg.deliveredAt
        }));
        setMessages(formattedMessages);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const getContactName = (userId: string): string => {
    const contact = contacts.find(c => c.userId === userId);
    return contact?.name || '알 수 없음';
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedContact || !user) {
      return;
    }

    if (!messageContent.trim() && attachedFiles.length === 0) {
      return;
    }

    setIsSending(true);

    try {
      if (attachedFiles.length > 0) {
        await sendFilesWithMessage(messageContent);
        return;
      }

      const now = new Date().toISOString();
      const tempMessageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // 낙관적 UI 업데이트: 먼저 메시지를 화면에 추가
      const optimisticMessage = {
        id: tempMessageId,
        messageId: tempMessageId,
        senderId: user.id,
        senderName: user.name || '나',
        recipientId: selectedContact.userId,
        content: messageContent,
        type: 'text' as const,
        timestamp: now,
        isRead: false,
        readAt: undefined,
        delivered: false,  // 아직 전달 안됨
        deliveredAt: undefined
      };

      addMessage(optimisticMessage);
      const sentContent = messageContent;
      setMessageContent('');

      // 1. P2P 내부 네트워크로 전송 시도
      if (p2pStatus.isRunning) {
        try {
          const p2pResult = await window.electronAPI?.sendInternalMessage?.({
            receiverId: selectedContact.userId,
            content: sentContent,
            type: 'text',
            messageId: tempMessageId
          });

          if (p2pResult?.success) {
            console.log('[MessagingPanel] P2P 메시지 전송 성공:', p2pResult.messageId);
            // 메시지 ID 업데이트 및 전달 상태 업데이트는 이벤트로 처리됨
            return;
          } else {
            console.warn('[MessagingPanel] P2P 전송 실패, 대체 방법 시도:', p2pResult?.error);
          }
        } catch (p2pError) {
          console.warn('[MessagingPanel] P2P 전송 오류:', p2pError);
        }
      }

      // 2. 로컬 모드 시뮬레이션
      if (isLocalMode()) {
        // 로컬 모드: 1-3초 후 자동 응답 시뮬레이션
        const contact = contacts.find(c => c.userId === selectedContact.userId);
        setTimeout(() => {
          const autoReply = {
            id: `local-reply-${Date.now()}`,
            messageId: `local-reply-${Date.now()}`,
            senderId: selectedContact.userId,
            senderName: contact?.name || selectedContact.name,
            recipientId: user.id,
            content: getRandomAutoReply(),
            type: 'text' as const,
            timestamp: new Date().toISOString(),
            isRead: false,
            readAt: undefined,
            delivered: true,
            deliveredAt: new Date().toISOString()
          };
          addMessage(autoReply);
          addNotification({
            title: `새 메시지: ${autoReply.senderName}`,
            message: autoReply.content,
            type: 'info',
          });
        }, 1000 + Math.random() * 2000);

        console.log('[MessagingPanel] 로컬 모드: 메시지 전송 시뮬레이션');
        return;
      }

      // 3. 원격 서버를 통한 전송 (폴백)
      const result = await window.electronAPI?.sendMessage?.({
        recipientId: selectedContact.userId,
        content: sentContent,
        type: 'text',
      });

      if (result?.success) {
        console.log('[MessagingPanel] 원격 서버 메시지 전송 성공');
      } else {
        console.error('[MessagingPanel] 메시지 전송 실패:', result?.error);
        addNotification({
          title: '메시지 전송 실패',
          message: result?.error || '알 수 없는 오류',
          type: 'error',
        });
      }
    } catch (error: any) {
      console.error('[MessagingPanel] 메시지 전송 중 오류:', error);
      addNotification({
        title: '메시지 전송 오류',
        message: error.message,
        type: 'error',
      });
    } finally {
      setIsSending(false);
    }
  };

  // 타이핑 상태 전송
  const handleTypingChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setMessageContent(newValue);

    // 타이핑 상태 전송
    if (selectedContact && p2pStatus.isRunning) {
      // 이전 타이머 취소
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // 타이핑 중 상태 전송
      window.electronAPI?.sendInternalTyping?.({
        receiverId: selectedContact.userId,
        isTyping: newValue.length > 0
      });

      // 2초 후 타이핑 중지 상태 전송
      typingTimeoutRef.current = setTimeout(() => {
        window.electronAPI?.sendInternalTyping?.({
          receiverId: selectedContact.userId,
          isTyping: false
        });
      }, 2000);
    }
  }, [selectedContact, p2pStatus.isRunning]);

  const filteredMessages = selectedContact
    ? messages.filter(msg =>
        (msg.senderId === user?.id && msg.recipientId === selectedContact.userId) ||
        (msg.senderId === selectedContact.userId && msg.recipientId === user?.id)
      )
    : [];

  // 파일 선택 핸들러
  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  // 파일 선택 시 첨부 목록에 추가
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !selectedContact) return;

    // 새로운 파일들을 첨부 목록에 추가
    const newFiles = Array.from(files);
    setAttachedFiles(prev => [...prev, ...newFiles]);

    console.log('[MessagingPanel] Files attached:', newFiles.map(f => f.name));

    // 입력 초기화 (같은 파일 다시 선택 가능하도록)
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 첨부 파일 제거
  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 파일 아이콘 가져오기
  const getFileIcon = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const icons: Record<string, string> = {
      pdf: '📄',
      doc: '📝',
      docx: '📝',
      xls: '📊',
      xlsx: '📊',
      ppt: '📽️',
      pptx: '📽️',
      txt: '📃',
      jpg: '🖼️',
      jpeg: '🖼️',
      png: '🖼️',
      gif: '🖼️',
      bmp: '🖼️',
      svg: '🖼️',
      mp3: '🎵',
      wav: '🎵',
      mp4: '🎬',
      avi: '🎬',
      mov: '🎬',
      zip: '📦',
      rar: '📦',
      '7z': '📦',
      html: '🌐',
      css: '🎨',
      js: '⚡',
      ts: '⚡',
      json: '📋'
    };
    return icons[ext || ''] || '📎';
  };

  // 첨부 파일과 함께 메시지 전송
  const sendFilesWithMessage = async (messageText: string) => {
    if (!selectedContact || !user) return;

    setIsUploadingFiles(true);

    try {
      // 1. 먼저 텍스트 메시지 전송 (있는 경우)
      if (messageText.trim()) {
        const now = new Date().toISOString();
        const tempMessageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const textMessage = {
          id: tempMessageId,
          messageId: tempMessageId,
          senderId: user.id,
          senderName: user.name || '나',
          recipientId: selectedContact.userId,
          content: messageText,
          type: 'text' as const,
          timestamp: now,
          isRead: false,
          readAt: undefined,
          delivered: false,
          deliveredAt: undefined
        };

        addMessage(textMessage);

        // P2P로 메시지 전송
        if (p2pStatus.isRunning) {
          await window.electronAPI?.sendInternalMessage?.({
            receiverId: selectedContact.userId,
            content: messageText,
            type: 'text'
          });
        }
      }

      // 2. 각 파일 전송
      for (const file of attachedFiles) {
        const filePath = (file as any).path || file.name;

        console.log('[MessagingPanel] Sending file with message:', file.name, file.size);

        // P2P가 실행 중이면 P2P로 전송
        if (p2pStatus.isRunning) {
          const result = await window.electronAPI?.offerInternalFile?.({
            receiverId: selectedContact.userId,
            fileName: file.name,
            fileSize: file.size,
            filePath: filePath
          });

          if (result?.success) {
            setPendingFileTransfers(prev => {
              const newMap = new Map(prev);
              newMap.set(result.transfer.transferId, {
                ...result.transfer,
                progress: 0
              });
              return newMap;
            });

            // 파일 메시지를 화면에 표시
            const fileMessage = {
              id: `file-sending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              messageId: result.transfer.transferId,
              senderId: user.id,
              senderName: user.name || '나',
              recipientId: selectedContact.userId,
              content: `📎 ${file.name}`,
              type: 'file' as const,
              timestamp: new Date().toISOString(),
              isRead: false,
              delivered: false,
              fileInfo: {
                fileName: file.name,
                fileSize: file.size,
                status: 'sending'
              }
            };
            addMessage(fileMessage);
          }
        } else {
          // P2P가 없으면 로컬 저장 (추후 동기화)
          addNotification({
            title: '파일 대기 중',
            message: `${file.name} - P2P 연결 시 전송됩니다.`,
            type: 'warning',
          });
        }
      }

      // 3. 첨부 파일 및 메시지 초기화
      setAttachedFiles([]);
      setMessageContent('');

      addNotification({
        title: '전송 완료',
        message: attachedFiles.length > 0
          ? `메시지와 ${attachedFiles.length}개 파일이 전송되었습니다.`
          : '메시지가 전송되었습니다.',
        type: 'success',
      });

    } catch (error: any) {
      console.error('[MessagingPanel] Send with files error:', error);
      addNotification({
        title: '전송 오류',
        message: error.message,
        type: 'error',
      });
    } finally {
      setIsUploadingFiles(false);
    }
  };

  // 파일 전송 수락
  const handleAcceptFile = async () => {
    if (!incomingFileOffer) return;

    try {
      const result = await window.electronAPI?.acceptInternalFile?.(incomingFileOffer.transferId);

      if (result?.success) {
        // 대기 중인 전송에 추가
        setPendingFileTransfers(prev => {
          const newMap = new Map(prev);
          newMap.set(incomingFileOffer.transferId, {
            ...incomingFileOffer,
            progress: 0
          });
          return newMap;
        });
      }
    } catch (error: any) {
      console.error('[MessagingPanel] Accept file error:', error);
      addNotification({
        title: '파일 수신 오류',
        message: error.message,
        type: 'error',
      });
    }

    setShowFileTransferDialog(false);
    setIncomingFileOffer(null);
  };

  // 파일 전송 거절
  const handleRejectFile = async () => {
    if (!incomingFileOffer) return;

    try {
      await window.electronAPI?.rejectInternalFile?.(incomingFileOffer.transferId);
    } catch (error: any) {
      console.error('[MessagingPanel] Reject file error:', error);
    }

    setShowFileTransferDialog(false);
    setIncomingFileOffer(null);
  };

  return (
    <div className="h-full flex bg-white">
      {/* Contacts List */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">연락처</h3>
              <p className="text-sm text-gray-500">총 {contacts.length}명</p>
            </div>
            {/* P2P 상태 표시 */}
            <div className="flex items-center space-x-1">
              <div className={`w-2 h-2 rounded-full ${p2pStatus.isRunning ? 'bg-green-400 animate-pulse' : 'bg-gray-300'}`} />
              <span className="text-xs text-gray-500">
                {p2pStatus.isRunning ? `P2P (${p2pStatus.peerCount})` : 'P2P 대기'}
              </span>
            </div>
          </div>
          {p2pStatus.isRunning && p2pStatus.ipAddress && (
            <p className="text-xs text-gray-400 mt-1">IP: {p2pStatus.ipAddress}</p>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">
              <p>연락처를 불러오는 중...</p>
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <p className="text-sm">연락처가 없습니다.</p>
              <p className="text-xs mt-2">네트워크 디스커버리를 실행하여 다른 사용자를 찾으세요.</p>
            </div>
          ) : (
            contacts.map((contact: any) => (
              <div
                key={contact.userId}
                onClick={() => selectContact(contact)}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                  selectedContact?.userId === contact.userId ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{contact.name}</p>
                    <p className="text-sm text-gray-600">
                      {contact.jobTitle || contact.role}
                    </p>
                    {contact.workplace && (
                      <p className="text-xs text-gray-400 truncate">{contact.workplace}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end space-y-1 ml-2">
                    <div className="flex items-center space-x-1">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          contact.isOnline ? 'bg-green-400' : 'bg-gray-300'
                        }`}
                      />
                      <span className="text-xs text-gray-500">
                        {contact.isOnline ? '온라인' : '오프라인'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages Header */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-800">
            {selectedContact ? `${selectedContact.name}님과의 대화` : '대화 상대를 선택하세요'}
          </h3>
          {selectedContact && (
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                discoveredPeers.get(selectedContact.userId)?.isOnline || selectedContact.isOnline
                  ? 'bg-green-400'
                  : 'bg-gray-300'
              }`} />
              <p className="text-sm text-gray-500">
                {discoveredPeers.get(selectedContact.userId)?.isOnline || selectedContact.isOnline
                  ? '온라인'
                  : '오프라인'}
              </p>
              {/* 타이핑 인디케이터 */}
              {isTyping.get(selectedContact.userId) && (
                <span className="text-sm text-blue-500 italic animate-pulse">
                  입력 중...
                </span>
              )}
            </div>
          )}
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {selectedContact ? (
            filteredMessages.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <p>아직 메시지가 없습니다.</p>
                <p className="text-sm mt-2">첫 메시지를 보내보세요!</p>
              </div>
            ) : (
              filteredMessages.map((message) => (
                <div
                  key={message.messageId}
                  className={`flex ${message.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-md px-4 py-2 rounded-lg ${
                      message.senderId === user?.id
                        ? 'bg-gray-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    <p className="text-sm font-medium mb-1">{message.senderName}</p>
                    <p>{message.content}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs opacity-75">
                        {new Date(message.timestamp).toLocaleTimeString('ko-KR')}
                      </p>
                      {message.senderId === user?.id && (
                        <div className="flex items-center space-x-1 ml-2">
                          {message.delivered && (
                            <span className="text-xs opacity-75">✓</span>
                          )}
                          {message.isRead && (
                            <span className="text-xs opacity-75">✓</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            <div className="text-center text-gray-500 mt-8">
              <p>왼쪽에서 대화할 상대를 선택하세요.</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 파일 전송 진행 표시 */}
        {pendingFileTransfers.size > 0 && (
          <div className="px-4 py-2 bg-blue-50 border-t border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-2">파일 전송 중...</p>
            {Array.from(pendingFileTransfers.values()).map((transfer) => (
              <div key={transfer.transferId} className="flex items-center space-x-2 mb-1">
                <span className="text-xs text-blue-600 truncate flex-1">{transfer.fileName}</span>
                <div className="w-24 bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${transfer.progress || 0}%` }}
                  />
                </div>
                <span className="text-xs text-blue-600">{transfer.progress || 0}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Message Input */}
        {selectedContact && (
          <form onSubmit={handleSendMessage} className="border-t border-gray-200 bg-gray-50">
            {/* 숨겨진 파일 입력 - 다중 파일 선택 가능 */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              multiple
            />

            {/* 첨부 파일 미리보기 */}
            {attachedFiles.length > 0 && (
              <div className="px-4 pt-3 pb-2 border-b border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    첨부 파일 ({attachedFiles.length}개)
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachedFiles([])}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    전체 삭제
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {attachedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-3 py-2 max-w-xs"
                    >
                      <span className="text-lg">{getFileIcon(file.name)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachedFile(index)}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4">
              <div className="flex space-x-2">
                {/* 파일 첨부 버튼 */}
                <button
                  type="button"
                  onClick={handleFileSelect}
                  disabled={!p2pStatus.isRunning || !selectedContact || isUploadingFiles}
                  className="px-3 py-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative"
                  title={p2pStatus.isRunning ? '파일 첨부' : 'P2P 연결 필요'}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  {attachedFiles.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                      {attachedFiles.length}
                    </span>
                  )}
                </button>

                <input
                  type="text"
                  value={messageContent}
                  onChange={handleTypingChange}
                  placeholder={attachedFiles.length > 0 ? "메시지를 추가하거나 바로 전송..." : "메시지를 입력하세요..."}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isSending || isUploadingFiles}
                />
                <button
                  type="submit"
                  disabled={(isSending || isUploadingFiles) || (!messageContent.trim() && attachedFiles.length === 0)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                >
                  {(isSending || isUploadingFiles) ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>전송 중</span>
                    </>
                  ) : (
                    <span>전송</span>
                  )}
                </button>
              </div>

              {/* 상태 표시 */}
              <div className="flex items-center justify-between mt-1">
                {p2pStatus.isRunning ? (
                  <p className="text-xs text-green-600 flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-1"></span>
                    P2P 직접 전송 가능
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">P2P 연결 대기 중</p>
                )}
                {attachedFiles.length > 0 && (
                  <p className="text-xs text-blue-600">
                    {attachedFiles.length}개 파일, 총 {formatFileSize(attachedFiles.reduce((acc, f) => acc + f.size, 0))}
                  </p>
                )}
              </div>
            </div>
          </form>
        )}
      </div>

      {/* 파일 전송 수락/거절 다이얼로그 */}
      {showFileTransferDialog && incomingFileOffer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">파일 전송 요청</h3>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                <span className="font-medium">{incomingFileOffer.senderName}</span>님이 파일을 보내려고 합니다.
              </p>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="font-medium text-gray-800 truncate">{incomingFileOffer.fileName}</p>
                <p className="text-sm text-gray-500">{formatFileSize(incomingFileOffer.fileSize)}</p>
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={handleRejectFile}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                거절
              </button>
              <button
                onClick={handleAcceptFile}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                수락
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

