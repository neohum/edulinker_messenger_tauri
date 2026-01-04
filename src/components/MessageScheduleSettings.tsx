import { useState, useEffect } from 'react';
import { useMessageSettingsStore, CLASS_TIME_PRESETS, TimeRange, DefaultContactAction } from '../store/messageSettings';

export default function MessageScheduleSettings() {
  const {
    classTimes,
    selectedPresetIndex,
    isRestrictionEnabled,
    urgentNotificationSound,
    defaultContactAction,
    loadSettings,
    selectPreset,
    setClassTimes,
    setRestrictionEnabled,
    setUrgentNotificationSound,
    setDefaultContactAction,
    isAllowedTime,
    getCurrentClass,
  } = useMessageSettingsStore();

  const [customTimes, setCustomTimes] = useState<TimeRange[]>(classTimes);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    setCustomTimes(classTimes);
  }, [classTimes]);

  const handlePresetChange = async (index: number) => {
    await selectPreset(index);
    if (index === CLASS_TIME_PRESETS.length - 1) {
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  };

  const handleAddTime = () => {
    const lastTime = customTimes[customTimes.length - 1];
    const newLabel = `${customTimes.length + 1}교시`;
    if (lastTime) {
      // 마지막 수업 종료 10분 후부터 시작
      const [endH, endM] = lastTime.end.split(':').map(Number);
      const startMinutes = endH * 60 + endM + 10;
      const startH = Math.floor(startMinutes / 60);
      const startM = startMinutes % 60;
      const endMinutes = startMinutes + 45;
      const endHour = Math.floor(endMinutes / 60);
      const endMin = endMinutes % 60;
      setCustomTimes([...customTimes, {
        start: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
        end: `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
        label: newLabel,
      }]);
    } else {
      setCustomTimes([...customTimes, { start: '09:00', end: '09:45', label: newLabel }]);
    }
  };

  const handleRemoveTime = (index: number) => {
    setCustomTimes(customTimes.filter((_, i) => i !== index));
  };

  const handleTimeChange = (index: number, field: 'start' | 'end' | 'label', value: string) => {
    const newTimes = [...customTimes];
    newTimes[index] = { ...newTimes[index], [field]: value };
    setCustomTimes(newTimes);
  };

  const handleSaveCustomTimes = async () => {
    await setClassTimes(customTimes);
    setIsEditing(false);
  };

  // 현재 상태 표시
  const currentClass = getCurrentClass();
  const allowed = isAllowedTime();

  return (
    <div className="space-y-4">
      {/* 현재 상태 표시 */}
      {isRestrictionEnabled && (
        <div className={`p-3 rounded-lg text-sm ${
          allowed
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
        }`}>
          {allowed ? (
            <div className="flex items-center space-x-2">
              <span className="text-lg">✅</span>
              <span>현재 쉬는 시간입니다. 메시지를 자유롭게 발송할 수 있습니다.</span>
            </div>
          ) : currentClass ? (
            <div className="flex items-center space-x-2">
              <span className="text-lg">📚</span>
              <span>
                현재 <strong>{currentClass.label || '수업'}</strong> 중입니다 ({currentClass.start} ~ {currentClass.end}).
                수업 종료 후 발송됩니다.
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-lg">⏰</span>
              <span>수업 시간이 아닙니다. 메시지를 자유롭게 발송할 수 있습니다.</span>
            </div>
          )}
        </div>
      )}

      {/* 발송 제한 활성화 토글 */}
      <div className="flex items-center justify-between p-3 theme-surface-translucent rounded-lg border border-current/10">
        <div>
          <p className="text-sm font-medium theme-text">수업 시간 발송 제한</p>
          <p className="text-xs theme-text-secondary">수업 중에는 메시지 발송이 제한됩니다</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isRestrictionEnabled}
            onChange={(e) => setRestrictionEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {/* 긴급 알림음 설정 */}
      <div className="flex items-center justify-between p-3 theme-surface-translucent rounded-lg border border-current/10">
        <div>
          <p className="text-sm font-medium theme-text">🚨 긴급 메시지 알림음</p>
          <p className="text-xs theme-text-secondary">긴급 메시지는 수업 중에도 알림이 울립니다</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={urgentNotificationSound}
            onChange={(e) => setUrgentNotificationSound(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {/* 대상 선택 시 기본 동작 */}
      <div className="p-3 theme-surface-translucent rounded-lg border border-current/10">
        <div className="mb-3">
          <p className="text-sm font-medium theme-text">👆 대상 클릭 시 동작</p>
          <p className="text-xs theme-text-secondary">조직도에서 대상을 클릭했을 때 기본 동작을 설정합니다</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setDefaultContactAction('ask')}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              defaultContactAction === 'ask'
                ? 'bg-blue-600 text-white'
                : 'theme-surface-translucent border border-current/20 theme-text hover:bg-white/20'
            }`}
          >
            매번 물어보기
          </button>
          <button
            onClick={() => setDefaultContactAction('message')}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              defaultContactAction === 'message'
                ? 'bg-blue-600 text-white'
                : 'theme-surface-translucent border border-current/20 theme-text hover:bg-white/20'
            }`}
          >
            메시지 보내기
          </button>
          <button
            onClick={() => setDefaultContactAction('chat')}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              defaultContactAction === 'chat'
                ? 'bg-blue-600 text-white'
                : 'theme-surface-translucent border border-current/20 theme-text hover:bg-white/20'
            }`}
          >
            채팅 시작
          </button>
        </div>
      </div>

      {isRestrictionEnabled && (
        <>
          {/* 프리셋 선택 */}
          <div className="space-y-2">
            <p className="text-sm font-medium theme-text">수업 시간 프리셋</p>
            <div className="flex flex-wrap gap-2">
              {CLASS_TIME_PRESETS.map((preset, index) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetChange(index)}
                  className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                    selectedPresetIndex === index
                      ? 'bg-blue-600 text-white'
                      : 'theme-surface-translucent border border-current/20 theme-text hover:bg-white/20'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* 수업 시간 목록 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium theme-text">설정된 수업 시간</p>
              {selectedPresetIndex === CLASS_TIME_PRESETS.length - 1 && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs theme-primary-text hover:opacity-80"
                >
                  편집
                </button>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {(isEditing ? customTimes : classTimes).map((time, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-2 p-2 theme-surface-translucent rounded border border-current/10"
                >
                  {isEditing ? (
                    <>
                      <input
                        type="text"
                        value={time.label || ''}
                        onChange={(e) => handleTimeChange(index, 'label', e.target.value)}
                        placeholder="교시명"
                        className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="time"
                        value={time.start}
                        onChange={(e) => handleTimeChange(index, 'start', e.target.value)}
                        className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="theme-text-secondary">~</span>
                      <input
                        type="time"
                        value={time.end}
                        onChange={(e) => handleTimeChange(index, 'end', e.target.value)}
                        className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => handleRemoveTime(index)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="w-16 text-sm font-medium theme-text">{time.label || `${index + 1}교시`}</span>
                      <span className="text-sm theme-text">{time.start}</span>
                      <span className="theme-text-secondary">~</span>
                      <span className="text-sm theme-text">{time.end}</span>
                    </>
                  )}
                </div>
              ))}
            </div>

            {isEditing && (
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleAddTime}
                  className="flex items-center space-x-1 text-sm theme-primary-text hover:opacity-80"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span>교시 추가</span>
                </button>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setCustomTimes(classTimes);
                      setIsEditing(false);
                    }}
                    className="px-3 py-1 text-sm theme-text-secondary hover:theme-text"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveCustomTimes}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    저장
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 안내 문구 */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-700">
              💡 <strong>수업 시간 외</strong>에는 메시지가 즉시 전달됩니다.
              수업 중에 보낸 메시지는 수업 종료 후 알림이 표시됩니다.
              <strong>긴급 메시지</strong>는 수업 중에도 즉시 알림이 울립니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
