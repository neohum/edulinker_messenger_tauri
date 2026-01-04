import { create } from 'zustand';

/** 시간 범위 설정 */
export interface TimeRange {
  start: string; // HH:mm 형식
  end: string;   // HH:mm 형식
  label?: string; // 교시 이름 (선택)
}

/** 대상 선택 시 기본 동작 */
export type DefaultContactAction = 'ask' | 'message' | 'chat';

/** 수업 시간 프리셋 */
export const CLASS_TIME_PRESETS: { name: string; times: TimeRange[] }[] = [
  {
    name: '초등학교 기본',
    times: [
      { start: '09:00', end: '09:40', label: '1교시' },
      { start: '09:50', end: '10:30', label: '2교시' },
      { start: '10:40', end: '11:20', label: '3교시' },
      { start: '11:30', end: '12:10', label: '4교시' },
      { start: '13:10', end: '13:50', label: '5교시' },
      { start: '14:00', end: '14:40', label: '6교시' },
    ],
  },
  {
    name: '중고등학교 기본',
    times: [
      { start: '09:00', end: '09:45', label: '1교시' },
      { start: '09:55', end: '10:40', label: '2교시' },
      { start: '10:50', end: '11:35', label: '3교시' },
      { start: '11:45', end: '12:30', label: '4교시' },
      { start: '13:30', end: '14:15', label: '5교시' },
      { start: '14:25', end: '15:10', label: '6교시' },
      { start: '15:20', end: '16:05', label: '7교시' },
    ],
  },
  {
    name: '사용자 정의',
    times: [],
  },
];

interface MessageSettingsState {
  /** 수업 시간대 (이 시간에는 메시지 발송 제한) */
  classTimes: TimeRange[];
  /** 선택된 프리셋 인덱스 */
  selectedPresetIndex: number;
  /** 메시지 발송 제한 활성화 여부 */
  isRestrictionEnabled: boolean;
  /** 긴급 메시지 알림음 활성화 */
  urgentNotificationSound: boolean;
  /** 대상 선택 시 기본 동작 (ask: 매번 물어보기, message: 메시지, chat: 채팅) */
  defaultContactAction: DefaultContactAction;

  /** 설정 불러오기 */
  loadSettings: () => Promise<void>;
  /** 수업 시간 설정 */
  setClassTimes: (times: TimeRange[]) => Promise<void>;
  /** 프리셋 선택 */
  selectPreset: (index: number) => Promise<void>;
  /** 발송 제한 활성화/비활성화 */
  setRestrictionEnabled: (enabled: boolean) => Promise<void>;
  /** 긴급 알림음 설정 */
  setUrgentNotificationSound: (enabled: boolean) => Promise<void>;
  /** 기본 동작 설정 */
  setDefaultContactAction: (action: DefaultContactAction) => Promise<void>;
  /** 현재 시간이 발송 가능 시간인지 확인 (수업 시간이 아닌 경우) */
  isAllowedTime: () => boolean;
  /** 현재 수업 중인지 확인 */
  isClassTime: () => boolean;
  /** 현재 수업 정보 가져오기 */
  getCurrentClass: () => TimeRange | null;
  /** 다음 쉬는 시간 (현재 수업 종료 시간) 가져오기 */
  getNextBreakTime: () => string | null;
  /** 오늘의 쉬는 시간 목록 가져오기 (예약 발송용) */
  getBreakTimeSlots: () => { label: string; time: string; dateTime: string }[];
}

