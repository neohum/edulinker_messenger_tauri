import { useState, useEffect, useRef } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import ServicesList from '../components/ServicesList';
import OrganizationChart from '../components/OrganizationChart';
import FileTransferPanel from '../components/FileTransferPanel';
import NotificationPanel from '../components/NotificationPanel';
import NetworkDiscovery from '../components/NetworkDiscovery';
import { AddressBook } from '../components/AddressBook';
import GroupChatPanel from '../components/GroupChatPanel';
import MessagingPanel from '../components/MessagingPanel';
import PageLayout from '../components/PageLayout';
import PageHeader from '../components/PageHeader';
import PageTabs from '../components/PageTabs';
import ProfileSettingsPage from './ProfileSettingsPage';
import ThemeSettings from '../components/ThemeSettings';
import AppearanceSettings from '../components/AppearanceSettings';
import BackgroundSettings from '../components/BackgroundSettings';
import DownloadSettings from '../components/DownloadSettings';
import MessageScheduleSettings from '../components/MessageScheduleSettings';
import CollapsibleCard from '../components/CollapsibleCard';
import { UpdateCheckButton } from '../components/UpdateChecker';
import { useMessagingStore } from '../store/messaging';
import { useDownloadStore } from '../store/download';

type Tab = 'services' | 'organization' | 'files' | 'notifications' | 'network' | 'address-book' | 'group-chat' | 'settings' | 'profile-setup' | 'messaging';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('organization');
  const headerRef = useRef<HTMLDivElement>(null);
  const { selectContact } = useMessagingStore();
  const { downloadPath } = useDownloadStore();

  const handleSendMessage = (user: any) => {
    // 메시지 보내기 기능 구현
    console.log('Send message to user:', user);
    
    // 연락처를 Contact 형식으로 변환
    const contact = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen
    };
    
    // 메시징 스토어에 연락처 선택
    selectContact(contact);
    
    // 메시징 탭으로 전환
    setActiveTab('messaging');
  };

  const handleStartConversation = (user: any) => {
    // 대화 시작 기능 구현
    console.log('Start conversation with user:', user);
    
    // 연락처를 Contact 형식으로 변환
    const contact = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen
    };
    
    // 메시징 스토어에 연락처 선택
    selectContact(contact);
    
    // 메시징 탭으로 전환
    setActiveTab('messaging');
  };

  // 개발 환경인지 확인 (임시로 강제 활성화)
  const isDevelopment = true; // import.meta.env.DEV || import.meta.env.MODE === 'development';
  console.log('Environment check:', {
    DEV: import.meta.env.DEV,
    MODE: import.meta.env.MODE,
    isDevelopment
  });

  const tabs = [
    { id: 'services', label: '서비스' },
    { id: 'organization', label: '조직도' },
    { id: 'messaging', label: '메시지함' },
    { id: 'group-chat', label: '그룹 채팅' },
    { id: 'files', label: '받은 파일함' },
    { id: 'network', label: '네트워크' },
    { id: 'address-book', label: '주소록' },
    { id: 'settings', label: '설정' }
  ];

  const openMessageCenterWindow = async () => {
    try {
      console.log('[DashboardPage] 메시지함 창 열기 시도...');

      // 이미 열려있는 창이 있는지 확인
      try {
        const existing = await WebviewWindow.getByLabel('message-center');
        if (existing) {
          console.log('[DashboardPage] 기존 메시지함 창 포커스');
          await existing.setFocus();
          return;
        }
      } catch (e) {
        console.log('[DashboardPage] 기존 창 없음, 새 창 생성');
      }

      // 현재 페이지 URL을 기반으로 메시지 센터 URL 생성
      const baseUrl = window.location.origin;
      const messageCenterUrl = `${baseUrl}/#/message-center`;

      console.log('[DashboardPage] 메시지 센터 URL:', messageCenterUrl);

      const windowInstance = new WebviewWindow('message-center', {
        url: messageCenterUrl,
        title: '메시지함',
        width: 1100,
        height: 780,
        resizable: true,
        decorations: false,
        center: true,
      });

      windowInstance.once('tauri://error', (error) => {
        console.error('[DashboardPage] 메시지함 창 생성 실패:', error);
        alert(`메시지함 창을 열 수 없습니다: ${error}`);
      });

      windowInstance.once('tauri://created', () => {
        console.log('[DashboardPage] 메시지함 창 생성 성공');
      });

      windowInstance.once('tauri://window-created', () => {
        console.log('[DashboardPage] 메시지함 창 표시됨');
      });
    } catch (error) {
      console.error('[DashboardPage] 메시지함 창 열기 중 오류:', error);
      alert(`메시지함을 열 수 없습니다: ${error}`);
    }
  };

  const openDownloadFolder = async () => {
    if (downloadPath) {
      try {
        await invoke('open_folder', { path: downloadPath });
      } catch (error) {
        console.error('폴더 열기 실패:', error);
        alert('폴더를 열 수 없습니다. 경로를 확인해주세요.');
      }
    } else {
      alert('다운로드 폴더가 설정되지 않았습니다. 설정에서 다운로드 폴더를 지정해주세요.');
      setActiveTab('settings');
    }
  };

  return (
    <PageLayout
      header={
        <PageHeader
          ref={headerRef}
          title="edulinker - messenger"
          showUserInfo={true}
          showLogout={true}
          onProfileClick={() => setActiveTab('profile-setup')}
        />
      }
      tabs={
        <PageTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(tabId) => {
            if (tabId === 'messaging') {
              openMessageCenterWindow();
              return;
            }
            if (tabId === 'files') {
              openDownloadFolder();
              return;
            }
            setActiveTab(tabId as Tab);
          }}
        />
      }
    >
      {activeTab === 'services' && <ServicesList />}
      {activeTab === 'organization' && <OrganizationChart />}
      {activeTab === 'messaging' && <MessagingPanel />}
      {activeTab === 'group-chat' && <GroupChatPanel />}
      {activeTab === 'files' && <FileTransferPanel />}
      {activeTab === 'notifications' && <NotificationPanel />}
      {activeTab === 'network' && <NetworkDiscovery />}
      {activeTab === 'address-book' && (
        <AddressBook 
          onSendMessage={handleSendMessage}
          onStartConversation={handleStartConversation}
        />
      )}
      {activeTab === 'settings' && (
        <div className="p-6">
          <h2 className="mb-4 text-2xl font-bold theme-text">설정</h2>
          <div className="space-y-3">
            {/* 프로필 설정 */}
            <button
              onClick={() => setActiveTab('profile-setup')}
              className="w-full px-4 py-3 text-left theme-text transition-colors theme-surface-translucent rounded-lg shadow hover:bg-white/20"
            >
              <div className="flex items-center space-x-3">
                <svg className="w-6 h-6 theme-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <div>
                  <h3 className="font-medium">프로필 설정</h3>
                  <p className="text-sm theme-text-secondary">이름, 역할, 프로필 정보를 수정합니다</p>
                </div>
              </div>
            </button>

            {/* 메시지 알림 설정 */}
            <CollapsibleCard
              title="메시지 알림 설정"
              description="쉬는 시간에만 메시지가 발송되도록 설정합니다"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            >
              <MessageScheduleSettings />
            </CollapsibleCard>

            {/* 테마 설정 */}
            <div className="px-4 py-3 theme-surface-translucent rounded-lg shadow relative z-30">
              <ThemeSettings />
            </div>

            {/* 글자/폰트 설정 */}
            <CollapsibleCard
              title="글자/폰트 설정"
              description="글자 크기, 글자 색, 폰트를 변경합니다"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10m-10 6h16" />
                </svg>
              }
              className="relative z-20"
            >
              <AppearanceSettings />
            </CollapsibleCard>

            {/* 배경 설정 */}
            <CollapsibleCard
              title="배경 설정"
              description="배경 이미지와 카드 투명도를 설정합니다"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
              className="relative z-10"
            >
              <BackgroundSettings />
            </CollapsibleCard>

            {/* 다운로드 설정 */}
            <CollapsibleCard
              title="다운로드 설정"
              description="첨부 파일 다운로드 폴더를 설정합니다"
              icon={
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              }
            >
              <DownloadSettings />
            </CollapsibleCard>

            {/* 업데이트 확인 */}
            <div className="px-4 py-3 theme-surface-translucent rounded-lg shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg className="w-6 h-6 theme-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <div>
                    <h3 className="font-medium theme-text">앱 업데이트</h3>
                    <p className="text-sm theme-text-secondary">최신 버전을 확인하고 설치합니다</p>
                  </div>
                </div>
                <UpdateCheckButton />
              </div>
            </div>

          </div>
        </div>
      )}
      {activeTab === 'profile-setup' && <ProfileSettingsPage onCancel={() => setActiveTab('settings')} />}
    </PageLayout>
  );
}

