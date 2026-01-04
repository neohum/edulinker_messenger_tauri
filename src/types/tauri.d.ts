/**
 * Tauri IPC 커맨드 타입 정의
 */

// tus 관련 타입
export interface TusEndpointResponse {
  success: boolean;
  endpoint: string;
}

export interface TusUploadStatusResponse {
  success: boolean;
  upload?: {
    id: string;
    offset: number;
    length: number;
    isComplete: boolean;
    filename: string;
    finalPath?: string;
  };
  error?: string;
}

// Durable Streams 관련 타입
export interface StreamEndpointsResponse {
  success: boolean;
  endpoint: string;
  sseEndpoint: string;
  pollEndpoint: string;
}

export interface StreamMessageResponse {
  success: boolean;
  message?: {
    id: string;
    offset: number;
    timestamp: string;
  };
  error?: string;
}

export interface StreamMessagesResponse {
  success: boolean;
  messages: Array<{
    id: string;
    offset: number;
    type: string;
    payload: any;
    senderId: string;
    recipientId: string;
    timestamp: string;
  }>;
  nextOffset: number;
  error?: string;
}

export interface StreamOffsetResponse {
  success: boolean;
  offset: number;
}

export interface StreamInfoResponse {
  success: boolean;
  info?: {
    path: string;
    mode: 'json' | 'bytes';
    currentOffset: number;
    totalBytes: number;
    createdAt: string;
    updatedAt: string;
    etag: string;
  };
  error?: string;
}

export interface StreamDeleteResponse {
  success: boolean;
  error?: string;
}

export interface StreamHealthResponse {
  success: boolean;
  health?: {
    status: string;
    messageCount: number;
    currentOffset: number;
    totalBytes: number;
    etag: string;
  };
  error?: string;
}

// Tauri 커맨드 확장
declare module '@tauri-apps/api/core' {
  export function invoke(cmd: 'tus_get_endpoint'): Promise<TusEndpointResponse>;
  export function invoke(cmd: 'tus_get_upload_status', args: { uploadId: string }): Promise<TusUploadStatusResponse>;

  export function invoke(cmd: 'streams_get_endpoint'): Promise<StreamEndpointsResponse>;
  export function invoke(
    cmd: 'streams_send_message',
    args: {
      senderId: string;
      recipientId: string;
      content: string;
      msgType?: string;
    }
  ): Promise<StreamMessageResponse>;
  export function invoke(
    cmd: 'streams_get_messages',
    args: {
      userId: string;
      otherUserId?: string;
      fromOffset?: number;
      limit?: number;
    }
  ): Promise<StreamMessagesResponse>;
  export function invoke(cmd: 'streams_get_current_offset'): Promise<StreamOffsetResponse>;
  export function invoke(cmd: 'streams_get_info'): Promise<StreamInfoResponse>;
  export function invoke(cmd: 'streams_delete_message', args: { messageId: string }): Promise<StreamDeleteResponse>;
  export function invoke(cmd: 'streams_health_check'): Promise<StreamHealthResponse>;
}
