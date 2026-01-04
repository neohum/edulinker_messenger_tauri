# Edulinker Messenger 자동 업데이트 설정 가이드

## 개요

앱이 와사비 버킷의 `latest.json` 파일을 확인하여 새 버전이 있으면 자동으로 다운로드 및 설치합니다.

## 1. 서명 키 생성

Tauri 업데이트는 서명된 바이너리만 설치할 수 있습니다.

```bash
# 키 생성 (비밀번호 설정 필요)
pnpm tauri signer generate -w ~/.tauri/edulinker.key
```

출력 예시:
```
Your keypair was generated successfully
Private: ~/.tauri/edulinker.key
Public: dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYy...
```

**Public Key**를 `tauri.conf.json`의 `plugins.updater.pubkey`에 입력하세요.

## 2. 와사비 버킷 구조

버킷: `edulinkermessenger`
리전: `ap-northeast-1`
URL: `https://s3.ap-northeast-1.wasabisys.com/edulinkermessenger/`

```
edulinkermessenger/
└── updates/
    ├── latest.json                    # 최신 버전 정보 (필수)
    └── 0.1.4/                         # 버전별 폴더
        ├── edulinker_messenger_0.1.4_x64-setup.nsis.zip      # Windows 설치 파일
        └── edulinker_messenger_0.1.4_x64-setup.nsis.zip.sig  # 서명 파일
```

## 3. latest.json 형식

새 버전을 배포할 때 이 파일을 업데이트합니다.

```json
{
  "version": "0.1.4",
  "notes": "버그 수정 및 성능 개선\n- 메시지 전송 속도 향상\n- UI 개선",
  "pub_date": "2026-01-03T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9t...",
      "url": "https://s3.ap-northeast-1.wasabisys.com/edulinkermessenger/updates/0.1.4/edulinker_messenger_0.1.4_x64-setup.nsis.zip"
    }
  }
}
```

### 필드 설명

| 필드 | 설명 |
|------|------|
| `version` | 새 버전 번호 (현재 앱 버전보다 높아야 함) |
| `notes` | 업데이트 내용 (사용자에게 표시됨) |
| `pub_date` | 배포 날짜 (ISO 8601 형식) |
| `platforms` | 플랫폼별 다운로드 정보 |
| `signature` | `.sig` 파일의 내용 |
| `url` | 설치 파일 다운로드 URL |

## 4. 빌드 및 배포 방법

### 4.1 버전 업데이트

`tauri.conf.json`에서 버전 수정:
```json
{
  "version": "0.1.4"
}
```

### 4.2 서명된 빌드 생성

```bash
# Windows (PowerShell)
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content ~/.tauri/edulinker.key -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-password"
pnpm tauri build
```

### 4.3 생성된 파일 확인

빌드 후 `src-tauri/target/release/bundle/nsis/` 폴더:
- `edulinker_messenger_0.1.4_x64-setup.nsis.zip` - 설치 파일
- `edulinker_messenger_0.1.4_x64-setup.nsis.zip.sig` - 서명 파일

### 4.4 와사비에 업로드

1. 와사비 콘솔 접속: https://console.wasabisys.com
2. `edulinkermessenger` 버킷 선택
3. `updates/0.1.4/` 폴더 생성
4. `.zip`과 `.sig` 파일 업로드
5. `updates/latest.json` 파일 업데이트

### 4.5 latest.json 업데이트

```json
{
  "version": "0.1.4",
  "notes": "새로운 기능 추가",
  "pub_date": "2026-01-03T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "sig 파일 내용을 여기에 붙여넣기",
      "url": "https://s3.ap-northeast-1.wasabisys.com/edulinkermessenger/updates/0.1.4/edulinker_messenger_0.1.4_x64-setup.nsis.zip"
    }
  }
}
```

## 5. 와사비 버킷 권한 설정

버킷의 `updates/` 폴더를 공개 읽기로 설정해야 합니다.

1. 와사비 콘솔 > 버킷 선택 > Settings > Policies
2. 다음 정책 추가:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadUpdates",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::edulinkermessenger/updates/*"
    }
  ]
}
```

## 6. 업데이트 동작 방식

1. **앱 시작 시**: 3초 후 `latest.json` 확인
2. **주기적 체크**: 1시간마다 자동 확인
3. **수동 체크**: 설정 > 앱 업데이트 > "업데이트 확인" 버튼

새 버전 발견 시:
1. 업데이트 알림 모달 표시
2. 사용자가 "지금 업데이트" 클릭
3. 파일 다운로드 (진행률 표시)
4. 서명 검증
5. 설치 및 앱 재시작

## 7. 문제 해결

### 업데이트가 감지되지 않음
- `latest.json`의 `version`이 현재 앱 버전보다 높은지 확인
- 와사비 버킷 공개 설정 확인
- 브라우저에서 `https://s3.ap-northeast-1.wasabisys.com/edulinkermessenger/updates/latest.json` 접근 가능한지 확인

### 서명 검증 실패
- `.sig` 파일 내용이 `latest.json`의 `signature` 필드와 일치하는지 확인
- `tauri.conf.json`의 `pubkey`가 올바른지 확인

### 다운로드 실패
- 설치 파일 URL이 올바른지 확인
- 파일이 와사비에 존재하는지 확인
