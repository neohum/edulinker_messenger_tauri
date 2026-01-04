/**
 * Durable Streams 기반 메시지 스트리밍 클라이언트
 * https://github.com/durable-streams/durable-streams 프로토콜 기반
 * SSE(Server-Sent Events)를 사용한 실시간 메시지 수신
 */

import { invoke } from '@tauri-apps/api/core';

export interface StreamMessage {
  id: string;
  offset: number;
  type: 'text' | 'file' | 'image' | 'typing' | 'read_receipt' | 'delivery_receipt' | 'system' | 'presence';
  payload: {
    content?: string;
    uploadId?: string;
    filename?: string;
    fileSize?: number;
    mimeType?: string;
    isTyping?: boolean;
    messageIds?: string[];
    isOnline?: boolean;
    lastSeen?: string;
    [key: string]: any;
  };
  senderId: string;
  recipientId: string;
  timestamp: string;
}

export interface StreamEndpoints {
  endpoint: string;
  sseEndpoint: string;
  pollEndpoint: string;
}

/** 스트림 정보 */
export interface StreamInfo {
  path: string;
  mode: 'json' | 'bytes';
  currentOffset: number;
  totalBytes: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, string>;
  etag: string;
}

/** 스트림 생성 옵션 */
export interface CreateStreamOptions {
  mode?: 'json' | 'bytes';
  metadata?: Record<string, string>;
}

/** 범위 읽기 응답 */
export interface RangeReadResponse {
  messages: StreamMessage[];
  startOffset: number;
  endOffset: number;
  totalOffset: number;
  hasMore: boolean;
}

/** 스트림 헬스 정보 */
export interface StreamHealth {
  status: string;
  messageCount: number;
  currentOffset: number;
  totalBytes: number;
  etag: string;
}

export type MessageHandler = (message: StreamMessage) => void;
export type ConnectionHandler = (offset: number) => void;
export type ErrorHandler = (error: Event | Error) => void;

class StreamClient {
  private endpoints: StreamEndpoints | null = null;
  private eventSource: EventSource | null = null;
  private userId: string = '';
  private lastOffset: number = 0;
  private lastEtag: string = '';
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;

  /**
   * 클라이언트 초기화
   */
  async init(): Promise<void> {
    try {
      const result = await invoke<{ success: boolean } & StreamEndpoints>('streams_get_endpoint');
      if (result.success) {
        this.endpoints = {
          endpoint: result.endpoint,
          sseEndpoint: result.sseEndpoint,
          pollEndpoint: result.pollEndpoint,
        };
        console.log('[StreamClient] Initialized with endpoints:', this.endpoints);
      }
    } catch (error) {
      console.error('[StreamClient] Failed to initialize:', error);
    }
  }

  /**
   * SSE 스트림 연결
   */
  connect(userId: string, withUser?: string, fromOffset?: number): void {
    if (!this.endpoints) {
      throw new Error('StreamClient not initialized. Call init() first.');
    }

    this.userId = userId;
    if (fromOffset !== undefined) {
      this.lastOffset = fromOffset;
    }

    // 기존 연결 정리
    this.disconnect();

    // SSE URL 구성
    let url = `${this.endpoints.sseEndpoint}?offset=${this.lastOffset}`;
    if (withUser) {
      url += `&with_user=${encodeURIComponent(withUser)}`;
    }

    console.log('[StreamClient] Connecting to:', url);

    this.eventSource = new EventSource(url);

    // 헤더 설정을 위해 fetch + ReadableStream 사용 필요
    // (EventSource는 커스텀 헤더를 지원하지 않음)
    // 대안: Long-poll 사용 또는 Tauri IPC 사용

    this.eventSource.onopen = () => {
      console.log('[StreamClient] Connected');
      this.reconnectAttempts = 0;
    };

    this.eventSource.addEventListener('connected', (event) => {
      const data = JSON.parse(event.data);
      this.lastOffset = data.offset;
      this.connectionHandlers.forEach((handler) => handler(data.offset));
    });

    this.eventSource.addEventListener('message', (event) => {
      try {
        const message: StreamMessage = JSON.parse(event.data);
        this.lastOffset = message.offset;
        this.messageHandlers.forEach((handler) => handler(message));
      } catch (error) {
        console.error('[StreamClient] Failed to parse message:', error);
      }
    });

    this.eventSource.addEventListener('heartbeat', () => {
      // 하트비트 수신 - 연결 유지 확인
    });

    this.eventSource.addEventListener('reset', () => {
      // 메시지 누락 - 재동기화 필요
      console.warn('[StreamClient] Reset received, resynchronizing...');
      this.resync();
    });

    this.eventSource.onerror = (error) => {
      console.error('[StreamClient] Connection error:', error);
      this.errorHandlers.forEach((handler) => handler(error));
      this.handleReconnect(withUser);
    };
  }

