import { useEffect, useState, useRef } from 'react';
import { useBackgroundStore } from '../store/background';

// 카테고리별 배경 이미지
const IMAGE_CATEGORIES = [
  {
    id: 'nature',
    label: '자연',
    images: [
      { id: 'nature-1', label: '숲', url: 'https://picsum.photos/seed/forest1/1600/900' },
      { id: 'nature-2', label: '산', url: 'https://picsum.photos/seed/mountain1/1600/900' },
      { id: 'nature-3', label: '바다', url: 'https://picsum.photos/seed/ocean1/1600/900' },
      { id: 'nature-4', label: '호수', url: 'https://picsum.photos/seed/lake1/1600/900' },
      { id: 'nature-5', label: '꽃밭', url: 'https://picsum.photos/seed/flower1/1600/900' },
      { id: 'nature-6', label: '폭포', url: 'https://picsum.photos/seed/waterfall1/1600/900' },
      { id: 'nature-7', label: '계곡', url: 'https://picsum.photos/seed/valley1/1600/900' },
      { id: 'nature-8', label: '들판', url: 'https://picsum.photos/seed/field1/1600/900' },
      { id: 'nature-9', label: '정원', url: 'https://picsum.photos/seed/garden1/1600/900' },
      { id: 'nature-10', label: '나무', url: 'https://picsum.photos/seed/tree1/1600/900' },
    ]
  },
  {
    id: 'sky',
    label: '하늘',
    images: [
      { id: 'sky-1', label: '맑은 하늘', url: 'https://picsum.photos/seed/bluesky1/1600/900' },
      { id: 'sky-2', label: '구름', url: 'https://picsum.photos/seed/clouds1/1600/900' },
      { id: 'sky-3', label: '노을', url: 'https://picsum.photos/seed/sunset1/1600/900' },
      { id: 'sky-4', label: '별밤', url: 'https://picsum.photos/seed/stars1/1600/900' },
      { id: 'sky-5', label: '은하수', url: 'https://picsum.photos/seed/galaxy1/1600/900' },
      { id: 'sky-6', label: '오로라', url: 'https://picsum.photos/seed/aurora1/1600/900' },
      { id: 'sky-7', label: '일출', url: 'https://picsum.photos/seed/sunrise1/1600/900' },
      { id: 'sky-8', label: '달밤', url: 'https://picsum.photos/seed/moonnight1/1600/900' },
      { id: 'sky-9', label: '무지개', url: 'https://picsum.photos/seed/rainbow1/1600/900' },
      { id: 'sky-10', label: '황혼', url: 'https://picsum.photos/seed/twilight1/1600/900' },
    ]
  },
  {
    id: 'ocean',
    label: '바다',
    images: [
      { id: 'ocean-1', label: '해변', url: 'https://picsum.photos/seed/beach1/1600/900' },
      { id: 'ocean-2', label: '파도', url: 'https://picsum.photos/seed/waves1/1600/900' },
      { id: 'ocean-3', label: '수중', url: 'https://picsum.photos/seed/underwater1/1600/900' },
      { id: 'ocean-4', label: '산호초', url: 'https://picsum.photos/seed/coral1/1600/900' },
      { id: 'ocean-5', label: '등대', url: 'https://picsum.photos/seed/lighthouse1/1600/900' },
      { id: 'ocean-6', label: '항구', url: 'https://picsum.photos/seed/harbor1/1600/900' },
      { id: 'ocean-7', label: '절벽', url: 'https://picsum.photos/seed/cliff1/1600/900' },
      { id: 'ocean-8', label: '섬', url: 'https://picsum.photos/seed/island1/1600/900' },
    ]
  },
  {
    id: 'abstract',
    label: '추상',
    images: [
      { id: 'abstract-1', label: '그라데이션', url: 'https://picsum.photos/seed/gradient1/1600/900' },
      { id: 'abstract-2', label: '기하학', url: 'https://picsum.photos/seed/geometry1/1600/900' },
      { id: 'abstract-3', label: '웨이브', url: 'https://picsum.photos/seed/wave1/1600/900' },
      { id: 'abstract-4', label: '패턴', url: 'https://picsum.photos/seed/pattern1/1600/900' },
      { id: 'abstract-5', label: '텍스처', url: 'https://picsum.photos/seed/texture1/1600/900' },
      { id: 'abstract-6', label: '모자이크', url: 'https://picsum.photos/seed/mosaic1/1600/900' },
      { id: 'abstract-7', label: '네온', url: 'https://picsum.photos/seed/neon1/1600/900' },
      { id: 'abstract-8', label: '홀로그램', url: 'https://picsum.photos/seed/hologram1/1600/900' },
      { id: 'abstract-9', label: '프리즘', url: 'https://picsum.photos/seed/prism1/1600/900' },
      { id: 'abstract-10', label: '스플래시', url: 'https://picsum.photos/seed/splash1/1600/900' },
    ]
  },
  {
    id: 'minimal',
    label: '미니멀',
    images: [
      { id: 'minimal-1', label: '심플 1', url: 'https://picsum.photos/seed/simple1/1600/900' },
      { id: 'minimal-2', label: '심플 2', url: 'https://picsum.photos/seed/simple2/1600/900' },
      { id: 'minimal-3', label: '모노톤', url: 'https://picsum.photos/seed/mono1/1600/900' },
      { id: 'minimal-4', label: '화이트', url: 'https://picsum.photos/seed/white1/1600/900' },
      { id: 'minimal-5', label: '그레이', url: 'https://picsum.photos/seed/gray1/1600/900' },
      { id: 'minimal-6', label: '블랙', url: 'https://picsum.photos/seed/black1/1600/900' },
      { id: 'minimal-7', label: '라인', url: 'https://picsum.photos/seed/lines1/1600/900' },
      { id: 'minimal-8', label: '도트', url: 'https://picsum.photos/seed/dots1/1600/900' },
    ]
  },
  {
    id: 'city',
    label: '도시',
    images: [
      { id: 'city-1', label: '야경', url: 'https://picsum.photos/seed/citynight1/1600/900' },
      { id: 'city-2', label: '건물', url: 'https://picsum.photos/seed/building1/1600/900' },
      { id: 'city-3', label: '거리', url: 'https://picsum.photos/seed/street1/1600/900' },
      { id: 'city-4', label: '다리', url: 'https://picsum.photos/seed/bridge1/1600/900' },
      { id: 'city-5', label: '공원', url: 'https://picsum.photos/seed/park1/1600/900' },
      { id: 'city-6', label: '카페', url: 'https://picsum.photos/seed/cafe1/1600/900' },
      { id: 'city-7', label: '지하철', url: 'https://picsum.photos/seed/subway1/1600/900' },
      { id: 'city-8', label: '타워', url: 'https://picsum.photos/seed/tower1/1600/900' },
      { id: 'city-9', label: '골목', url: 'https://picsum.photos/seed/alley1/1600/900' },
      { id: 'city-10', label: '광장', url: 'https://picsum.photos/seed/plaza1/1600/900' },
    ]
  },
  {
    id: 'season',
    label: '계절',
    images: [
      { id: 'season-1', label: '봄꽃', url: 'https://picsum.photos/seed/spring1/1600/900' },
      { id: 'season-2', label: '벚꽃', url: 'https://picsum.photos/seed/cherry1/1600/900' },
      { id: 'season-3', label: '여름', url: 'https://picsum.photos/seed/summer1/1600/900' },
      { id: 'season-4', label: '해바라기', url: 'https://picsum.photos/seed/sunflower1/1600/900' },
      { id: 'season-5', label: '가을', url: 'https://picsum.photos/seed/autumn1/1600/900' },
      { id: 'season-6', label: '단풍', url: 'https://picsum.photos/seed/maple1/1600/900' },
      { id: 'season-7', label: '겨울', url: 'https://picsum.photos/seed/winter1/1600/900' },
      { id: 'season-8', label: '눈', url: 'https://picsum.photos/seed/snow1/1600/900' },
    ]
  },
  {
    id: 'travel',
    label: '여행',
    images: [
      { id: 'travel-1', label: '유럽', url: 'https://picsum.photos/seed/europe1/1600/900' },
      { id: 'travel-2', label: '아시아', url: 'https://picsum.photos/seed/asia1/1600/900' },
      { id: 'travel-3', label: '사막', url: 'https://picsum.photos/seed/desert1/1600/900' },
      { id: 'travel-4', label: '열대', url: 'https://picsum.photos/seed/tropical1/1600/900' },
      { id: 'travel-5', label: '성', url: 'https://picsum.photos/seed/castle1/1600/900' },
      { id: 'travel-6', label: '사원', url: 'https://picsum.photos/seed/temple1/1600/900' },
      { id: 'travel-7', label: '마을', url: 'https://picsum.photos/seed/village1/1600/900' },
      { id: 'travel-8', label: '기차', url: 'https://picsum.photos/seed/train1/1600/900' },
    ]
  },
  {
    id: 'cozy',
    label: '아늑함',
    images: [
      { id: 'cozy-1', label: '벽난로', url: 'https://picsum.photos/seed/fireplace1/1600/900' },
      { id: 'cozy-2', label: '책', url: 'https://picsum.photos/seed/books1/1600/900' },
      { id: 'cozy-3', label: '커피', url: 'https://picsum.photos/seed/coffee1/1600/900' },
      { id: 'cozy-4', label: '창문', url: 'https://picsum.photos/seed/window1/1600/900' },
      { id: 'cozy-5', label: '소파', url: 'https://picsum.photos/seed/sofa1/1600/900' },
      { id: 'cozy-6', label: '조명', url: 'https://picsum.photos/seed/lamp1/1600/900' },
      { id: 'cozy-7', label: '비오는날', url: 'https://picsum.photos/seed/rainy1/1600/900' },
      { id: 'cozy-8', label: '캔들', url: 'https://picsum.photos/seed/candle1/1600/900' },
    ]
  },
  {
    id: 'workspace',
    label: '작업공간',
    images: [
      { id: 'workspace-1', label: '데스크', url: 'https://picsum.photos/seed/desk1/1600/900' },
      { id: 'workspace-2', label: '오피스', url: 'https://picsum.photos/seed/office1/1600/900' },
      { id: 'workspace-3', label: '스튜디오', url: 'https://picsum.photos/seed/studio1/1600/900' },
      { id: 'workspace-4', label: '라이브러리', url: 'https://picsum.photos/seed/library1/1600/900' },
      { id: 'workspace-5', label: '코워킹', url: 'https://picsum.photos/seed/coworking1/1600/900' },
      { id: 'workspace-6', label: '노트북', url: 'https://picsum.photos/seed/laptop1/1600/900' },
    ]
  },
];

