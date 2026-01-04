import { useState, ReactNode } from 'react';

interface CollapsibleCardProps {
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export default function CollapsibleCard({
  title,
  description,
  icon,
  children,
  defaultOpen = false,
  className = '',
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`theme-surface-translucent rounded-lg shadow overflow-hidden ${className}`}>
      {/* 헤더 (클릭하여 펼치기/접기) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 text-left theme-text transition-colors hover:bg-white/10 flex items-center justify-between"
      >
        <div className="flex items-center space-x-3">
          <div className="theme-text-secondary">
            {icon}
          </div>
          <div>
            <h3 className="font-medium theme-text">{title}</h3>
            {description && (
              <p className="text-sm theme-text-secondary">{description}</p>
            )}
          </div>
        </div>
        <svg
          className={`w-5 h-5 theme-text-secondary transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 컨텐츠 (슬라이딩 애니메이션) */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 pt-2 border-t border-current/10">
          {children}
        </div>
      </div>
    </div>
  );
}