  /**
   * 연결 해제
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * 재연결 처리
   */
  private handleReconnect(withUser?: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[StreamClient] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[StreamClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect(this.userId, withUser, this.lastOffset);
    }, delay);
  }

  /**
   * 재동기화
   */
  private async resync(): Promise<void> {
    // 마지막 오프셋부터 메시지 다시 가져오기
    try {
      const messages = await this.getMessages(this.userId, undefined, this.lastOffset);
      messages.forEach((msg) => {
        this.messageHandlers.forEach((handler) => handler(msg));
      });
    } catch (error) {
      console.error('[StreamClient] Resync failed:', error);
    }
  }

  /**
   * 메시지 전송 (IPC 사용)
   */
  async sendMessage(
    recipientId: string,
    content: string,
    type: string = 'text'
  ): Promise<{ success: boolean; message?: { id: string; offset: number; timestamp: string }; error?: string }> {
    return await invoke('streams_send_message', {
      senderId: this.userId,
      recipientId,
      content,
      msgType: type,
    });
  }

  /**
   * 메시지 조회 (IPC 사용)
   */
  async getMessages(
    userId: string,
    otherUserId?: string,
    fromOffset?: number,
    limit?: number
  ): Promise<StreamMessage[]> {
    const result = await invoke<{
      success: boolean;
      messages: StreamMessage[];
      nextOffset: number;
      error?: string;
    }>('streams_get_messages', {
      userId,
      otherUserId,
      fromOffset,
      limit,
    });

    if (result.success) {
      return result.messages;
    }
    throw new Error(result.error || 'Failed to get messages');
  }

  /**
   * 현재 오프셋 조회
   */
  async getCurrentOffset(): Promise<number> {
    const result = await invoke<{ success: boolean; offset: number }>('streams_get_current_offset');
    if (result.success) {
      return result.offset;
    }
    return 0;
  }

  /**
   * 메시지 핸들러 등록
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * 연결 핸들러 등록
   */
  onConnect(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  /**
   * 에러 핸들러 등록
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Long-poll 방식으로 메시지 조회 (SSE 대안)
   */
  async poll(userId: string, otherUserId?: string, timeoutSecs: number = 30): Promise<{
    messages: StreamMessage[];
    nextOffset: number;
    hasMore: boolean;
  }> {
    if (!this.endpoints) {
      throw new Error('StreamClient not initialized');
    }

    const url = new URL(this.endpoints.pollEndpoint);
    url.searchParams.set('offset', this.lastOffset.toString());
    url.searchParams.set('timeout_secs', timeoutSecs.toString());
    if (otherUserId) {
      url.searchParams.set('with_user', otherUserId);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      throw new Error(`Poll failed: ${response.status}`);
    }

    const data = await response.json();
    if (data.messages.length > 0) {
      this.lastOffset = data.nextOffset;
    }
    return data;
  }

  /**
   * 현재 사용자 ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * 마지막 오프셋
   */
  getLastOffset(): number {
    return this.lastOffset;
  }

  /**
   * 연결 상태
   */
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  // ============================================
  // Durable Streams 프로토콜 확장 API
  // ============================================

  /**
   * 스트림 생성 (PUT /streams/:path)
   */
  async createStream(path: string, options: CreateStreamOptions = {}): Promise<StreamInfo> {
    if (!this.endpoints) {
      throw new Error('StreamClient not initialized');
    }

    const response = await fetch(`${this.endpoints.endpoint}/streams/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-None-Match': '*', // 이미 존재하면 실패
      },
      body: JSON.stringify({
        mode: options.mode || 'json',
        metadata: options.metadata || {},
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to create stream');
    }
    return data.stream;
  }

  /**
   * 스트림 조회 (GET /streams/:path)
   */
  async getStream(path: string): Promise<StreamInfo | null> {
    if (!this.endpoints) {
      throw new Error('StreamClient not initialized');
    }

    const response = await fetch(`${this.endpoints.endpoint}/streams/${encodeURIComponent(path)}`, {
      headers: this.lastEtag ? { 'If-None-Match': this.lastEtag } : {},
    });

    if (response.status === 304) {
      return null; // Not Modified
    }

    if (response.status === 404) {
      return null;
    }

    const etag = response.headers.get('ETag');
    if (etag) {
      this.lastEtag = etag;
    }

    return await response.json();
  }

  /**
   * 스트림 목록 조회 (GET /streams)
   */
  async listStreams(): Promise<{ streams: StreamInfo[]; total: number }> {
    if (!this.endpoints) {
      throw new Error('StreamClient not initialized');
    }

    const response = await fetch(`${this.endpoints.endpoint}/streams`);
    if (!response.ok) {
      throw new Error(`Failed to list streams: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * 스트림 삭제 (DELETE /streams/:path)
   */
  async deleteStream(path: string): Promise<boolean> {
    if (!this.endpoints) {
      throw new Error('StreamClient not initialized');
    }

    const response = await fetch(`${this.endpoints.endpoint}/streams/${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    return data.success;
  }

  /**
   * 스트림 정보 조회 (기본 스트림)
   */
  async getStreamInfo(): Promise<StreamInfo> {
    if (!this.endpoints) {
      throw new Error('StreamClient not initialized');
    }

    const response = await fetch(`${this.endpoints.endpoint}/info`);
    if (!response.ok) {
      throw new Error(`Failed to get stream info: ${response.status}`);
    }

    const etag = response.headers.get('ETag');
    if (etag) {
      this.lastEtag = etag;
    }

    return await response.json();
  }

  /**
   * 범위 기반 메시지 조회 (Range 헤더 지원)
   */
  async getMessagesRange(
    startOffset: number,
    endOffset?: number,
    limit: number = 50
  ): Promise<RangeReadResponse> {
    if (!this.endpoints) {
      throw new Error('StreamClient not initialized');
    }

    const headers: Record<string, string> = {};

    // Range 헤더 설정
    if (endOffset !== undefined) {
      headers['Range'] = `offset=${startOffset}-${endOffset}`;
    } else {
      headers['Range'] = `offset=${startOffset}-`;
    }

    // 조건부 요청 (ETag)
    if (this.lastEtag) {
      headers['If-None-Match'] = this.lastEtag;
    }

    const url = new URL(`${this.endpoints.endpoint}/messages`);
    url.searchParams.set('offset', startOffset.toString());
    url.searchParams.set('limit', limit.toString());

    const response = await fetch(url.toString(), { headers });

    if (response.status === 304) {
      // Not Modified - 빈 응답 반환
      return {
        messages: [],
        startOffset,
        endOffset: startOffset,
        totalOffset: this.lastOffset,
        hasMore: false,
      };
    }

    const etag = response.headers.get('ETag');
    if (etag) {
      this.lastEtag = etag;
    }

    return await response.json();
  }

  /**
   * 메시지 삭제
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    if (!this.endpoints) {
      throw new Error('StreamClient not initialized');
    }

    const response = await fetch(`${this.endpoints.endpoint}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    return data.success;
  }

  /**
   * 스트림 헬스 체크
   */
  async checkHealth(): Promise<StreamHealth> {
    if (!this.endpoints) {
      throw new Error('StreamClient not initialized');
    }

    const response = await fetch(`${this.endpoints.endpoint}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      status: data.status,
      messageCount: data.message_count,
      currentOffset: data.current_offset,
      totalBytes: data.total_bytes,
      etag: data.etag,
    };
  }

  /**
   * ETag 조회
   */
  getLastEtag(): string {
    return this.lastEtag;
  }

  /**
   * ETag 설정
   */
  setLastEtag(etag: string): void {
    this.lastEtag = etag;
  }
}

// 싱글톤 인스턴스
export const streamClient = new StreamClient();