// 슬라이드 카드 컴포넌트
function ImageSlider({
  category,
  selectedUrl,
  onSelect
}: {
  category: typeof IMAGE_CATEGORIES[0];
  selectedUrl: string | null;
  onSelect: (url: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium theme-text">{category.label}</h4>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="p-1 rounded hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="p-1 rounded hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {category.images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => onSelect(img.url)}
            className={`relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
              selectedUrl === img.url
                ? 'border-blue-500 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <img
              src={img.url}
              alt={img.label}
              className="h-16 w-24 object-cover"
              loading="lazy"
            />
            {selectedUrl === img.url && (
              <span className="absolute top-0.5 right-0.5 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                V
              </span>
            )}
            <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] py-0.5 text-center">
              {img.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BackgroundSettings() {
  const { backgroundImageUrl, cardOpacity, setBackgroundImageUrl, setCardOpacity } = useBackgroundStore();
  const [customUrl, setCustomUrl] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (backgroundImageUrl) {
      setCustomUrl(backgroundImageUrl);
    }
  }, [backgroundImageUrl]);

  const validateAndApplyImage = async (url: string) => {
    setWarning(null);
    setIsChecking(true);
    try {
      await setBackgroundImageUrl(url);
    } catch {
      setWarning('이미지를 불러오지 못했습니다. URL을 확인해주세요.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div>
      <div className="space-y-4">
        {/* 카드 투명도 슬라이더 */}
        <div className="flex items-center gap-3">
          <label className="w-24 text-sm theme-text-secondary flex-shrink-0">카드 투명도</label>
          <div className="flex items-center gap-3 flex-1">
            <input
              type="range"
              min="0"
              max="100"
              value={cardOpacity}
              onChange={(e) => setCardOpacity(parseInt(e.target.value, 10))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-sm theme-text-secondary w-12 text-right">{cardOpacity}%</span>
          </div>
        </div>

        {/* 배경 이미지 - 카테고리별 슬라이드 */}
        <div className="border-t border-gray-200 pt-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm theme-text-secondary">배경 이미지</label>
            {backgroundImageUrl && (
              <button
                type="button"
                onClick={() => {
                  setBackgroundImageUrl(null);
                  setCustomUrl('');
                }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                이미지 제거
              </button>
            )}
          </div>

          {/* 카테고리별 이미지 슬라이더 */}
          {IMAGE_CATEGORIES.map((category) => (
            <ImageSlider
              key={category.id}
              category={category}
              selectedUrl={backgroundImageUrl}
              onSelect={validateAndApplyImage}
            />
          ))}
        </div>

        {/* 커스텀 URL 입력 */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200">
          <input
            type="text"
            placeholder="이미지 URL을 입력하세요"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 text-sm theme-text theme-surface border border-gray-300 rounded-lg"
          />
          <button
            type="button"
            onClick={() => validateAndApplyImage(customUrl)}
            disabled={!customUrl || isChecking}
            className="px-4 py-2 text-sm theme-primary-bg text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isChecking ? '적용 중...' : 'URL 적용'}
          </button>
        </div>

        {warning && (
          <p className="text-xs text-orange-600">
            {warning}
          </p>
        )}
      </div>
    </div>
  );
}
