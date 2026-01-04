# Developer C - 풀스택/통합 전문가 작업 지시서

## 담당 영역
- API 통합 및 에러 핸들링
- 테스트 환경 구축
- CI/CD 파이프라인
- 문서화 및 DevOps

---

## 🔴 Sprint 1 - Week 1-2

### Task C-1: API 클라이언트 정리 및 에러 핸들링 (예상 2일)

#### 목표
중앙 집중식 API 클라이언트 구현 및 일관된 에러 핸들링

#### 작업 파일
- `src/services/api.ts` (신규)
- `src/services/errors.ts` (신규)

#### 상세 작업

**1. 에러 타입 정의 (src/services/errors.ts)**

```typescript
export enum ErrorCode {
  // 네트워크 에러
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  OFFLINE = 'OFFLINE',

  // 인증 에러
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',

  // 요청 에러
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // 서버 에러
  SERVER_ERROR = 'SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // 앱 에러
  IPC_ERROR = 'IPC_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  P2P_ERROR = 'P2P_ERROR',

  // 알 수 없는 에러
  UNKNOWN = 'UNKNOWN',
}

export class AppError extends Error {
  code: ErrorCode;
  status?: number;
  details?: any;
  originalError?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      status?: number;
      details?: any;
      originalError?: Error;
    }
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options?.status;
    this.details = options?.details;
    this.originalError = options?.originalError;
  }

  static fromHttpStatus(status: number, message?: string): AppError {
    const statusMap: Record<number, ErrorCode> = {
      400: ErrorCode.BAD_REQUEST,
      401: ErrorCode.UNAUTHORIZED,
      403: ErrorCode.UNAUTHORIZED,
      404: ErrorCode.NOT_FOUND,
      409: ErrorCode.CONFLICT,
      422: ErrorCode.VALIDATION_ERROR,
      500: ErrorCode.SERVER_ERROR,
      503: ErrorCode.SERVICE_UNAVAILABLE,
    };

    const code = statusMap[status] || ErrorCode.UNKNOWN;
    return new AppError(code, message || `HTTP Error ${status}`, { status });
  }

  static fromUnknown(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      // 네트워크 에러 감지
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return new AppError(ErrorCode.NETWORK_ERROR, error.message, {
          originalError: error,
        });
      }

      return new AppError(ErrorCode.UNKNOWN, error.message, {
        originalError: error,
      });
    }

    return new AppError(ErrorCode.UNKNOWN, String(error));
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
    };
  }
}

// 에러 메시지 한글화
export const errorMessages: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_ERROR]: '네트워크 연결을 확인해주세요.',
  [ErrorCode.TIMEOUT]: '요청 시간이 초과되었습니다.',
  [ErrorCode.OFFLINE]: '오프라인 상태입니다.',
  [ErrorCode.UNAUTHORIZED]: '인증이 필요합니다.',
  [ErrorCode.TOKEN_EXPIRED]: '세션이 만료되었습니다. 다시 로그인해주세요.',
  [ErrorCode.INVALID_CREDENTIALS]: '이메일 또는 비밀번호가 올바르지 않습니다.',
  [ErrorCode.BAD_REQUEST]: '잘못된 요청입니다.',
  [ErrorCode.NOT_FOUND]: '요청한 항목을 찾을 수 없습니다.',
  [ErrorCode.CONFLICT]: '충돌이 발생했습니다.',
  [ErrorCode.VALIDATION_ERROR]: '입력값을 확인해주세요.',
  [ErrorCode.SERVER_ERROR]: '서버 오류가 발생했습니다.',
  [ErrorCode.SERVICE_UNAVAILABLE]: '서비스를 사용할 수 없습니다.',
  [ErrorCode.IPC_ERROR]: '내부 통신 오류가 발생했습니다.',
  [ErrorCode.STORAGE_ERROR]: '저장소 오류가 발생했습니다.',
  [ErrorCode.P2P_ERROR]: 'P2P 연결 오류가 발생했습니다.',
  [ErrorCode.UNKNOWN]: '알 수 없는 오류가 발생했습니다.',
};

export function getErrorMessage(error: AppError | Error | unknown): string {
  if (error instanceof AppError) {
    return errorMessages[error.code] || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
```

**2. API 클라이언트 (src/services/api.ts)**

