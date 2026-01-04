import React, { useState, useEffect } from 'react';
import { useNetworkStore } from '../store/network';

interface DevFabProps {
  onClick: () => void;
}

export const DevFab: React.FC<DevFabProps> = ({ onClick }) => {
  const { simulationEnabled, getEffectiveInternalNetwork, getEffectiveExternalNetwork } = useNetworkStore();
  const [isHovered, setIsHovered] = useState(false);

  const effectiveInternal = getEffectiveInternalNetwork();
  const effectiveExternal = getEffectiveExternalNetwork();

  // 네트워크 상태에 따른 색상
  const getStatusColor = () => {
    if (!effectiveInternal && !effectiveExternal) return 'bg-red-600 hover:bg-red-500';
    if (!effectiveInternal || !effectiveExternal) return 'bg-yellow-600 hover:bg-yellow-500';
    return 'bg-gray-700 hover:bg-gray-600';
  };

  // 키보드 단축키 (Ctrl + Shift + D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClick]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all duration-200 ${getStatusColor()}`}
      title="개발자 도구 (Ctrl+Shift+D)"
    >
      {/* Icon */}
      <div className="relative">
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {/* Simulation indicator */}
        {simulationEnabled && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-gray-700 animate-pulse" />
        )}
      </div>

      {/* Label (shown on hover) */}
      <span className={`text-white text-sm font-medium overflow-hidden transition-all duration-200 ${isHovered ? 'max-w-32 opacity-100' : 'max-w-0 opacity-0'}`}>
        DEV
      </span>

      {/* Network Status Indicators */}
      <div className="flex gap-1">
        <div
          className={`w-2 h-2 rounded-full ${effectiveInternal ? 'bg-green-400' : 'bg-red-400'}`}
          title={`내부 네트워크: ${effectiveInternal ? '연결됨' : '끊김'}`}
        />
        <div
          className={`w-2 h-2 rounded-full ${effectiveExternal ? 'bg-green-400' : 'bg-red-400'}`}
          title={`외부 네트워크: ${effectiveExternal ? '연결됨' : '끊김'}`}
        />
      </div>
    </button>
  );
};

export default DevFab;
