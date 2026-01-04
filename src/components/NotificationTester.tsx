import { useNotificationStore } from '../store/notifications';

export default function NotificationTester() {
  const { addNotification } = useNotificationStore();

  const testNotifications = [
    {
      title: '새 메시지',
      message: '김선생님이 메시지를 보냈습니다.',
      type: 'info' as const,
    },
    {
      title: '파일 전송 완료',
      message: '수업자료.pdf 파일이 성공적으로 전송되었습니다.',
      type: 'success' as const,
    },
    {
      title: '시스템 업데이트',
      message: '새로운 버전이 출시되었습니다. 업데이트를 권장합니다.',
      type: 'warning' as const,
    },
    {
      title: '연결 오류',
      message: '서버와의 연결이 끊어졌습니다. 네트워크를 확인해주세요.',
      type: 'error' as const,
    },
  ];

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">알림 테스트</h3>
      <div className="grid grid-cols-2 gap-3">
        {testNotifications.map((notif, index) => (
          <button
            key={index}
            onClick={() => addNotification(notif)}
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              notif.type === 'info'
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                : notif.type === 'success'
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : notif.type === 'warning'
                ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            }`}
          >
            {notif.title}
          </button>
        ))}
      </div>
    </div>
  );
}

