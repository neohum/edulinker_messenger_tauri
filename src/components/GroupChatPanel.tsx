import { useEffect, useState, useRef, useCallback } from 'react';
import { useGroupStore, createGroup, createGroupMessage } from '../store/groups';
import { useAuthStore } from '../store/auth';
import { useMessagingStore } from '../store/messaging';
import { useNotificationStore } from '../store/notifications';
import { isLocalMode } from '../services/appConfig';
import { addressBookService } from '../services/addressBook';
import type { ChatGroup, GroupMessage, Contact } from '../types/messaging';

function mapEntryToContact(entry: any): Contact {
  return {
    userId: entry.userId,
    name: entry.name,
    email: entry.email || '',
    role: entry.role,
    schoolId: entry.schoolId,
    isOnline: entry.isOnline ?? false,
    lastSeen: entry.lastSeen,
    jobTitle: entry.jobTitle,
    workplace: entry.workplace
  };
}

export default function GroupChatPanel() {
  const { user, token } = useAuthStore();
  const { contacts, setContacts } = useMessagingStore();
  const { addNotification } = useNotificationStore();
  const {
    groups,
    selectedGroup,
    groupMessages,
    addGroup,
    selectGroup,
    addGroupMessage,
    setGroupMessages,
    markGroupMessageAsRead,
    markGroupMessageAsDelivered,
    updateMemberOnlineStatus
  } = useGroupStore();

  const [messageContent, setMessageContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState<Map<string, { userId: string; userName: string }>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 연락처 로드
  useEffect(() => {
    const loadContacts = async () => {
      try {
        // 이미 연락처가 로드되어 있으면 스킵
        if (contacts.length > 0) {
          return;
        }

        // 로컬 모드에서는 AddressBookService 사용
        if (isLocalMode()) {
          const entries = await addressBookService.getAllEntries();
          const contactList = entries.map(mapEntryToContact);
          setContacts(contactList);
          console.log(`[GroupChatPanel] 로컬 모드: ${contactList.length}명 연락처 로드`);
          return;
        }

        // 원격 모드
        if (!token) {
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
        console.error('[GroupChatPanel] Failed to load contacts:', error);
      }
    };

    loadContacts();
  }, [token, contacts.length, setContacts]);

  // 그룹 이벤트 리스너 설정
  useEffect(() => {
    // 그룹 메시지 수신
    const handleGroupMessage = (message: any) => {
      console.log('[GroupChatPanel] Group message received:', message);

      const groupMessage: GroupMessage = {
        id: message.id,
        messageId: message.messageId,
        senderId: message.senderId,
        senderName: message.senderName,
        recipientId: message.groupId,
        content: message.content,
        type: message.type || 'text',
        timestamp: message.timestamp,
        isRead: false,
        delivered: true,
        deliveredAt: message.deliveredAt,
        groupId: message.groupId,
        groupName: message.groupName,
        readBy: message.readBy || [message.senderId],
        deliveredTo: message.deliveredTo || [user?.id || '', message.senderId]
      };

      addGroupMessage(message.groupId, groupMessage);

      // 알림
      if (message.senderId !== user?.id) {
        addNotification({
          title: `${message.groupName}`,
          message: `${message.senderName}: ${message.content}`,
          type: 'info',
        });
      }
    };

    // 그룹 생성 알림 수신
    const handleGroupCreated = (data: any) => {
      console.log('[GroupChatPanel] Group created:', data);

      const newGroup: ChatGroup = {
        id: data.groupId,
        name: data.groupName,
        description: data.description,
        createdBy: data.createdBy,
        createdAt: data.timestamp,
        members: data.memberIds.map((id: string) => ({
          userId: id,
          userName: id === data.createdBy ? data.createdByName : id,
          role: id === data.createdBy ? 'admin' : 'member',
          joinedAt: data.timestamp
        })),
        unreadCount: 0,
        isActive: true
      };

      addGroup(newGroup);

      addNotification({
        title: '새 그룹 채팅',
        message: `${data.createdByName}님이 "${data.groupName}" 그룹에 초대했습니다.`,
        type: 'info',
      });
    };

    // 그룹 타이핑 상태
    const handleGroupTyping = (data: any) => {
      if (data.groupId === selectedGroup?.id && data.userId !== user?.id) {
        setIsTyping(prev => {
          const newMap = new Map(prev);
          if (data.isTyping) {
            newMap.set(data.userId, { userId: data.userId, userName: data.userName });
          } else {
            newMap.delete(data.userId);
          }
          return newMap;
        });

        // 3초 후 자동 해제
        if (data.isTyping) {
          setTimeout(() => {
            setIsTyping(prev => {
              const newMap = new Map(prev);
              newMap.delete(data.userId);
              return newMap;
            });
          }, 3000);
        }
      }
    };

    // 그룹 읽음 확인
    const handleGroupReadReceipt = (data: any) => {
      markGroupMessageAsRead(data.groupId, data.messageId, data.userId);
    };

    // 그룹 전달 확인
    const handleGroupDeliveryReceipt = (data: any) => {
      markGroupMessageAsDelivered(data.groupId, data.messageId, data.userId);
    };

    // 이벤트 리스너 등록
    window.electronAPI?.onGroupMessageReceived?.(handleGroupMessage);
    window.electronAPI?.onGroupCreated?.(handleGroupCreated);
    window.electronAPI?.onGroupTyping?.(handleGroupTyping);
    window.electronAPI?.onGroupReadReceipt?.(handleGroupReadReceipt);
    window.electronAPI?.onGroupDeliveryReceipt?.(handleGroupDeliveryReceipt);

    return () => {
      window.electronAPI?.removeGroupListeners?.();
    };
  }, [selectedGroup?.id, user?.id, addGroupMessage, addGroup, markGroupMessageAsRead, markGroupMessageAsDelivered, addNotification]);

  // 스크롤 자동 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [groupMessages]);

  // 그룹 생성
  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || selectedMembers.length === 0 || !user) {
      return;
    }

    const members = selectedMembers.map(userId => {
      const contact = contacts.find(c => c.userId === userId);
      return {
        userId,
        userName: contact?.name || userId
      };
    });

    const group = createGroup(newGroupName, user.id, user.name || '나', members);
    addGroup(group);

    // P2P로 그룹 생성 알림
    try {
      await window.electronAPI?.broadcastGroupCreate?.({
        groupId: group.id,
        groupName: group.name,
        memberIds: group.members.map(m => m.userId),
        description: group.description
      });
    } catch (error) {
      console.error('[GroupChatPanel] Failed to broadcast group create:', error);
    }

    setShowCreateDialog(false);
    setNewGroupName('');
    setSelectedMembers([]);
    selectGroup(group);
  };

  // 메시지 전송
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedGroup || !user || !messageContent.trim()) {
      return;
    }

    setIsSending(true);

    try {
      const groupMessage = createGroupMessage(
        selectedGroup.id,
        selectedGroup.name,
        user.id,
        user.name || '나',
        messageContent,
        'text'
      );

      // 먼저 UI에 메시지 추가
      addGroupMessage(selectedGroup.id, groupMessage);
      setMessageContent('');

      // P2P로 메시지 전송
      const memberIds = selectedGroup.members.map(m => m.userId);
      const result = await window.electronAPI?.sendGroupMessage?.({
        groupId: selectedGroup.id,
        groupName: selectedGroup.name,
        memberIds,
        content: groupMessage.content,
        messageId: groupMessage.messageId
      });

      if (result?.failedRecipients?.length > 0) {
        console.log('[GroupChatPanel] Some recipients offline:', result.failedRecipients);
      }
    } catch (error: any) {
      console.error('[GroupChatPanel] Send message error:', error);
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

    if (selectedGroup) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      const memberIds = selectedGroup.members.map(m => m.userId);
      window.electronAPI?.sendGroupTyping?.({
        groupId: selectedGroup.id,
        memberIds,
        isTyping: newValue.length > 0
      });

      typingTimeoutRef.current = setTimeout(() => {
        window.electronAPI?.sendGroupTyping?.({
          groupId: selectedGroup.id,
          memberIds,
          isTyping: false
        });
      }, 2000);
    }
  }, [selectedGroup]);

  // 현재 그룹의 메시지들
  const currentMessages = selectedGroup ? groupMessages.get(selectedGroup.id) || [] : [];

  // 온라인 멤버 수
  const onlineMemberCount = selectedGroup?.members.filter(m => m.isOnline).length || 0;

  return (
    <div className="h-full flex">
      {/* 그룹 목록 */}
      <div className="w-80 border-r border-white/20 flex flex-col theme-surface-translucent">
        <div className="p-4 border-b border-white/20">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold theme-text">그룹 채팅</h3>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="p-2 theme-text hover:bg-white/20 rounded-lg transition-colors"
              title="새 그룹 만들기"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <p className="text-sm theme-text-secondary">총 {groups.length}개 그룹</p>
        </div>

        <div className="flex-1 overflow-auto">
          {groups.length === 0 ? (
            <div className="p-4 text-center theme-text-secondary">
              <p className="text-sm">참여 중인 그룹이 없습니다.</p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="mt-2 text-blue-400 hover:underline text-sm"
              >
                새 그룹 만들기
              </button>
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                onClick={() => selectGroup(group)}
                className={`p-4 border-b border-white/10 cursor-pointer hover:bg-white/10 ${
                  selectedGroup?.id === group.id ? 'bg-white/20 border-l-4 border-l-blue-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium theme-text truncate">{group.name}</p>
                    <p className="text-sm theme-text-secondary">
                      {group.members.length}명 참여
                    </p>
                    {group.lastMessage && (
                      <p className="text-xs theme-text-secondary truncate mt-1">
                        {group.lastMessage.senderName}: {group.lastMessage.content}
                      </p>
                    )}
                  </div>
                  {group.unreadCount > 0 && (
                    <span className="ml-2 px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                      {group.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 flex flex-col theme-surface-translucent">
        {selectedGroup ? (
          <>
            {/* 그룹 헤더 */}
            <div className="p-4 border-b border-white/20 bg-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold theme-text">{selectedGroup.name}</h3>
                  <p className="text-sm theme-text-secondary">
                    {selectedGroup.members.length}명 ({onlineMemberCount}명 온라인)
                  </p>
                </div>
                <div className="flex -space-x-2">
                  {selectedGroup.members.slice(0, 5).map((member) => (
                    <div
                      key={member.userId}
                      className={`w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-medium border-2 border-white ${
                        member.isOnline ? 'ring-2 ring-green-400' : ''
                      }`}
                      title={member.userName}
                    >
                      {member.userName?.charAt(0) || '?'}
                    </div>
                  ))}
                  {selectedGroup.members.length > 5 && (
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-medium border-2 border-white">
                      +{selectedGroup.members.length - 5}
                    </div>
                  )}
                </div>
              </div>
              {isTyping.size > 0 && (
                <p className="text-sm text-blue-500 italic mt-1 animate-pulse">
                  {Array.from(isTyping.values()).map((t: { userId: string; userName: string }) => t.userName).join(', ')}님이 입력 중...
                </p>
              )}
            </div>

            {/* 메시지 목록 */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {currentMessages.length === 0 ? (
                <div className="text-center theme-text-secondary mt-8">
                  <p>아직 메시지가 없습니다.</p>
                  <p className="text-sm mt-2">첫 메시지를 보내보세요!</p>
                </div>
              ) : (
                currentMessages.map((message) => (
                  <div
                    key={message.messageId}
                    className={`flex ${message.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-md px-4 py-2 rounded-lg ${
                        message.senderId === user?.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/30 theme-text backdrop-blur-sm'
                      }`}
                    >
                      {message.senderId !== user?.id && (
                        <p className="text-xs font-medium mb-1 opacity-75">{message.senderName}</p>
                      )}
                      <p>{message.content}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs opacity-75">
                          {new Date(message.timestamp).toLocaleTimeString('ko-KR')}
                        </p>
                        {message.senderId === user?.id && (
                          <div className="flex items-center space-x-1 ml-2">
                            <span className="text-xs opacity-75">
                              {message.deliveredTo.length - 1}/{selectedGroup.members.length - 1}
                            </span>
                            {message.readBy.length > 1 && (
                              <span className="text-xs opacity-75 text-green-200">
                                (읽음 {message.readBy.length - 1})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 메시지 입력 */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-white/20 bg-white/10">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={messageContent}
                  onChange={handleTypingChange}
                  placeholder="그룹에 메시지를 입력하세요..."
                  className="flex-1 px-4 py-2 border border-white/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/20 theme-text placeholder:text-white/50"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={isSending || !messageContent.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? '전송 중...' : '전송'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center theme-text-secondary">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-lg font-medium mb-2 theme-text">그룹 채팅</p>
              <p className="text-sm">왼쪽에서 그룹을 선택하거나 새 그룹을 만드세요.</p>
            </div>
          </div>
        )}
      </div>

      {/* 그룹 생성 다이얼로그 */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="theme-surface-translucent rounded-lg p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col shadow-2xl border border-white/20">
            <h3 className="text-lg font-semibold theme-text mb-4">새 그룹 만들기</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium theme-text mb-1">그룹 이름</label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="그룹 이름 입력..."
                className="w-full px-3 py-2 border border-white/30 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/20 theme-text placeholder:text-white/50"
              />
            </div>

            <div className="mb-4 flex-1 overflow-hidden flex flex-col">
              <label className="block text-sm font-medium theme-text mb-1">
                멤버 선택 ({selectedMembers.length}명)
              </label>
              <div className="flex-1 overflow-auto border border-white/20 rounded-lg bg-white/10 min-h-[200px]">
                {contacts.length === 0 ? (
                  <div className="p-4 text-center theme-text-secondary">
                    <p className="text-sm">연락처가 없습니다.</p>
                    <p className="text-xs mt-1">주소록에 연락처를 추가해주세요.</p>
                  </div>
                ) : contacts.map((contact) => (
                  <label
                    key={contact.userId}
                    className="flex items-center p-3 hover:bg-white/10 cursor-pointer border-b border-white/10 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(contact.userId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMembers([...selectedMembers, contact.userId]);
                        } else {
                          setSelectedMembers(selectedMembers.filter(id => id !== contact.userId));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="ml-3 flex-1">
                      <p className="font-medium theme-text">{contact.name}</p>
                      <p className="text-sm theme-text-secondary">{contact.jobTitle || contact.role}</p>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${contact.isOnline ? 'bg-green-400' : 'bg-gray-400'}`} />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-white/20">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewGroupName('');
                  setSelectedMembers([]);
                }}
                className="px-4 py-2 theme-text-secondary hover:theme-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || selectedMembers.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                그룹 만들기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
