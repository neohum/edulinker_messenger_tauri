import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';

interface ProfileData {
  name?: string;
  grade?: number;
  class?: string;
  classroom?: string;
  workplace?: string;
  jobTitle?: string;
  adminDuties?: string;
  extensionNumber?: string;
  phoneNumber?: string;
  subjects?: string[];
}

interface ProfileSettingsPageProps {
  onCancel?: () => void;
}

export default function ProfileSettingsPage({ onCancel }: ProfileSettingsPageProps) {
  const { user, token, setAuth } = useAuthStore();
  const [formData, setFormData] = useState<ProfileData>({
    name: user?.name || '',
    grade: user?.grade || undefined,
    class: user?.class || '',
    classroom: user?.classroom || '',
    workplace: user?.workplace || '',
    jobTitle: user?.jobTitle || '',
    adminDuties: user?.adminDuties || '',
    extensionNumber: user?.extensionNumber || '',
    phoneNumber: user?.phoneNumber || '',
    subjects: user?.subjects || []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [subjectInput, setSubjectInput] = useState('');

  // 컴포넌트 마운트 시 스크롤을 상단으로 이동
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleInputChange = (field: keyof ProfileData, value: string | number | undefined) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddSubject = () => {
    if (subjectInput.trim() && !formData.subjects?.includes(subjectInput.trim())) {
      setFormData(prev => ({
        ...prev,
        subjects: [...(prev.subjects || []), subjectInput.trim()]
      }));
      setSubjectInput('');
    }
  };

  const handleRemoveSubject = (subject: string) => {
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects?.filter(s => s !== subject) || []
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // 네트워크 상태 확인
      const networkCheck = await window.electronAPI?.checkNetworkStatus?.();
      const isOffline = !networkCheck?.online;

      let result;
      if (isOffline) {
        // 오프라인 모드에서 프로필 업데이트
        result = await window.electronAPI?.updateUserProfileOffline?.({
          ...formData,
          profileCompleted: true
        });
      } else {
        // 온라인 모드에서 프로필 업데이트
        result = await window.electronAPI?.updateUserProfile?.({
          ...formData,
          profileCompleted: true
        });
      }

      if (result?.success) {
        // 사용자 정보 업데이트
        setAuth(token!, {
          ...user!,
          ...formData
        });
        setSuccess('프로필이 성공적으로 업데이트되었습니다.');
      } else {
        setError(result?.error || '프로필 업데이트에 실패했습니다.');
      }
    } catch (error) {
      console.error('Profile update error:', error);
      setError('프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="bg-white/80 backdrop-blur-md rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">프로필 설정</h1>
          <p className="text-gray-600">개인 정보를 수정할 수 있습니다.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 기본 정보 */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              기본 정보
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">역할</label>
                <input
                  type="text"
                  value={user?.role === 'TEACHER' ? '교사' : user?.role === 'ADMIN' ? '학교 관리자' : user?.role === 'STUDENT' ? '학생' : '기타'}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">역할은 변경할 수 없습니다</p>
              </div>
            </div>
          </div>

          {/* 학급 정보 */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              학급 정보
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">학년</label>
                <select
                  value={formData.grade || ''}
                  onChange={(e) => handleInputChange('grade', e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">선택 안함</option>
                  {[1, 2, 3, 4, 5, 6].map(grade => (
                    <option key={grade} value={grade}>{grade}학년</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">반</label>
                <input
                  type="text"
                  value={formData.class || ''}
                  onChange={(e) => handleInputChange('class', e.target.value)}
                  placeholder="예: 1반"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">교실</label>
                <input
                  type="text"
                  value={formData.classroom || ''}
                  onChange={(e) => handleInputChange('classroom', e.target.value)}
                  placeholder="예: 101호"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 업무 정보 */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              업무 정보
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">근무 장소</label>
                <input
                  type="text"
                  value={formData.workplace || ''}
                  onChange={(e) => handleInputChange('workplace', e.target.value)}
                  placeholder="예: 교무실, 행정실, 전담실"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">직책/업무</label>
                <input
                  type="text"
                  value={formData.jobTitle || ''}
                  onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                  placeholder="예: 담임교사, 교감, 교무부장"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">행정 업무 / 담당 업무</label>
                <input
                  type="text"
                  value={formData.adminDuties || ''}
                  onChange={(e) => handleInputChange('adminDuties', e.target.value)}
                  placeholder="예: 학생부, 시설관리, 교육과정"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 담당 과목 (교사인 경우) */}
          {(user?.role === 'TEACHER' || user?.role === 'ADMIN') && (
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                담당 과목
              </h2>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={subjectInput}
                    onChange={(e) => setSubjectInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubject())}
                    placeholder="과목명 입력 후 추가"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddSubject}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                  >
                    추가
                  </button>
                </div>
                {formData.subjects && formData.subjects.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.subjects.map((subject, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                      >
                        {subject}
                        <button
                          type="button"
                          onClick={() => handleRemoveSubject(subject)}
                          className="ml-2 text-blue-500 hover:text-blue-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 연락처 정보 */}
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              연락처 정보
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">내선 번호</label>
                <input
                  type="text"
                  value={formData.extensionNumber || ''}
                  onChange={(e) => handleInputChange('extensionNumber', e.target.value)}
                  placeholder="예: 101"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">휴대폰 번호</label>
                <input
                  type="tel"
                  value={formData.phoneNumber || ''}
                  onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                  placeholder="010-1234-5678"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 제출 버튼 */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => onCancel ? onCancel() : window.history.back()}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
