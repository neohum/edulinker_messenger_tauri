import { ReactNode } from 'react';

interface PageLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  tabs?: ReactNode;
}

export default function PageLayout({
  children,
  header,
  tabs
}: PageLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen overflow-auto">
      {/* 헤더 영역 */}
      {header && (
        <header className="flex-shrink-0">
          {header}
        </header>
      )}
      
      {/* 메인 콘텐츠와 탭 영역 */}
      <div className="flex flex-1 min-h-0">
        {/* 왼쪽 탭 */}
        {tabs && (
          <aside className="flex-shrink-0 w-10 border-r shadow-2xl theme-border theme-app-bg-translucent">
            {tabs}
          </aside>
        )}
        
        {/* 메인 콘텐츠 영역 */}
        <main className="flex-1 px-4 overflow-auto">
          {children}
        </main>
      </div>

      {/* 모바일에서는 하단 탭 네비게이션 */}
      {/* 모바일 탭은 별도 처리 */}

      {/* 데스크톱에서는 기존 탭 표시 */}
      {/* 탭은 이제 fixed로 별도 배치됨 */}
    </div>
  );
}
