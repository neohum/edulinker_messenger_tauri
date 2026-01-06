// P2P 상태 인터페이스
export interface P2PStatus {
  isRunning: boolean;
  peerId?: string;
  userId?: string;
  userName?: string;
  ipAddress?: string;
  peerCount: number;
}

// 피어 정보 인터페이스
export interface PeerInfo {
  peerId: string;
  userId: string;
  userName?: string;
  ipAddress: string;
  isOnline: boolean;
  lastSeen: Date;
}

// 연락처 인터페이스
export interface Contact {
  userId: string;
  name: string;
  email: string;
  role: string;
  schoolId?: string;
  isOnline: boolean;
  lastSeen?: string;
  jobTitle?: string;
  workplace?: string;
}

// 포맷된 메시지 인터페이스
export interface FormattedMessage {
  id: string;
  messageId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  content: string;
  type: string;
  timestamp: string;
  isRead: boolean;
  readAt?: string;
  delivered: boolean;
  deliveredAt?: string;
  // 그룹 메시지용
  groupId?: string;
  groupName?: string;
}

// 그룹 채팅 인터페이스
export interface ChatGroup {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  members: GroupMember[];
  lastMessage?: FormattedMessage;
  unreadCount: number;
  isActive: boolean;
}

// 그룹 멤버 인터페이스
export interface GroupMember {
  userId: string;
  userName: string;
  role: 'admin' | 'member';
  joinedAt: string;
  isOnline?: boolean;
}

// 그룹 메시지 인터페이스
export interface GroupMessage extends FormattedMessage {
  groupId: string;
  groupName: string;
  readBy: string[]; // 읽은 사용자 ID 목록
  deliveredTo: string[]; // 전달된 사용자 ID 목록
}

