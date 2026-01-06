// 데이터 서비스 - 로컬/원격 모드에 따라 데이터 소스 전환
// .env의 VITE_APP_MODE에 따라 동작

import { getAppConfig, checkServerConnection } from './appConfig';

export interface Teacher {
  id: string;
  email?: string;
  name?: string;
  role?: 'TEACHER' | 'ADMIN' | string;
  grade?: number;
  class?: string;
  classroom?: string;
  workplace?: string;
  jobTitle?: string;
  adminDuties?: string;
  subjects?: string[];
  extensionNumber?: string;
  phoneNumber?: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  content: string;
  type: 'text' | 'file' | 'image';
  timestamp: string;
  isRead: boolean;
  delivered: boolean;
  readAt?: string;
  deliveredAt?: string;
}

// 캐시된 데이터
let cachedTeachers: Teacher[] | null = null;
let cachedMessages: Map<string, Message[]> = new Map();

// 초기화 상태
let isInitialized = false;

// 데이터 서비스 초기화
export async function initializeDataService(): Promise<void> {
  if (isInitialized) return;

  const config = getAppConfig();
  console.log(`[DataService] 초기화 - 모드: ${config.appMode}`);

  if (config.appMode === 'hybrid' || config.appMode === 'remote') {
    // 서버 연결 시도
    const isConnected = await checkServerConnection();
    console.log(`[DataService] 서버 연결 상태: ${isConnected ? '연결됨' : '연결 안됨'}`);
  }

  isInitialized = true;
}

