# Edulinker Internal Network Messenger - 개발 완료 계획서

## 프로젝트 현황 요약

| 항목 | 상태 | 완성도 |
|------|------|--------|
| 인증 시스템 | ✅ 완료 | 95% |
| 1:1 메시징 | ✅ 완료 | 85% |
| 그룹 채팅 | ⚠️ 부분 완료 | 60% |
| P2P 네트워크 | ⚠️ 구조만 완성 | 40% |
| 파일 전송 | ⚠️ 부분 완료 | 70% |
| 주소록 | ✅ 완료 | 90% |
| 알림 시스템 | ✅ 완료 | 85% |
| 설정/환경설정 | ⚠️ 기본만 | 50% |
| 보안/암호화 | ❌ 미구현 | 10% |

**전체 완성도: 약 45-50%**

---

## 팀 구성 및 역할 분담

### 👨‍💻 Developer A: 백엔드/P2P 전문가 (Rust)
**담당 영역**: P2P 네트워크, IPC 커맨드, 보안

### 👨‍💻 Developer B: 프론트엔드 전문가 (React/TypeScript)
**담당 영역**: UI/UX, 컴포넌트, 상태 관리

### 👨‍💻 Developer C: 풀스택/통합 전문가
**담당 영역**: API 통합, 테스트, DevOps, 문서화

---

## 📋 Sprint 1 (2주) - P2P 네트워크 완성 및 핵심 기능 안정화

### Developer A - P2P 백엔드 완성
**우선순위: 🔴 Critical**

#### Task A-1: P2P IPC 커맨드 연결 (3일)
**파일**: `src-tauri/src/main.rs`

현재 `not_implemented`로 되어있는 P2P 커맨드들을 실제 구현과 연결:

```rust
// 연결해야 할 커맨드 목록:
"internal-p2p:start"           -> p2p_state.internal.start()
"internal-p2p:stop"            -> p2p_state.internal.stop()
"internal-p2p:get-peers"       -> p2p_state.internal.get_peers()
"internal-p2p:send-message"    -> p2p_state.internal.send_message()
"internal-p2p:broadcast"       -> p2p_state.internal.broadcast()
"internal-p2p:offer-file"      -> p2p_state.internal.offer_file()
"internal-p2p:accept-file"     -> p2p_state.internal.accept_file()
"internal-p2p:reject-file"     -> p2p_state.internal.reject_file()
"internal-p2p:get-transfers"   -> p2p_state.internal.get_transfers()
"network-discovery:start"      -> p2p_state.discovery.start()
"network-discovery:stop"       -> p2p_state.discovery.stop()
"network-discovery:get-devices"-> p2p_state.discovery.get_devices()
```

**체크리스트**:
- [ ] P2PState를 Tauri managed state로 등록
- [ ] 각 IPC 핸들러에서 P2PState 접근
- [ ] async 함수들을 tauri::async_runtime으로 실행
- [ ] 에러 핸들링 및 Result 반환

#### Task A-2: P2P 메시지 릴레이 완성 (3일)
**파일**: `src-tauri/src/internal_p2p.rs`

```rust
// 구현해야 할 메서드:
impl InternalP2PManager {
    // TCP 메시지 전송 완성
    pub async fn send_message(&self, peer_id: &str, message: Value) -> Result<(), String>

    // 파일 전송 시작
    pub async fn offer_file(&self, peer_id: &str, file_path: &str) -> Result<String, String>

    // 파일 전송 수락/거절
    pub async fn accept_file(&self, transfer_id: &str) -> Result<(), String>
    pub async fn reject_file(&self, transfer_id: &str) -> Result<(), String>

    // 프론트엔드 이벤트 발행
    fn emit_peer_discovered(&self, peer: &PeerInfo)
    fn emit_peer_disconnected(&self, peer_id: &str)
    fn emit_message_received(&self, from: &str, message: &Value)
    fn emit_file_progress(&self, transfer: &FileTransfer)
}
```

**이벤트 목록** (프론트엔드로 emit):
- `p2p:peer-discovered`
- `p2p:peer-disconnected`
- `p2p:message-received`
- `p2p:file-offer`
- `p2p:file-progress`
- `p2p:file-complete`
- `p2p:file-error`

#### Task A-3: 메시지 암호화 기본 구현 (2일)
**파일**: `src-tauri/src/crypto.rs` (신규)

```rust
// 기본 암호화 모듈
pub struct MessageCrypto {
    // AES-256-GCM 사용
}

impl MessageCrypto {
    pub fn encrypt(&self, plaintext: &[u8], key: &[u8]) -> Result<Vec<u8>, CryptoError>
    pub fn decrypt(&self, ciphertext: &[u8], key: &[u8]) -> Result<Vec<u8>, CryptoError>
    pub fn generate_key() -> [u8; 32]
    pub fn derive_key(password: &str, salt: &[u8]) -> [u8; 32]
}
```

