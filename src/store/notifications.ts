import { create } from 'zustand';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
  read: boolean;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      read: false,
    };

    set((state) => {
      const newUnreadCount = state.unreadCount + 1;

      // Update badge count
      if (window.electronAPI) {
        window.electronAPI?.updateBadgeCount?.(newUnreadCount);
      }

      return {
        notifications: [newNotification, ...state.notifications],
        unreadCount: newUnreadCount,
      };
    });

    // Show desktop notification
    if (window.electronAPI) {
      window.electronAPI?.showNotification?.({
        title: notification.title,
        body: notification.message,
      });
    }

    // Auto-remove after 10 seconds for non-error notifications
    if (notification.type !== 'error') {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== newNotification.id),
        }));
      }, 10000);
    }
  },

  markAsRead: (id) =>
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      if (!notification || notification.read) return state;

      const newUnreadCount = Math.max(0, state.unreadCount - 1);

      // Update badge count
      if (window.electronAPI) {
        window.electronAPI?.updateBadgeCount?.(newUnreadCount);
      }

      return {
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: newUnreadCount,
      };
    }),

  markAllAsRead: () =>
    set((state) => {
      // Update badge count
      if (window.electronAPI) {
        window.electronAPI?.updateBadgeCount?.(0);
      }

      return {
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      };
    }),

  removeNotification: (id) =>
    set((state) => {
      const notification = state.notifications.find((n) => n.id === id);
      const newUnreadCount = notification && !notification.read
        ? Math.max(0, state.unreadCount - 1)
        : state.unreadCount;

      // Update badge count
      if (window.electronAPI) {
        window.electronAPI?.updateBadgeCount?.(newUnreadCount);
      }

      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: newUnreadCount,
      };
    }),

  clearAll: () =>
    set(() => {
      // Update badge count
      if (window.electronAPI) {
        window.electronAPI?.updateBadgeCount?.(0);
      }

      return {
        notifications: [],
        unreadCount: 0,
      };
    }),
}));

