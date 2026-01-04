import PageLayout from '../components/PageLayout';

export default function SimplePage() {
  return (
    <PageLayout
      title="간단한 페이지"
      subtitle="탭 없는 페이지 예시"
      showUserInfo={true}
      showLogout={true}
    >
      <div className="p-6">
        <h2 className="text-xl font-semibold mb-4">컨텐츠 제목</h2>
        <p>여기에 페이지 컨텐츠를 넣으세요.</p>

        <div className="mt-6">
          <button className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors">
            액션 버튼
          </button>
        </div>
      </div>
    </PageLayout>
  );
}