**의존성 추가** (`Cargo.toml`):
```toml
aes-gcm = "0.10"
argon2 = "0.5"
rand = "0.8"
```

#### Task A-4: 데이터베이스 마이그레이션 시스템 (2일)
**파일**: `src-tauri/src/migrations.rs` (신규)

```rust
pub struct MigrationManager {
    version: u32,
}

impl MigrationManager {
    pub fn run_migrations(conn: &Connection) -> Result<(), String>
    fn get_current_version(conn: &Connection) -> u32
    fn apply_migration(conn: &Connection, version: u32) -> Result<(), String>
}

// 마이그레이션 정의
const MIGRATIONS: &[&str] = &[
    // v1: 기본 스키마 (현재)
    // v2: 암호화 키 테이블
    "CREATE TABLE IF NOT EXISTS encryption_keys (...)",
    // v3: 메시지 검색 인덱스
    "CREATE VIRTUAL TABLE messages_fts USING fts5(...)",
];
```

---

### Developer B - 프론트엔드 P2P 통합 및 UI 개선
**우선순위: 🔴 Critical**

#### Task B-1: P2P 이벤트 리스너 구현 (2일)
**파일**: `src/hooks/useP2PNetwork.ts` (신규)

```typescript
export interface UseP2PNetworkReturn {
  // 상태
  isConnected: boolean;
  peers: PeerInfo[];
  transfers: FileTransfer[];

  // 액션
  start: (userId: string, userName: string, schoolId?: string) => Promise<void>;
  stop: () => Promise<void>;
  sendMessage: (peerId: string, message: any) => Promise<void>;
  broadcast: (message: any) => Promise<void>;
  offerFile: (peerId: string, filePath: string) => Promise<string>;
  acceptFile: (transferId: string) => Promise<void>;
  rejectFile: (transferId: string) => Promise<void>;
}

export function useP2PNetwork(): UseP2PNetworkReturn {
  // Tauri 이벤트 리스너 등록
  useEffect(() => {
    const unlisten = Promise.all([
      listen('p2p:peer-discovered', handlePeerDiscovered),
      listen('p2p:peer-disconnected', handlePeerDisconnected),
      listen('p2p:message-received', handleMessageReceived),
      listen('p2p:file-offer', handleFileOffer),
      listen('p2p:file-progress', handleFileProgress),
    ]);

    return () => { unlisten.then(fns => fns.forEach(fn => fn())); };
  }, []);
}
```

#### Task B-2: MessagingPanel P2P 통합 (3일)
**파일**: `src/components/MessagingPanel.tsx`

수정사항:
1. P2P 연결 상태 표시
2. 온라인/오프라인 메시지 전송 분기
3. P2P 파일 전송 UI
4. 실시간 피어 상태 업데이트

```typescript
// 추가해야 할 기능:
const MessagingPanel = () => {
  const { peers, sendMessage: sendP2P, isConnected: p2pConnected } = useP2PNetwork();
  const { sendMessage: sendStream } = useDurableStreams();

  // 메시지 전송 시 P2P 우선, 실패시 Stream 사용
  const handleSend = async (content: string) => {
    const peer = peers.find(p => p.userId === selectedContact.id);
    if (peer && p2pConnected) {
      await sendP2P(peer.peerId, { type: 'text', content });
    } else {
      await sendStream(selectedContact.id, content);
    }
  };
};
```

#### Task B-3: 파일 전송 UI 완성 (2일)
**파일**: `src/components/FileTransferPanel.tsx`

```typescript
// 현재: 하드코딩된 연락처
// 변경: 실제 주소록 연동 + P2P 전송

const FileTransferPanel = () => {
  const { contacts } = useAddressBook();
  const { transfers, offerFile, acceptFile, rejectFile } = useP2PNetwork();

  // 파일 선택 및 전송
  const handleFileSend = async (contactId: string) => {
    const filePath = await open({ multiple: false });
    if (filePath) {
      const peer = findPeerByUserId(contactId);
      if (peer) {
        await offerFile(peer.peerId, filePath);
      }
    }
  };

  // 수신 파일 알림 모달
  // 전송 진행률 표시
  // 전송 히스토리
};
```

#### Task B-4: 메시지 검색 UI 구현 (2일)
**파일**: `src/components/MessageSearch.tsx` (신규)

```typescript
interface MessageSearchProps {
  conversationId?: string;
  onResultClick: (messageId: string) => void;
}

const MessageSearch = ({ conversationId, onResultClick }: MessageSearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({
    dateRange: null,
    messageType: 'all',
    sender: null,
  });

  // 검색 실행
  const handleSearch = async () => {
    const results = await invoke('messages:search', {
      query,
      conversationId,
      filters,
    });
    setResults(results);
  };
};
```

