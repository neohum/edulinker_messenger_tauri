// @ts-ignore
const electronAPI = window.electronAPI;

import { getAppConfig, isLocalMode, checkServerConnection } from './appConfig';
import { getTeachers } from './dataService';
import type { FakeTeacher } from './fakeDataGenerator';

export interface AddressBookEntry {
  id?: number;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  schoolId?: string;
  ipAddress: string;
  hostname: string;
  os: string;
  platform: string;
  lastSeen: string;
  isOnline: boolean;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
  // 추가 필드 (로컬 모드)
  grade?: number;
  class?: string;
  workplace?: string;
  jobTitle?: string;
  extensionNumber?: string;
  phoneNumber?: string;
}

// FakeTeacher를 AddressBookEntry로 변환
function teacherToAddressBookEntry(teacher: FakeTeacher): AddressBookEntry {
  return {
    userId: teacher.id,
    name: teacher.name,
    email: teacher.email,
    phone: teacher.phoneNumber,
    role: teacher.role,
    schoolId: 'local-school',
    ipAddress: '192.168.1.' + Math.floor(Math.random() * 254 + 1),
    hostname: `${teacher.name}-PC`,
    os: 'Windows 11',
    platform: 'win32',
    lastSeen: teacher.lastSeen,
    isOnline: teacher.isOnline,
    synced: false,
    createdAt: teacher.createdAt,
    updatedAt: teacher.lastSeen,
    grade: teacher.grade,
    class: teacher.class,
    workplace: teacher.workplace,
    jobTitle: teacher.jobTitle,
    extensionNumber: teacher.extensionNumber,
    phoneNumber: teacher.phoneNumber
  };
}

export interface AddressBookStats {
  totalDevices: number;
  onlineDevices: number;
  syncedDevices: number;
  dbPath: string;
}

interface IPCResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export class AddressBookService {
  private initialized = false;
  private localCache: AddressBookEntry[] = [];

  // 데이터베이스 초기화
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 로컬 모드에서는 페이크 데이터로 초기화
    if (isLocalMode()) {
      const teachers = await getTeachers();
      this.localCache = teachers.map(teacherToAddressBookEntry);
      this.initialized = true;
      console.log(`[AddressBook] 로컬 모드 초기화 완료: ${this.localCache.length}명`);
      return;
    }

