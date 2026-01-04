import { create } from 'zustand';
import type { ChatGroup, GroupMember, GroupMessage } from '../types/messaging';

interface GroupStore {
  // 상태
  groups: ChatGroup[];
  selectedGroup: ChatGroup | null;
  groupMessages: Map<string, GroupMessage[]>;
  isLoading: boolean;

  // 그룹 관리
  setGroups: (groups: ChatGroup[]) => void;
  addGroup: (group: ChatGroup) => void;
  updateGroup: (groupId: string, updates: Partial<ChatGroup>) => void;
  deleteGroup: (groupId: string) => void;
  selectGroup: (group: ChatGroup | null) => void;

  // 멤버 관리
  addMember: (groupId: string, member: GroupMember) => void;
  removeMember: (groupId: string, userId: string) => void;
  updateMemberRole: (groupId: string, userId: string, role: 'admin' | 'member') => void;
  updateMemberOnlineStatus: (userId: string, isOnline: boolean) => void;

  // 메시지 관리
  setGroupMessages: (groupId: string, messages: GroupMessage[]) => void;
  addGroupMessage: (groupId: string, message: GroupMessage) => void;
  markGroupMessageAsRead: (groupId: string, messageId: string, userId: string) => void;
  markGroupMessageAsDelivered: (groupId: string, messageId: string, userId: string) => void;

  // 유틸리티
  getGroupById: (groupId: string) => ChatGroup | undefined;
  getGroupMessages: (groupId: string) => GroupMessage[];
  setLoading: (loading: boolean) => void;
  clearGroupData: () => void;
}

export const useGroupStore = create<GroupStore>((set, get) => ({
  // 초기 상태
  groups: [],
  selectedGroup: null,
  groupMessages: new Map(),
  isLoading: false,

  // 그룹 관리
  setGroups: (groups) => set({ groups }),

  addGroup: (group) => {
    set((state) => ({
      groups: [...state.groups, group]
    }));
  },

  updateGroup: (groupId, updates) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, ...updates } : g
      ),
      selectedGroup:
        state.selectedGroup?.id === groupId
          ? { ...state.selectedGroup, ...updates }
          : state.selectedGroup
    }));
  },

  deleteGroup: (groupId) => {
    set((state) => {
      const newMessages = new Map(state.groupMessages);
      newMessages.delete(groupId);
      return {
        groups: state.groups.filter((g) => g.id !== groupId),
        groupMessages: newMessages,
        selectedGroup:
          state.selectedGroup?.id === groupId ? null : state.selectedGroup
      };
    });
  },

  selectGroup: (group) => set({ selectedGroup: group }),

  // 멤버 관리
  addMember: (groupId, member) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, members: [...g.members, member] }
          : g
      )
    }));
  },

  removeMember: (groupId, userId) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? { ...g, members: g.members.filter((m) => m.userId !== userId) }
          : g
      )
    }));
  },

  updateMemberRole: (groupId, userId, role) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              members: g.members.map((m) =>
                m.userId === userId ? { ...m, role } : m
              )
            }
          : g
      )
    }));
  },

  updateMemberOnlineStatus: (userId, isOnline) => {
    set((state) => ({
      groups: state.groups.map((g) => ({
        ...g,
        members: g.members.map((m) =>
          m.userId === userId ? { ...m, isOnline } : m
        )
      }))
    }));
  },

  // 메시지 관리
  setGroupMessages: (groupId, messages) => {
    set((state) => {
      const newMessages = new Map(state.groupMessages);
      newMessages.set(groupId, messages);
      return { groupMessages: newMessages };
    });
  },

  addGroupMessage: (groupId, message) => {
    set((state) => {
      const newMessages = new Map(state.groupMessages);
      const existing = newMessages.get(groupId) || [];
      newMessages.set(groupId, [...existing, message]);

      // 그룹의 마지막 메시지 업데이트
      const groups = state.groups.map((g) =>
        g.id === groupId
          ? { ...g, lastMessage: message }
          : g
      );

      return { groupMessages: newMessages, groups };
    });
  },

  markGroupMessageAsRead: (groupId, messageId, userId) => {
    set((state) => {
      const newMessages = new Map(state.groupMessages);
      const messages = newMessages.get(groupId);
      if (messages) {
        const updatedMessages = messages.map((m) =>
          m.messageId === messageId && !m.readBy.includes(userId)
            ? { ...m, readBy: [...m.readBy, userId] }
            : m
        );
        newMessages.set(groupId, updatedMessages);
      }
      return { groupMessages: newMessages };
    });
  },

  markGroupMessageAsDelivered: (groupId, messageId, userId) => {
    set((state) => {
      const newMessages = new Map(state.groupMessages);
      const messages = newMessages.get(groupId);
      if (messages) {
        const updatedMessages = messages.map((m) =>
          m.messageId === messageId && !m.deliveredTo.includes(userId)
            ? { ...m, deliveredTo: [...m.deliveredTo, userId] }
            : m
        );
        newMessages.set(groupId, updatedMessages);
      }
      return { groupMessages: newMessages };
    });
  },

  // 유틸리티
  getGroupById: (groupId) => {
    return get().groups.find((g) => g.id === groupId);
  },

  getGroupMessages: (groupId) => {
    return get().groupMessages.get(groupId) || [];
  },

  setLoading: (loading) => set({ isLoading: loading }),

  clearGroupData: () => {
    set({
      groups: [],
      selectedGroup: null,
      groupMessages: new Map(),
      isLoading: false
    });
  }
}));

// 그룹 생성 헬퍼 함수
export function createGroup(
  name: string,
  createdBy: string,
  createdByName: string,
  members: { userId: string; userName: string }[],
  description?: string
): ChatGroup {
  const now = new Date().toISOString();

  return {
    id: `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    createdBy,
    createdAt: now,
    members: [
      // 생성자는 항상 admin
      {
        userId: createdBy,
        userName: createdByName,
        role: 'admin',
        joinedAt: now,
        isOnline: true
      },
      // 나머지 멤버들
      ...members
        .filter((m) => m.userId !== createdBy)
        .map((m) => ({
          userId: m.userId,
          userName: m.userName,
          role: 'member' as const,
          joinedAt: now,
          isOnline: false
        }))
    ],
    unreadCount: 0,
    isActive: true
  };
}

// 그룹 메시지 생성 헬퍼 함수
export function createGroupMessage(
  groupId: string,
  groupName: string,
  senderId: string,
  senderName: string,
  content: string,
  type: string = 'text'
): GroupMessage {
  const now = new Date().toISOString();
  const messageId = `gmsg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: messageId,
    messageId,
    senderId,
    senderName,
    recipientId: groupId, // 그룹 메시지의 경우 groupId
    content,
    type,
    timestamp: now,
    isRead: false,
    delivered: false,
    groupId,
    groupName,
    readBy: [senderId], // 보낸 사람은 이미 읽음
    deliveredTo: [senderId] // 보낸 사람에게는 이미 전달됨
  };
}
