import { useState } from 'react';

interface Service {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  status: 'active' | 'development' | 'planned';
  category: 'core' | 'communication' | 'management' | 'tools';
}

const services: Service[] = [
  {
    id: 'main',
    name: 'edulinker.dev',
    description: '메인 허브 (SSO, 권한, 알림, 통합검색)',
    url: 'http://localhost:3000',
    icon: '🏠',
    status: 'development',
    category: 'core',
  },
  {
    id: 'gatong',
    name: '가통',
    description: '공지/메시지/설문/동의서 관리',
    url: 'http://localhost:3001',
    icon: '📢',
    status: 'development',
    category: 'communication',
  },
  {
    id: 'sendipass',
    name: 'sendipass',
    description: '학생 계정/비밀번호 안전 배포',
    url: 'http://localhost:3002',
    icon: '🔐',
    status: 'development',
    category: 'management',
  },
  {
    id: 'sign-school',
    name: 'sign-school',
    description: '전자서명 시스템',
    url: 'http://localhost:3003',
    icon: '✍️',
    status: 'development',
    category: 'management',
  },
  {
    id: 'g6-sendoc',
    name: 'G6-Sendoc',
    description: '원서 서명',
    url: 'http://localhost:3004',
    icon: '📄',
    status: 'development',
    category: 'management',
  },
  {
    id: 'school-vote',
    name: 'school투표',
    description: '선거 관리 시스템',
    url: 'http://localhost:3005',
    icon: '🗳️',
    status: 'planned',
    category: 'management',
  },
  {
    id: 'pc-info',
    name: 'pc-info',
    description: 'PC 자산 관리',
    url: 'http://localhost:3006',
    icon: '💻',
    status: 'planned',
    category: 'tools',
  },
  {
    id: 'share-ppt',
    name: 'share-ppt',
    description: '발표 동기화',
    url: 'http://localhost:3007',
    icon: '📊',
    status: 'planned',
    category: 'tools',
  },
  {
    id: 'graduation-ppt',
    name: 'graduation-ppt',
    description: '졸업 PPT 생성',
    url: 'http://localhost:3008',
    icon: '🎓',
    status: 'planned',
    category: 'tools',
  },
  {
    id: 'ai-class',
    name: 'AI 반편성',
    description: '로컬 학급 배정 최적화',
    url: 'local://ai-class',
    icon: '🤖',
    status: 'planned',
    category: 'tools',
  },
];

export default function ServicesList() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredServices =
    selectedCategory === 'all'
      ? services
      : services.filter((s) => s.category === selectedCategory);

  const handleServiceClick = (service: Service) => {
    if (service.status === 'planned') {
      alert(`${service.name}은(는) 아직 개발 중입니다.`);
      return;
    }

    // Open service in new window or embedded view
    if (service.url.startsWith('http')) {
      window.open(service.url, '_blank');
    } else {
      alert(`로컬 앱 ${service.name} 실행 기능은 곧 추가됩니다.`);
    }
  };

  const getStatusBadge = (status: Service['status']) => {
    const badges = {
      active: 'bg-green-100 text-green-800',
      development: 'bg-yellow-100 text-yellow-800',
      planned: 'bg-gray-100 text-gray-800',
    };
    const labels = {
      active: '운영중',
      development: '개발중',
      planned: '계획중',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${badges[status]}`}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">서비스 목록</h2>
          
          {/* Category Filter */}
          <div className="flex space-x-2">
            {[
              { id: 'all', label: '전체' },
              { id: 'core', label: '핵심' },
              { id: 'communication', label: '소통' },
              { id: 'management', label: '관리' },
              { id: 'tools', label: '도구' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-gray-600 text-white'
                    : 'theme-surface-translucent text-gray-700 hover:bg-white/50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map((service) => (
            <button
              key={service.id}
              onClick={() => handleServiceClick(service)}
              className="p-6 theme-surface-translucent rounded-lg shadow hover:shadow-lg transition-shadow text-left hover:bg-white/50"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-4xl">{service.icon}</span>
                {getStatusBadge(service.status)}
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">{service.name}</h3>
              <p className="text-sm text-gray-600">{service.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

