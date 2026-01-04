import { useNotificationStore } from '../store/notifications';
import NotificationTester from './NotificationTester';

export default function NotificationPanel() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification, clearAll } = 
    useNotificationStore();

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-800">
            알림
            {unreadCount > 0 && (
              <span className="ml-2 px-2 py-1 text-xs bg-gray-600 text-white rounded-full">
                {unreadCount}
              </span>
            )}
          </h2>
          <div className="flex space-x-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                모두 읽음
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-sm text-gray-600 hover:text-gray-700"
              >
                모두 삭제
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Test Buttons */}
        <NotificationTester />

        {notifications.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-5xl mb-4">🔔</div>
            <p className="text-gray-500">알림이 없습니다</p>
            <p className="text-xs text-gray-400 mt-2">위의 버튼으로 테스트 알림을 생성할 수 있습니다</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg border transition-all ${
                notification.read ? 'bg-white border-gray-200' : getNotificationColor(notification.type)
              } ${!notification.read ? 'shadow-sm' : ''}`}
              onClick={() => !notification.read && markAsRead(notification.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3 flex-1">
                  <div className={`text-2xl ${notification.read ? 'opacity-50' : ''}`}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className={`font-semibold ${notification.read ? 'text-gray-600' : 'text-gray-800'}`}>
                        {notification.title}
                      </h3>
                      {!notification.read && (
                        <span className="w-2 h-2 bg-gray-600 rounded-full"></span>
                      )}
                    </div>
                    <p className={`text-sm ${notification.read ? 'text-gray-500' : 'text-gray-700'}`}>
                      {notification.message}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      {formatTime(notification.timestamp)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeNotification(notification.id);
                  }}
                  className="text-gray-400 hover:text-gray-600 ml-2"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

