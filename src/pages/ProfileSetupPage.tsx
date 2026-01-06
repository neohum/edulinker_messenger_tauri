import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';

interface ProfileData {
  email?: string;
  role?: string;
  organizationGroup?: string;
  grade?: number;
  class?: string;
  classroom?: string;
  workplace?: string;
  jobTitle?: string;
  adminDuties?: string;
  extensionNumber?: string;
  phoneNumber?: string;
}

export default function ProfileSetupPage() {
  const { user, token, setAuth } = useAuthStore();
  const [formData, setFormData] = useState<ProfileData>({
    email: user?.email || '',
    role: user?.role || '교사',
    organizationGroup: '',
    grade: undefined,
    class: '',
    classroom: '',
    workplace: '',
    jobTitle: '',
    adminDuties: '',
    extensionNumber: '',
    phoneNumber: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<string[]>([
    '교사',
    '교장',
    '교감',
    '행정실장',
    '행정실',
    '교무',
    '전담',
    '영양사',
    '영양교사',
    '보건교사',
    '보건실',
    '교무실무원',
    '과학실무원',
    '정보실무원'
  ]);

  // 개발자 모드 네트워크 제어
  const [isDevMode, setIsDevMode] = useState(import.meta.env.DEV);
  const [forceExternalOffline, setForceExternalOffline] = useState(false);
  const [forceInternalOffline, setForceInternalOffline] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<'online' | 'internal' | 'local' | 'offline'>('offline');
  const [internalNetworkConnected, setInternalNetworkConnected] = useState(false);
  const [externalNetworkConnected, setExternalNetworkConnected] = useState(false);
  const [connectionChecked, setConnectionChecked] = useState(false);

  // 컴포넌트 마운트 시 스크롤을 상단으로 이동하고 네트워크 상태 확인
  useEffect(() => {
    window.scrollTo(0, 0);
    // 컴포넌트 마운트 시 네트워크 상태 확인
    checkConnection();
    // 서버에서 역할 목록 가져오기
    loadAvailableRoles();
  }, []);

  // 서버에서 사용 가능한 역할 목록 가져오기
  const loadAvailableRoles = async () => {
    try {
      const result = await window.electronAPI?.getAvailableRoles?.();
      if (result?.success && result.roles && result.roles.length > 0) {
        // 서버에서 가져온 역할과 기본 역할을 합침 (중복 제거)
        const defaultRoles = [
          '교사',
          '교장',
          '교감',
          '행정실장',
          '행정실',
          '교무',
          '전담',
          '영양사',
          '영양교사',
          '보건교사',
          '보건실',
          '교무실무원',
          '과학실무원',
          '정보실무원'
        ];
        const combinedRoles = Array.from(new Set([...defaultRoles, ...result.roles]));
        setAvailableRoles(combinedRoles);
      }
    } catch (error) {
      console.error('역할 목록 로드 실패:', error);
      // 실패 시 기본 역할 유지
    }
  };

  // API 서버 연결 상태 확인
  const checkApiConnection = async () => {
    try {
      const response = await fetch('http://localhost:3000/health', {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      // API 서버 연결 실패는 정상적인 상황이므로 조용히 처리
      return false;
    }
  };

  // 사내 네트워크 연결 상태 확인 (IP 주소 기반)
  const checkInternalNetwork = async () => {
    try {
      const result = await window.electronAPI?.checkInternalNetworkIp?.();
      return result?.isInternal || false;
    } catch (error) {
      console.error('내부 네트워크 확인 실패:', error);
      return false;
    }
  };

  // 외부 네트워크 연결 상태 확인
  const checkExternalNetwork = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      // 외부 서비스 연결 확인 (구글, 클라우드플레어 등)
      await fetch('https://www.google.com/favicon.ico', {
        signal: controller.signal,
        mode: 'no-cors'
      });
      
      clearTimeout(timeoutId);
      return true; // no-cors 모드에서는 response 객체를 받지 못하지만 연결은 확인됨
    } catch (error) {
      // 외부 네트워크 연결 실패는 정상적인 상황이므로 조용히 처리
      return false;
    }
  };

  // 네트워크 상태 확인 및 설정
  const checkConnection = async () => {
    console.log('checkConnection called, isDevMode:', isDevMode, 'forceInternalOffline:', forceInternalOffline, 'forceExternalOffline:', forceExternalOffline);

    let apiAvailable = false;
    let internalAvailable = false;
    let externalAvailable = false;

    if (isDevMode) {
      // 개발자 모드: 강제 설정 사용
      // 내부 네트워크: forceInternalOffline이 false면 온라인, true면 오프라인
      internalAvailable = !forceInternalOffline;

      // 외부 네트워크: forceExternalOffline이 false면 온라인, true면 오프라인
      externalAvailable = !forceExternalOffline;
      apiAvailable = !forceExternalOffline; // API 연결도 외부 네트워크 상태와 동일하게 설정

      console.log('Dev mode: forced settings', {
        internalAvailable,
        externalAvailable,
        apiAvailable,
        forceInternalOffline,
        forceExternalOffline
      });
    } else {
      // 운영 모드: 실제 네트워크 확인
      apiAvailable = await checkApiConnection();
      internalAvailable = await checkInternalNetwork();
      externalAvailable = await checkExternalNetwork();
      console.log('Production mode: actual checks', { apiAvailable, internalAvailable, externalAvailable });
    }
    
    // 네트워크 상태 결정 로직
    let currentNetworkStatus: 'online' | 'internal' | 'local' | 'offline' = 'offline';
    
    if (externalAvailable && apiAvailable) {
      currentNetworkStatus = 'online';
    } else if (internalAvailable) {
      currentNetworkStatus = 'internal';
    } else if (apiAvailable) {
      currentNetworkStatus = 'local';
    } else {
      currentNetworkStatus = 'offline';
    }
    
    setNetworkStatus(currentNetworkStatus);
    setInternalNetworkConnected(internalAvailable);
    setExternalNetworkConnected(externalAvailable);
    setConnectionChecked(true);
    
    return currentNetworkStatus !== 'offline';
  };

  // 개발자 모드 네트워크 토글 함수들
  const toggleExternalNetwork = async () => {
    setForceExternalOffline(!forceExternalOffline);
    // 즉시 연결 상태 재확인
    await checkConnection();
  };

  const toggleInternalNetwork = async () => {
    setForceInternalOffline(!forceInternalOffline);
    // 즉시 연결 상태 재확인
    await checkConnection();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'grade' ? (value ? parseInt(value) : undefined) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      console.log('Submitting profile data:', formData);

      // 네트워크 상태 확인
      const networkCheck = await window.electronAPI?.checkNetworkStatus?.();
      const isOffline = !networkCheck?.online;

      console.log('Network status check:', networkCheck, 'isOffline:', isOffline);

      // 실제 네트워크 상태 사용 (하드코딩 제거)
      const actualIsOffline = isOffline;

      console.log('Actual offline status:', actualIsOffline);

      // 오프라인 상태에 따라 적절한 API 호출
      let result;
      if (actualIsOffline) {
        console.log('Using offline profile update API');
        result = await window.electronAPI?.updateUserProfileOffline?.({
          ...formData,
          profileCompleted: true
        });
      } else {
        console.log('Using online profile update API');
        result = await window.electronAPI?.updateUserProfile?.({
          ...formData,
          profileCompleted: true
        });
      }

      console.log('Profile update result:', result);

      if (result?.success) {
        // 프로필 업데이트 성공 - auth store 업데이트 및 영구 저장
        const updatedUser = {
          ...user,
          ...formData,
          profileCompleted: true
        };
        setAuth(token!, updatedUser);
        setShowSuccessModal(true);
      } else {
        setError(result?.error || '프로필 업데이트 실패');
      }
    } catch (error: any) {
      console.error('Profile update error:', error);
      setError(`프로필 업데이트 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const skipForNow = () => {
    // 나중에 설정하기 - 프로필 설정을 건너뛰고 로그인 완료 처리
    if (!token) {
      console.error('No token available for profile skip');
      return;
    }

    const updatedUser = {
      ...user,
      profileCompleted: true
    };
    // auth store 업데이트 및 영구 저장
    setAuth(token, updatedUser);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500">사용자 정보를 불러올 수 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4 py-12 bg-gray-50 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-3xl font-extrabold text-center text-gray-900">
            프로필 설정
          </h2>
          <p className="mt-2 text-sm text-center text-gray-600">
            {user.name}님, 더 나은 서비스를 위해 추가 정보를 입력해주세요.
          </p>
          
          {/* 개발자 모드 네트워크 제어 */}
          {isDevMode && (
            <div className="p-4 mt-4 border border-gray-200 rounded-lg bg-gray-50">
              <div className="mb-3 text-center">
                <p className="text-xs text-gray-500">🚀 개발자 모드 - 네트워크 상태 시뮬레이션</p>
              </div>
              
              <div className="flex justify-center mb-3 space-x-2">
                <button
                  type="button"
                  onClick={toggleInternalNetwork}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                    forceInternalOffline 
                      ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  🏢 내부 네트워크 {forceInternalOffline ? '오프라인' : '온라인'}
                </button>
                <button
                  type="button"
                  onClick={toggleExternalNetwork}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                    forceExternalOffline 
                      ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  🌐 외부 네트워크 {forceExternalOffline ? '오프라인' : '온라인'}
                </button>
              </div>
              
              {/* 내부/외부 네트워크 연결 상태 표시 */}
              {connectionChecked && (
                <div className="space-y-1 text-center">
                  <div className="flex items-center justify-center space-x-4 text-xs">
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${internalNetworkConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className={internalNetworkConnected ? 'text-green-600' : 'text-red-600'}>
                        내부: {internalNetworkConnected ? '연결됨' : '연결 안됨'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className={`w-2 h-2 rounded-full ${externalNetworkConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className={externalNetworkConnected ? 'text-green-600' : 'text-red-600'}>
                        외부: {externalNetworkConnected ? '연결됨' : '연결 안됨'}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    현재 모드: {networkStatus === 'online' ? '온라인' : networkStatus === 'internal' ? '내부망' : networkStatus === 'local' ? '로컬' : '오프라인'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* 이메일 */}
            <div>
              <label htmlFor="email" className="block mb-1 text-sm font-medium text-gray-700">
                이메일
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="example@school.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">이메일을 입력하면 해당 학교 서비스에 접근할 수 있습니다</p>
            </div>

            {/* 역할 */}
            <div>
              <label htmlFor="role" className="block mb-1 text-sm font-medium text-gray-700">
                역할
              </label>
              <select
                id="role"
                name="role"
                value={formData.role || '교사'}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {availableRoles.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            {/* 소속 그룹 */}
            <div>
              <label htmlFor="organizationGroup" className="block mb-1 text-sm font-medium text-gray-700">
                소속 그룹
              </label>
              <select
                id="organizationGroup"
                name="organizationGroup"
                value={formData.organizationGroup || ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">미배정</option>
                <option value="교장실">교장실</option>
                <option value="교무실">교무실</option>
                <option value="행정실">행정실</option>
                <option value="1학년">1학년</option>
                <option value="2학년">2학년</option>
                <option value="3학년">3학년</option>
                <option value="4학년">4학년</option>
                <option value="5학년">5학년</option>
                <option value="6학년">6학년</option>
                <option value="전담실">전담실</option>
              </select>
            </div>

            {/* 학년 */}
            <div>
              <label htmlFor="grade" className="block mb-1 text-sm font-medium text-gray-700">
                학년
              </label>
              <select
                id="grade"
                name="grade"
                value={formData.grade || ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">선택 안함</option>
                <option value="1">1학년</option>
                <option value="2">2학년</option>
                <option value="3">3학년</option>
                <option value="4">4학년</option>
                <option value="5">5학년</option>
                <option value="6">6학년</option>
              </select>
            </div>

            {/* 반 */}
            <div>
              <label htmlFor="class" className="block mb-1 text-sm font-medium text-gray-700">
                반
              </label>
              <input
                id="class"
                name="class"
                type="text"
                value={formData.class}
                onChange={handleInputChange}
                placeholder="예: 1반, 2반..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 교실 */}
            <div>
              <label htmlFor="classroom" className="block mb-1 text-sm font-medium text-gray-700">
                교실
              </label>
              <input
                id="classroom"
                name="classroom"
                type="text"
                value={formData.classroom}
                onChange={handleInputChange}
                placeholder="예: 101호, 201호..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 근무장소 */}
            <div>
              <label htmlFor="workplace" className="block mb-1 text-sm font-medium text-gray-700">
                근무장소
              </label>
              <input
                id="workplace"
                name="workplace"
                type="text"
                value={formData.workplace}
                onChange={handleInputChange}
                placeholder="예: 교무실, 행정실..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 업무 */}
            <div>
              <label htmlFor="jobTitle" className="block mb-1 text-sm font-medium text-gray-700">
                업무
              </label>
              <input
                id="jobTitle"
                name="jobTitle"
                type="text"
                value={formData.jobTitle}
                onChange={handleInputChange}
                placeholder="예: 담임교사, 과목교사..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 행정업무 */}
            <div>
              <label htmlFor="adminDuties" className="block mb-1 text-sm font-medium text-gray-700">
                행정업무
              </label>
              <input
                id="adminDuties"
                name="adminDuties"
                type="text"
                value={formData.adminDuties}
                onChange={handleInputChange}
                placeholder="예: 학생부, 시설관리..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 내선번호 */}
            <div>
              <label htmlFor="extensionNumber" className="block mb-1 text-sm font-medium text-gray-700">
                내선번호
              </label>
              <input
                id="extensionNumber"
                name="extensionNumber"
                type="text"
                value={formData.extensionNumber}
                onChange={handleInputChange}
                placeholder="예: 101, 201..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* 전화번호 */}
            <div>
              <label htmlFor="phoneNumber" className="block mb-1 text-sm font-medium text-gray-700">
                전화번호
              </label>
              <input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                placeholder="예: 010-1234-5678"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 border border-red-200 rounded-lg bg-red-50">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-3 font-medium text-white transition-colors bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '저장 중...' : '프로필 저장'}
            </button>

            <button
              type="button"
              onClick={skipForNow}
              className="w-full px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-800"
            >
              나중에 설정하기
            </button>
          </div>
        </form>
      </div>

      {/* 성공 모달 */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">저장 완료</h3>
              <p className="text-gray-600 text-center mb-6">프로필이 성공적으로 저장되었습니다.</p>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}