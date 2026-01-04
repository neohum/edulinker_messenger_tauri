import { useState } from 'react';
import PageLayout from '../components/PageLayout';

// 페이지에서 사용할 탭 타입 정의
type Tab = 'overview' | 'settings' | 'reports';

export default function ExamplePage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // 탭 설정
  const tabs = [
    { id: 'overview', label: '개요' },
    { id: 'settings', label: '설정' },
    { id: 'reports', label: '보고서' }
  ];

  // 헤더 액션 (선택사항)
  const headerActions = (
    <button className="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors">
      액션 버튼
    </button>
  );

  return (
    <PageLayout
      title="페이지 제목"
      subtitle="페이지 설명"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(tabId) => setActiveTab(tabId as Tab)}
      headerActions={headerActions}
    >
      {/* 탭별 컨텐츠 */}
      {activeTab === 'overview' && (
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">개요</h2>
          <p>여기에 개요 컨텐츠를 넣으세요.</p>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">설정</h2>
          <p>여기에 설정 컨텐츠를 넣으세요.</p>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">보고서</h2>
          <p>여기에 보고서 컨텐츠를 넣으세요.</p>
        </div>
      )}
    </PageLayout>
  );
}