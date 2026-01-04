import React, { useState, useEffect } from 'react';
import { addressBookService, AddressBookEntry } from '../services/addressBook';
import { useNetworkStore } from '../store/network';

interface AddressBookProps {
  className?: string;
  onSendMessage?: (user: AddressBookEntry) => void;
  onStartConversation?: (user: AddressBookEntry) => void;
}

export const AddressBook: React.FC<AddressBookProps> = ({ 
  className = '',
  onSendMessage,
  onStartConversation
}) => {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<AddressBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; user: AddressBookEntry } | null>(null);
  const isExternalOnline = useNetworkStore((state) => (
    state.simulationEnabled ? state.simulatedExternalNetwork : state.realExternalNetwork
  ));

  // 체크박스 토글
  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  // 전체 선택/해제
  const toggleAllSelection = () => {
    if (selectedUsers.size === filteredEntries.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredEntries.map(entry => entry.userId)));
    }
  };

  // 오른쪽 클릭 핸들러
  const handleContextMenu = (e: React.MouseEvent, user: AddressBookEntry) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      user
    });
  };

  // 모달 닫기
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // 주소록 데이터 로드
  const loadAddressBook = async () => {
    try {
      setLoading(true);
      setError(null);

      // 로컬 데이터 로드
      let localEntries: any[] = [];
      try {
        localEntries = await addressBookService.getAllEntries();
      } catch (dbError) {
        console.warn('Local database not available, trying server sync only:', dbError);
      }

      // 서버와 동기화 시도
      try {
        await addressBookService.syncWithServerAutomatically();
        // 동기화 후 다시 로드
        const updatedEntries = await addressBookService.getAllEntries();
        setEntries(updatedEntries);
      } catch (syncError) {
        console.warn('Server sync failed, using local data only:', syncError);
        setEntries(localEntries);
      }
    } catch (error) {
      console.error('Failed to load address book:', error);
      setError('주소록을 불러오는데 실패했습니다.');
      setEntries([]); // 빈 배열로 설정
    } finally {
      setLoading(false);
    }
  };

  // 수동 동기화
  const handleSync = async () => {
    if (!isExternalOnline) {
      return;
    }
    try {
      setSyncing(true);
      setError(null);
      await addressBookService.syncWithServerAutomatically();
      await loadAddressBook();
    } catch (error) {
      console.error('Manual sync failed:', error);
      setError('동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  // 필터링 적용
  useEffect(() => {
    let filtered = entries;

    // 검색어 필터링
    if (searchTerm) {
      filtered = filtered.filter(entry =>
        entry.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.ipAddress.includes(searchTerm)
      );
    }

    // 역할 필터링
    if (selectedRole !== 'all') {
      filtered = filtered.filter(entry => entry.role === selectedRole);
    }

    // 온라인 상태 필터링
    if (showOnlineOnly) {
      filtered = filtered.filter(entry => entry.isOnline);
    }

    setFilteredEntries(filtered);
  }, [entries, searchTerm, selectedRole, showOnlineOnly]);

  // 컴포넌트 마운트 시 데이터 로드
  useEffect(() => {
    if (!isExternalOnline) {
      setEntries([]);
      setFilteredEntries([]);
      setLoading(false);
      return;
    }

    const loadData = async () => {
      await loadAddressBook();
    };
    loadData();
  }, [isExternalOnline]);

  // 역할 목록 추출
  const roles = Array.from(new Set(entries.map(entry => entry.role)));

  if (!isExternalOnline) {
    return (
      <div className={`h-full flex flex-col min-h-0 ${className}`}>
        <div className="p-4 flex-shrink-0">
          <h2 className="text-xl font-semibold mb-2">주소록</h2>
          <p className="text-sm text-gray-500">외부 네트워크 연결 시 활성화됩니다.</p>
        </div>
        <div className="flex-1 flex items-center justify-center px-4 pb-6">
          <div className="max-w-md w-full bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-6 text-center">
            <div className="flex items-center justify-center mb-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 4.93l14.14 14.14M7.76 7.76a7 7 0 019.9 9.9" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-1">외부 네트워크가 필요합니다</h3>
            <p className="text-sm text-yellow-700">외부 네트워크 연결을 확인한 뒤 주소록을 사용해주세요.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">주소록 로딩 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col min-h-0 ${className}`}>
      <div className="p-4 flex-shrink-0">
        <h2 className="text-xl font-semibold mb-4">주소록</h2>

        {/* 컨트롤 패널 */}
        <div className="flex flex-wrap gap-4 mb-4">
          {/* 검색 */}
          <div className="flex-1 min-w-64">
            <input
              type="text"
              placeholder="이름, 이메일, IP 주소로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 역할 필터 */}
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">모든 역할</option>
            {roles.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>

          {/* 온라인만 보기 */}
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={showOnlineOnly}
              onChange={(e) => setShowOnlineOnly(e.target.checked)}
              className="mr-2"
            />
            온라인만 보기
          </label>

          {/* 동기화 버튼 */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? '동기화 중...' : '동기화'}
          </button>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* 통계 및 선택 컨트롤 */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            총 {entries.length}명, 온라인 {entries.filter(e => e.isOnline).length}명,
            동기화됨 {entries.filter(e => e.synced).length}명
          </div>
          {filteredEntries.length > 0 && (
            <div className="flex items-center space-x-2">
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={selectedUsers.size === filteredEntries.length && filteredEntries.length > 0}
                  onChange={toggleAllSelection}
                  className="mr-1"
                />
                전체 선택 ({selectedUsers.size}/{filteredEntries.length})
              </label>
            </div>
          )}
        </div>
      </div>

      {/* 주소록 목록 */}
      <div className="flex-1 overflow-auto min-h-0 px-4 pb-4">
        <div className="space-y-2">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {entries.length === 0 ? '주소록이 비어있습니다.' : '검색 결과가 없습니다.'}
            </div>
          ) : (
            filteredEntries.map(entry => (
              <div
                key={entry.userId}
                className={`flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer ${
                  selectedUsers.has(entry.userId) ? 'bg-blue-50 border-blue-300' : ''
                }`}
                onContextMenu={(e) => handleContextMenu(e, entry)}
              >
                <div className="flex items-center space-x-3">
                  {/* 체크박스 */}
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(entry.userId)}
                    onChange={() => toggleUserSelection(entry.userId)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />

                  {/* 온라인 상태 인디케이터 */}
                  <div className={`w-3 h-3 rounded-full ${entry.isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>

                  {/* 사용자 정보 */}
                  <div>
                    <div className="font-medium">{entry.name}</div>
                    <div className="text-sm text-gray-600">{entry.email}</div>
                    <div className="text-xs text-gray-500">
                      {entry.role} • {entry.ipAddress}
                      {entry.hostname && ` • ${entry.hostname}`}
                    </div>
                  </div>
                </div>

                <div className="text-right text-xs text-gray-500">
                  <div>{entry.synced ? '동기화됨' : '미동기화'}</div>
                  <div>{new Date(entry.lastSeen).toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 컨텍스트 메뉴 모달 */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={closeContextMenu}
        >
          <div
            className="absolute bg-white border border-gray-300 rounded-lg shadow-lg py-2 min-w-48"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2 border-b border-gray-200">
              <div className="font-medium">{contextMenu.user.name}</div>
              <div className="text-sm text-gray-600">{contextMenu.user.email}</div>
            </div>
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => {
                onSendMessage?.(contextMenu.user);
                closeContextMenu();
              }}
            >
              <span>💬</span>
              <span>메시지 보내기</span>
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => {
                onStartConversation?.(contextMenu.user);
                closeContextMenu();
              }}
            >
              <span>🗣️</span>
              <span>대화 시작</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