```typescript
import { invoke } from '@tauri-apps/api/core';
import { AppError, ErrorCode } from './errors';

interface RequestOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private defaultTimeout = 30000;
  private defaultRetries = 3;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  }

  setToken(token: string | null) {
    this.token = token;
  }

  // HTTP 요청
  async request<T>(
    endpoint: string,
    options: RequestInit & RequestOptions = {}
  ): Promise<T> {
    const { timeout = this.defaultTimeout, retries = 0, retryDelay = 1000, ...fetchOptions } = options;

    const headers = new Headers(fetchOptions.headers);
    headers.set('Content-Type', 'application/json');

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw AppError.fromHttpStatus(response.status, await response.text());
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof AppError) {
        throw error;
      }

      // 재시도 로직
      if (retries > 0 && this.shouldRetry(error)) {
        await this.delay(retryDelay);
        return this.request<T>(endpoint, { ...options, retries: retries - 1 });
      }

      throw AppError.fromUnknown(error);
    }
  }

  // IPC 요청 (Tauri)
  async ipc<T>(command: string, args?: Record<string, any>): Promise<T> {
    try {
      const result = await invoke<ApiResponse<T>>(command, args);

      if (!result.success && result.error) {
        throw new AppError(ErrorCode.IPC_ERROR, result.error);
      }

      return result.data as T;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(ErrorCode.IPC_ERROR, String(error), {
        originalError: error instanceof Error ? error : undefined,
      });
    }
  }

  // 재시도 여부 판단
  private shouldRetry(error: unknown): boolean {
    if (error instanceof AppError) {
      return [
        ErrorCode.NETWORK_ERROR,
        ErrorCode.TIMEOUT,
        ErrorCode.SERVER_ERROR,
        ErrorCode.SERVICE_UNAVAILABLE,
      ].includes(error.code);
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 편의 메서드
  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', ...options });
  }

  async post<T>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      ...options,
    });
  }

  async put<T>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
      ...options,
    });
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', ...options });
  }
}

// 싱글톤 인스턴스
export const api = new ApiClient();

// 스트림 API 클라이언트
export const streamApi = new ApiClient('http://127.0.0.1:41234/api/streams');

export default api;
```

**3. 에러 바운더리 컴포넌트 (src/components/ErrorBoundary.tsx)**

```typescript
import { Component, ErrorInfo, ReactNode } from 'react';
import { AppError, getErrorMessage } from '../services/errors';

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);

    // 에러 로깅 서비스로 전송
    this.logError(error, errorInfo);
  }

  private async logError(error: Error, errorInfo: ErrorInfo) {
    try {
      await invoke('log_error', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        },
      });
    } catch (e) {
      console.error('Failed to log error:', e);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error!, this.reset);
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-xl font-semibold mb-2">문제가 발생했습니다</h2>
          <p className="text-gray-600 mb-4">
            {getErrorMessage(this.state.error)}
          </p>
          <button
            onClick={this.reset}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            다시 시도
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

#### 완료 기준
- [ ] 중앙 API 클라이언트 동작
- [ ] 에러 타입 정의 완료
- [ ] 한글 에러 메시지
- [ ] ErrorBoundary 동작

---

### Task C-2: 통합 테스트 환경 구축 (예상 3일)

#### 목표
Vitest + Playwright 테스트 환경 구축

#### 작업 파일
- `vitest.config.ts`
- `playwright.config.ts`
- `src/__tests__/`
- `package.json`

#### 상세 작업

**1. 의존성 설치**

```bash
pnpm add -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom
pnpm add -D playwright @playwright/test
pnpm add -D msw  # Mock Service Worker
```

**2. Vitest 설정 (vitest.config.ts)**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/__tests__/'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**3. 테스트 셋업 (src/__tests__/setup.ts)**

```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Tauri API 모킹
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

// fetch 모킹
global.fetch = vi.fn();

// localStorage 모킹
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;
```

**4. 단위 테스트 예시 (src/__tests__/unit/auth.test.ts)**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../../store/auth';

vi.mock('@tauri-apps/api/core');

describe('Auth Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
  });

  it('should login successfully', async () => {
    const mockUser = { id: '1', email: 'test@test.com', name: 'Test User' };
    const mockToken = 'test-token';

    (invoke as any).mockResolvedValueOnce({
      success: true,
      user: mockUser,
      token: mockToken,
    });

    const { login } = useAuthStore.getState();
    await login('test@test.com', 'password');

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.token).toBe(mockToken);
    expect(state.isAuthenticated).toBe(true);
  });

  it('should handle login failure', async () => {
    (invoke as any).mockResolvedValueOnce({
      success: false,
      error: 'Invalid credentials',
    });

    const { login } = useAuthStore.getState();
    await expect(login('test@test.com', 'wrong')).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
  });

  it('should logout correctly', () => {
    useAuthStore.setState({
      user: { id: '1', email: 'test@test.com', name: 'Test' },
      token: 'token',
      isAuthenticated: true,
    });

    const { logout } = useAuthStore.getState();
    logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});
```

