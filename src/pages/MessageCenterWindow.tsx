import { useMemo, useState, useEffect, useRef } from 'react';
import { useDownloadStore } from '../store/download';

type MessageTab = 'received' | 'sent' | 'scheduled-received' | 'scheduled-sent';
type ComposeMode = 'reply' | 'forward' | null;

interface FileAttachment {
  id: string;
  uploadId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  peerId?: string; // P2P 전송 시 발신자 피어 ID
  dataUrl?: string; // 이미지 캡처 시 base64 데이터 URL
  isImage?: boolean; // 이미지 파일 여부
}

interface MessageItem {
  id: string;
  tab: MessageTab;
  title: string;
  content: string;
  sender: string;
  recipient: string;
  createdAt: string;
  scheduledAt?: string;
  isRead: boolean;
  attachments?: FileAttachment[];
}

interface ContactOption {
  id: string;
  name: string;
  role: string;
  email: string;
}

const PAGE_SIZE = 10;

const tabLabels: Record<MessageTab, string> = {
  received: '받은 메시지',
  sent: '보낸 메시지',
  'scheduled-received': '예약 받은 메시지',
  'scheduled-sent': '예약 보낸 메시지',
};

const tabBadgeClasses: Record<MessageTab, string> = {
  received: 'bg-blue-50 text-blue-700',
  sent: 'bg-green-50 text-green-700',
  'scheduled-received': 'bg-purple-50 text-purple-700',
  'scheduled-sent': 'bg-orange-50 text-orange-700',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileIcon(mimeType: string): string {
  const normalizedType = mimeType.toLowerCase();
  // 폴더 타입 체크
  if (
    normalizedType === 'folder' ||
    normalizedType === 'application/x-directory' ||
    normalizedType === 'inode/directory' ||
    normalizedType === 'httpd/unix-directory' ||
    normalizedType === 'application/vnd.google-apps.folder'
  ) return '📁';
  if (normalizedType.startsWith('image/')) return '🖼️';
  if (normalizedType.includes('pdf')) return '📄';
  if (normalizedType.includes('spreadsheet') || normalizedType.includes('excel')) return '📊';
  if (normalizedType.includes('presentation') || normalizedType.includes('powerpoint')) return '📽️';
  if (normalizedType.includes('word') || normalizedType.includes('document')) return '📝';
  if (normalizedType.includes('hwp')) return '📃';
  if (normalizedType.startsWith('video/')) return '🎬';
  if (normalizedType.startsWith('audio/')) return '🎵';
  if (normalizedType.includes('zip') || normalizedType.includes('compressed')) return '📦';
  return '📎';
}

function isFolderAttachment(attachment: FileAttachment): boolean {
  const normalizedType = attachment.mimeType.toLowerCase();
  return (
    normalizedType === 'folder' ||
    normalizedType === 'application/x-directory' ||
    normalizedType === 'inode/directory' ||
    normalizedType === 'httpd/unix-directory' ||
    normalizedType === 'application/vnd.google-apps.folder' ||
    attachment.fileName.endsWith('/')
  );
}


export default function MessageCenterWindow() {
  const [activeTab, setActiveTab] = useState<MessageTab>('received');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMessage, setSelectedMessage] = useState<MessageItem | null>(null);
  const [downloadingFiles, setDownloadingFiles] = useState<Record<string, number>>({});
  const { downloadPath, selectDownloadFolder } = useDownloadStore();

  // 답장/전달 관련 상태
  const [composeMode, setComposeMode] = useState<ComposeMode>(null);
  const [composeRecipient, setComposeRecipient] = useState('');
  const [composeTitle, setComposeTitle] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [composeAttachments, setComposeAttachments] = useState<FileAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<ContactOption[]>([]);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const composeContentRef = useRef<HTMLTextAreaElement>(null);
  const [messages] = useState<MessageItem[]>([]);

  // 다운로드 설정 로드
  useEffect(() => {
    useDownloadStore.getState().loadSettings();
  }, []);

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const result = await window.electronAPI?.getAllAddressBookEntries?.();
        const entries = result?.success ? result.data : [];
        const mapped = entries.map((entry: any, index: number) => ({
          id: entry.userId || entry.id || `contact-${index}`,
          name: entry.name || entry.displayName || '알 수 없음',
          role: entry.role || 'UNKNOWN',
          email: entry.email || ''
        }));
        setContactOptions(mapped);
      } catch (error) {
        console.error('주소록 로드 실패:', error);
        setContactOptions([]);
      }
    };

    loadContacts();
  }, []);

  // 파일 다운로드 핸들러
  const handleDownload = async (attachment: FileAttachment) => {
    // 다운로드 폴더가 설정되지 않은 경우
    if (!downloadPath) {
      const selected = await selectDownloadFolder();
      if (!selected) {
        alert('다운로드 폴더를 선택해주세요.');
        return;
      }
    }

    // 다운로드 시작
    setDownloadingFiles((prev) => ({ ...prev, [attachment.id]: 0 }));

    try {
      // P2P 또는 Durable Stream을 통한 다운로드
      const result = await window.electronAPI?.downloadFile?.({
        uploadId: attachment.uploadId,
        fileName: attachment.fileName,
        peerId: attachment.peerId,
      });

      if (result?.success) {
        setDownloadingFiles((prev) => ({ ...prev, [attachment.id]: 100 }));
        // 잠시 후 완료 상태 제거
        setTimeout(() => {
          setDownloadingFiles((prev) => {
            const newState = { ...prev };
            delete newState[attachment.id];
            return newState;
          });
        }, 2000);
      } else {
        throw new Error(result?.error || '다운로드 실패');
      }
    } catch (error) {
      console.error('다운로드 오류:', error);
      alert(`파일 다운로드에 실패했습니다: ${attachment.fileName}`);
      setDownloadingFiles((prev) => {
        const newState = { ...prev };
        delete newState[attachment.id];
        return newState;
      });
    }
  };

  const handleDownloadAll = async (attachments: FileAttachment[]) => {
    if (!downloadPath) {
      const selected = await selectDownloadFolder();
      if (!selected) {
        alert('다운로드 폴더를 선택해주세요.');
        return;
      }
    }

    for (const attachment of attachments) {
      await handleDownload(attachment);
    }
  };

  // 답장 시작
  const handleReply = (message: MessageItem) => {
    setComposeMode('reply');
    setComposeRecipient(message.sender);
    setComposeTitle(`Re: ${message.title}`);
    setComposeContent(`\n\n--- 원본 메시지 ---\n발신: ${message.sender}\n일시: ${new Date(message.createdAt).toLocaleString('ko-KR')}\n\n${message.content}`);
    setComposeAttachments([]);
    setSelectedContacts([]);
    setTimeout(() => composeContentRef.current?.focus(), 100);
  };

  // 전달 시작
  const handleForward = (message: MessageItem) => {
    setComposeMode('forward');
    setComposeRecipient('');
    setComposeTitle(`Fwd: ${message.title}`);
    setComposeContent(`\n\n--- 전달된 메시지 ---\n발신: ${message.sender}\n수신: ${message.recipient}\n일시: ${new Date(message.createdAt).toLocaleString('ko-KR')}\n\n${message.content}`);
    // 첨부 파일도 함께 전달
    setComposeAttachments(message.attachments || []);
    setSelectedContacts([]);
    setShowContactPicker(true);
  };

  // 메시지 전송
  const handleSendMessage = async () => {
    if (composeMode === 'forward' && selectedContacts.length === 0) {
      alert('수신자를 선택해주세요.');
      return;
    }
    if (!composeContent.trim()) {
      alert('메시지 내용을 입력해주세요.');
      return;
    }

    setIsSending(true);
    try {
      const recipients = composeMode === 'reply'
        ? [composeRecipient]
        : selectedContacts.map(c => c.name);

      // P2P 메시지 전송
      for (const recipient of recipients) {
        await window.electronAPI?.sendMessage?.({
          recipient,
          title: composeTitle,
          content: composeContent,
          attachments: composeAttachments,
        });
      }

      alert(`메시지가 ${recipients.length > 1 ? `${recipients.length}명에게 ` : ''}전송되었습니다.`);
      handleCloseCompose();
    } catch (error) {
      console.error('메시지 전송 실패:', error);
      alert('메시지 전송에 실패했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  // 작성 닫기
  const handleCloseCompose = () => {
    setComposeMode(null);
    setComposeRecipient('');
    setComposeTitle('');
    setComposeContent('');
    setComposeAttachments([]);
    setSelectedContacts([]);
    setShowContactPicker(false);
    setContactSearch('');
  };

  // 연락처 선택/해제
  const toggleContact = (contact: ContactOption) => {
    setSelectedContacts(prev => {
      const exists = prev.find(c => c.id === contact.id);
      if (exists) {
        return prev.filter(c => c.id !== contact.id);
      }
      return [...prev, contact];
    });
  };

  // 필터링된 연락처
  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contactOptions;
    const query = contactSearch.toLowerCase();
    return contactOptions.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.role.toLowerCase().includes(query) ||
      c.email.toLowerCase().includes(query)
    );
  }, [contactSearch, contactOptions]);

  // 첨부 파일 제거
  const removeAttachment = (attachmentId: string) => {
    setComposeAttachments(prev => prev.filter(a => a.id !== attachmentId));
  };

  // 클립보드에서 이미지 붙여넣기
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          await addImageAttachment(file);
        }
        break;
      }
    }
  };

  // 이미지 파일을 첨부로 추가
  const addImageAttachment = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const timestamp = Date.now();
      const newAttachment: FileAttachment = {
        id: `img-${timestamp}`,
        uploadId: `upload-img-${timestamp}`,
        fileName: file.name || `캡처_${new Date().toLocaleString('ko-KR').replace(/[/:]/g, '-')}.png`,
        fileSize: file.size,
        mimeType: file.type,
        dataUrl,
        isImage: true,
      };
      setComposeAttachments(prev => [...prev, newAttachment]);
    };
    reader.readAsDataURL(file);
  };

  // 파일 선택으로 이미지 추가
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        await addImageAttachment(file);
      } else {
        // 일반 파일 첨부
        const timestamp = Date.now();
        const newAttachment: FileAttachment = {
          id: `file-${timestamp}-${i}`,
          uploadId: `upload-file-${timestamp}-${i}`,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          isImage: false,
        };
        setComposeAttachments(prev => [...prev, newAttachment]);
      }
    }
    // 입력 필드 초기화
    e.target.value = '';
  };

  // 이미지 미리보기 모달 상태
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 다운로드 진행 상태 이벤트 리스너
  useEffect(() => {
    const handleProgress = (data: { uploadId: string; progress: number }) => {
      // uploadId에서 attachment id 찾기
      setDownloadingFiles((prev) => {
        const newState = { ...prev };
        // 모든 다운로드 중인 파일에서 해당 uploadId 찾기
        Object.keys(newState).forEach((id) => {
          if (id.includes(data.uploadId)) {
            newState[id] = data.progress;
          }
        });
        return newState;
      });
    };

    window.electronAPI?.onDownloadProgress?.(handleProgress);

    return () => {
      window.electronAPI?.removeDownloadListeners?.();
    };
  }, []);

  const filteredMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return messages.filter((message) => {
      if (message.tab !== activeTab) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        message.title.toLowerCase().includes(query) ||
        message.content.toLowerCase().includes(query) ||
        message.sender.toLowerCase().includes(query) ||
        message.recipient.toLowerCase().includes(query)
      );
    });
  }, [messages, activeTab, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / PAGE_SIZE));
  const pageMessages = filteredMessages.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const unreadCounts = useMemo(() => {
    const counts: Record<MessageTab, number> = {
      received: 0,
      sent: 0,
      'scheduled-received': 0,
      'scheduled-sent': 0,
    };
    messages.forEach((msg) => {
      if (!msg.isRead) {
        counts[msg.tab]++;
      }
    });
    return counts;
  }, [messages]);

  const handleTabChange = (tab: MessageTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSelectedMessage(null);
  };

  // 검색어 변경 핸들러
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1); // 검색 시 첫 페이지로 이동
    setSelectedMessage(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderMessageDetail = (message: MessageItem) => {
    const attachments = message.attachments ?? [];
    const shouldShowDownloadAll =
      attachments.length >= 2 || attachments.some(isFolderAttachment);

    return (
      <div className="theme-surface-translucent border border-gray-200/50 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <span className={`px-2 py-1 text-xs rounded-full ${tabBadgeClasses[message.tab]}`}>
          {tabLabels[message.tab]}
        </span>
        <button
          onClick={() => setSelectedMessage(null)}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <h3 className="text-lg font-semibold theme-text mb-3">
        {message.title}
      </h3>

      <div className="space-y-2 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="theme-text-secondary w-14">발신:</span>
          <span className="theme-text">{message.sender}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="theme-text-secondary w-14">수신:</span>
          <span className="theme-text">{message.recipient}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="theme-text-secondary w-14">일시:</span>
          <span className="theme-text">
            {new Date(message.createdAt).toLocaleString('ko-KR')}
          </span>
        </div>
        {message.scheduledAt && (
          <div className="flex items-center gap-2">
            <span className="theme-text-secondary w-14">예약:</span>
            <span className="text-orange-600">
              {new Date(message.scheduledAt).toLocaleString('ko-KR')}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <p className="theme-text text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
      </div>

      {message.attachments && message.attachments.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h4 className="text-sm font-medium theme-text flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              첨부 파일 ({message.attachments.length})
            </h4>
            {shouldShowDownloadAll && (
              <button
                type="button"
                onClick={() => handleDownloadAll(attachments)}
                className="px-3 py-1.5 text-xs rounded-lg border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                전체 다운로드
              </button>
            )}
          </div>
          <div className="space-y-2">
            {message.attachments.map((attachment) => {
              const isDownloading = downloadingFiles[attachment.id] !== undefined;
              const progress = downloadingFiles[attachment.id] || 0;

              return (
                <div
                  key={attachment.id}
                  className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <span className="text-xl flex-shrink-0">
                    {getFileIcon(attachment.mimeType)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium theme-text truncate">
                      {attachment.fileName}
                    </p>
                    <p className="text-xs theme-text-secondary">
                      {formatFileSize(attachment.fileSize)}
                    </p>
                    {isDownloading && (
                      <div className="mt-1">
                        <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload(attachment)}
                    disabled={isDownloading}
                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                      isDownloading
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : progress === 100
                        ? 'bg-green-100 text-green-600'
                        : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                    }`}
                    title={isDownloading ? '다운로드 중...' : progress === 100 ? '완료' : '다운로드'}
                  >
                    {isDownloading && progress < 100 ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : progress === 100 ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-6">
        <button
          onClick={() => handleReply(message)}
          className="flex-1 px-4 py-2 text-sm theme-primary-bg text-white rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          답장
        </button>
        <button
          onClick={() => handleForward(message)}
          className="flex-1 px-4 py-2 text-sm border border-gray-300/50 rounded-lg theme-surface-translucent theme-text hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          전달
        </button>
        <button className="px-4 py-2 text-sm border border-red-300/50 text-red-600 rounded-lg hover:bg-red-100/50 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen theme-text">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold theme-text">메시지함</h2>
            <p className="text-sm theme-text-secondary">
              받은 메시지, 보낸 메시지, 예약 메시지를 한 곳에서 관리합니다.
            </p>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-gray-200/50 pb-4">
          {(['received', 'sent', 'scheduled-received', 'scheduled-sent'] as MessageTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`relative px-4 py-2 text-sm rounded-lg transition-colors ${
                activeTab === tab
                  ? 'theme-primary-bg text-white'
                  : 'theme-surface-translucent theme-text border border-gray-200/50 hover:bg-white/20'
              }`}
            >
              {tabLabels[tab]}
              {unreadCounts[tab] > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadCounts[tab]}
                </span>
              )}
            </button>
          ))}

          {/* 검색 */}
          <div className="ml-auto flex-1 min-w-[240px] max-w-md">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="제목, 내용, 발신/수신자 검색"
                value={searchQuery}
                onChange={(event) => handleSearchChange(event.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300/50 rounded-lg theme-surface-translucent theme-text text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm theme-text-secondary">
              총 {filteredMessages.length}건
            </span>
          </div>

          <div className="space-y-2">
            {pageMessages.length === 0 ? (
              <div className="theme-surface-translucent rounded-lg border border-gray-200/50 p-10 text-center theme-text-secondary">
                {searchQuery ? '검색 결과가 없습니다.' : '메시지가 없습니다.'}
              </div>
            ) : (
              pageMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 transition-all duration-300 ${
                    selectedMessage?.id === message.id ? 'items-start' : ''
                  }`}
                >
                  {/* 메시지 카드 */}
                  <div
                    onClick={() => setSelectedMessage(selectedMessage?.id === message.id ? null : message)}
                    className={`theme-surface-translucent border rounded-lg px-4 py-3 cursor-pointer transition-all ${
                      selectedMessage?.id === message.id
                        ? 'border-blue-500 ring-1 ring-blue-500 w-1/3 flex-shrink-0'
                        : 'border-gray-200/50 hover:border-gray-300 hover:shadow-sm flex-1'
                    } ${!message.isRead ? 'bg-blue-50/30' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 읽음 표시 */}
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${message.isRead ? 'bg-gray-300' : 'bg-blue-500'}`} />

                      <div className="flex-1 min-w-0">
                        <div className={`flex items-center justify-between mb-1 ${selectedMessage?.id === message.id ? 'flex-col items-start gap-1' : ''}`}>
                          <h3 className={`font-medium theme-text truncate ${!message.isRead ? 'font-semibold' : ''} ${selectedMessage?.id === message.id ? 'text-sm' : ''}`}>
                            {message.title}
                          </h3>
                          <span className={`text-xs theme-text-secondary flex-shrink-0 ${selectedMessage?.id === message.id ? '' : 'ml-2'}`}>
                            {formatDate(message.createdAt)}
                          </span>
                        </div>
                        {/* 선택된 카드가 아닐 때만 내용 미리보기 표시 */}
                        {selectedMessage?.id !== message.id && (
                          <p className="text-sm theme-text-secondary truncate mb-1">
                            {message.content}
                          </p>
                        )}
                        <div className={`flex items-center gap-2 text-xs theme-text-secondary ${selectedMessage?.id === message.id ? 'flex-wrap' : ''}`}>
                          <span className={`px-2 py-0.5 rounded-full ${tabBadgeClasses[message.tab]} ${selectedMessage?.id === message.id ? 'text-xs' : ''}`}>
                            {activeTab.includes('sent') ? message.recipient : message.sender}
                          </span>
                          {message.attachments && message.attachments.length > 0 && (
                            <span className="flex items-center gap-1 text-gray-500">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              {message.attachments.length}
                            </span>
                          )}
                          {selectedMessage?.id !== message.id && message.scheduledAt && (
                            <span className="text-orange-600">
                              예약: {new Date(message.scheduledAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 선택된 메시지의 상세 보기 (같은 행에 표시) */}
                  {selectedMessage?.id === message.id && (
                    <div className="flex-1 min-w-0">
                      {renderMessageDetail(message)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center mt-4 gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm border border-gray-300/50 rounded-lg theme-surface-translucent theme-text disabled:opacity-50 hover:bg-white/20"
              >
                이전
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-8 h-8 text-sm rounded-lg ${
                      currentPage === page
                        ? 'theme-primary-bg text-white'
                        : 'theme-surface-translucent theme-text hover:bg-white/20'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300/50 rounded-lg theme-surface-translucent theme-text disabled:opacity-50 hover:bg-white/20"
              >
                다음
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 답장/전달 모달 */}
      {composeMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="theme-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold theme-text flex items-center gap-2">
                {composeMode === 'reply' ? (
                  <>
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    답장
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    전달
                  </>
                )}
              </h3>
              <button
                onClick={handleCloseCompose}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* 수신자 */}
              <div>
                <label className="block text-sm font-medium theme-text mb-2">수신자</label>
                {composeMode === 'reply' ? (
                  <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm theme-text">
                    {composeRecipient}
                  </div>
                ) : (
                  <div>
                    {/* 선택된 연락처 표시 */}
                    {selectedContacts.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {selectedContacts.map(contact => (
                          <span
                            key={contact.id}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                          >
                            {contact.name}
                            <button
                              onClick={() => toggleContact(contact)}
                              className="hover:text-blue-900"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 연락처 검색 */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="이름, 역할, 이메일로 검색..."
                        value={contactSearch}
                        onChange={(e) => setContactSearch(e.target.value)}
                        onFocus={() => setShowContactPicker(true)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg theme-surface theme-text text-sm"
                      />

                      {/* 연락처 드롭다운 */}
                      {showContactPicker && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                          {filteredContacts.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500">검색 결과가 없습니다</div>
                          ) : (
                            filteredContacts.map(contact => {
                              const isSelected = selectedContacts.some(c => c.id === contact.id);
                              return (
                                <button
                                  key={contact.id}
                                  onClick={() => toggleContact(contact)}
                                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                                    isSelected ? 'bg-blue-50' : ''
                                  }`}
                                >
                                  <div>
                                    <span className="font-medium">{contact.name}</span>
                                    <span className="text-gray-500 ml-2">({contact.role})</span>
                                  </div>
                                  {isSelected && (
                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 제목 */}
              <div>
                <label className="block text-sm font-medium theme-text mb-2">제목</label>
                <input
                  type="text"
                  value={composeTitle}
                  onChange={(e) => setComposeTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg theme-surface theme-text text-sm"
                />
              </div>

              {/* 내용 */}
              <div>
                <label className="block text-sm font-medium theme-text mb-2">내용</label>
                <textarea
                  ref={composeContentRef}
                  value={composeContent}
                  onChange={(e) => setComposeContent(e.target.value)}
                  onPaste={handlePaste}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg theme-surface theme-text text-sm resize-none"
                  placeholder="메시지를 입력하세요... (Ctrl+V로 이미지 붙여넣기 가능)"
                />
                {/* 파일 첨부 버튼 */}
                <div className="flex items-center gap-2 mt-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors theme-text">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    파일 첨부
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.zip"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors theme-text">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    이미지 첨부
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                  <span className="text-xs theme-text-secondary">
                    또는 Ctrl+V로 캡처 이미지 붙여넣기
                  </span>
                </div>
              </div>

              {/* 첨부 파일 목록 */}
              {composeAttachments.length > 0 && (
                <div>
                  <label className="block text-sm font-medium theme-text mb-2">
                    첨부 파일 ({composeAttachments.length})
                  </label>
                  <div className="space-y-2">
                    {composeAttachments.map(attachment => (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        {/* 이미지 미리보기 또는 아이콘 */}
                        {attachment.isImage && attachment.dataUrl ? (
                          <img
                            src={attachment.dataUrl}
                            alt={attachment.fileName}
                            className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80"
                            onClick={() => setPreviewImage(attachment.dataUrl!)}
                          />
                        ) : (
                          <span className="text-lg">{getFileIcon(attachment.mimeType)}</span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium theme-text truncate">{attachment.fileName}</p>
                          <p className="text-xs theme-text-secondary">{formatFileSize(attachment.fileSize)}</p>
                        </div>
                        {/* 이미지 미리보기 버튼 */}
                        {attachment.isImage && attachment.dataUrl && (
                          <button
                            onClick={() => setPreviewImage(attachment.dataUrl!)}
                            className="p-1 text-gray-400 hover:text-blue-500"
                            title="미리보기"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => removeAttachment(attachment.id)}
                          className="p-1 text-gray-400 hover:text-red-500"
                          title="첨부 파일 제거"
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
            </div>

            {/* 모달 푸터 */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button
                onClick={handleCloseCompose}
                disabled={isSending}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg theme-text hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleSendMessage}
                disabled={isSending || (composeMode === 'forward' && selectedContacts.length === 0)}
                className="px-4 py-2 text-sm theme-primary-bg text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              >
                {isSending ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    전송 중...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    보내기
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 미리보기 모달 */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={previewImage}
              alt="미리보기"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}