#### Task B-5: 그룹 채팅 기능 완성 (3일)
**파일**: `src/components/GroupChatPanel.tsx`

추가 기능:
1. 그룹 생성 모달 완성
2. 멤버 관리 (추가/제거/권한)
3. 그룹 설정 (이름, 아바타)
4. 그룹 파일 공유
5. @멘션 기능

```typescript
// 추가 컴포넌트
const CreateGroupModal = () => { /* 그룹 생성 */ };
const GroupSettingsModal = () => { /* 그룹 설정 */ };
const MemberManagement = () => { /* 멤버 관리 */ };
const GroupFileShare = () => { /* 파일 공유 */ };
```

---

### Developer C - 통합 및 테스트
**우선순위: 🟡 High**

#### Task C-1: API 클라이언트 정리 및 에러 핸들링 (2일)
**파일**: `src/services/api.ts` (신규)

```typescript
// 중앙 API 클라이언트
class ApiClient {
  private baseUrl: string;
  private token: string | null;

  async request<T>(endpoint: string, options?: RequestOptions): Promise<T>;

  // 에러 핸들링
  private handleError(error: ApiError): never;

  // 재시도 로직
  private async retry<T>(fn: () => Promise<T>, attempts: number): Promise<T>;
}

// 에러 타입
class ApiError extends Error {
  code: string;
  status: number;
  details?: any;
}
```

#### Task C-2: 통합 테스트 환경 구축 (3일)
**파일**: `src/__tests__/`, `src-tauri/tests/`

```
tests/
├── unit/
│   ├── auth.test.ts
│   ├── messaging.test.ts
│   └── p2p.test.ts
├── integration/
│   ├── login-flow.test.ts
│   ├── messaging-flow.test.ts
│   └── file-transfer.test.ts
└── e2e/
    └── full-workflow.test.ts
```

테스트 도구:
- Vitest (단위 테스트)
- Playwright (E2E 테스트)
- Rust: `cargo test`

#### Task C-3: IPC 타입 자동 생성 (2일)
**파일**: `scripts/generate-types.ts`

```typescript
// Rust IPC 커맨드에서 TypeScript 타입 자동 생성
// main.rs의 #[tauri::command] 분석하여 타입 추출

const generateTypes = async () => {
  const rustCode = await readFile('src-tauri/src/main.rs');
  const commands = parseCommands(rustCode);
  const types = generateTypeDefinitions(commands);
  await writeFile('src/types/ipc-generated.d.ts', types);
};
```

#### Task C-4: 로깅 및 모니터링 시스템 (2일)
**파일**: `src/services/logger.ts`, `src-tauri/src/logger.rs`

```typescript
// 프론트엔드 로거
class Logger {
  private level: LogLevel;
  private handlers: LogHandler[];

  info(message: string, context?: any): void;
  warn(message: string, context?: any): void;
  error(message: string, error?: Error, context?: any): void;

  // 로그 저장 (SQLite)
  private persist(entry: LogEntry): void;

  // 로그 내보내기
  export(format: 'json' | 'csv'): Promise<string>;
}
```

```rust
// 백엔드 로거
pub struct AppLogger {
    level: LogLevel,
    file_path: PathBuf,
}

impl AppLogger {
    pub fn log(&self, level: LogLevel, message: &str, context: Option<Value>);
    pub fn export(&self, format: &str) -> Result<String, String>;
}
```

#### Task C-5: 문서화 (3일)
**파일**: `docs/`

```
docs/
├── API.md              # IPC 커맨드 문서
├── ARCHITECTURE.md     # 아키텍처 설명
├── DEVELOPMENT.md      # 개발 가이드
├── DEPLOYMENT.md       # 배포 가이드
└── USER_GUIDE.md       # 사용자 가이드
```

---

## 📋 Sprint 2 (2주) - 보안 강화 및 고급 기능

### Developer A - 보안 및 성능
**우선순위: 🟡 High**

#### Task A-5: End-to-End 암호화 (4일)
- 키 교환 프로토콜 (X25519)
- 세션 키 관리
- 메시지 암호화/복호화
- 키 백업/복구

#### Task A-6: 입력 검증 및 보안 강화 (3일)
- SQL 인젝션 방지 (prepared statements 검증)
- XSS 방지 (입력 sanitization)
- 파일 업로드 검증
- Rate limiting

#### Task A-7: 성능 최적화 (3일)
- 메시지 페이지네이션 최적화
- 데이터베이스 인덱스 튜닝
- 메모리 사용량 최적화
- 백그라운드 작업 관리