export const useMessageSettingsStore = create<MessageSettingsState>((set, get) => ({
  classTimes: CLASS_TIME_PRESETS[0].times,
  selectedPresetIndex: 0,
  isRestrictionEnabled: true,
  urgentNotificationSound: true,
  defaultContactAction: 'ask',

  loadSettings: async () => {
    try {
      const result = await window.electronAPI?.getSettings?.('messageSettings');
      if (result?.success && result.data) {
        const settings = JSON.parse(result.data);
        set({
          classTimes: settings.classTimes || settings.breakTimes || CLASS_TIME_PRESETS[0].times,
          selectedPresetIndex: settings.selectedPresetIndex ?? 0,
          isRestrictionEnabled: settings.isRestrictionEnabled ?? true,
          urgentNotificationSound: settings.urgentNotificationSound ?? true,
          defaultContactAction: settings.defaultContactAction ?? 'ask',
        });
      }
    } catch (error) {
      console.error('메시지 설정 로드 실패:', error);
    }
  },

  setClassTimes: async (times) => {
    set({ classTimes: times, selectedPresetIndex: CLASS_TIME_PRESETS.length - 1 }); // 사용자 정의
    await saveSettings(get());
  },

  selectPreset: async (index) => {
    if (index >= 0 && index < CLASS_TIME_PRESETS.length) {
      set({
        selectedPresetIndex: index,
        classTimes: index === CLASS_TIME_PRESETS.length - 1
          ? get().classTimes
          : CLASS_TIME_PRESETS[index].times,
      });
      await saveSettings(get());
    }
  },

  setRestrictionEnabled: async (enabled) => {
    set({ isRestrictionEnabled: enabled });
    await saveSettings(get());
  },

  setDefaultContactAction: async (action) => {
    set({ defaultContactAction: action });
    await saveSettings(get());
  },

  setUrgentNotificationSound: async (enabled) => {
    set({ urgentNotificationSound: enabled });
    await saveSettings(get());
  },

  isClassTime: () => {
    const state = get();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return state.classTimes.some((range) => {
      const [startH, startM] = range.start.split(':').map(Number);
      const [endH, endM] = range.end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    });
  },

  getCurrentClass: () => {
    const state = get();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return state.classTimes.find((range) => {
      const [startH, startM] = range.start.split(':').map(Number);
      const [endH, endM] = range.end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }) || null;
  },

  isAllowedTime: () => {
    const state = get();
    if (!state.isRestrictionEnabled) return true;

    // 수업 시간이 아니면 발송 가능
    return !state.isClassTime();
  },

  getNextBreakTime: () => {
    const state = get();
    if (!state.isRestrictionEnabled) return null;

    const currentClass = state.getCurrentClass();
    if (currentClass) {
      return currentClass.end;
    }

    return null;
  },

  getBreakTimeSlots: () => {
    const state = get();
    const slots: { label: string; time: string; dateTime: string }[] = [];

    // 한국 시간(KST, UTC+9) 기준으로 현재 시간 계산
    const now = new Date();
    const kstFormatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = kstFormatter.formatToParts(now);
    const kstYear = parts.find(p => p.type === 'year')?.value || '';
    const kstMonth = parts.find(p => p.type === 'month')?.value || '';
    const kstDay = parts.find(p => p.type === 'day')?.value || '';
    const kstHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const kstMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

    const today = `${kstYear}-${kstMonth}-${kstDay}`;
    const currentMinutes = kstHour * 60 + kstMinute;
    const nowTime = `${String(kstHour).padStart(2, '0')}:${String(kstMinute).padStart(2, '0')}`;

    // 수업 시간 가져오기 (설정이 비어있으면 기본 프리셋 사용)
    const classTimesToUse = state.classTimes.length > 0
      ? state.classTimes
      : CLASS_TIME_PRESETS[0].times;

    // 수업 시간을 시간순으로 정렬
    const sortedClasses = [...classTimesToUse].sort((a, b) => {
      const [aH, aM] = a.start.split(':').map(Number);
      const [bH, bM] = b.start.split(':').map(Number);
      return (aH * 60 + aM) - (bH * 60 + bM);
    });

    // 현재 수업 중인지 확인
    const isInClass = sortedClasses.some((range) => {
      const [startH, startM] = range.start.split(':').map(Number);
      const [endH, endM] = range.end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    });

    // 1. 지금 바로 보내기 (수업 시간이 아닐 때)
    if (!isInClass) {
      slots.push({
        label: `지금 바로 (${nowTime})`,
        time: nowTime,
        dateTime: `${today}T${nowTime}`,
      });
    }

    // 2. 오늘 남은 쉬는 시간들 (모든 수업 후 쉬는 시간 표시)
    console.log('[getBreakTimeSlots] 현재 시간(분):', currentMinutes, '수업 수:', sortedClasses.length);

    for (let i = 0; i < sortedClasses.length; i++) {
      const classItem = sortedClasses[i];
      const nextClass = sortedClasses[i + 1];

      const [endH, endM] = classItem.end.split(':').map(Number);
      const endMinutes = endH * 60 + endM;

      console.log(`[getBreakTimeSlots] ${classItem.label}: 종료=${classItem.end}(${endMinutes}분), 현재=${currentMinutes}분, 이후여부=${endMinutes > currentMinutes}`);

      // 현재 시간 이후만 추가
      if (endMinutes > currentMinutes) {
        if (nextClass) {
          const [nextStartH, nextStartM] = nextClass.start.split(':').map(Number);
          const nextStartMinutes = nextStartH * 60 + nextStartM;
          const gap = nextStartMinutes - endMinutes;

          console.log(`[getBreakTimeSlots] 다음 수업: ${nextClass.label}, 시작=${nextClass.start}(${nextStartMinutes}분), 간격=${gap}분`);

          // 수업 간 간격이 있으면 쉬는 시간으로 추가
          if (gap > 0) {
            const gapLabel = gap >= 30 ? '점심시간' : '쉬는 시간';
            slots.push({
              label: `${classItem.label || `${i + 1}교시`} 후 ${gapLabel} (${classItem.end}~${nextClass.start})`,
              time: classItem.end,
              dateTime: `${today}T${classItem.end}`,
            });
          }
        } else {
          // 마지막 수업 종료 후
          slots.push({
            label: `${classItem.label || `${i + 1}교시`} 종료 후 (${classItem.end})`,
            time: classItem.end,
            dateTime: `${today}T${classItem.end}`,
          });
        }
      }
    }

    console.log('[getBreakTimeSlots] 오늘 슬롯:', slots.length);

    // 3. 내일 옵션 추가 (한국 시간 기준)
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowParts = kstFormatter.formatToParts(tomorrowDate);
    const tomorrowYear = tomorrowParts.find(p => p.type === 'year')?.value || '';
    const tomorrowMonth = tomorrowParts.find(p => p.type === 'month')?.value || '';
    const tomorrowDay = tomorrowParts.find(p => p.type === 'day')?.value || '';
    const tomorrowStr = `${tomorrowYear}-${tomorrowMonth}-${tomorrowDay}`;

    if (sortedClasses.length > 0) {
      // 내일 첫 수업 시작 10분 전
      const firstClass = sortedClasses[0];
      const [startH, startM] = firstClass.start.split(':').map(Number);
      const totalMinutes = startH * 60 + startM - 10;
      const beforeH = Math.floor(totalMinutes / 60);
      const beforeM = totalMinutes % 60;
      const beforeFirst = `${String(beforeH).padStart(2, '0')}:${String(beforeM).padStart(2, '0')}`;

      slots.push({
        label: `내일 아침 ${firstClass.label || '1교시'} 시작 10분 전 (${beforeFirst})`,
        time: beforeFirst,
        dateTime: `${tomorrowStr}T${beforeFirst}`,
      });

      // 내일 쉬는 시간들 (모든 수업 간 쉬는 시간 표시)
      for (let i = 0; i < sortedClasses.length; i++) {
        const classItem = sortedClasses[i];
        const nextClass = sortedClasses[i + 1];

        if (nextClass) {
          const [endH, endM] = classItem.end.split(':').map(Number);
          const [nextStartH, nextStartM] = nextClass.start.split(':').map(Number);
          const endMinutes = endH * 60 + endM;
          const nextStartMinutes = nextStartH * 60 + nextStartM;
          const gap = nextStartMinutes - endMinutes;

          // 수업 간 간격이 있으면 쉬는 시간으로 추가
          if (gap > 0) {
            const gapLabel = gap >= 30 ? '점심시간' : '쉬는 시간';
            slots.push({
              label: `내일 ${classItem.label || `${i + 1}교시`} 후 ${gapLabel} (${classItem.end}~${nextClass.start})`,
              time: classItem.end,
              dateTime: `${tomorrowStr}T${classItem.end}`,
            });
          }
        } else {
          // 내일 마지막 수업 종료 후
          slots.push({
            label: `내일 ${classItem.label || `${i + 1}교시`} 종료 후 (${classItem.end})`,
            time: classItem.end,
            dateTime: `${tomorrowStr}T${classItem.end}`,
          });
        }
      }
    }

    // 슬롯이 비어있으면 기본 옵션 추가
    if (slots.length === 0) {
      slots.push({
        label: `지금 바로 (${nowTime})`,
        time: nowTime,
        dateTime: `${today}T${nowTime}`,
      });
    }

    return slots;
  },
}));

async function saveSettings(state: MessageSettingsState) {
  try {
    const settings = {
      classTimes: state.classTimes,
      selectedPresetIndex: state.selectedPresetIndex,
      isRestrictionEnabled: state.isRestrictionEnabled,
      urgentNotificationSound: state.urgentNotificationSound,
      defaultContactAction: state.defaultContactAction,
    };
    await window.electronAPI?.saveSettings?.('messageSettings', JSON.stringify(settings));
  } catch (error) {
    console.error('메시지 설정 저장 실패:', error);
  }
}
