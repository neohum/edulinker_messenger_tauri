import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { downloadDir } from '@tauri-apps/api/path';

type UnlistenFn = () => void;

const listenerMap = new Map<string, UnlistenFn[]>();

async function addListener(event: string, callback: (payload: any) => void) {
  const unlisten = await listen(event, (e) => {
    callback(e.payload);
  });

  const existing = listenerMap.get(event) || [];
  existing.push(unlisten);
  listenerMap.set(event, existing);
}

function removeListeners(event?: string) {
  if (event) {
    const listeners = listenerMap.get(event) || [];
    listeners.forEach((unlisten) => {
      try {
        unlisten();
      } catch {
        // Ignore listener cleanup errors
      }
    });
    listenerMap.delete(event);
    return;
  }

  Array.from(listenerMap.keys()).forEach((key) => removeListeners(key));
}

function ipcInvoke(channel: string, args?: any) {
  return invoke('ipc', { channel, args: args ?? null });
}

export function createElectronAPI() {
  return {
    on: (event: string, callback: (payload: any) => void) => {
      void addListener(event, callback);
    },
    removeAllListeners: (event?: string) => {
      removeListeners(event);
    },

    // Auth
    login: (credentials: any) => ipcInvoke('auth:login', credentials),
    register: (data: any) => ipcInvoke('auth:register', data),
    logout: () => ipcInvoke('auth:logout'),
    getStoredAuth: () => ipcInvoke('auth:get-stored'),
    refreshToken: () => ipcInvoke('auth:refresh-token'),
    autoLogin: (userType: string) => ipcInvoke('auth:auto-login', userType),
    updateUserProfile: (profileData: any) => ipcInvoke('auth:update-user-profile', profileData),
    updateUserProfileOffline: (profileData: any) => ipcInvoke('auth:update-user-profile-offline', profileData),
    checkNetworkStatus: () => ipcInvoke('check-network-status'),
    checkInternalNetworkIp: () => ipcInvoke('check-internal-network-ip'),
    seedDemoData: () => ipcInvoke('auth:seed-demo-data'),
    seedFromJsonFile: (filePath: string) => ipcInvoke('auth:seed-from-json', filePath),

    // Offline Auth
    offlineLogin: (credentials: any) => ipcInvoke('auth:offline-login', credentials),
    offlineRegister: (data: any) => ipcInvoke('auth:offline-register', data),
    validateOfflineSession: (token: string) => ipcInvoke('auth:validate-offline-session', token),
    syncUsers: (onlineUsers: any[]) => ipcInvoke('auth:sync-users', onlineUsers),
    getOfflineUsers: () => ipcInvoke('auth:get-offline-users'),
    seedTeacherData: (count: number) => ipcInvoke('auth:seed-teacher-data', count),
    seedFakeUsers: (options: any) => ipcInvoke('auth:seed-fake-users', options),

    // Window controls
    minimizeWindow: () => ipcInvoke('window:minimize'),
    maximizeWindow: () => ipcInvoke('window:maximize'),
    closeWindow: () => ipcInvoke('window:close'),
    toggleDevTools: () => ipcInvoke('window:toggle-dev-tools'),

    // Address Book
    getAddressBook: async (token: string) => {
      const result: any = await ipcInvoke('auth:get-address-book', token);
      return result?.contacts || [];
    },

    // Address Book Management
    initAddressBook: () => ipcInvoke('address-book:init-db'),
    saveAddressBookEntry: (entry: any) => ipcInvoke('address-book:save-entry', entry),
    getAddressBookEntry: (userId: string) => ipcInvoke('address-book:get-entry', userId),
    getAllAddressBookEntries: () => ipcInvoke('address-book:get-all-entries'),
    getUsersForAddressBook: () => ipcInvoke('address-book:get-users'),
    getAddressBookEntriesByRole: (role: string) => ipcInvoke('address-book:get-entries-by-role', role),
    getOnlineAddressBookEntries: () => ipcInvoke('address-book:get-online-entries'),
    deleteAddressBookEntry: (userId: string) => ipcInvoke('address-book:delete-entry', userId),
    getUnsyncedAddressBookEntries: () => ipcInvoke('address-book:get-unsynced-entries'),
    markAddressBookEntrySynced: (userId: string, synced: boolean) =>
      ipcInvoke('address-book:mark-synced', { userId, synced }),
    updateAddressBookOnlineStatus: (userId: string | undefined, isOnline: boolean, lastSeen?: string) =>
      ipcInvoke('address-book:update-online-status', { userId, isOnline, lastSeen }),
    syncAddressBookWithServer: (serverData: any) => ipcInvoke('address-book:sync-with-server', serverData),
    getAddressBookStats: () => ipcInvoke('address-book:get-stats'),

    // Messaging
    sendMessage: (message: any) => ipcInvoke('messaging:send', message),
    onMessageReceived: (callback: (message: any) => void) => {
      void addListener('messaging:received', callback);
    },
    removeMessageListener: () => removeListeners('messaging:received'),
    onReadReceipt: (callback: (receipt: any) => void) => {
      void addListener('messaging:read-receipt', callback);
    },
    onDeliveryReceipt: (callback: (receipt: any) => void) => {
      void addListener('messaging:delivery-receipt', callback);
    },
    removeReceiptListeners: () => {
      removeListeners('messaging:read-receipt');
      removeListeners('messaging:delivery-receipt');
    },

    // Offline Messaging
    saveOfflineMessage: (message: any) => ipcInvoke('messaging:save-offline', message),
    getOfflineMessages: (userId: string, otherUserId: string) =>
      ipcInvoke('messaging:get-offline', { userId, otherUserId }),
    getOfflineUnreadMessages: (userId: string) => ipcInvoke('messaging:get-unread-offline', userId),
    markOfflineMessageAsRead: (messageId: string) => ipcInvoke('messaging:mark-read-offline', messageId),
    getUnsyncedMessages: () => ipcInvoke('messaging:get-unsynced'),
    markMessagesAsSynced: (messageIds: string[]) => ipcInvoke('messaging:mark-synced', messageIds),

    // P2P Messaging
    sendP2PMessage: (message: any) => ipcInvoke('p2p-messaging:send', message),
    saveGroupMessage: (message: any) => ipcInvoke('saveGroupMessage', message),

    // Notifications
    showNotification: (notification: { title: string; body: string }) => ipcInvoke('show-notification', notification),
    updateBadgeCount: (count: number) => ipcInvoke('update-badge-count', { count }),

    // App info
    getAppVersion: () => ipcInvoke('get-app-version'),
    getDeviceInfo: () => ipcInvoke('get-device-info'),
    checkDatabaseConnection: async () => {
      const result: any = await ipcInvoke('check-database-connection');
      return { connected: !!result?.success };
    },

    // Network Discovery
    startNetworkDiscovery: () => ipcInvoke('network-discovery:start'),
    stopNetworkDiscovery: () => ipcInvoke('network-discovery:stop'),
    getDiscoveredDevices: () => ipcInvoke('network-discovery:get-devices'),
    saveDiscoveredDevice: (device: any) => ipcInvoke('network-discovery:save-device', device),
    syncDatabases: () => ipcInvoke('network-discovery:sync-databases'),
    onDeviceDiscovered: (callback: (device: any) => void) => {
      void addListener('network-device-discovered', callback);
    },
    removeDeviceDiscoveryListener: () => removeListeners('network-device-discovered'),
    onNetworkDiscoveryPortChanged: (callback: (data: { port: number; requestedPort: number; isFallback: boolean }) => void) => {
      void addListener('network-discovery:port-changed', callback);
    },
    removeNetworkDiscoveryPortListener: () => removeListeners('network-discovery:port-changed'),
    startDeviceRegistration: (token: string, userId: string) =>
      ipcInvoke('p2p:start-device-registration', { authToken: token, userId }),
    stopDeviceRegistration: () => ipcInvoke('p2p:stop-device-registration'),

    // Internal P2P Messaging
    startInternalP2P: (userId: string, userName: string, schoolId?: string) =>
      ipcInvoke('internal-p2p:start', { userId, userName, schoolId }),
    stopInternalP2P: () => ipcInvoke('internal-p2p:stop'),
    getInternalP2PStatus: () => ipcInvoke('internal-p2p:status'),
    getInternalPeers: () => ipcInvoke('internal-p2p:get-peers'),
    sendInternalMessage: (data: { receiverId: string; content: string; type?: string; messageId?: string }) =>
      ipcInvoke('internal-p2p:send-message', data),
    getInternalMessages: (data: { userId: string; otherUserId: string; limit?: number; offset?: number }) =>
      ipcInvoke('internal-p2p:get-messages', data),
    getInternalUnreadCount: (userId: string) => ipcInvoke('internal-p2p:get-unread-count', userId),
    sendInternalReadReceipt: (data: { messageId: string; senderId: string }) =>
      ipcInvoke('internal-p2p:send-read-receipt', data),
    sendInternalTyping: (data: { receiverId: string; isTyping: boolean }) =>
      ipcInvoke('internal-p2p:send-typing', data),
    offerInternalFile: (data: { receiverId: string; fileName: string; fileSize: number; filePath: string }) =>
      ipcInvoke('internal-p2p:offer-file', data),
    acceptInternalFile: (transferId: string) => ipcInvoke('internal-p2p:accept-file', transferId),
    rejectInternalFile: (transferId: string) => ipcInvoke('internal-p2p:reject-file', transferId),
    getInternalFileTransfers: () => ipcInvoke('internal-p2p:get-file-transfers'),
    onInternalP2PStarted: (callback: (info: any) => void) => {
      void addListener('p2p:started', callback);
    },
    onInternalP2PStopped: (callback: () => void) => {
      void addListener('p2p:stopped', callback);
    },
    onInternalPeerDiscovered: (callback: (peer: any) => void) => {
      void addListener('p2p:peer-discovered', callback);
    },
    onInternalPeerOnline: (callback: (peer: any) => void) => {
      void addListener('p2p:peer-online', callback);
    },
    onInternalPeerOffline: (callback: (peer: any) => void) => {
      void addListener('p2p:peer-offline', callback);
    },
    onInternalTyping: (callback: (data: { userId: string; isTyping: boolean }) => void) => {
      void addListener('messaging:typing', callback);
    },
    onInternalFileOffer: (callback: (transfer: any) => void) => {
      void addListener('p2p:file-offer', callback);
    },
    onInternalFileProgress: (callback: (data: any) => void) => {
      void addListener('p2p:file-progress', callback);
    },
    onInternalFileComplete: (callback: (transfer: any) => void) => {
      void addListener('p2p:file-complete', callback);
    },
    removeInternalP2PListeners: () => {
      removeListeners('p2p:started');
      removeListeners('p2p:stopped');
      removeListeners('p2p:peer-discovered');
      removeListeners('p2p:peer-online');
      removeListeners('p2p:peer-offline');
      removeListeners('messaging:typing');
      removeListeners('p2p:file-offer');
      removeListeners('p2p:file-progress');
      removeListeners('p2p:file-complete');
    },

    // Group Chat
    sendGroupMessage: (data: { groupId: string; groupName: string; memberIds: string[]; content: string; messageId?: string }) =>
      ipcInvoke('internal-p2p:send-group-message', data),
    broadcastGroupCreate: (data: { groupId: string; groupName: string; memberIds: string[]; description?: string }) =>
      ipcInvoke('internal-p2p:broadcast-group-create', data),
    broadcastGroupMemberChange: (data: { groupId: string; groupName: string; memberIds: string[]; action: 'join' | 'leave'; targetUserId: string; targetUserName: string }) =>
      ipcInvoke('internal-p2p:broadcast-group-member-change', data),
    sendGroupReadReceipt: (data: { groupId: string; messageId: string; memberIds: string[] }) =>
      ipcInvoke('internal-p2p:send-group-read-receipt', data),
    sendGroupTyping: (data: { groupId: string; memberIds: string[]; isTyping: boolean }) =>
      ipcInvoke('internal-p2p:send-group-typing', data),
    onGroupMessageReceived: (callback: (message: any) => void) => {
      void addListener('group:message-received', callback);
    },
    onGroupCreated: (callback: (data: any) => void) => {
      void addListener('group:created', callback);
    },
    onGroupMemberChanged: (callback: (data: any) => void) => {
      void addListener('group:member-changed', callback);
    },
    onGroupReadReceipt: (callback: (data: any) => void) => {
      void addListener('group:read-receipt', callback);
    },
    onGroupDeliveryReceipt: (callback: (data: any) => void) => {
      void addListener('group:delivery-receipt', callback);
    },
    onGroupTyping: (callback: (data: any) => void) => {
      void addListener('group:typing', callback);
    },
    removeGroupListeners: () => {
      removeListeners('group:message-received');
      removeListeners('group:created');
      removeListeners('group:member-changed');
      removeListeners('group:read-receipt');
      removeListeners('group:delivery-receipt');
      removeListeners('group:typing');
    },

    // Settings
    getSetting: (key: string) => ipcInvoke('settings:get', { key }),
    setSetting: (key: string, value: string) => ipcInvoke('settings:set', { key, value }),
    getTheme: () => ipcInvoke('settings:get-theme'),
    setTheme: (themeId: string) => ipcInvoke('settings:set-theme', { themeId }),

    // File Dialog
    selectDownloadFolder: async () => {
      try {
        const selected = await openDialog({
          directory: true,
          multiple: false,
          title: '다운로드 폴더 선택',
        });
        return { success: true, path: selected };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    getDefaultDownloadPath: async () => {
      try {
        const path = await downloadDir();
        return { success: true, path };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
    createDownloadFolder: (parentPath: string) =>
      ipcInvoke('file:create-download-folder', { parentPath }),

    // File Download
    downloadFile: (data: { uploadId: string; fileName: string; peerId?: string }) =>
      ipcInvoke('file:download', data),
    getDownloadProgress: (uploadId: string) =>
      ipcInvoke('file:download-progress', { uploadId }),
    cancelDownload: (uploadId: string) =>
      ipcInvoke('file:cancel-download', { uploadId }),
    onDownloadProgress: (callback: (data: { uploadId: string; progress: number; status: string }) => void) => {
      void addListener('file:download-progress', callback);
    },
    onDownloadComplete: (callback: (data: { uploadId: string; filePath: string }) => void) => {
      void addListener('file:download-complete', callback);
    },
    removeDownloadListeners: () => {
      removeListeners('file:download-progress');
      removeListeners('file:download-complete');
    },
  };
}
