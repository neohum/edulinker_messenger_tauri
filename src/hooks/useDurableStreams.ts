/**
 * Durable Streams 통합 훅
 * https://github.com/durable-streams/durable-streams 프로토콜 기반
 * MessagingPanel에서 사용할 수 있는 메시지 스트리밍 기능 제공
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  streamClient,
  StreamMessage,
  StreamInfo,
  StreamHealth,
  RangeReadResponse,
} from '../services/streamClient';
import { useAuthStore } from '../store/auth';

export interface UseDurableStreamsOptions {
  /** 특정 사용자와의 대화만 구독 */
  withUser?: string;
  /** 시작 오프셋 */
  fromOffset?: number;
  /** SSE 대신 Long-poll 사용 */
  useLongPoll?: boolean;
  /** Long-poll 간격 (초) */
  pollInterval?: number;
}

export interface UseDurableStreamsReturn {
  /** 수신된 메시지 목록 */
  messages: StreamMessage[];
  /** 연결 상태 */
  isConnected: boolean;
  /** 초기화 상태 */
  isInitialized: boolean;
  /** 로딩 상태 */
  isLoading: boolean;
  /** 에러 */
  error: Error | null;
  /** 현재 오프셋 */
  currentOffset: number;
  /** 스트림 정보 */
  streamInfo: StreamInfo | null;
  /** 스트림 헬스 */
  streamHealth: StreamHealth | null;
  /** 메시지 전송 */
  sendMessage: (recipientId: string, content: string, type?: string) => Promise<boolean>;
  /** 타이핑 표시 전송 */
  sendTyping: (recipientId: string, isTyping: boolean) => Promise<void>;
  /** 읽음 확인 전송 */
  sendReadReceipt: (recipientId: string, messageIds: string[]) => Promise<void>;
  /** 히스토리 로드 */
  loadHistory: (limit?: number) => Promise<void>;
  /** 범위 기반 메시지 로드 */
  loadRange: (startOffset: number, endOffset?: number, limit?: number) => Promise<RangeReadResponse | null>;
  /** 메시지 삭제 */
  deleteMessage: (messageId: string) => Promise<boolean>;
  /** 스트림 정보 새로고침 */
  refreshStreamInfo: () => Promise<void>;
  /** 헬스 체크 */
  checkHealth: () => Promise<void>;
  /** 재연결 */
  reconnect: () => void;
  /** 연결 해제 */
  disconnect: () => void;
}

