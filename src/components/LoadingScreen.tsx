interface LoadingScreenProps {
  message?: string;
}

export default function LoadingScreen({ message = '로딩 중...' }: LoadingScreenProps) {
  return (
    <div className="flex items-center justify-center flex-1 bg-white">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 border-b-2 border-gray-600 rounded-full animate-spin"></div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
