import { useEffect, useRef, useCallback } from 'react';

interface UseIdleDetectionOptions {
  /** 비활성 시간 (밀리초), 기본값 5분 (300000ms) */
  timeout?: number;
  /** 비활성 상태가 되었을 때 호출되는 콜백 */
  onIdle?: () => void;
  /** 활성 상태로 돌아왔을 때 호출되는 콜백 */
  onActive?: () => void;
  /** 감지할 이벤트 목록 */
  events?: string[];
}

const DEFAULT_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
];

const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5분

export function useIdleDetection({
  timeout = DEFAULT_TIMEOUT,
  onIdle,
  onActive,
  events = DEFAULT_EVENTS,
}: UseIdleDetectionOptions = {}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef(false);

  const handleIdle = useCallback(() => {
    if (!isIdleRef.current) {
      isIdleRef.current = true;
      onIdle?.();
    }
  }, [onIdle]);

  const handleActive = useCallback(() => {
    if (isIdleRef.current) {
      isIdleRef.current = false;
      onActive?.();
    }
  }, [onActive]);

  const resetTimer = useCallback(() => {
    // 활성 상태로 전환
    handleActive();

    // 기존 타이머 클리어
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // 새 타이머 설정
    timerRef.current = setTimeout(handleIdle, timeout);
  }, [timeout, handleIdle, handleActive]);

  useEffect(() => {
    // 초기 타이머 설정
    timerRef.current = setTimeout(handleIdle, timeout);

    // 이벤트 리스너 등록
    events.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    // 클린업
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [events, resetTimer, timeout, handleIdle]);

  return {
    isIdle: isIdleRef.current,
    resetTimer,
  };
}