**5. 컴포넌트 테스트 (src/__tests__/unit/MessagingPanel.test.tsx)**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MessagingPanel from '../../components/MessagingPanel';
import { useAuthStore } from '../../store/auth';

vi.mock('../../hooks/useP2PNetwork', () => ({
  useP2PNetwork: () => ({
    isRunning: true,
    peers: [{ peerId: '1', userId: 'user-1', userName: 'Test Peer', isOnline: true }],
    sendMessage: vi.fn().mockResolvedValue(true),
    isUserOnline: vi.fn().mockReturnValue(true),
  }),
}));

vi.mock('../../hooks/useDurableStreams', () => ({
  useDurableStreams: () => ({
    messages: [],
    sendMessage: vi.fn().mockResolvedValue(true),
    isConnected: true,
  }),
}));

describe('MessagingPanel', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'current-user', email: 'test@test.com', name: 'Current User' },
      isAuthenticated: true,
    });
  });

  it('should render contact list', () => {
    render(<MessagingPanel />);
    expect(screen.getByText('Test Peer')).toBeInTheDocument();
  });

  it('should send message when button clicked', async () => {
    render(<MessagingPanel />);

    // 연락처 선택
    fireEvent.click(screen.getByText('Test Peer'));

    // 메시지 입력
    const input = screen.getByPlaceholderText('메시지 입력...');
    fireEvent.change(input, { target: { value: 'Hello!' } });

    // 전송 버튼 클릭
    const sendButton = screen.getByRole('button', { name: /전송/i });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });
});
```

**6. Playwright E2E 테스트 (e2e/login.spec.ts)**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/');

    // 로그인 폼 입력
    await page.fill('input[name="email"]', 'teacher@test.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // 대시보드로 이동 확인
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('대시보드');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/');

    await page.fill('input[name="email"]', 'wrong@test.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // 에러 메시지 확인
    await expect(page.locator('.error-message')).toBeVisible();
  });
});
```

**7. package.json 스크립트 추가**

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

#### 완료 기준
- [ ] Vitest 단위 테스트 실행
- [ ] 커버리지 리포트 생성
- [ ] Playwright E2E 테스트 실행
- [ ] 주요 컴포넌트 테스트 작성

---

### Task C-3: IPC 타입 자동 생성 (예상 2일)

#### 목표
Rust IPC 커맨드에서 TypeScript 타입 자동 생성

#### 작업 파일
- `scripts/generate-ipc-types.ts`
- `src/types/ipc-generated.d.ts`

#### 상세 작업

```typescript
// scripts/generate-ipc-types.ts
import * as fs from 'fs';
import * as path from 'path';

interface Command {
  name: string;
  params: { name: string; type: string; optional: boolean }[];
  returnType: string;
}

function parseRustType(rustType: string): string {
  const typeMap: Record<string, string> = {
    'String': 'string',
    '&str': 'string',
    'i32': 'number',
    'i64': 'number',
    'u32': 'number',
    'u64': 'number',
    'f32': 'number',
    'f64': 'number',
    'bool': 'boolean',
    'Value': 'any',
    'Vec<String>': 'string[]',
    'Vec<Value>': 'any[]',
    'Option<String>': 'string | undefined',
    'Option<u64>': 'number | undefined',
    'Option<i64>': 'number | undefined',
  };

  return typeMap[rustType] || 'any';
}

function parseCommand(code: string): Command | null {
  // #[tauri::command] 다음 줄의 함수 시그니처 파싱
  const fnMatch = code.match(/async\s+fn\s+(\w+)\s*\(([\s\S]*?)\)\s*->\s*Result<([^,]+),/);

  if (!fnMatch) return null;

  const [, name, paramsStr, returnType] = fnMatch;

  // State 파라미터 제외하고 파싱
  const params = paramsStr
    .split(',')
    .map((p) => p.trim())
    .filter((p) => !p.includes('State<') && p.length > 0)
    .map((p) => {
      const [paramName, paramType] = p.split(':').map((s) => s.trim());
      const optional = paramType?.startsWith('Option<');
      return {
        name: paramName,
        type: parseRustType(paramType?.replace(/Option<(.+)>/, '$1') || 'any'),
        optional,
      };
    });

  return {
    name,
    params,
    returnType: parseRustType(returnType.trim()),
  };
}

function generateTypes(commands: Command[]): string {
  let output = `// 이 파일은 자동 생성되었습니다. 직접 수정하지 마세요.\n`;
  output += `// 생성 시간: ${new Date().toISOString()}\n\n`;

  output += `declare module '@tauri-apps/api/core' {\n`;

  for (const cmd of commands) {
    const argsType =
      cmd.params.length > 0
        ? `{ ${cmd.params
            .map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`)
            .join('; ')} }`
        : 'void';

    output += `  export function invoke(cmd: '${cmd.name}'`;
    if (argsType !== 'void') {
      output += `, args: ${argsType}`;
    }
    output += `): Promise<${cmd.returnType}>;\n`;
  }

  output += `}\n`;

  return output;
}

async function main() {
  const mainRsPath = path.join(__dirname, '../src-tauri/src/main.rs');
  const outputPath = path.join(__dirname, '../src/types/ipc-generated.d.ts');

  const code = fs.readFileSync(mainRsPath, 'utf-8');

  // #[tauri::command] 블록 추출
  const commandBlocks = code.split('#[tauri::command]').slice(1);

  const commands: Command[] = [];

  for (const block of commandBlocks) {
    const cmd = parseCommand(block);
    if (cmd) {
      commands.push(cmd);
    }
  }

  console.log(`Found ${commands.length} commands`);

  const types = generateTypes(commands);
  fs.writeFileSync(outputPath, types);

  console.log(`Generated types at ${outputPath}`);
}

main().catch(console.error);
```