export function useDurableStreams(options: UseDurableStreamsOptions = {}): UseDurableStreamsReturn {
  const { user } = useAuthStore();
  const { withUser, fromOffset = 0, useLongPoll = false, pollInterval = 30 } = options;

  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentOffset, setCurrentOffset] = useState(fromOffset);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [streamHealth, setStreamHealth] = useState<StreamHealth | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 클라이언트 초기화
  useEffect(() => {
    const init = async () => {
      try {
        await streamClient.init();
        setIsInitialized(true);
        console.log('[useDurableStreams] Initialized');
      } catch (err) {
        console.error('[useDurableStreams] Init failed:', err);
        setError(err instanceof Error ? err : new Error('Init failed'));
      }
    };
    init();
  }, []);

  // 메시지 핸들러
  const handleMessage = useCallback((message: StreamMessage) => {
    setMessages((prev) => {
      // 중복 방지
      if (prev.some((m) => m.id === message.id)) {
        return prev;
      }
      return [...prev, message].sort((a, b) => a.offset - b.offset);
    });
    setCurrentOffset(message.offset);
  }, []);

  // SSE 연결
  useEffect(() => {
    if (!isInitialized || !user?.id || useLongPoll) return;

    // 메시지 핸들러 등록
    const unsubMessage = streamClient.onMessage(handleMessage);

    // 연결 핸들러 등록
    const unsubConnect = streamClient.onConnect((offset) => {
      setIsConnected(true);
      setCurrentOffset(offset);
    });

    // 에러 핸들러 등록
    const unsubError = streamClient.onError((err) => {
      setIsConnected(false);
      setError(err instanceof Error ? err : new Error('Connection error'));
    });

    // 연결
    streamClient.connect(user.id, withUser, fromOffset);

    return () => {
      unsubMessage();
      unsubConnect();
      unsubError();
      streamClient.disconnect();
    };
  }, [isInitialized, user?.id, withUser, fromOffset, useLongPoll, handleMessage]);

  // Long-poll 모드
  useEffect(() => {
    if (!isInitialized || !user?.id || !useLongPoll) return;

    const poll = async () => {
      try {
        const result = await streamClient.poll(user.id, withUser, pollInterval);
        result.messages.forEach(handleMessage);
        setIsConnected(true);
      } catch (err) {
        console.error('[useDurableStreams] Poll error:', err);
        setError(err instanceof Error ? err : new Error('Poll failed'));
      }
    };

    // 초기 poll
    poll();

    // 주기적 poll
    pollIntervalRef.current = setInterval(poll, pollInterval * 1000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isInitialized, user?.id, withUser, useLongPoll, pollInterval, handleMessage]);

  // 메시지 전송
  const sendMessage = useCallback(
    async (recipientId: string, content: string, type: string = 'text'): Promise<boolean> => {
      if (!user?.id) return false;

      try {
        const result = await streamClient.sendMessage(recipientId, content, type);
        return result.success;
      } catch (err) {
        console.error('[useDurableStreams] Send failed:', err);
        return false;
      }
    },
    [user?.id]
  );

  // 타이핑 표시 전송
  const sendTyping = useCallback(
    async (recipientId: string, isTyping: boolean): Promise<void> => {
      if (!user?.id) return;

      try {
        await streamClient.sendMessage(
          recipientId,
          JSON.stringify({ isTyping }),
          'typing'
        );
      } catch (err) {
        console.error('[useDurableStreams] Send typing failed:', err);
      }
    },
    [user?.id]
  );

  // 읽음 확인 전송
  const sendReadReceipt = useCallback(
    async (recipientId: string, messageIds: string[]): Promise<void> => {
      if (!user?.id || messageIds.length === 0) return;

      try {
        await streamClient.sendMessage(
          recipientId,
          JSON.stringify({ messageIds, readAt: new Date().toISOString() }),
          'read_receipt'
        );
      } catch (err) {
        console.error('[useDurableStreams] Send read receipt failed:', err);
      }
    },
    [user?.id]
  );

  // 히스토리 로드
  const loadHistory = useCallback(
    async (limit: number = 50): Promise<void> => {
      if (!user?.id) return;

      setIsLoading(true);
      try {
        const history = await streamClient.getMessages(user.id, withUser, 0, limit);
        setMessages(history);
        if (history.length > 0) {
          setCurrentOffset(history[history.length - 1].offset);
        }
      } catch (err) {
        console.error('[useDurableStreams] Load history failed:', err);
        setError(err instanceof Error ? err : new Error('Load history failed'));
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id, withUser]
  );

  // 범위 기반 메시지 로드
  const loadRange = useCallback(
    async (
      startOffset: number,
      endOffset?: number,
      limit: number = 50
    ): Promise<RangeReadResponse | null> => {
      try {
        const response = await streamClient.getMessagesRange(startOffset, endOffset, limit);
        // 새 메시지를 기존 목록에 병합
        if (response.messages.length > 0) {
          setMessages((prev) => {
            const combined = [...prev, ...response.messages];
            // 중복 제거 및 정렬
            const unique = combined.filter(
              (msg, index, self) => index === self.findIndex((m) => m.id === msg.id)
            );
            return unique.sort((a, b) => a.offset - b.offset);
          });
          setCurrentOffset(response.endOffset);
        }
        return response;
      } catch (err) {
        console.error('[useDurableStreams] Load range failed:', err);
        setError(err instanceof Error ? err : new Error('Load range failed'));
        return null;
      }
    },
    []
  );

  // 메시지 삭제
  const deleteMessage = useCallback(async (messageId: string): Promise<boolean> => {
    try {
      const deleted = await streamClient.deleteMessage(messageId);
      if (deleted) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
      return deleted;
    } catch (err) {
      console.error('[useDurableStreams] Delete message failed:', err);
      return false;
    }
  }, []);

  // 스트림 정보 새로고침
  const refreshStreamInfo = useCallback(async (): Promise<void> => {
    try {
      const info = await streamClient.getStreamInfo();
      setStreamInfo(info);
    } catch (err) {
      console.error('[useDurableStreams] Refresh stream info failed:', err);
    }
  }, []);

  // 헬스 체크
  const checkHealth = useCallback(async (): Promise<void> => {
    try {
      const health = await streamClient.checkHealth();
      setStreamHealth(health);
    } catch (err) {
      console.error('[useDurableStreams] Health check failed:', err);
    }
  }, []);

  // 재연결
  const reconnect = useCallback(() => {
    if (!user?.id) return;

    if (useLongPoll) {
      // Long-poll 재시작
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      // 재귀적으로 시작됨 (useEffect)
    } else {
      streamClient.connect(user.id, withUser, currentOffset);
    }
  }, [user?.id, withUser, currentOffset, useLongPoll]);

  // 연결 해제
  const disconnect = useCallback(() => {
    if (useLongPoll) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    } else {
      streamClient.disconnect();
    }
    setIsConnected(false);
  }, [useLongPoll]);

  return {
    messages,
    isConnected,
    isInitialized,
    isLoading,
    error,
    currentOffset,
    streamInfo,
    streamHealth,
    sendMessage,
    sendTyping,
    sendReadReceipt,
    loadHistory,
    loadRange,
    deleteMessage,
    refreshStreamInfo,
    checkHealth,
    reconnect,
    disconnect,
  };
}

export default useDurableStreams;
