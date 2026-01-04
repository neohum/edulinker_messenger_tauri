import { create } from 'zustand';

export interface NetworkSimulationState {
  // 실제 네트워크 상태
  realInternalNetwork: boolean;
  realExternalNetwork: boolean;

  // 시뮬레이션 설정
  simulationEnabled: boolean;
  simulatedInternalNetwork: boolean;
  simulatedExternalNetwork: boolean;

  // 시뮬레이션 옵션
  simulatedLatency: number; // ms
  simulatedPacketLoss: number; // 0-100%
  simulatedBandwidth: 'unlimited' | 'fast' | 'medium' | 'slow' | '2g';

  // 네트워크 상태 로그
  networkLogs: NetworkLog[];

  // Actions
  setRealNetworkStatus: (internal: boolean, external: boolean) => void;
  toggleSimulation: () => void;
  setSimulatedInternalNetwork: (active: boolean) => void;
  setSimulatedExternalNetwork: (active: boolean) => void;
  setSimulatedLatency: (latency: number) => void;
  setSimulatedPacketLoss: (loss: number) => void;
  setSimulatedBandwidth: (bandwidth: NetworkSimulationState['simulatedBandwidth']) => void;
  addNetworkLog: (log: Omit<NetworkLog, 'id' | 'timestamp'>) => void;
  clearNetworkLogs: () => void;

  // Computed
  getEffectiveInternalNetwork: () => boolean;
  getEffectiveExternalNetwork: () => boolean;
}

export interface NetworkLog {
  id: string;
  timestamp: Date;
  type: 'info' | 'warning' | 'error' | 'success';
  source: 'internal' | 'external' | 'simulation';
  message: string;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useNetworkStore = create<NetworkSimulationState>((set, get) => ({
  // 초기 상태
  realInternalNetwork: true,
  realExternalNetwork: true,

  simulationEnabled: false,
  simulatedInternalNetwork: true,
  simulatedExternalNetwork: true,

  simulatedLatency: 0,
  simulatedPacketLoss: 0,
  simulatedBandwidth: 'unlimited',

  networkLogs: [],

  // Actions
  setRealNetworkStatus: (internal, external) => {
    set({ realInternalNetwork: internal, realExternalNetwork: external });
    get().addNetworkLog({
      type: 'info',
      source: internal ? 'internal' : 'external',
      message: `실제 네트워크 상태 변경 - 내부: ${internal ? '연결됨' : '끊김'}, 외부: ${external ? '연결됨' : '끊김'}`
    });
  },

  toggleSimulation: () => {
    const newValue = !get().simulationEnabled;
    set({ simulationEnabled: newValue });
    get().addNetworkLog({
      type: newValue ? 'warning' : 'info',
      source: 'simulation',
      message: newValue ? '네트워크 시뮬레이션 모드 활성화됨' : '네트워크 시뮬레이션 모드 비활성화됨'
    });
  },

  setSimulatedInternalNetwork: (active) => {
    set({ simulatedInternalNetwork: active });
    get().addNetworkLog({
      type: active ? 'success' : 'warning',
      source: 'simulation',
      message: `시뮬레이션: 내부 네트워크 ${active ? '연결' : '끊김'} 설정`
    });
  },

  setSimulatedExternalNetwork: (active) => {
    set({ simulatedExternalNetwork: active });
    get().addNetworkLog({
      type: active ? 'success' : 'warning',
      source: 'simulation',
      message: `시뮬레이션: 외부 네트워크 ${active ? '연결' : '끊김'} 설정`
    });
  },

  setSimulatedLatency: (latency) => {
    set({ simulatedLatency: latency });
    get().addNetworkLog({
      type: 'info',
      source: 'simulation',
      message: `시뮬레이션: 지연시간 ${latency}ms로 설정`
    });
  },

  setSimulatedPacketLoss: (loss) => {
    set({ simulatedPacketLoss: loss });
    get().addNetworkLog({
      type: loss > 0 ? 'warning' : 'info',
      source: 'simulation',
      message: `시뮬레이션: 패킷 손실률 ${loss}%로 설정`
    });
  },

  setSimulatedBandwidth: (bandwidth) => {
    set({ simulatedBandwidth: bandwidth });
    const bandwidthLabels = {
      unlimited: '무제한',
      fast: '빠름 (100Mbps)',
      medium: '보통 (10Mbps)',
      slow: '느림 (1Mbps)',
      '2g': '2G (256Kbps)'
    };
    get().addNetworkLog({
      type: 'info',
      source: 'simulation',
      message: `시뮬레이션: 대역폭 ${bandwidthLabels[bandwidth]}로 설정`
    });
  },

  addNetworkLog: (log) => {
    const newLog: NetworkLog = {
      ...log,
      id: generateId(),
      timestamp: new Date()
    };
    set((state) => ({
      networkLogs: [newLog, ...state.networkLogs].slice(0, 100) // 최대 100개 유지
    }));
  },

  clearNetworkLogs: () => {
    set({ networkLogs: [] });
  },

  // Computed getters
  getEffectiveInternalNetwork: () => {
    const state = get();
    if (state.simulationEnabled) {
      return state.simulatedInternalNetwork;
    }
    return state.realInternalNetwork;
  },

  getEffectiveExternalNetwork: () => {
    const state = get();
    if (state.simulationEnabled) {
      return state.simulatedExternalNetwork;
    }
    return state.realExternalNetwork;
  }
}));