    // 원격/하이브리드 모드
    try {
      const result = await electronAPI.initAddressBook() as IPCResponse;
      if (!result.success) {
        throw new Error(result.error || 'Failed to initialize address book database');
      }
      this.initialized = true;
    } catch (error) {
      console.warn('[AddressBook] 원격 초기화 실패, 로컬 모드로 폴백:', error);
      const teachers = await getTeachers();
      this.localCache = teachers.map(teacherToAddressBookEntry);
      this.initialized = true;
    }
  }

  // 주소록 항목 저장
  async saveEntry(entry: Omit<AddressBookEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<AddressBookEntry | null> {
    await this.ensureInitialized();

    // 로컬 모드에서는 캐시에 저장
    if (isLocalMode()) {
      const now = new Date().toISOString();
      const newEntry: AddressBookEntry = {
        ...entry,
        id: this.localCache.length + 1,
        createdAt: now,
        updatedAt: now
      };
      this.localCache.push(newEntry);
      return newEntry;
    }

    const result = await electronAPI.saveAddressBookEntry(entry) as IPCResponse<AddressBookEntry | null>;
    if (!result.success) {
      throw new Error(result.error || 'Failed to save address book entry');
    }
    return result.data ?? null;
  }

  // 주소록 항목 조회
  async getEntry(userId: string): Promise<AddressBookEntry | null> {
    await this.ensureInitialized();

    // 로컬 모드
    if (isLocalMode()) {
      return this.localCache.find(e => e.userId === userId) || null;
    }

    const result = await electronAPI.getAddressBookEntry(userId) as IPCResponse<AddressBookEntry | null>;
    if (!result.success) {
      throw new Error(result.error || 'Failed to get address book entry');
    }
    return result.data ?? null;
  }

  // 모든 주소록 항목 조회
  async getAllEntries(): Promise<AddressBookEntry[]> {
    await this.ensureInitialized();

    // 로컬 모드에서는 캐시된 페이크 데이터 반환
    if (isLocalMode()) {
      return this.localCache;
    }

    // 하이브리드 모드에서 서버 연결 확인
    const config = getAppConfig();
    if (config.appMode === 'hybrid') {
      const serverAvailable = await checkServerConnection();
      if (!serverAvailable && this.localCache.length > 0) {
        console.log('[AddressBook] 서버 연결 불가, 로컬 캐시 사용');
        return this.localCache;
      }
    }

    try {
      const result = await electronAPI.getUsersForAddressBook() as IPCResponse<AddressBookEntry[]>;
      if (!result.success) {
        throw new Error(result.error || 'Failed to get all users for address book');
      }
      return result.data || [];
    } catch (error) {
      console.warn('[AddressBook] 원격 조회 실패, 로컬 캐시 사용:', error);
      if (this.localCache.length === 0) {
        const teachers = await getTeachers();
        this.localCache = teachers.map(teacherToAddressBookEntry);
      }
      return this.localCache;
    }
  }

  // 역할별 주소록 항목 조회
  async getEntriesByRole(role: string): Promise<AddressBookEntry[]> {
    await this.ensureInitialized();

    // 로컬 모드
    if (isLocalMode()) {
      return this.localCache.filter(e => e.role === role);
    }

    try {
      const result = await electronAPI.getAddressBookEntriesByRole(role) as IPCResponse<AddressBookEntry[]>;
      if (!result.success) {
        throw new Error(result.error || 'Failed to get address book entries by role');
      }
      return result.data || [];
    } catch (error) {
      console.warn('[AddressBook] 역할별 조회 실패, 로컬 캐시 사용:', error);
      return this.localCache.filter(e => e.role === role);
    }
  }

  // 온라인 주소록 항목 조회
  async getOnlineEntries(): Promise<AddressBookEntry[]> {
    await this.ensureInitialized();

    // 로컬 모드
    if (isLocalMode()) {
      return this.localCache.filter(e => e.isOnline);
    }

    try {
      const result = await electronAPI.getOnlineAddressBookEntries() as IPCResponse<AddressBookEntry[]>;
      if (!result.success) {
        throw new Error(result.error || 'Failed to get online address book entries');
      }
      return result.data || [];
    } catch (error) {
      console.warn('[AddressBook] 온라인 조회 실패, 로컬 캐시 사용:', error);
      return this.localCache.filter(e => e.isOnline);
    }
  }

  // 로컬 캐시 새로고침
  async refreshLocalCache(): Promise<void> {
    const teachers = await getTeachers();
    this.localCache = teachers.map(teacherToAddressBookEntry);
    console.log(`[AddressBook] 로컬 캐시 새로고침: ${this.localCache.length}명`);
  }

  // 검색 기능
  async searchEntries(query: string): Promise<AddressBookEntry[]> {
    await this.ensureInitialized();

    if (isLocalMode() || this.localCache.length > 0) {
      const lowerQuery = query.toLowerCase();
      return this.localCache.filter(e =>
        e.name.toLowerCase().includes(lowerQuery) ||
        e.email.toLowerCase().includes(lowerQuery) ||
        e.role.toLowerCase().includes(lowerQuery) ||
        e.jobTitle?.toLowerCase().includes(lowerQuery) ||
        e.workplace?.toLowerCase().includes(lowerQuery)
      );
    }

    // 원격 검색 (구현 필요시)
    const allEntries = await this.getAllEntries();
    const lowerQuery = query.toLowerCase();
    return allEntries.filter(e =>
      e.name.toLowerCase().includes(lowerQuery) ||
      e.email.toLowerCase().includes(lowerQuery)
    );
  }

  // 주소록 항목 삭제
  async deleteEntry(userId: string): Promise<boolean> {
    await this.ensureInitialized();

    // 로컬 모드
    if (isLocalMode()) {
      const index = this.localCache.findIndex(e => e.userId === userId);
      if (index !== -1) {
        this.localCache.splice(index, 1);
        return true;
      }
      return false;
    }

    try {
      const result = await electronAPI.deleteAddressBookEntry(userId) as IPCResponse<boolean>;
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete address book entry');
      }
      return result.data ?? false;
    } catch (error) {
      console.warn('[AddressBook] 삭제 실패:', error);
      return false;
    }
  }

  // 동기화되지 않은 주소록 항목들 조회
  async getUnsyncedEntries(): Promise<AddressBookEntry[]> {
    await this.ensureInitialized();

    // 로컬 모드에서는 모든 항목이 동기화되지 않은 것으로 처리
    if (isLocalMode()) {
      return this.localCache.filter(e => !e.synced);
    }

    try {
      const result = await electronAPI.getUnsyncedAddressBookEntries() as IPCResponse<AddressBookEntry[]>;
      if (!result.success) {
        throw new Error(result.error || 'Failed to get unsynced address book entries');
      }
      return result.data || [];
    } catch (error) {
      console.warn('[AddressBook] 동기화 안된 항목 조회 실패:', error);
      return this.localCache.filter(e => !e.synced);
    }
  }

  // 주소록 항목 동기화 상태 업데이트
  async markSynced(userId: string, synced: boolean = true): Promise<boolean> {
    await this.ensureInitialized();

    // 로컬 모드
    if (isLocalMode()) {
      const entry = this.localCache.find(e => e.userId === userId);
      if (entry) {
        entry.synced = synced;
        return true;
      }
      return false;
    }

    try {
      const result = await electronAPI.markAddressBookEntrySynced(userId, synced) as IPCResponse<boolean>;
      if (!result.success) {
        throw new Error(result.error || 'Failed to mark address book entry synced');
      }
      return result.data ?? false;
    } catch (error) {
      console.warn('[AddressBook] 동기화 상태 업데이트 실패:', error);
      return false;
    }
  }

  // 주소록 온라인 상태 업데이트
  async updateOnlineStatus(userId: string | undefined, isOnline: boolean, lastSeen?: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!userId) {
      throw new Error('User ID is required');
    }

    // 로컬 모드
    if (isLocalMode()) {
      const entry = this.localCache.find(e => e.userId === userId);
      if (entry) {
        entry.isOnline = isOnline;
        if (lastSeen) {
          entry.lastSeen = lastSeen;
        }
        return true;
      }
      return false;
    }

    try {
      const result = await electronAPI.updateAddressBookOnlineStatus(userId, isOnline, lastSeen) as IPCResponse<boolean>;
      if (!result.success) {
        throw new Error(result.error || 'Failed to update address book online status');
      }
      return result.data ?? false;
    } catch (error) {
      console.warn('[AddressBook] 온라인 상태 업데이트 실패:', error);
      return false;
    }
  }

  // 웹 서버와 로컬 데이터베이스 동기화
  async syncWithServer(serverData: any[]): Promise<{
    syncedCount: number;
    failedCount: number;
    syncedEntries: AddressBookEntry[];
    failedEntries: any[];
  }> {
    await this.ensureInitialized();

    // 로컬 모드에서는 서버 데이터를 캐시에 병합
    if (isLocalMode()) {
      const syncedEntries: AddressBookEntry[] = [];
      for (const data of serverData) {
        const entry = data as AddressBookEntry;
        const existingIndex = this.localCache.findIndex(e => e.userId === entry.userId);
        if (existingIndex !== -1) {
          this.localCache[existingIndex] = { ...this.localCache[existingIndex], ...entry, synced: true };
        } else {
          this.localCache.push({ ...entry, synced: true });
        }
        syncedEntries.push(entry);
      }
      return {
        syncedCount: syncedEntries.length,
        failedCount: 0,
        syncedEntries,
        failedEntries: []
      };
    }

    try {
      const result = await electronAPI.syncAddressBookWithServer(serverData) as IPCResponse<{
        syncedCount: number;
        failedCount: number;
        syncedEntries: AddressBookEntry[];
        failedEntries: any[];
      }>;
      if (!result.success) {
        throw new Error(result.error || 'Failed to sync address book with server');
      }
      return result.data!;
    } catch (error) {
      console.warn('[AddressBook] 서버 동기화 실패:', error);
      return {
        syncedCount: 0,
        failedCount: serverData.length,
        syncedEntries: [],
        failedEntries: serverData
      };
    }
  }

  // 데이터베이스 통계 조회
  async getStats(): Promise<AddressBookStats | null> {
    await this.ensureInitialized();

    // 로컬 모드
    if (isLocalMode()) {
      return {
        totalDevices: this.localCache.length,
        onlineDevices: this.localCache.filter(e => e.isOnline).length,
        syncedDevices: this.localCache.filter(e => e.synced).length,
        dbPath: 'local-memory'
      };
    }

    try {
      const result = await electronAPI.getAddressBookStats() as IPCResponse<AddressBookStats>;
      if (!result.success) {
        throw new Error(result.error || 'Failed to get address book stats');
      }
      return result.data ?? null;
    } catch (error) {
      console.warn('[AddressBook] 통계 조회 실패:', error);
      return {
        totalDevices: this.localCache.length,
        onlineDevices: this.localCache.filter(e => e.isOnline).length,
        syncedDevices: this.localCache.filter(e => e.synced).length,
        dbPath: 'local-memory (fallback)'
      };
    }
  }

  // 서버에서 주소록 데이터 가져오기
  async fetchServerAddressBook(): Promise<any[]> {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('authToken');

      if (!token) {
        throw new Error('No authentication token found');
      }

      // 개발 환경에서는 시드 계정 API 사용
      const isDevelopment = process.env.NODE_ENV === 'development';
      const endpoint = isDevelopment ? '/api/dev/seed-accounts?all=true' : '/api/address-book';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // 시드 계정 API는 인증이 필요 없을 수 있음
      if (!isDevelopment && token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${apiUrl}${endpoint}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const data = await response.json();

      let entriesArray: any[] = [];

      if (isDevelopment && data.success && data.accounts) {
        // 시드 계정 API 응답 처리
        entriesArray = data.accounts.map((account: any) => ({
          userId: account.user.id,
          name: account.user.name || account.user.username || `User ${account.user.id}`,
          email: account.user.email || '',
          phone: account.user.phone || '',
          role: account.user.role || 'UNKNOWN',
          schoolId: account.user.schoolId,
          ipAddress: '', // 시드 데이터에는 IP 정보 없음
          hostname: '',
          os: '',
          platform: '',
          lastSeen: new Date().toISOString(),
          isOnline: false, // 시드 데이터는 오프라인으로 표시
          synced: false
        }));
      } else {
        // 프로덕션 API 응답 처리
        const addressBookData = data.addressBook || [];
        entriesArray = Array.isArray(addressBookData)
          ? addressBookData
          : Object.values(addressBookData || {}).flat();

        // 로컬 데이터베이스가 필요로 하는 필드 형태로 변환
        entriesArray = entriesArray.map((entry: any) => {
          const deviceInfo = entry.currentDevice || entry.devices?.[0] || {};

          return {
            userId: entry.userId || entry.id,
            name: entry.name || '',
            email: entry.email || '',
            phone: entry.phone || entry.mobile,
            role: entry.role || 'UNKNOWN',
            schoolId: entry.schoolId,
            ipAddress: deviceInfo.ipAddress || entry.ipAddress || '',
            hostname: deviceInfo.hostname || entry.hostname || '',
            os: deviceInfo.os || entry.os || '',
            platform: deviceInfo.platform || entry.platform || '',
            lastSeen: deviceInfo.lastSeen || entry.lastLoginAt || entry.updatedAt || new Date().toISOString(),
            isOnline: Boolean(deviceInfo.isOnline ?? entry.isOnline),
            synced: true
          };
        });
      }

      return entriesArray;
    } catch (error) {
      console.error('서버 주소록 가져오기 실패:', error);
      throw error;
    }
  }

  // 서버와 로컬 데이터 동기화 (자동)
  async syncWithServerAutomatically(): Promise<void> {
    try {
      // 서버에서 최신 데이터 가져오기
      const serverData = await this.fetchServerAddressBook();

      // 로컬 데이터베이스와 동기화
      const syncResult = await this.syncWithServer(serverData);

      console.log('Address book sync completed:', syncResult);

      // 동기화 완료된 항목들을 synced로 표시
      for (const entry of syncResult.syncedEntries) {
        await this.markSynced(entry.userId, true);
      }
    } catch (error) {
      console.error('자동 주소록 동기화 실패:', error);
      throw error;
    }
  }

  // 초기화 확인 헬퍼 메소드
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// 싱글톤 인스턴스
export const addressBookService = new AddressBookService();
