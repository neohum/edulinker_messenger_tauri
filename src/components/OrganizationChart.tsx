import React, { useEffect, useState, useRef } from 'react';
import { useMessagingStore } from '../store/messaging';
import { useAuthStore } from '../store/auth';
import { useMessageSettingsStore, DefaultContactAction } from '../store/messageSettings';
import TiptapEditor from './TiptapEditor';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

type UserStatus = 'online' | 'away' | 'offline';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  grade?: number;
  group?: string;
  class?: string;
  jobTitle?: string;
  workplace?: string;
  adminDuties?: string;
  extensionNumber?: string;
  phoneNumber?: string;
  subjects?: string[];
  isOnline?: boolean;
  /** 사용자 상태 (online, away, offline) */
  status?: UserStatus;
}

interface TreeNode {
  id: string;
  name: string;
  type: 'group' | 'grade' | 'user';
  children?: TreeNode[];
  user?: User;
  isExpanded?: boolean;
  isChecked?: boolean;
  isIndeterminate?: boolean;
}

interface ContextMenu {
  x: number;
  y: number;
  user?: User;
  group?: { name: string; users: User[] };
}

interface OrganizationChartProps {
  onProfileEdit?: () => void;
}

export default function OrganizationChart({ onProfileEdit }: OrganizationChartProps = {}) {
  const { selectContact } = useMessagingStore();
  const { user: currentUser } = useAuthStore();
  const {
    isAllowedTime,
    getCurrentClass,
    getNextBreakTime,
    getBreakTimeSlots,
    isRestrictionEnabled,
    defaultContactAction,
    setDefaultContactAction,
    loadSettings,
  } = useMessageSettingsStore();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageContent, setMessageContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [recipientSearchQuery, setRecipientSearchQuery] = useState('');
  const [showRecipientSearch, setShowRecipientSearch] = useState(false);

  // 메시지 발송 옵션
  const [isUrgent, setIsUrgent] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [customDateTime, setCustomDateTime] = useState(''); // 직접 입력용

  // 파일 첨부
  interface AttachedFile {
    name: string;
    path: string;
    size: number;
    type: string;
    isFolder: boolean;
    children?: AttachedFile[];
    isExpanded?: boolean;
  }
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // 동작 선택 다이얼로그
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [actionDialogUser, setActionDialogUser] = useState<User | null>(null);
  const [rememberChoice, setRememberChoice] = useState(false);

  // 드롭 영역 ref
  const dropZoneRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    loadSettings();
    loadOrganizationData();
  }, [currentUser?.id, currentUser?.grade, currentUser?.class, currentUser?.jobTitle]);

  // 트리 상태 변경 시 localStorage에 저장
  useEffect(() => {
    if (treeData.length > 0) {
      const expandedState: Record<string, boolean> = {};
      const collectExpandedState = (nodes: TreeNode[]) => {
        nodes.forEach(node => {
          if (node.type === 'group') {
            expandedState[node.id] = node.isExpanded || false;
          }
          if (node.children) {
            collectExpandedState(node.children);
          }
        });
      };
      collectExpandedState(treeData);
      localStorage.setItem('organizationChart_expandedState', JSON.stringify(expandedState));
    }
  }, [treeData]);

  // Tauri 파일 드래그 앤 드롭 이벤트 리스너
  useEffect(() => {
    if (!showMessageDialog) return;

    let unlisten: (() => void) | undefined;

    const setupDragDropListener = async () => {
      try {
        unlisten = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            const newFiles: AttachedFile[] = [];

            for (const filePath of paths) {
              const fileName = filePath.split(/[/\\]/).pop() || filePath;

              // Tauri invoke로 파일 정보 가져오기
              try {
                // get_file_info 명령 호출 (Rust 백엔드에서 처리)
                interface FileInfoChild {
                  name: string;
                  path: string;
                  is_dir: boolean;
                  size: number;
                  children?: FileInfoChild[] | null;
                }
                interface FileInfoResponse {
                  is_dir: boolean;
                  size: number;
                  total_size: number;
                  children?: FileInfoChild[] | null;
                }

                const fileInfo = await invoke<FileInfoResponse>('get_file_info', { path: filePath });
                const isFolder = fileInfo.is_dir;
                // 폴더인 경우 total_size (폴더 내 모든 파일 합계), 파일인 경우 size 사용
                const fileSize = isFolder ? fileInfo.total_size : fileInfo.size;

                // 파일 확장자로 타입 추정하는 헬퍼 함수
                const getFileType = (name: string): string => {
                  const ext = name.split('.').pop()?.toLowerCase() || '';
                  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
                    return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                  } else if (['pdf'].includes(ext)) {
                    return 'application/pdf';
                  } else if (['doc', 'docx'].includes(ext)) {
                    return 'application/msword';
                  } else if (['xls', 'xlsx'].includes(ext)) {
                    return 'application/vnd.ms-excel';
                  } else if (['txt'].includes(ext)) {
                    return 'text/plain';
                  } else if (['zip', 'rar', '7z'].includes(ext)) {
                    return 'application/zip';
                  }
                  return 'application/octet-stream';
                };

                // children을 AttachedFile 형식으로 변환
                const convertChildren = (children: FileInfoChild[] | null | undefined): AttachedFile[] | undefined => {
                  if (!children || children.length === 0) return undefined;
                  return children.map(child => ({
                    name: child.name,
                    path: child.path,
                    size: child.size,
                    type: child.is_dir ? 'folder' : getFileType(child.name),
                    isFolder: child.is_dir,
                    children: convertChildren(child.children),
                    isExpanded: false,
                  }));
                };

                newFiles.push({
                  name: fileName,
                  path: filePath,
                  size: fileSize,
                  type: isFolder ? 'folder' : getFileType(fileName),
                  isFolder: isFolder,
                  children: convertChildren(fileInfo.children),
                  isExpanded: true, // 최상위 폴더는 기본 펼침
                });
              } catch (err) {
                console.error('파일 정보 가져오기 실패:', filePath, err);
                // 파일 정보를 가져오지 못해도 경로는 추가 (확장자로 폴더 여부 추정)
                const hasExtension = fileName.includes('.') && fileName.split('.').pop()!.length <= 5;
                newFiles.push({
                  name: fileName,
                  path: filePath,
                  size: 0,
                  type: hasExtension ? 'application/octet-stream' : 'folder',
                  isFolder: !hasExtension,
                });
              }
            }

            setAttachedFiles(prev => [...prev, ...newFiles]);
            setIsDragging(false);
          }
        });

        // 드래그 진입 이벤트
        const unlistenEnter = await listen('tauri://drag-enter', () => {
          setIsDragging(true);
        });

        // 드래그 이탈 이벤트
        const unlistenLeave = await listen('tauri://drag-leave', () => {
          setIsDragging(false);
        });

        // cleanup 함수에 모든 unlisten 추가
        const originalUnlisten = unlisten;
        unlisten = () => {
          originalUnlisten?.();
          unlistenEnter?.();
          unlistenLeave?.();
        };
      } catch (error) {
        console.error('Tauri drag-drop listener error:', error);
      }
    };

    setupDragDropListener();

    return () => {
      unlisten?.();
    };
  }, [showMessageDialog]);

  // 컨텍스트 메뉴 외부 클릭 시 닫기 및 포커스 이동 시 닫기
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    const handleBlur = () => setContextMenu(null);
    const handleFocusOut = () => setContextMenu(null);
    const handleMouseDown = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC, Tab, Enter 등 키 입력 시 닫기
      if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Enter') {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('blur', handleBlur);
      document.addEventListener('focusout', handleFocusOut);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('blur', handleBlur);
        document.removeEventListener('focusout', handleFocusOut);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [contextMenu]);

  // 체크박스 선택 시 selectedUsers 동기화
  useEffect(() => {
    const checkedUsers = getSelectedUsers(treeData);
    setSelectedUsers(checkedUsers);
  }, [treeData]);

  // 오른쪽 클릭 핸들러 (사용자)
  const handleContextMenu = (e: React.MouseEvent, user: User) => {
    e.preventDefault();
    e.stopPropagation();

    // 자기 자신은 컨텍스트 메뉴를 열 수 없음
    if (currentUser && user.id === currentUser.id) {
      return;
    }

    setContextMenu({ x: e.clientX, y: e.clientY, user });
  };

  // 오른쪽 클릭 핸들러 (그룹)
  const handleGroupContextMenu = (e: React.MouseEvent, groupName: string, children: TreeNode[]) => {
    e.preventDefault();
    e.stopPropagation();
    // 중첩된 모든 사용자 수집
    const collectUsers = (nodes: TreeNode[]): User[] => {
      const result: User[] = [];
      nodes.forEach(node => {
        if (node.type === 'user' && node.user) {
          result.push(node.user);
        }
        if (node.children) {
          result.push(...collectUsers(node.children));
        }
      });
      return result;
    };
    const users = collectUsers(children);
    if (users.length > 0) {
      setContextMenu({ x: e.clientX, y: e.clientY, group: { name: groupName, users } });
    }
  };

  // 그룹 메시지 보내기
  const handleSendGroupMessageFromMenu = (users: User[]) => {
    setSelectedUsers(users);
    setShowMessageDialog(true);
    setContextMenu(null);
  };

  // 메시지 보내기 (쪽지)
  const handleSendMessage = (user: User) => {
    setSelectedUsers([user]);
    setShowMessageDialog(true);
    setContextMenu(null);
  };

  // 채팅 시작
  const handleStartChat = (user: User) => {
    selectContact({
      userId: user.id,
      name: user.name,
      role: user.role,
      jobTitle: user.jobTitle,
      workplace: user.workplace,
      isOnline: user.isOnline || false
    });
    setContextMenu(null);
    setSelectedUserDetail(null);
  };

  // 사용자 클릭 처리 (기본 동작에 따라)
  const handleUserClick = (user: User) => {
    // 자기 자신은 클릭할 수 없음
    if (currentUser && user.id === currentUser.id) {
      return;
    }

    if (defaultContactAction === 'ask') {
      // 매번 물어보기
      setActionDialogUser(user);
      setShowActionDialog(true);
      setRememberChoice(false);
    } else if (defaultContactAction === 'message') {
      // 바로 메시지 보내기
      handleSendMessage(user);
    } else if (defaultContactAction === 'chat') {
      // 바로 채팅 시작
      handleStartChat(user);
    }
  };

  // 동작 선택 후 처리
  const handleActionSelect = async (action: 'message' | 'chat') => {
    if (actionDialogUser) {
      if (rememberChoice) {
        // 선택 저장
        await setDefaultContactAction(action);
      }

      if (action === 'message') {
        handleSendMessage(actionDialogUser);
      } else {
        handleStartChat(actionDialogUser);
      }
    }

    setShowActionDialog(false);
    setActionDialogUser(null);
  };

  const loadOrganizationData = async () => {
    try {
      setIsLoading(true);
      console.log('Loading organization data...');

      let extendedUsers: User[] = [];

      // 로컬/원격 모두 주소록 기반으로 로드
      const result = await window.electronAPI?.getAllAddressBookEntries?.();
      console.log('Address book result:', result);
      const addressBook = result?.success ? result.data : [];
      console.log('Address book data:', addressBook);
      console.log('Address book length:', addressBook.length);

      extendedUsers = addressBook.map((entry: any, index: number) => {
        console.log('Processing address book entry:', entry);
        return {
          id: entry.id || entry.userId || `user-${index}`,
          name: entry.name || entry.displayName,
          email: entry.email,
          role: entry.role,
          department: entry.department || entry.workplace || '일반',
          grade: entry.grade,
          group: entry.class || '미배정',
          class: entry.class,
          jobTitle: entry.jobTitle || entry.role,
          workplace: entry.workplace || '교무실',
          adminDuties: entry.adminDuties,
          extensionNumber: entry.extensionNumber,
          phoneNumber: entry.phoneNumber,
          subjects: entry.subjects,
          isOnline: entry.isOnline || false
        };
      });

      // 현재 로그인한 사용자도 조직도에 추가 (중복 방지)
      if (currentUser && !extendedUsers.some(u => u.id === currentUser.id)) {
        // organizationGroup에 따라 workplace와 jobTitle 자동 설정
        let autoWorkplace = currentUser.workplace;
        let autoJobTitle = currentUser.jobTitle;

        const orgGroup = (currentUser as any).organizationGroup;
        if (orgGroup) {
          if (orgGroup === '교장실') {
            autoWorkplace = '교장실';
            autoJobTitle = autoJobTitle || '교장';
          } else if (orgGroup === '교무실') {
            autoWorkplace = '교무실';
            autoJobTitle = autoJobTitle || '교무실무원';
          } else if (orgGroup === '행정실') {
            autoWorkplace = '행정실';
            autoJobTitle = autoJobTitle || '행정직원';
          } else if (orgGroup === '전담실') {
            autoWorkplace = '전담실';
            autoJobTitle = autoJobTitle || '전담교사';
          } else if (orgGroup.match(/^[1-6]학년$/)) {
            const gradeNum = parseInt(orgGroup);
            autoWorkplace = autoWorkplace || '교무실';
            autoJobTitle = autoJobTitle || '담임교사';
          }
        }

        const currentUserEntry: User = {
          id: currentUser.id,
          name: currentUser.name || '나',
          email: currentUser.email || '',
          role: currentUser.role || 'TEACHER',
          department: autoWorkplace,
          grade: currentUser.grade,
          group: currentUser.class,
          class: currentUser.class,
          jobTitle: autoJobTitle || '담임교사',
          workplace: autoWorkplace || '교무실',
          adminDuties: currentUser.adminDuties,
          extensionNumber: currentUser.extensionNumber,
          phoneNumber: currentUser.phoneNumber,
          subjects: currentUser.subjects,
          isOnline: true // 현재 사용자는 항상 온라인
        };
        extendedUsers.push(currentUserEntry);
        console.log('[OrganizationChart] 현재 사용자 추가:', currentUserEntry);
      }

      console.log('Extended users:', extendedUsers);

      setAllUsers(extendedUsers);

      // 학교 조직 구조 기반 그룹화
      const treeNodes: TreeNode[] = [];

      // 1. 교장실 (교장)
      const principals = extendedUsers.filter(u =>
        u.jobTitle === '교장'
      );
      if (principals.length > 0) {
        treeNodes.push({
          id: 'group-principals',
          name: '교장실',
          type: 'group',
          isExpanded: true,
          children: principals.map(user => ({
            id: `user-${user.id}`,
            name: user.name,
            type: 'user',
            user
          }))
        });
      }

      // 2. 교무실 (교감, 교무부장, 교무실무원)
      const teachersOffice = extendedUsers.filter(u =>
        ['교감', '교무부장', '교무실무원'].includes(u.jobTitle || '')
      );
      if (teachersOffice.length > 0) {
        treeNodes.push({
          id: 'group-teachers-office',
          name: '교무실',
          type: 'group',
          isExpanded: false,
          children: teachersOffice.sort((a, b) => {
            const priority: Record<string, number> = { '교감': 1, '교무부장': 2, '교무실무원': 3 };
            return (priority[a.jobTitle || ''] || 99) - (priority[b.jobTitle || ''] || 99);
          }).map(user => ({
            id: `user-${user.id}`,
            name: user.name,
            type: 'user',
            user
          }))
        });
      }

      // 3. 행정실
      const adminOffice = extendedUsers.filter(u =>
        u.workplace === '행정실' || u.jobTitle === '행정실장' || u.jobTitle === '행정직원' || u.role === 'ADMIN'
      );
      if (adminOffice.length > 0) {
        treeNodes.push({
          id: 'group-admin-office',
          name: '행정실',
          type: 'group',
          isExpanded: false,
          children: adminOffice.sort((a, b) => {
            const priority: Record<string, number> = { '행정실장': 1, '행정직원': 2 };
            return (priority[a.jobTitle || ''] || 99) - (priority[b.jobTitle || ''] || 99);
          }).map(user => ({
            id: `user-${user.id}`,
            name: user.name,
            type: 'user',
            user
          }))
        });
      }

      // 4. 학년별 담임교사
      const grades = [1, 2, 3, 4, 5, 6];
      for (const grade of grades) {
        const gradeTeachers = extendedUsers.filter(u =>
          u.grade === grade && u.jobTitle === '담임교사'
        );
        if (gradeTeachers.length > 0) {
          treeNodes.push({
            id: `group-grade-${grade}`,
            name: `${grade}학년`,
            type: 'group',
            isExpanded: false,
            children: gradeTeachers
              .sort((a, b) => {
                const classA = parseInt(a.class?.replace('반', '') || '0');
                const classB = parseInt(b.class?.replace('반', '') || '0');
                return classA - classB;
              })
              .map(user => ({
                id: `user-${user.id}`,
                name: user.name,
                type: 'user',
                user
              }))
          });
        }
      }

      // 5. 전담실 (전담교사, 교과교사, 전문교사)
      const specialists = extendedUsers.filter(u =>
        u.workplace === '전담실' ||
        ['보건교사', '영양교사', '상담교사', '사서교사', '특수교사'].includes(u.jobTitle || '') ||
        (u.role === 'TEACHER' && u.jobTitle?.includes('교사') && !u.jobTitle?.includes('담임') && !['교감', '교무부장', '교무실무원', '교장'].includes(u.jobTitle || ''))
      );
      if (specialists.length > 0) {
        treeNodes.push({
          id: 'group-specialists',
          name: '전담실',
          type: 'group',
          isExpanded: false,
          children: specialists.map(user => ({
            id: `user-${user.id}`,
            name: user.name,
            type: 'user',
            user
          }))
        });
      }

      // 6. 미배정 (어떤 그룹에도 속하지 않은 사용자)
      const assignedUserIds = new Set<string>();
      treeNodes.forEach(group => {
        group.children?.forEach(child => {
          if (child.user) {
            assignedUserIds.add(child.user.id);
          }
        });
      });

      const unassignedUsers = extendedUsers.filter(u => !assignedUserIds.has(u.id));
      if (unassignedUsers.length > 0) {
        treeNodes.push({
          id: 'group-unassigned',
          name: '미배정',
          type: 'group',
          isExpanded: true,
          children: unassignedUsers.map(user => ({
            id: `user-${user.id}`,
            name: user.name,
            type: 'user',
            user
          }))
        });
      }

      // localStorage에서 저장된 펼침 상태 불러오기
      const savedExpandedState = localStorage.getItem('organizationChart_expandedState');
      if (savedExpandedState) {
        try {
          const expandedState: Record<string, boolean> = JSON.parse(savedExpandedState);
          const applyExpandedState = (nodes: TreeNode[]): TreeNode[] => {
            return nodes.map(node => {
              if (node.type === 'group' && expandedState[node.id] !== undefined) {
                return {
                  ...node,
                  isExpanded: expandedState[node.id],
                  children: node.children ? applyExpandedState(node.children) : node.children
                };
              }
              return node;
            });
          };
          setTreeData(applyExpandedState(treeNodes));
        } catch (e) {
          console.error('Failed to parse expanded state:', e);
          setTreeData(treeNodes);
        }
      } else {
        setTreeData(treeNodes);
      }
    } catch (error) {
      console.error('Failed to load organization data:', error);
      setTreeData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleNode = (nodeId: string) => {
    const updateNode = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return { ...node, isExpanded: !node.isExpanded };
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });
    };

    setTreeData(updateNode(treeData));
  };

  const toggleNodeCheck = (nodeId: string, userId?: string) => {
    // 자기 자신은 선택할 수 없음
    if (userId && currentUser && userId === currentUser.id) {
      return;
    }

    const updateNodeCheck = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          const newChecked = !node.isChecked;
          return updateNodeWithChildren(node, newChecked);
        }
        if (node.children) {
          const updatedChildren = updateNodeCheck(node.children);
          const updatedNode = { ...node, children: updatedChildren };
          return updateParentCheckState(updatedNode);
        }
        return node;
      });
    };

    setTreeData(updateNodeCheck(treeData));
  };

  const updateNodeWithChildren = (node: TreeNode, checked: boolean): TreeNode => {
    // 자기 자신은 체크하지 않음
    const isSelf = node.type === 'user' && node.user?.id === currentUser?.id;
    const updatedNode = { ...node, isChecked: isSelf ? false : checked, isIndeterminate: false };

    if (updatedNode.children) {
      updatedNode.children = updatedNode.children.map(child =>
        updateNodeWithChildren(child, checked)
      );
    }

    return updatedNode;
  };

  const updateParentCheckState = (node: TreeNode): TreeNode => {
    if (!node.children || node.children.length === 0) {
      return node;
    }

    const childrenChecked = node.children.filter(child => child.isChecked).length;
    const childrenIndeterminate = node.children.filter(child => child.isIndeterminate).length;
    const totalChildren = node.children.length;

    if (childrenChecked === totalChildren && childrenIndeterminate === 0) {
      return { ...node, isChecked: true, isIndeterminate: false };
    } else if (childrenChecked === 0 && childrenIndeterminate === 0) {
      return { ...node, isChecked: false, isIndeterminate: false };
    } else {
      return { ...node, isChecked: false, isIndeterminate: true };
    }
  };

  const getSelectedUsers = (nodes: TreeNode[]): User[] => {
    const userMap = new Map<string, User>();

    const traverse = (nodeList: TreeNode[]) => {
      nodeList.forEach(node => {
        if (node.type === 'user' && node.user && node.isChecked) {
          // 중복 방지: id 기준으로 저장
          userMap.set(node.user.id, node.user);
        }
        if (node.children) {
          traverse(node.children);
        }
      });
    };

    traverse(nodes);
    return Array.from(userMap.values());
  };

  const handleSendGroupMessage = async () => {
    if (!messageContent.trim() || selectedUsers.length === 0) {
      return;
    }

    // 예약 발송 검증
    if (isScheduled && !scheduledDateTime) {
      alert('예약 발송 시간을 선택해주세요.');
      return;
    }

    // 발송 가능 시간 확인 (긴급이 아닌 경우에만)
    if (!isUrgent && !isScheduled && isRestrictionEnabled && !isAllowedTime()) {
      const currentClass = getCurrentClass();
      const nextBreak = getNextBreakTime();
      const confirmSend = confirm(
        `현재 ${currentClass?.label || '수업'} 중입니다.\n` +
        (nextBreak ? `수업 종료 시간: ${nextBreak}\n\n` : '\n') +
        `수업 중에 발송하면 수업 종료 후 알림이 전달됩니다.\n그래도 발송하시겠습니까?`
      );
      if (!confirmSend) return;
    }

    setIsSending(true);

    try {
      // 예약 발송인 경우
      const effectiveScheduledTime = customDateTime || scheduledDateTime;
      if (isScheduled && effectiveScheduledTime && effectiveScheduledTime !== 'custom') {
        const scheduledMessage = {
          id: `scheduled-${Date.now()}-${crypto.randomUUID()}`,
          content: messageContent,
          recipients: selectedUsers.map(u => ({ id: u.id, name: u.name })),
          scheduledAt: effectiveScheduledTime,
          isUrgent: isUrgent,
          status: 'pending',
          createdAt: new Date().toISOString(),
          attachments: attachedFiles.map(f => ({
            name: f.name,
            path: f.path,
            size: f.size,
            type: f.type,
            isFolder: f.isFolder,
          })),
        };

        // 로컬 데이터베이스에 예약 메시지 저장
        const result = await window.electronAPI?.saveScheduledMessage?.(scheduledMessage);

        if (result?.success) {
          if (window.electronAPI?.showNotification) {
            window.electronAPI.showNotification({
              title: '메시지 예약 완료',
              body: `${selectedUsers.length}명에게 ${new Date(effectiveScheduledTime).toLocaleString()}에 발송됩니다.`
            });
          }
        } else {
          alert('메시지 예약에 실패했습니다.');
        }

        // 다이얼로그 닫기 및 초기화
        resetMessageDialog();
        return;
      }

      // 즉시 전송
      const sendPromises = selectedUsers.map(async (user) => {
        try {
          const result = await window.electronAPI?.sendP2PMessage?.({
            receiverId: user.id,
            content: messageContent,
            type: attachedFiles.length > 0 ? 'file' : 'text',
            isGroupMessage: selectedUsers.length > 1,
            groupRecipients: selectedUsers.map(u => u.id),
            isUrgent: isUrgent,
            attachments: attachedFiles.map(f => ({
              name: f.name,
              path: f.path,
              size: f.size,
              type: f.type,
              isFolder: f.isFolder,
            })),
          });

          console.log(`메시지 전송 결과 (${user.name}):`, result);

          if (result && !result.error) {
            console.log(`메시지 전송 성공: ${user.name}`);
            return { user, success: true };
          } else {
            console.error(`메시지 전송 실패: ${user.name}`, result?.error);
            return { user, success: false, error: result?.error };
          }
        } catch (error) {
          console.error(`메시지 전송 중 오류: ${user.name}`, error);
          return { user, success: false, error: error };
        }
      });

      const results = await Promise.all(sendPromises);
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      // 로컬에 메시지 저장
      await saveGroupMessageToLocal(messageContent, selectedUsers, isUrgent, attachedFiles);

      // 결과 알림
      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification({
          title: isUrgent ? '🚨 긴급 메시지 전송 완료' : '그룹 메시지 전송 완료',
          body: `${selectedUsers.length}명 중 ${successCount}명에게 성공, ${failCount}명 실패`
        });
      }

      // 다이얼로그 닫기 및 초기화
      resetMessageDialog();

    } catch (error) {
      console.error('그룹 메시지 전송 중 오류:', error);
      alert('메시지 전송 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  const resetMessageDialog = () => {
    setShowMessageDialog(false);
    setMessageContent('');
    setSelectedUsers([]);
    setIsUrgent(false);
    setIsScheduled(false);
    setScheduledDateTime('');
    setCustomDateTime(''); // 직접 입력 시간 초기화
    setRecipientSearchQuery('');
    setShowRecipientSearch(false);
    setAttachedFiles([]);
    setIsDragging(false);
  };

  // 파일 크기 포맷팅
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // 드래그 앤 드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // Tauri 드래그 앤 드롭 이벤트가 처리하므로 여기서는 웹 파일만 처리
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const newFiles: AttachedFile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Tauri에서는 file.path가 있을 수 있음
        const filePath = (file as any).path || file.name;

        newFiles.push({
          name: file.name,
          path: filePath,
          size: file.size,
          type: file.type || 'application/octet-stream',
          isFolder: false,
        });
      }

      setAttachedFiles(prev => [...prev, ...newFiles]);
    }
  };

  // 파일 input을 통한 선택 (fallback)
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newFiles: AttachedFile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        newFiles.push({
          name: file.name,
          path: (file as any).path || file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          isFolder: false,
        });
      }

      setAttachedFiles(prev => [...prev, ...newFiles]);
    }

    // input 초기화 (같은 파일 다시 선택 가능하게)
    if (e.target) {
      e.target.value = '';
    }
  };

  // 파일 선택 핸들러 (버튼 클릭)
  const handleFileSelect = async () => {
    try {
      // Tauri의 파일 다이얼로그 사용 시도
      if (window.electronAPI?.openFileDialog) {
        const result = await window.electronAPI.openFileDialog({
          multiple: true,
          filters: [
            { name: '모든 파일', extensions: ['*'] },
            { name: '문서', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx', 'txt'] },
            { name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] },
            { name: '압축 파일', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] },
          ],
        });

        if (result?.success && result.files) {
          const newFiles: AttachedFile[] = result.files.map((file: any) => ({
            name: file.name,
            path: file.path,
            size: file.size || 0,
            type: file.type || 'application/octet-stream',
            isFolder: false,
          }));
          setAttachedFiles(prev => [...prev, ...newFiles]);
        }
      } else {
        // fallback: HTML file input 사용
        fileInputRef.current?.click();
      }
    } catch (error) {
      console.error('파일 선택 오류:', error);
      // fallback: HTML file input 사용
      fileInputRef.current?.click();
    }
  };

  // 폴더 선택 핸들러
  const handleFolderSelect = async () => {
    try {
      // Tauri의 폴더 다이얼로그 사용
      const result = await window.electronAPI?.openFolderDialog?.();

      if (result?.success && result.folder) {
        const folder = result.folder;
        setAttachedFiles(prev => [...prev, {
          name: folder.name,
          path: folder.path,
          size: folder.size || 0,
          type: 'folder',
          isFolder: true,
        }]);
      }
    } catch (error) {
      console.error('폴더 선택 오류:', error);
    }
  };

  // 첨부파일 제거
  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 폴더 펼침/접힘 토글
  const toggleFolderExpand = (path: string[]) => {
    setAttachedFiles(prev => {
      const updateExpand = (files: AttachedFile[], remainingPath: string[]): AttachedFile[] => {
        return files.map((file, idx) => {
          if (remainingPath.length === 1 && idx === parseInt(remainingPath[0])) {
            return { ...file, isExpanded: !file.isExpanded };
          }
          if (remainingPath.length > 1 && idx === parseInt(remainingPath[0]) && file.children) {
            return { ...file, children: updateExpand(file.children, remainingPath.slice(1)) };
          }
          return file;
        });
      };
      return updateExpand(prev, path);
    });
  };

  // 재귀적 파일 아이템 렌더링
  const renderFileItem = (file: AttachedFile, index: number, depth: number = 0, pathPrefix: string[] = []) => {
    const currentPath = [...pathPrefix, String(index)];

    return (
      <div key={currentPath.join('-')}>
        <div
          className="flex items-center justify-between py-1.5 hover:bg-white/10 rounded"
          style={{ paddingLeft: `${depth * 16 + 8}px`, paddingRight: '8px' }}
        >
          <div className="flex items-center space-x-2 overflow-hidden flex-1 min-w-0">
            {/* 폴더 펼침/접힘 버튼 */}
            {file.isFolder && file.children && file.children.length > 0 ? (
              <button
                onClick={() => toggleFolderExpand(currentPath)}
                className="flex-shrink-0 p-0.5 hover:bg-white/20 rounded"
              >
                <svg
                  className={`w-3 h-3 theme-text-secondary transition-transform ${file.isExpanded ? 'rotate-90' : ''}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            ) : (
              <span className="w-4" /> // 정렬용 빈 공간
            )}
            {getFileIcon(file)}
            <div className="min-w-0 flex-1">
              <p className="text-sm theme-text truncate">{file.name}</p>
              {depth === 0 && (
                <p className="text-xs theme-text-secondary">
                  {file.isFolder ? `폴더 (${formatFileSize(file.size)})` : formatFileSize(file.size)}
                </p>
              )}
            </div>
          </div>
          {depth === 0 && (
            <button
              onClick={() => removeAttachedFile(index)}
              className="flex-shrink-0 p-1 text-red-500 hover:bg-red-50 rounded"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {/* 하위 파일/폴더 렌더링 */}
        {file.isFolder && file.isExpanded && file.children && (
          <div className="border-l border-current/10 ml-4">
            {file.children.map((child, childIdx) => renderFileItem(child, childIdx, depth + 1, currentPath))}
          </div>
        )}
      </div>
    );
  };

  // 파일 아이콘 결정
  const getFileIcon = (file: AttachedFile) => {
    if (file.isFolder) {
      return (
        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z" clipRule="evenodd" />
          <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z" />
        </svg>
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    // 이미지
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }

    // 문서
    if (['pdf', 'doc', 'docx', 'hwp', 'hwpx', 'txt', 'rtf'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    }

    // 스프레드시트
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    }

    // 압축 파일
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return (
        <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    }

    // 기본 아이콘
    return (
      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  };

  const saveGroupMessageToLocal = async (content: string, recipients: User[], urgent: boolean = false, files: AttachedFile[] = []) => {
    try {
      const messageData = {
        id: `group-${Date.now()}-${crypto.randomUUID()}`,
        content: content,
        type: files.length > 0 ? 'group-message-with-files' : 'group-message',
        timestamp: new Date().toISOString(),
        senderId: currentUser?.id || 'current-user',
        recipients: recipients.map(u => ({ id: u.id, name: u.name })),
        isRead: true, // 보낸 메시지는 읽음 처리
        delivered: true,
        isUrgent: urgent,
        attachments: files.map(f => ({
          name: f.name,
          path: f.path,
          size: f.size,
          type: f.type,
          isFolder: f.isFolder,
        })),
      };

      // 로컬 데이터베이스에 저장
      const result = await window.electronAPI?.saveGroupMessage?.(messageData);
      if (result?.success) {
        console.log('그룹 메시지가 로컬에 저장되었습니다.');
      }
    } catch (error) {
      console.error('로컬 메시지 저장 실패:', error);
    }
  };

  const renderTreeNode = (node: TreeNode, level: number = 0): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = node.isExpanded;
    const isSelf = node.type === 'user' && node.user?.id === currentUser?.id;

    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center py-2 px-4 border-l-2 ${
            level === 0 ? 'border-transparent' : 'border-current/20'
          } ${isSelf ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/20 cursor-pointer'}`}
          style={{ paddingLeft: `${16 + level * 20}px` }}
          onClick={(e) => {
            // 사용자 노드 클릭 시 기본 동작 실행
            if (node.type === 'user' && node.user) {
              e.stopPropagation();
              handleUserClick(node.user);
            }
          }}
          onContextMenu={(e) => {
            if (node.type === 'user' && node.user) {
              handleContextMenu(e, node.user);
            } else if (node.type === 'group' && node.children && node.children.length > 0) {
              handleGroupContextMenu(e, node.name, node.children);
            }
          }}
        >
          {/* 체크박스 */}
          <div className="w-4 h-4 mr-2 flex items-center justify-center">
            <input
              type="checkbox"
              checked={node.isChecked || false}
              ref={(el) => {
                if (el) el.indeterminate = node.isIndeterminate || false;
              }}
              onChange={() => toggleNodeCheck(node.id, node.user?.id)}
              disabled={node.type === 'user' && node.user?.id === currentUser?.id}
              className="w-4 h-4 text-blue-600 bg-white/80 border-current/30 rounded focus:ring-blue-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* 확장/축소 아이콘 */}
          {hasChildren && (
            <button
              className="w-8 h-8 mr-1 flex items-center justify-center rounded hover:bg-white/30 transition-colors theme-text"
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(node.id);
              }}
            >
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          {!hasChildren && <div className="w-8 h-8 mr-1" />}

          {/* 노드 아이콘 */}
          <div className="w-6 h-6 mr-3 flex items-center justify-center">
            {node.type === 'group' && (
              <svg className="w-5 h-5 theme-primary-text" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm3 2a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
              </svg>
            )}
            {node.type === 'grade' && (
              <svg className="w-5 h-5 theme-secondary-text" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {node.type === 'user' && (
              <div className="w-6 h-6 theme-primary-bg rounded-full flex items-center justify-center">
                <span className="text-xs text-white font-semibold">
                  {node.user?.name.charAt(0)}
                </span>
              </div>
            )}
          </div>

          {/* 노드 이름 */}
          <div className="flex-1">
            <div className="flex items-center">
              <span className={`font-medium ${
                node.type === 'group' ? 'theme-primary-text' :
                node.type === 'grade' ? 'theme-secondary-text' :
                node.user?.isOnline ? 'theme-text' : 'theme-text-secondary'
              }`}>
                {node.name}
              </span>
              {node.type === 'user' && node.user && (
                <div className={`w-2 h-2 rounded-full ml-2 ${
                  node.user.status === 'away' ? 'bg-yellow-400' :
                  node.user.isOnline ? 'bg-green-400' : 'bg-gray-400'
                }`} title={
                  node.user.status === 'away' ? '자리 비움' :
                  node.user.isOnline ? '온라인' : '오프라인'
                }></div>
              )}
              {node.type !== 'user' && hasChildren && (
                <span className="text-xs theme-text-secondary ml-2">
                  ({node.children?.length}명)
                </span>
              )}
            </div>
            {node.type === 'user' && node.user && (
              <div className={`text-xs flex items-center space-x-3 mt-0.5 ${node.user.isOnline ? 'theme-text' : 'theme-text-secondary'}`}>
                {/* 직책 */}
                <span>{node.user.jobTitle || node.user.role}</span>
                {/* 근무장소 */}
                {node.user.workplace && (
                  <span>{node.user.workplace}</span>
                )}
                {/* 내선 */}
                {node.user.extensionNumber && (
                  <span>내선 {node.user.extensionNumber}</span>
                )}
                {/* 업무 */}
                {node.user.adminDuties && (
                  <span>{node.user.adminDuties}</span>
                )}
              </div>
            )}
          </div>

        </div>

        {/* 자식 노드들 */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(childNode => renderTreeNode(childNode, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full theme-surface-translucent flex min-h-0 rounded-lg">
      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* 헤더 */}
        <div className="p-4 border-b border-current/10 theme-surface-translucent flex-shrink-0 rounded-t-lg">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold theme-text">학교 조직도</h3>
              <p className="text-sm theme-text-secondary">전체 {allUsers.length}명</p>
            </div>
            <button
              onClick={loadOrganizationData}
              disabled={isLoading}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              title="조직도 새로고침"
            >
              <svg
                className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              새로고침
            </button>
          </div>

          {/* 검색 */}
          <div className="relative">
            <input
              type="text"
              placeholder="이름, 직책, 근무지로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pl-10 border border-current/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm theme-text theme-surface-translucent"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 theme-text-secondary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="mt-3 flex items-center justify-between theme-surface-translucent p-2 rounded border border-current/10">
            <div className="flex items-center space-x-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedUsers.length === allUsers.length && allUsers.length > 0}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedUsers.length > 0 && selectedUsers.length < allUsers.length;
                  }}
                  onChange={() => {
                    const allChecked = selectedUsers.length === allUsers.length;
                    const updateAllNodes = (nodes: TreeNode[], checked: boolean): TreeNode[] => {
                      return nodes.map(node => updateNodeWithChildren(node, checked));
                    };
                    setTreeData(updateAllNodes(treeData, !allChecked));
                  }}
                  className="w-4 h-4 text-blue-600 bg-white/80 border-current/30 rounded focus:ring-blue-500"
                />
                <span className="text-sm theme-text-secondary">전체 선택</span>
              </label>
              <p className="text-sm font-medium theme-primary-text">
                {selectedUsers.length}명 선택됨
              </p>
            </div>
            {selectedUsers.length > 0 && (
              <button
                onClick={() => setShowMessageDialog(true)}
                className="px-3 py-1 text-xs theme-primary-bg text-white rounded hover:opacity-90 transition-opacity"
              >
                그룹 메시지
              </button>
            )}
          </div>
        </div>

        {/* 조직도 컨텐츠 */}
        <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="p-8 text-center theme-text-secondary">
            <p>조직도를 불러오는 중...</p>
          </div>
        ) : treeData.length === 0 ? (
          <div className="p-8 text-center theme-text-secondary">
            <p>조직도 데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="py-2">
            {treeData.map(node => renderTreeNode(node))}
          </div>
        )}
        </div>
      </div>

      {/* 사용자 상세 정보 모달 */}
      {selectedUserDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="theme-surface-translucent rounded-lg w-full max-w-sm mx-4 max-h-[80vh] overflow-hidden shadow-xl">
            <div className="p-4 border-b border-current/10 flex justify-between items-center theme-surface-translucent">
              <h3 className="text-lg font-semibold theme-text">상세 정보</h3>
              <button
                onClick={() => setSelectedUserDetail(null)}
                className="theme-text-secondary hover:theme-text"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-auto p-4" style={{ maxHeight: 'calc(80vh - 60px)' }}>
              {/* 프로필 */}
              <div className="text-center mb-6">
                <div className="relative inline-block mb-3">
                  <div className="w-20 h-20 rounded-full theme-header-bg flex items-center justify-center text-white text-2xl font-medium mx-auto">
                    {selectedUserDetail.name.charAt(0)}
                  </div>
                  <div className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white ${selectedUserDetail.isOnline ? 'bg-green-400' : 'bg-gray-300'}`} />
                </div>
                <h4 className="text-xl font-bold theme-text">{selectedUserDetail.name}</h4>
                <p className="theme-text-secondary">{selectedUserDetail.jobTitle || selectedUserDetail.role}</p>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs ${selectedUserDetail.isOnline ? 'bg-green-100 text-green-700' : 'theme-surface-translucent theme-text-secondary'}`}>
                  {selectedUserDetail.isOnline ? '온라인' : '오프라인'}
                </span>
              </div>

              {/* 상세 정보 */}
              <div className="space-y-3 mb-6">
                {selectedUserDetail.workplace && (
                  <div className="theme-surface-translucent p-3 rounded-lg border border-current/10">
                    <p className="text-xs theme-text-secondary mb-1">근무지</p>
                    <p className="theme-text">{selectedUserDetail.workplace}</p>
                  </div>
                )}

                {selectedUserDetail.adminDuties && (
                  <div className="theme-surface-translucent p-3 rounded-lg border border-current/10">
                    <p className="text-xs theme-text-secondary mb-1">담당 업무</p>
                    <p className="theme-text">{selectedUserDetail.adminDuties}</p>
                  </div>
                )}

                {selectedUserDetail.grade && selectedUserDetail.class && (
                  <div className="theme-surface-translucent p-3 rounded-lg border border-current/10">
                    <p className="text-xs theme-text-secondary mb-1">담당 학급</p>
                    <p className="theme-text">{selectedUserDetail.grade}학년 {selectedUserDetail.class}</p>
                  </div>
                )}

                {selectedUserDetail.subjects && selectedUserDetail.subjects.length > 0 && (
                  <div className="theme-surface-translucent p-3 rounded-lg border border-current/10">
                    <p className="text-xs theme-text-secondary mb-1">담당 과목</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedUserDetail.subjects.map((subject, idx) => (
                        <span key={idx} className="px-2 py-0.5 theme-primary-bg text-white rounded text-xs">
                          {subject}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedUserDetail.extensionNumber && (
                  <div className="theme-surface-translucent p-3 rounded-lg border border-current/10">
                    <p className="text-xs theme-text-secondary mb-1">내선번호</p>
                    <p className="theme-text">{selectedUserDetail.extensionNumber}</p>
                  </div>
                )}

                {selectedUserDetail.phoneNumber && (
                  <div className="theme-surface-translucent p-3 rounded-lg border border-current/10">
                    <p className="text-xs theme-text-secondary mb-1">연락처</p>
                    <p className="theme-text">{selectedUserDetail.phoneNumber}</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 메시지 전송 다이얼로그 */}
      {showMessageDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="theme-surface-translucent rounded-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            <div className="p-4 border-b border-current/10 flex justify-between items-center">
              <h3 className="text-lg font-semibold theme-text">
                메시지 전송
              </h3>
              <button
                onClick={() => {
                  setShowMessageDialog(false);
                  setMessageContent('');
                  setRecipientSearchQuery('');
                  setShowRecipientSearch(false);
                }}
                className="theme-text-secondary hover:theme-text"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {/* 받는 사람 */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium theme-text">
                    받는 사람 ({selectedUsers.length}명)
                  </label>
                  <button
                    onClick={() => setShowRecipientSearch(!showRecipientSearch)}
                    className="text-xs theme-primary-text hover:opacity-80 flex items-center space-x-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>추가</span>
                  </button>
                </div>

                {/* 받는 사람 카드 목록 */}
                <div className="flex flex-wrap gap-2 p-2 theme-surface-translucent rounded-lg min-h-[60px] max-h-[120px] overflow-y-auto border border-current/10">
                  {selectedUsers.length === 0 ? (
                    <p className="text-sm theme-text-secondary w-full text-center py-2">받는 사람을 추가해주세요</p>
                  ) : (
                    selectedUsers.map(user => (
                      <div
                        key={user.id}
                        className="inline-flex items-center theme-surface-translucent border border-current/10 rounded-full px-3 py-1 text-sm shadow-sm"
                      >
                        <div className="w-5 h-5 rounded-full theme-primary-bg text-white flex items-center justify-center text-xs mr-2">
                          {user.name.charAt(0)}
                        </div>
                        <span className="theme-text">{user.name}</span>
                        <span className="theme-text-secondary text-xs ml-1">
                          ({user.jobTitle === '담임교사' && user.grade && user.class
                            ? `${user.grade}학년 ${user.class}`
                            : user.jobTitle || user.role})
                        </span>
                        <button
                          onClick={() => setSelectedUsers(selectedUsers.filter(u => u.id !== user.id))}
                          className="ml-2 theme-text-secondary hover:text-red-500"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* 사용자 검색 */}
                {showRecipientSearch && (
                  <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="이름, 직책, 학년, 반으로 검색..."
                        value={recipientSearchQuery}
                        onChange={(e) => setRecipientSearchQuery(e.target.value)}
                        className="w-full px-3 py-2 pl-9 text-sm border-b border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {allUsers
                        .filter(user => {
                          if (selectedUsers.some(u => u.id === user.id)) return false;
                          const query = recipientSearchQuery.toLowerCase();
                          const gradeStr = user.grade ? `${user.grade}학년` : '';
                          const classStr = user.class || '';
                          const gradeClassStr = user.grade && user.class ? `${user.grade}학년 ${user.class}` : '';
                          return (
                            user.name.toLowerCase().includes(query) ||
                            (user.jobTitle?.toLowerCase().includes(query)) ||
                            gradeStr.includes(query) ||
                            classStr.toLowerCase().includes(query) ||
                            gradeClassStr.includes(query)
                          );
                        })
                        .slice(0, 10)
                        .map(user => (
                          <div
                            key={user.id}
                            onClick={() => {
                              setSelectedUsers([...selectedUsers, user]);
                              setRecipientSearchQuery('');
                            }}
                            className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm mr-3">
                              {user.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{user.name}</p>
                              <p className="text-xs text-gray-500">
                                {user.jobTitle === '담임교사' && user.grade && user.class
                                  ? `${user.grade}학년 ${user.class} 담임`
                                  : user.jobTitle || user.role}
                              </p>
                            </div>
                            <div className={`ml-auto w-2 h-2 rounded-full ${user.isOnline ? 'bg-green-400' : 'bg-gray-300'}`} />
                          </div>
                        ))}
                      {allUsers.filter(user => {
                        if (selectedUsers.some(u => u.id === user.id)) return false;
                        const query = recipientSearchQuery.toLowerCase();
                        const gradeStr = user.grade ? `${user.grade}학년` : '';
                        const classStr = user.class || '';
                        const gradeClassStr = user.grade && user.class ? `${user.grade}학년 ${user.class}` : '';
                        return (
                          user.name.toLowerCase().includes(query) ||
                          (user.jobTitle?.toLowerCase().includes(query)) ||
                          gradeStr.includes(query) ||
                          classStr.toLowerCase().includes(query) ||
                          gradeClassStr.includes(query)
                        );
                      }).length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-4">검색 결과가 없습니다</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 메시지 내용 */}
              <div className="mb-4">
                <label className="block text-sm font-medium theme-text mb-2">
                  메시지 내용
                </label>
                <TiptapEditor
                  content={messageContent}
                  onChange={setMessageContent}
                  placeholder="보낼 메시지를 입력하세요..."
                />
              </div>

              {/* 파일 첨부 */}
              <div className="mb-4">
                {/* 숨겨진 파일 input (fallback) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium theme-text">
                    첨부파일 {attachedFiles.length > 0 && `(${attachedFiles.length}개, ${formatFileSize(attachedFiles.reduce((sum, f) => sum + f.size, 0))})`}
                  </label>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleFileSelect}
                      className="text-xs text-gray-800 hover:text-gray-600 flex items-center space-x-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <span>파일</span>
                    </button>
                    <button
                      onClick={handleFolderSelect}
                      className="text-xs text-gray-800 hover:text-gray-600 flex items-center space-x-1"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z" clipRule="evenodd" />
                        <path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z" />
                      </svg>
                      <span>폴더</span>
                    </button>
                  </div>
                </div>

                {/* 드래그 앤 드롭 영역 */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-lg p-3 transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-current/20 theme-surface-translucent hover:border-current/40'
                  }`}
                >
                  {attachedFiles.length === 0 ? (
                    <div className="text-center py-4">
                      <svg className="mx-auto w-8 h-8 theme-text-secondary mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm theme-text-secondary">
                        파일을 드래그하거나 위 버튼으로 추가
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto">
                      {attachedFiles.map((file, index) => renderFileItem(file, index, 0, []))}
                    </div>
                  )}

                  {/* 드래그 오버레이 */}
                  {isDragging && (
                    <div className="absolute inset-0 flex items-center justify-center bg-blue-100/80 rounded-lg">
                      <div className="text-center">
                        <svg className="mx-auto w-10 h-10 text-blue-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-sm font-medium text-blue-600">여기에 놓으세요</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 발송 옵션 */}
              <div className="mb-4 space-y-3">
                {/* 긴급 메시지 */}
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isUrgent}
                    onChange={(e) => {
                      setIsUrgent(e.target.checked);
                      // 긴급과 예약은 동시에 체크할 수 없음
                      if (e.target.checked) {
                        setIsScheduled(false);
                        setScheduledDateTime('');
                        setCustomDateTime('');
                      }
                    }}
                    disabled={isSending}
                    className="w-4 h-4 text-red-600 bg-white border-gray-300 rounded focus:ring-red-500"
                  />
                  <div className="flex items-center space-x-2">
                    <span className="text-red-600 font-medium">🚨 긴급</span>
                    <span className="text-xs theme-text-secondary">(쉬는 시간 외에도 즉시 알림)</span>
                  </div>
                </label>

                {/* 예약 발송 */}
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isScheduled}
                      onChange={(e) => {
                        setIsScheduled(e.target.checked);
                        // 긴급과 예약은 동시에 체크할 수 없음
                        if (e.target.checked) {
                          setIsUrgent(false);
                          // 기본값: 첫 번째 쉬는 시간 선택
                          const slots = getBreakTimeSlots();
                          if (slots.length > 0) {
                            setScheduledDateTime(slots[0].dateTime);
                          }
                        } else {
                          setScheduledDateTime('');
                          setCustomDateTime('');
                        }
                      }}
                      disabled={isSending}
                      className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="flex items-center space-x-2">
                      <span className="theme-text font-medium">📅 예약 발송</span>
                      <span className="text-xs theme-text-secondary">(쉬는 시간에 자동 발송)</span>
                    </div>
                  </label>

                  {isScheduled && (
                    <div className="ml-7 space-y-2">
                      {/* 쉬는 시간 드롭다운 */}
                      <div>
                        <label className="block text-xs theme-text-secondary mb-1">쉬는 시간 선택</label>
                        <select
                          value={scheduledDateTime === 'custom' || customDateTime ? 'custom' : scheduledDateTime}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === 'custom') {
                              // 직접 입력 선택 시 현재 시간(한국 시간)을 기본값으로 설정
                              const now = new Date();
                              // datetime-local 형식: YYYY-MM-DDTHH:mm
                              const kstOffset = 9 * 60; // UTC+9
                              const localOffset = now.getTimezoneOffset();
                              const kstTime = new Date(now.getTime() + (kstOffset + localOffset) * 60 * 1000);
                              const formatted = kstTime.toISOString().slice(0, 16);
                              setCustomDateTime(formatted);
                              setScheduledDateTime('custom');
                            } else {
                              setCustomDateTime('');
                              setScheduledDateTime(value);
                            }
                          }}
                          disabled={isSending}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm theme-text theme-surface"
                        >
                          {getBreakTimeSlots().map((slot, idx) => (
                            <option key={idx} value={slot.dateTime}>
                              {slot.label} ({slot.time})
                            </option>
                          ))}
                          <option value="custom">직접 입력...</option>
                        </select>
                      </div>

                      {/* 직접 입력 선택 시 datetime-local 표시 */}
                      {(scheduledDateTime === 'custom' || customDateTime) && (
                        <div>
                          <label className="block text-xs theme-text-secondary mb-1">날짜/시간 직접 입력</label>
                          <input
                            type="datetime-local"
                            value={customDateTime}
                            onChange={(e) => setCustomDateTime(e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                            disabled={isSending}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                        </div>
                      )}

                      {/* 선택된 시간 표시 */}
                      {((scheduledDateTime && scheduledDateTime !== 'custom') || customDateTime) && (
                        <div className="p-2 bg-purple-50 rounded-lg border border-purple-200">
                          <p className="text-xs text-purple-700">
                            📅 예약 시간: <strong>{new Date(customDateTime || scheduledDateTime).toLocaleString('ko-KR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              weekday: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Asia/Seoul',
                            })}</strong>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 발송 시간 안내 */}
                {!isUrgent && !isScheduled && isRestrictionEnabled && (
                  <div className={`p-2 rounded-lg text-sm ${
                    isAllowedTime()
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                  }`}>
                    {isAllowedTime() ? (
                      <span>✅ 현재 쉬는 시간입니다. 메시지가 즉시 전달됩니다.</span>
                    ) : (
                      <span>
                        📚 현재 {getCurrentClass()?.label || '수업'} 중입니다.
                        {getNextBreakTime() && (
                          <> {getNextBreakTime()}에 수업이 종료되면 알림이 전달됩니다.</>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-current/10 flex justify-end space-x-2">
              <button
                onClick={resetMessageDialog}
                disabled={isSending}
                className="px-4 py-2 text-sm theme-text-secondary hover:theme-text transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleSendGroupMessage}
                disabled={isSending || !messageContent.trim() || selectedUsers.length === 0 || (isScheduled && !customDateTime && (!scheduledDateTime || scheduledDateTime === 'custom'))}
                className={`px-4 py-2 text-sm text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isUrgent
                    ? 'bg-red-600 hover:bg-red-700'
                    : isScheduled
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSending
                  ? '전송 중...'
                  : isScheduled
                    ? `예약 (${selectedUsers.length}명)`
                    : isUrgent
                      ? `🚨 긴급 전송 (${selectedUsers.length}명)`
                      : `전송 (${selectedUsers.length}명)`
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <div
          className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[220px] max-w-[300px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 체크된 사용자가 있을 때 모두 표시 */}
          {selectedUsers.length > 0 && (
            <>
              <div className="px-3 py-2 border-b border-gray-100 bg-blue-50">
                <p className="font-medium text-blue-700 text-sm">선택된 대상 ({selectedUsers.length}명)</p>
                <div className="flex flex-wrap gap-1 mt-2 max-h-24 overflow-y-auto">
                  {selectedUsers.map(user => (
                    <span
                      key={user.id}
                      className="inline-flex items-center px-2 py-0.5 bg-white border border-blue-200 rounded-full text-xs text-blue-700"
                    >
                      {user.name}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowMessageDialog(true);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>선택 대상 메시지</span>
              </button>
              <button
                onClick={() => {
                  // 선택된 모든 사용자와 그룹 채팅 시작
                  if (selectedUsers.length > 0) {
                    selectContact({
                      userId: selectedUsers.map(u => u.id).join(','),
                      name: selectedUsers.map(u => u.name).join(', '),
                      role: 'GROUP',
                      isOnline: selectedUsers.some(u => u.isOnline)
                    });
                  }
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
                <span>선택 대상 채팅</span>
              </button>

              {/* 한 명만 선택했을 때만 상세정보 표시 */}
              {selectedUsers.length === 1 && (
                <button
                  onClick={() => {
                    setSelectedUserDetail(selectedUsers[0]);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>상세정보</span>
                </button>
              )}
            </>
          )}

          {/* 사용자 우클릭 메뉴 (체크박스로 선택되지 않은 사용자) */}
          {contextMenu.user && !selectedUsers.some(u => u.id === contextMenu.user!.id) && (
            <>
              <div className={`px-3 py-2 border-b border-gray-100 ${selectedUsers.length > 0 ? 'border-t mt-1' : ''}`}>
                <p className="font-medium text-gray-800 text-sm">{contextMenu.user.name}</p>
                <p className="text-xs text-gray-500">{contextMenu.user.jobTitle || contextMenu.user.role}</p>
              </div>
              <button
                onClick={() => handleSendMessage(contextMenu.user!)}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>메시지</span>
              </button>
              <button
                onClick={() => handleStartChat(contextMenu.user!)}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>채팅</span>
              </button>
              <button
                onClick={() => {
                  setSelectedUserDetail(contextMenu.user!);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>상세정보</span>
              </button>
            </>
          )}

          {/* 그룹 메뉴 (체크박스 선택이 없을 때만) */}
          {contextMenu.group && selectedUsers.length === 0 && (
            <>
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="font-medium text-gray-800 text-sm">{contextMenu.group.name}</p>
                <p className="text-xs text-gray-500">{contextMenu.group.users.length}명</p>
              </div>
              <button
                onClick={() => handleSendGroupMessageFromMenu(contextMenu.group!.users)}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>그룹 메시지</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 동작 선택 다이얼로그 */}
      {showActionDialog && actionDialogUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="theme-surface rounded-lg w-full max-w-sm mx-4 shadow-xl overflow-hidden">
            {/* 헤더 */}
            <div className="p-4 border-b border-current/10 theme-surface-translucent">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full theme-primary-bg flex items-center justify-center text-white text-lg font-medium">
                  {actionDialogUser.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-semibold theme-text">{actionDialogUser.name}</h3>
                  <p className="text-sm theme-text-secondary">
                    {actionDialogUser.jobTitle === '담임교사' && actionDialogUser.grade && actionDialogUser.class
                      ? `${actionDialogUser.grade}학년 ${actionDialogUser.class} 담임`
                      : actionDialogUser.jobTitle || actionDialogUser.role}
                  </p>
                </div>
              </div>
            </div>

            {/* 선택 옵션 */}
            <div className="p-4 space-y-3">
              <p className="text-sm theme-text-secondary text-center mb-4">
                어떤 방식으로 연락하시겠습니까?
              </p>

              {/* 메시지 보내기 */}
              <button
                onClick={() => handleActionSelect('message')}
                className="w-full flex items-center space-x-4 p-4 rounded-lg border border-current/10 hover:bg-blue-50 hover:border-blue-300 transition-colors group"
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="font-medium theme-text">메시지 보내기</p>
                  <p className="text-sm theme-text-secondary">파일 첨부, 예약 발송 가능</p>
                </div>
              </button>

              {/* 채팅 시작 */}
              <button
                onClick={() => handleActionSelect('chat')}
                className="w-full flex items-center space-x-4 p-4 rounded-lg border border-current/10 hover:bg-green-50 hover:border-green-300 transition-colors group"
              >
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="font-medium theme-text">채팅 시작</p>
                  <p className="text-sm theme-text-secondary">실시간 대화</p>
                </div>
              </button>

              {/* 선택 기억하기 */}
              <label className="flex items-center justify-center space-x-2 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberChoice}
                  onChange={(e) => setRememberChoice(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm theme-text-secondary">이 선택을 기억하기</span>
              </label>
            </div>

            {/* 푸터 */}
            <div className="p-4 border-t border-current/10 bg-gray-50">
              <button
                onClick={() => {
                  setShowActionDialog(false);
                  setActionDialogUser(null);
                }}
                className="w-full py-2 text-sm theme-text-secondary hover:theme-text transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
