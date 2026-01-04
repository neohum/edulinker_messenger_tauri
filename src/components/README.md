# 페이지 레이아웃 가이드

이 가이드는 새로운 페이지를 만들 때 Dashboard와 동일한 스타일의 헤더와 탭 메뉴를 적용하는 방법을 설명합니다.

## 사용 가능한 컴포넌트

### PageLayout
메인 페이지 레이아웃 컴포넌트로, 헤더와 탭 메뉴를 포함합니다.

```tsx
import PageLayout from '../components/PageLayout';

<PageLayout
  title="페이지 제목"           // 헤더 타이틀 (기본값: "edulinker")
  subtitle="페이지 설명"         // 헤더 서브타이틀 (기본값: "교사용 통합 플랫폼")
  tabs={tabs}                  // 탭 배열 (선택사항)
  activeTab={activeTab}        // 현재 활성 탭
  onTabChange={handleTabChange} // 탭 변경 핸들러
  headerActions={headerActions} // 헤더 오른쪽에 추가할 액션들
  showUserInfo={true}          // 사용자 정보 표시 여부
  showLogout={true}            // 로그아웃 버튼 표시 여부
>
  {/* 페이지 컨텐츠 */}
</PageLayout>
```

### PageHeader
헤더만 필요한 경우 사용할 수 있는 컴포넌트.

```tsx
import PageHeader from '../components/PageHeader';

<PageHeader
  title="페이지 제목"
  subtitle="페이지 설명"
  showUserInfo={true}
  showLogout={true}
>
  {/* 추가 액션들 */}
</PageHeader>
```

### PageTabs
탭 메뉴만 필요한 경우 사용할 수 있는 컴포넌트.

```tsx
import PageTabs from '../components/PageTabs';

const tabs = [
  { id: 'tab1', label: '탭 1' },
  { id: 'tab2', label: '탭 2', icon: <Icon /> }
];

<PageTabs
  tabs={tabs}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

## 탭 설정 예시

```tsx
type Tab = 'overview' | 'settings' | 'reports';

const [activeTab, setActiveTab] = useState<Tab>('overview');

const tabs = [
  { id: 'overview', label: '개요' },
  { id: 'settings', label: '설정' },
  { id: 'reports', label: '보고서' }
];
```

## 스타일링

- 헤더: 흰색 배경, 회색 테두리
- 탭: primary-600 색상으로 활성 상태 표시
- 배경: 회색-100
- 전체 높이: 화면 전체 높이 (h-screen)

## 템플릿 파일

- `ExamplePage.tsx`: 탭이 있는 페이지 템플릿
- `SimplePage.tsx`: 탭 없는 간단한 페이지 템플릿

새로운 페이지를 만들 때는 이 템플릿들을 참고하여 PageLayout 컴포넌트를 사용하세요.