---

### Developer B - 사용자 경험 개선
**우선순위: 🟡 High**

#### Task B-6: 설정 페이지 완성 (3일)
**파일**: `src/pages/SettingsPage.tsx` (신규)

```typescript
const SettingsPage = () => {
  return (
    <Tabs>
      <Tab label="일반">
        <GeneralSettings />  {/* 언어, 시작 시 실행 등 */}
      </Tab>
      <Tab label="알림">
        <NotificationSettings />  {/* 알림 설정 */}
      </Tab>
      <Tab label="프라이버시">
        <PrivacySettings />  {/* 읽음 확인, 온라인 상태 등 */}
      </Tab>
      <Tab label="보안">
        <SecuritySettings />  {/* 암호화, 잠금 등 */}
      </Tab>
      <Tab label="저장공간">
        <StorageSettings />  {/* 데이터 관리, 내보내기 */}
      </Tab>
    </Tabs>
  );
};
```

#### Task B-7: 다크 모드 구현 (2일)
- Tailwind 다크 모드 설정
- 테마 전환 토글
- 시스템 테마 감지
- 사용자 선호 저장

#### Task B-8: 반응형 디자인 개선 (2일)
- 창 크기별 레이아웃
- 사이드바 접기/펼치기
- 모바일 친화적 터치 영역

#### Task B-9: 접근성 개선 (3일)
- 키보드 네비게이션
- 스크린 리더 지원
- 고대비 모드
- 폰트 크기 조절

---

### Developer C - 배포 및 품질 관리
**우선순위: 🟡 High**

#### Task C-6: CI/CD 파이프라인 구축 (3일)
**파일**: `.github/workflows/`

```yaml
# build.yml
name: Build & Test
on: [push, pull_request]
jobs:
  test:
    - Run unit tests
    - Run integration tests
    - Code coverage report
  build:
    - Build for Windows
    - Build for macOS (optional)
    - Create installers
```

#### Task C-7: 자동 업데이트 시스템 (3일)
- Tauri updater 설정
- 버전 관리
- 업데이트 서버 설정
- 롤백 메커니즘

#### Task C-8: 에러 리포팅 시스템 (2일)
- 에러 수집
- 사용자 피드백 수집
- 로그 첨부
- 익명 통계

#### Task C-9: 성능 모니터링 (2일)
- 메모리 사용량 추적
- CPU 사용량 추적
- 네트워크 사용량 추적
- 성능 대시보드

---

## 📋 Sprint 3 (1주) - 마무리 및 출시 준비

### 공통 작업

#### 버그 수정 및 안정화 (3일)
- 테스트에서 발견된 버그 수정
- 엣지 케이스 처리
- 메모리 누수 수정
- 성능 병목 해결

#### 문서 완성 (2일)
- API 문서 최종화
- 사용자 가이드 완성
- 배포 체크리스트
- 릴리즈 노트

#### 최종 테스트 (2일)
- 전체 기능 QA
- 보안 테스트
- 성능 테스트
- 사용성 테스트

---

## 📊 마일스톤 요약

| 주차 | Developer A | Developer B | Developer C |
|------|-------------|-------------|-------------|
| 1 | P2P IPC 연결 | P2P Hook 구현 | API 클라이언트 |
| 2 | P2P 릴레이 완성 | MessagingPanel 통합 | 테스트 환경 |
| 3 | 암호화 기본 | 파일 전송 UI | 타입 생성 |
| 4 | E2E 암호화 | 설정 페이지 | CI/CD |
| 5 | 보안 강화 | 다크 모드 | 자동 업데이트 |
| 6 | 최종 마무리 | 최종 마무리 | 최종 마무리 |

---

## 🎯 성공 기준

### MVP 출시 조건
- [ ] P2P 메시징 동작 (내부 네트워크)
- [ ] 파일 전송 완료
- [ ] 기본 암호화 적용
- [ ] 주요 버그 0건
- [ ] 성능 목표 달성 (메시지 전송 < 100ms)

### 품질 기준
- [ ] 코드 커버리지 > 70%
- [ ] 보안 취약점 0건 (Critical/High)
- [ ] 문서화 완료
- [ ] 사용자 테스트 완료

---

## 📞 커뮤니케이션

### 일일 스탠드업
- 시간: 매일 오전 10시
- 내용: 어제 한 일, 오늘 할 일, 블로커

### 주간 회의
- 시간: 매주 금요일 오후 3시
- 내용: 진행 상황 리뷰, 다음 주 계획

### 코드 리뷰
- PR 생성 시 최소 1명 리뷰 필수
- 24시간 내 리뷰 완료

---

*문서 작성일: 2026-01-03*
*버전: 1.0*
