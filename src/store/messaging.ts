import { create } from 'zustand';

interface Message {
  id: string;
  messageId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  content: string;
  type: 'text' | 'file' | 'image';
  timestamp: string;
  isRead: boolean;
  readAt?: string;
  delivered: boolean;
  deliveredAt?: string;
}

interface Contact {
  userId: string;
  name: string;
  email?: string;
  role: string;
  schoolId?: string;
  isOnline: boolean;
  lastSeen?: string;
  jobTitle?: string;
  workplace?: string;
}

interface MessagingState {
  messages: Message[];
  contacts: Contact[];
  selectedContact: Contact | null;
  unreadCount: number;
  isLoading: boolean;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  markAsRead: (messageId: string) => void;
  markAsDelivered: (messageId: string) => void;
  setContacts: (contacts: Contact[]) => void;
  selectContact: (contact: Contact | null) => void;
  updateContactStatus: (userId: string, isOnline: boolean, lastSeen?: string) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
}

export const useMessagingStore = create<MessagingState>((set, _get) => ({
  messages: [],
  contacts: [],
  selectedContact: null,
  unreadCount: 0,
  isLoading: false,

  addMessage: (message) =>
    set((state) => {
      const existingMessage = state.messages.find(m => m.messageId === message.messageId);
      if (existingMessage) {
        // Update existing message
        return {
          messages: state.messages.map(m =>
            m.messageId === message.messageId ? { ...m, ...message } : m
          ),
          unreadCount: message.isRead ? state.unreadCount : (existingMessage.isRead ? state.unreadCount : state.unreadCount + 1)
        };
      } else {
        // Add new message
        return {
          messages: [...state.messages, message],
          unreadCount: message.isRead ? state.unreadCount : state.unreadCount + 1,
        };
      }
    }),

  setMessages: (messages) =>
    set((_state) => ({
      messages,
      unreadCount: messages.filter(m => !m.isRead).length,
    })),

  markAsRead: (messageId) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.messageId === messageId ? { ...msg, isRead: true, readAt: new Date().toISOString() } : msg
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  markAsDelivered: (messageId) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.messageId === messageId ? { ...msg, delivered: true, deliveredAt: new Date().toISOString() } : msg
      ),
    })),

  setContacts: (contacts) => set({ contacts }),

  selectContact: (contact) => set({ selectedContact: contact }),

  updateContactStatus: (userId, isOnline, lastSeen) =>
    set((state) => ({
      contacts: state.contacts.map((contact) =>
        contact.userId === userId ? { ...contact, isOnline, lastSeen } : contact
      ),
    })),

  clearMessages: () => set({ messages: [], unreadCount: 0 }),

  setLoading: (loading) => set({ isLoading: loading }),
}));