// 교사 목록 조회
export async function getTeachers(): Promise<Teacher[]> {
  const config = getAppConfig();

  // 1. 원격 모드: 서버에서 가져오기 시도
  if (config.appMode === 'remote' || config.appMode === 'hybrid') {
    try {
      const isConnected = await checkServerConnection();
      if (isConnected) {
        const response = await fetch(`${config.apiUrl}/api/teachers`, {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const teachers = data.teachers || [];
          cachedTeachers = teachers;
          return teachers;
        }
      }
    } catch (error) {
      console.warn('[DataService] 서버에서 교사 목록 가져오기 실패:', error);
    }

    // 하이브리드 모드에서 서버 실패 시 로컬 폴백
    if (config.appMode === 'hybrid') {
      console.log('[DataService] 로컬 캐시로 폴백');
    }
  }

  // 2. 로컬/폴백: 캐시된 데이터만 사용
  return cachedTeachers || [];
}

// 교사 검색
export async function searchTeachers(query: string): Promise<Teacher[]> {
  const teachers = await getTeachers();
  const lowerQuery = query.toLowerCase();

  return teachers.filter(teacher =>
    teacher.name.toLowerCase().includes(lowerQuery) ||
    teacher.email.toLowerCase().includes(lowerQuery) ||
    teacher.jobTitle?.toLowerCase().includes(lowerQuery) ||
    teacher.workplace?.toLowerCase().includes(lowerQuery) ||
    teacher.adminDuties?.toLowerCase().includes(lowerQuery)
  );
}

// 역할별 교사 조회
export async function getTeachersByRole(role: 'TEACHER' | 'ADMIN'): Promise<Teacher[]> {
  const teachers = await getTeachers();
  return teachers.filter(teacher => teacher.role === role);
}

// 학년별 담임교사 조회
export async function getTeachersByGrade(grade: number): Promise<Teacher[]> {
  const teachers = await getTeachers();
  return teachers.filter(teacher => teacher.grade === grade);
}

// 온라인 교사 조회
export async function getOnlineTeachers(): Promise<Teacher[]> {
  const teachers = await getTeachers();
  return teachers.filter(teacher => teacher.isOnline);
}

// 특정 교사 조회
export async function getTeacherById(id: string): Promise<Teacher | null> {
  const teachers = await getTeachers();
  return teachers.find(teacher => teacher.id === id) || null;
}

// 메시지 조회
export async function getMessages(userId: string, contactId: string): Promise<Message[]> {
  const config = getAppConfig();
  const cacheKey = `${userId}-${contactId}`;

  // 1. 원격 모드: 서버에서 가져오기
  if (config.appMode === 'remote' || config.appMode === 'hybrid') {
    try {
      const isConnected = await checkServerConnection();
      if (isConnected) {
        const response = await fetch(
          `${config.apiUrl}/api/messages?userId=${userId}&contactId=${contactId}`,
          {
            headers: {
              'Authorization': `Bearer ${getAuthToken()}`
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          return data.messages || [];
        }
      }
    } catch (error) {
      console.warn('[DataService] 서버에서 메시지 가져오기 실패:', error);
    }
  }

  // 2. 로컬/폴백: 캐시된 메시지만 반환
  return cachedMessages.get(cacheKey) || [];
}

// 메시지 전송
export async function sendMessage(
  senderId: string,
  recipientId: string,
  content: string,
  type: 'text' | 'file' | 'image' = 'text'
): Promise<{ success: boolean; message?: Message; error?: string }> {
  const config = getAppConfig();

  // 1. 원격 모드: 서버로 전송 시도
  if (config.appMode === 'remote' || config.appMode === 'hybrid') {
    try {
      const isConnected = await checkServerConnection();
      if (isConnected) {
        const response = await fetch(`${config.apiUrl}/api/messages/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
          },
          body: JSON.stringify({ senderId, recipientId, content, type })
        });

        if (response.ok) {
          const data = await response.json();
          return { success: true, message: data.message };
        }
      }
    } catch (error) {
      console.warn('[DataService] 서버로 메시지 전송 실패:', error);
    }

    // 하이브리드 모드에서 실패 시 로컬 저장
    if (config.appMode === 'hybrid') {
      console.log('[DataService] 로컬에 메시지 저장 (오프라인 큐)');
    }
  }

  // 2. 로컬: 캐시에 저장
  const sender = await getTeacherById(senderId);
  const newMessage: Message = {
    id: `msg-${Date.now()}`,
    senderId,
    senderName: sender?.name || '나',
    recipientId,
    content,
    type,
    timestamp: new Date().toISOString(),
    isRead: false,
    delivered: true
  };

  const cacheKey = `${senderId}-${recipientId}`;
  const existing = cachedMessages.get(cacheKey) || [];
  cachedMessages.set(cacheKey, [...existing, newMessage]);

  return { success: true, message: newMessage };
}

// 헬퍼: 인증 토큰 가져오기
function getAuthToken(): string {
  // Zustand store나 localStorage에서 토큰 가져오기
  try {
    const authData = localStorage.getItem('auth-storage');
    if (authData) {
      const parsed = JSON.parse(authData);
      return parsed.state?.token || '';
    }
  } catch (error) {
    console.warn('[DataService] 토큰 가져오기 실패:', error);
  }
  return '';
}

// 데이터 새로고침
export async function refreshData(): Promise<void> {
  cachedTeachers = null;
  cachedMessages.clear();
  isInitialized = false;
  await initializeDataService();
}

// 로컬 캐시 초기화 (재생성 없이 비움)
export function clearLocalData(): void {
  cachedTeachers = [];
  cachedMessages.clear();
  isInitialized = true;
}

// 통계 정보
export async function getDataStats(): Promise<{
  totalTeachers: number;
  onlineTeachers: number;
  admins: number;
  mode: string;
  serverConnected: boolean;
}> {
  const config = getAppConfig();
  const teachers = await getTeachers();
  const isConnected = await checkServerConnection();

  return {
    totalTeachers: teachers.length,
    onlineTeachers: teachers.filter(t => t.isOnline).length,
    admins: teachers.filter(t => t.role === 'ADMIN').length,
    mode: config.appMode,
    serverConnected: isConnected
  };
}