**package.json에 스크립트 추가**

```json
{
  "scripts": {
    "generate:types": "ts-node scripts/generate-ipc-types.ts"
  }
}
```

---

### Task C-4: 로깅 시스템 (예상 2일)

#### 작업 파일
- `src/services/logger.ts`
- `src-tauri/src/logger.rs`

**프론트엔드 로거 (src/services/logger.ts)**

```typescript
import { invoke } from '@tauri-apps/api/core';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: any;
  timestamp: string;
  source: string;
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private buffer: LogEntry[] = [];
  private bufferSize = 100;

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private log(level: LogLevel, message: string, context?: any) {
    if (level < this.level) return;

    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
      source: 'frontend',
    };

    // 콘솔 출력
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const consoleMethods = [console.debug, console.info, console.warn, console.error];
    consoleMethods[level](`[${levelNames[level]}] ${message}`, context || '');

    // 버퍼에 추가
    this.buffer.push(entry);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }

    // 백엔드로 전송 (ERROR만)
    if (level >= LogLevel.ERROR) {
      this.persist(entry);
    }
  }

  debug(message: string, context?: any) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: any) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: any) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, error?: Error | any, context?: any) {
    this.log(LogLevel.ERROR, message, {
      ...context,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    });
  }

  private async persist(entry: LogEntry) {
    try {
      await invoke('log_entry', { entry });
    } catch (e) {
      console.error('Failed to persist log:', e);
    }
  }

  getBuffer(): LogEntry[] {
    return [...this.buffer];
  }

  async export(format: 'json' | 'csv' = 'json'): Promise<string> {
    if (format === 'json') {
      return JSON.stringify(this.buffer, null, 2);
    }

    // CSV 형식
    const header = 'timestamp,level,message,context\n';
    const rows = this.buffer.map(
      (e) =>
        `${e.timestamp},${LogLevel[e.level]},${e.message.replace(/,/g, ';')},${
          e.context ? JSON.stringify(e.context) : ''
        }`
    );
    return header + rows.join('\n');
  }

  clear() {
    this.buffer = [];
  }
}

export const logger = new Logger();
export default logger;
```

---

### Task C-5: 문서화 (예상 3일)

#### 작업 파일
- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`

**API 문서 템플릿 (docs/API.md)**

```markdown
# Edulinker Messenger API 문서

## IPC 커맨드

### 인증

#### auth:login
사용자 로그인

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string | ✓ | 이메일 |
| password | string | ✓ | 비밀번호 |

**응답**
```json
{
  "success": true,
  "user": { "id": "...", "email": "...", "name": "..." },
  "token": "jwt-token"
}
```

### 메시징

#### streams_send_message
메시지 전송

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| senderId | string | ✓ | 발신자 ID |
| recipientId | string | ✓ | 수신자 ID |
| content | string | ✓ | 메시지 내용 |
| msgType | string | - | 메시지 타입 |

...
```

---

## 📋 체크리스트

### Week 1
- [ ] Task C-1: API 클라이언트 및 에러 핸들링
- [ ] Task C-2 시작: 테스트 환경 구축

### Week 2
- [ ] Task C-2 완료
- [ ] Task C-3: IPC 타입 생성
- [ ] Task C-4: 로깅 시스템
- [ ] Task C-5 시작: 문서화

---

## 📊 품질 목표

| 지표 | 목표 |
|------|------|
| 코드 커버리지 | > 70% |
| 단위 테스트 | 주요 로직 100% |
| E2E 테스트 | 핵심 플로우 100% |
| 문서화 | IPC 커맨드 100% |

---

*작성일: 2026-01-03*
