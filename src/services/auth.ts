import { User } from '../store/auth';
import { invoke } from '@tauri-apps/api/core';

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  role: 'STUDENT' | 'TEACHER' | 'PARENT' | 'ADMIN';
  region?: string;
  school?: string;
  schoolId?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

export class AuthService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  }

  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || '로그인에 실패했습니다.',
        };
      }

      return {
        success: true,
        token: data.token,
        user: data.user,
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: '네트워크 오류가 발생했습니다.',
      };
    }
  }

  // Note: This method is for online signup via API server
  // For offline signup, use offlineSignup() method instead
  async signup(userData: SignupRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || '회원가입에 실패했습니다.',
        };
      }

      return {
        success: true,
        token: data.token,
        user: data.user,
      };
    } catch (error) {
      console.error('Signup error:', error);
      return {
        success: false,
        error: '네트워크 오류가 발생했습니다.',
      };
    }
  }

  async offlineSignup(userData: SignupRequest): Promise<AuthResponse> {
    try {
      // Tauri invoke를 사용하여 Rust 백엔드 호출
      const result = await invoke<{
        success: boolean;
        token?: string;
        user?: User;
        error?: string;
      }>('ipc', {
        channel: 'auth:offline-register',
        args: userData,
      });

      console.log('🔍 [FRONTEND] offlineRegister result:', result);

      if (!result || !result.success) {
        console.error('❌ [FRONTEND] Registration failed:', result?.error);
        return {
          success: false,
          error: result?.error || '오프라인 회원가입에 실패했습니다.',
        };
      }

      console.log('✅ [FRONTEND] Registration successful');

      return {
        success: true,
        token: result.token,
        user: result.user,
      };
    } catch (error) {
      console.error('Offline signup error:', error);
      return {
        success: false,
        error: '오프라인 회원가입 중 오류가 발생했습니다.',
      };
    }
  }

  async refreshToken(): Promise<AuthResponse> {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        return { success: false, error: '토큰이 없습니다.' };
      }

      const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || '토큰 갱신에 실패했습니다.',
        };
      }

      return {
        success: true,
        token: data.token,
        user: data.user,
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      return {
        success: false,
        error: '네트워크 오류가 발생했습니다.',
      };
    }
  }
}

export const authService = new AuthService();