export interface ElectronAPI {
  on?: (event: string, callback: (payload: any) => void) => void;
  removeAllListeners?: (event?: string) => void;

  // Auth
  login: (credentials: any) => Promise<any>;
  register: (data: any) => Promise<any>;
  logout: () => Promise<any>;
  getStoredAuth: () => Promise<any>;
  refreshToken: () => Promise<any>;
  autoLogin: (userType: string) => Promise<any>;
  updateUserProfile: (profileData: any) => Promise<any>;
  updateUserProfileOffline: (profileData: any) => Promise<any>;
  checkNetworkStatus: () => Promise<any>;
  checkInternalNetworkIp: () => Promise<any>;
  // Offline Auth
  offlineLogin: (credentials: any) => Promise<any>;
  offlineRegister: (data: any) => Promise<any>;
  validateOfflineSession: (token: string) => Promise<any>;
  syncUsers: (onlineUsers: any[]) => Promise<any>;
  getOfflineUsers: () => Promise<any>;
  // Window controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  toggleDevTools: () => Promise<void>;

  // Address Book
  getAddressBook: (token: string) => Promise<any>;

  // Address Book Management
  initAddressBook: () => Promise<any>;
  saveAddressBookEntry: (entry: any) => Promise<any>;
  getAddressBookEntry: (userId: string) => Promise<any>;
  getAllAddressBookEntries: () => Promise<any>;
  getUsersForAddressBook: () => Promise<any>;
  getAddressBookEntriesByRole: (role: string) => Promise<any>;
  getOnlineAddressBookEntries: () => Promise<any>;
  deleteAddressBookEntry: (userId: string) => Promise<any>;
  getUnsyncedAddressBookEntries: () => Promise<any>;
  markAddressBookEntrySynced: (userId: string, synced: boolean) => Promise<any>;
  updateAddressBookOnlineStatus: (userId: string | undefined, isOnline: boolean, lastSeen?: string) => Promise<any>;
  syncAddressBookWithServer: (serverData: any) => Promise<any>;
  getAddressBookStats: () => Promise<any>;

  // Messaging
  sendMessage: (message: any) => Promise<any>;
  onMessageReceived: (callback: (message: any) => void) => void;
  removeMessageListener: () => void;
  onReadReceipt: (callback: (receipt: any) => void) => void;
  onDeliveryReceipt: (callback: (receipt: any) => void) => void;
  removeReceiptListeners: () => void;

  // Offline Messaging
  saveOfflineMessage: (message: any) => Promise<any>;
  getOfflineMessages: (userId: string, otherUserId: string) => Promise<any>;
  getOfflineUnreadMessages: (userId: string) => Promise<any>;
  markOfflineMessageAsRead: (messageId: string) => Promise<any>;
  getUnsyncedMessages: () => Promise<any>;
  markMessagesAsSynced: (messageIds: string[]) => Promise<any>;

  // P2P Messaging
  sendP2PMessage: (message: any) => Promise<any>;
  saveGroupMessage: (message: any) => Promise<any>;

  // Notifications
  showNotification: (notification: { title: string; body: string }) => Promise<{ success: boolean }>;
  updateBadgeCount: (count: number) => Promise<{ success: boolean }>;

  // App info
  getAppVersion: () => Promise<string>;
  getDeviceInfo: () => Promise<{ macAddress: string; ipAddress: string; hostname: string }>;
  checkDatabaseConnection: () => Promise<{ connected: boolean; error?: string }>;

  // Network Discovery
  startNetworkDiscovery: () => Promise<any>;
  stopNetworkDiscovery: () => Promise<any>;
  getDiscoveredDevices: () => Promise<any>;
  saveDiscoveredDevice: (device: any) => Promise<any>;
  syncDatabases: () => Promise<any>;
  onDeviceDiscovered: (callback: (device: any) => void) => void;
  removeDeviceDiscoveryListener: () => void;
  onNetworkDiscoveryPortChanged: (callback: (data: { port: number; requestedPort: number; isFallback: boolean }) => void) => void;
  removeNetworkDiscoveryPortListener: () => void;
  startDeviceRegistration: (token: string, userId: string) => Promise<any>;
  stopDeviceRegistration: () => Promise<any>;

  // Internal P2P Messaging
  startInternalP2P?: (userId: string, userName: string, schoolId?: string) => Promise<any>;
  stopInternalP2P?: () => Promise<any>;
  getInternalP2PStatus?: () => Promise<any>;
  getInternalPeers?: () => Promise<any>;
  sendInternalMessage?: (data: { receiverId: string; content: string; type?: string; messageId?: string }) => Promise<any>;
  getInternalMessages?: (data: { userId: string; otherUserId: string; limit?: number; offset?: number }) => Promise<any>;
  getInternalUnreadCount?: (userId: string) => Promise<any>;
  sendInternalReadReceipt?: (data: { messageId: string; senderId: string }) => Promise<any>;
  sendInternalTyping?: (data: { receiverId: string; isTyping: boolean }) => Promise<any>;
  offerInternalFile?: (data: { receiverId: string; fileName: string; fileSize: number; filePath: string }) => Promise<any>;
  acceptInternalFile?: (transferId: string) => Promise<any>;
  rejectInternalFile?: (transferId: string) => Promise<any>;
  getInternalFileTransfers?: () => Promise<any>;
  onInternalP2PStarted?: (callback: (info: any) => void) => void;
  onInternalP2PStopped?: (callback: () => void) => void;
  onInternalPeerDiscovered?: (callback: (peer: any) => void) => void;
  onInternalPeerOnline?: (callback: (peer: any) => void) => void;
  onInternalPeerOffline?: (callback: (peer: any) => void) => void;
  onInternalTyping?: (callback: (data: { userId: string; isTyping: boolean }) => void) => void;
  onInternalFileOffer?: (callback: (transfer: any) => void) => void;
  onInternalFileProgress?: (callback: (data: any) => void) => void;
  onInternalFileComplete?: (callback: (transfer: any) => void) => void;
  removeInternalP2PListeners?: () => void;

  // Group Chat
  sendGroupMessage?: (data: { groupId: string; groupName: string; memberIds: string[]; content: string; messageId?: string }) => Promise<any>;
  broadcastGroupCreate?: (data: { groupId: string; groupName: string; memberIds: string[]; description?: string }) => Promise<any>;
  broadcastGroupMemberChange?: (data: { groupId: string; groupName: string; memberIds: string[]; action: 'join' | 'leave'; targetUserId: string; targetUserName: string }) => Promise<any>;
  sendGroupReadReceipt?: (data: { groupId: string; messageId: string; memberIds: string[] }) => Promise<any>;
  sendGroupTyping?: (data: { groupId: string; memberIds: string[]; isTyping: boolean }) => Promise<any>;
  onGroupMessageReceived?: (callback: (message: any) => void) => void;
  onGroupCreated?: (callback: (data: any) => void) => void;
  onGroupMemberChanged?: (callback: (data: any) => void) => void;
  onGroupReadReceipt?: (callback: (data: any) => void) => void;
  onGroupDeliveryReceipt?: (callback: (data: any) => void) => void;
  onGroupTyping?: (callback: (data: any) => void) => void;
  removeGroupListeners?: () => void;

  // Settings
  getSetting?: (key: string) => Promise<{ success: boolean; value?: string }>;
  setSetting?: (key: string, value: string) => Promise<{ success: boolean }>;
  getTheme?: () => Promise<{ success: boolean; themeId: string }>;
  setTheme?: (themeId: string) => Promise<{ success: boolean; themeId: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
