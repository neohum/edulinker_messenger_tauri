# 내부 네트워크 전용 모드 설정 완료

## 개요
서버 연결 없이 내부 네트워크에서만 작동하도록 애플리케이션을 수정했습니다.
외부 서버 연결 실패 시 자동으로 로컬/내부 네트워크 모드로 전환되며, 사용자에게 에러 메시지를 표시하지 않습니다.

## 주요 변경사항

### 1. 로그인 에러 처리 개선 (src/pages/LoginPage.tsx)

#### 변경된 동작:
- **서버 연결 실패 시**: 조용히 로컬 SQLite DB 인증으로 자동 전환
- **에러 메시지 필터링**: 서버 연결 관련 에러는 사용자에게 표시하지 않음
- **로컬 인증 실패 시**: 이메일/비밀번호 불일치 메시지만 표시

#### 수정된 함수:
```typescript
const getFriendlyErrorMessage = (error: string, isLocalAuthError: boolean = false)
```

**필터링되는 서버 에러 패턴:**
- 'network'
- 'fetch failed'
- 'timeout'
- 'server'
- '서버 연결'
- '접근 거부'
- '네트워크 연결'

### 2. 로그인 플로우

```
1. 온라인 모드 시도 (isOnline === true)
   ├─ 성공 → 로그인 완료
   └─ 실패 → 조용히 2단계로 진행 (에러 표시 안 함)

2. 로컬/오프라인 모드 (SQLite DB)
   ├─ 성공 → 로그인 완료
   └─ 실패 → 이메일/비밀번호 불일치 에러 표시
```

### 3. 네트워크 상태 알림 제거

#### 이전:
```typescript
// 외부 네트워크 연결 실패 시 알림 표시
if (!externalAvailable && connectionChecked) {
  window.electronAPI.showNotification({
    title: '네트워크 연결 알림',
    body: '외부 네트워크에 연결할 수 없습니다...'
  });
}
```

#### 변경 후:
```typescript
// 내부 네트워크 전용 모드: 조용히 로그 만 기록
console.log('[LoginPage] 네트워크 상태:', {
  networkStatus: currentNetworkStatus,
  internal: internalAvailable,
  external: externalAvailable,
  api: apiAvailable
});
```

## 사용자 경험 개선

### 이전:
❌ "접근 거부 서버 연결에 실패했습니다. 네트워크 연결을 확인해 주세요."

### 변경 후:
✅ 서버 연결 실패 시 에러 메시지 없이 자동으로 로컬 모드로 전환
✅ 로그인 화면에서 네트워크 상태 시각적으로 표시
✅ 내부망/로컬 모드에서 정상적으로 P2P 메시징 사용 가능

## 네트워크 모드 표시

로그인 화면에 다음과 같은 시각적 표시가 유지됩니다:

- 🌐 **온라인 모드**: 외부 네트워크 + API 서버 연결됨
- 🏢 **내부망 모드**: 내부 네트워크만 연결됨 (P2P 메시징 가능)
- 💻 **로컬 모드**: API 서버만 연결됨
- 📴 **오프라인 모드**: 모든 네트워크 연결 안됨

## 테스트 방법

### 1. 서버 없이 로그인 테스트
```bash
# 서버를 실행하지 않고 앱 실행
pnpm dev
```

**예상 결과:**
- 서버 연결 에러 메시지 표시 안 됨
- 로컬 계정으로 자동 로그인 시도
- 네트워크 상태 표시: "내부망 모드" 또는 "로컬 모드"

### 2. P2P 메시징 테스트
```bash
# 터미널 1
pnpm dev:web

# 터미널 2
pnpm dev

# 터미널 3
pnpm test:instance
```

**예상 결과:**
- 두 인스턴스가 서로 발견됨
- P2P 메시지 송수신 가능
- 파일 전송 가능
- 서버 연결 없이 모든 기능 정상 작동

## 개발자 모드 기능

개발 환경에서는 네트워크 상태를 시뮬레이션할 수 있습니다:

- **외부 네트워크 토글**: 외부 인터넷 연결 on/off
- **내부 네트워크 토글**: 내부망 연결 on/off

로그인 화면에서 버튼을 클릭하여 테스트 가능합니다.

## 로그 확인

네트워크 및 인증 관련 로그는 콘솔에서 확인 가능합니다:

```javascript
// 네트워크 상태 로그
[LoginPage] 네트워크 상태: { networkStatus: 'internal', ... }

// 온라인 로그인 실패 로그
Online login failed, falling back to offline mode: ...

// 로컬 인증 로그
Using offline/local authentication
Offline login result: { success: true, ... }

// 서버 에러 필터링 로그
[LoginPage] 서버 연결 에러 무시: fetch failed
```

## 다음 단계

1. ✅ 서버 연결 실패 시 자동 fallback 구현
2. ✅ 에러 메시지 필터링 구현
3. ✅ 네트워크 알림 제거
4. 🔄 내부 네트워크 환경에서 실제 테스트
5. 🔄 여러 사용자 간 P2P 통신 테스트

## 참고사항

- 이 모드는 외부 인터넷 연결이 없는 폐쇄망 환경을 위한 것입니다
- 서버 기능이 필요한 경우 추후 서버를 설정하여 연결할 수 있습니다
- P2P 기능은 같은 네트워크 내에서만 작동합니다
- 로컬 SQLite 데이터베이스에 사용자 정보가 저장됩니다
