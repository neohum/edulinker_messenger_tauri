// 페이크 교사/관리자 데이터 생성기
// 로컬 테스트용 현실적인 데이터 생성

// 한국식 이름 생성용 데이터
const lastNames = [
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임',
  '한', '오', '서', '신', '권', '황', '안', '송', '류', '전',
  '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남',
  '심', '노', '하', '곽', '성', '차', '주', '우', '구', '민'
];

const firstNamesMale = [
  '민준', '서준', '예준', '도윤', '시우', '주원', '하준', '지호', '준서', '준우',
  '현우', '도현', '지후', '건우', '우진', '민재', '현준', '선우', '서진', '연우',
  '정우', '승현', '승우', '유준', '진우', '시윤', '지환', '승민', '준혁', '민성'
];

const firstNamesFemale = [
  '서연', '서윤', '지우', '서현', '민서', '하은', '하윤', '윤서', '지유', '채원',
  '지윤', '은서', '수아', '다은', '예은', '수빈', '지아', '소윤', '예린', '아린',
  '민지', '수현', '지은', '소연', '유진', '예서', '하린', '서아', '시은', '채은'
];

const subjects = [
  '국어', '수학', '영어', '사회', '과학', '음악', '미술', '체육',
  '도덕', '실과', '기술', '가정', '정보', '한문', '일본어', '중국어'
];

const specializations = [
  '특수교육', '영재교육', '진로진학', '독서교육', '환경교육',
  '인성교육', '정보교육', '안전교육', '다문화교육', 'SW교육'
];

const adminDuties = [
  '교무부장', '연구부장', '생활지도부장', '학년부장', '정보부장',
  '진로상담부장', '방과후부장', '특수교육부장', '인문학부장', '안전부장'
];

const workplaces = [
  '교무실', '행정실', '교장실', '교감실', '상담실', '보건실',
  '도서관', '컴퓨터실', '과학실', '음악실', '미술실', '체육관'
];

export interface FakeTeacher {
  id: string;
  email: string;
  name: string;
  role: 'TEACHER' | 'ADMIN';
  gender: 'male' | 'female';
  grade?: number;
  class?: string;
  classroom?: string;
  workplace: string;
  jobTitle: string;
  adminDuties?: string;
  subjects?: string[];
  extensionNumber: string;
  phoneNumber: string;
  profileCompleted: boolean;
  isOnline: boolean;
  lastSeen: string;
  createdAt: string;
}

// 랜덤 선택 헬퍼
function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePhoneNumber(): string {
  const middle = randomRange(1000, 9999);
  const last = randomRange(1000, 9999);
  return `010-${middle}-${last}`;
}

function generateExtensionNumber(): string {
  return String(randomRange(100, 999));
}

function generateName(gender: 'male' | 'female'): string {
  const lastName = randomPick(lastNames);
  const firstName = gender === 'male' ? randomPick(firstNamesMale) : randomPick(firstNamesFemale);
  return lastName + firstName;
}

// 담임교사 생성
function generateHomeRoomTeacher(grade: number, classNum: number, index: number): FakeTeacher {
  const gender = Math.random() > 0.4 ? 'female' : 'male'; // 60% 여성
  const name = generateName(gender);
  const className = `${classNum}반`;
  const classroom = `${grade}${String(classNum).padStart(2, '0')}호`;

  return {
    id: `homeroom-${grade}-${classNum}`,
    email: `homeroom${grade}${classNum}@school.edu`,
    name,
    role: 'TEACHER',
    gender,
    grade,
    class: className,
    classroom,
    workplace: classroom,
    jobTitle: '담임교사',
    adminDuties: `${grade}학년 ${classNum}반 담임`,
    extensionNumber: `${grade}${String(classNum).padStart(2, '0')}`,
    phoneNumber: generatePhoneNumber(),
    profileCompleted: true,
    isOnline: Math.random() > 0.3,
    lastSeen: new Date(Date.now() - randomRange(0, 86400000)).toISOString(),
    createdAt: new Date(Date.now() - randomRange(86400000, 365 * 86400000)).toISOString()
  };
}

// 교과 전담교사 생성
function generateSubjectTeacher(index: number): FakeTeacher {
  const gender = Math.random() > 0.4 ? 'female' : 'male';
  const name = generateName(gender);
  const subject = subjects[index % subjects.length];

  return {
    id: `subject-${index}`,
    email: `teacher${index}@school.edu`,
    name,
    role: 'TEACHER',
    gender,
    workplace: '교무실',
    jobTitle: `${subject} 교사`,
    subjects: [subject],
    extensionNumber: generateExtensionNumber(),
    phoneNumber: generatePhoneNumber(),
    profileCompleted: true,
    isOnline: Math.random() > 0.4,
    lastSeen: new Date(Date.now() - randomRange(0, 86400000)).toISOString(),
    createdAt: new Date(Date.now() - randomRange(86400000, 365 * 86400000)).toISOString()
  };
}

// 전문 교사 생성 (보건, 영양, 상담 등)
function generateSpecialistTeacher(type: string, index: number): FakeTeacher {
  const gender = Math.random() > 0.3 ? 'female' : 'male';
  const name = generateName(gender);

  const typeConfig: Record<string, { workplace: string; jobTitle: string; adminDuties: string }> = {
    health: { workplace: '보건실', jobTitle: '보건교사', adminDuties: '학생 건강관리' },
    nutrition: { workplace: '급식실', jobTitle: '영양교사', adminDuties: '급식 및 영양관리' },
    counselor: { workplace: '상담실', jobTitle: '상담교사', adminDuties: '학생 상담 및 진로지도' },
    librarian: { workplace: '도서관', jobTitle: '사서교사', adminDuties: '도서관 운영' },
    special: { workplace: '특수학급', jobTitle: '특수교사', adminDuties: '특수교육' }
  };

  const config = typeConfig[type] || typeConfig.health;

  return {
    id: `specialist-${type}-${index}`,
    email: `${type}${index}@school.edu`,
    name,
    role: 'TEACHER',
    gender,
    workplace: config.workplace,
    jobTitle: config.jobTitle,
    adminDuties: config.adminDuties,
    extensionNumber: generateExtensionNumber(),
    phoneNumber: generatePhoneNumber(),
    profileCompleted: true,
    isOnline: Math.random() > 0.5,
    lastSeen: new Date(Date.now() - randomRange(0, 86400000)).toISOString(),
    createdAt: new Date(Date.now() - randomRange(86400000, 365 * 86400000)).toISOString()
  };
}

// 관리자 생성
function generateAdmin(type: string, index: number): FakeTeacher {
  const gender = Math.random() > 0.5 ? 'male' : 'female';
  const name = generateName(gender);

  const typeConfig: Record<string, { workplace: string; jobTitle: string; adminDuties: string }> = {
    principal: { workplace: '교장실', jobTitle: '교장', adminDuties: '학교 총괄' },
    vicePrincipal: { workplace: '교감실', jobTitle: '교감', adminDuties: '교무 행정 총괄' },
    adminHead: { workplace: '행정실', jobTitle: '행정실장', adminDuties: '행정 업무 총괄' },
    admin: { workplace: '행정실', jobTitle: '행정직원', adminDuties: '행정 업무' }
  };

  const config = typeConfig[type] || typeConfig.admin;

  return {
    id: `admin-${type}-${index}`,
    email: `${type}${index}@school.edu`,
    name,
    role: 'ADMIN',
    gender,
    workplace: config.workplace,
    jobTitle: config.jobTitle,
    adminDuties: config.adminDuties,
    extensionNumber: generateExtensionNumber(),
    phoneNumber: generatePhoneNumber(),
    profileCompleted: true,
    isOnline: Math.random() > 0.3,
    lastSeen: new Date(Date.now() - randomRange(0, 86400000)).toISOString(),
    createdAt: new Date(Date.now() - randomRange(86400000, 365 * 86400000)).toISOString()
  };
}

// 부장교사 생성
function generateHeadTeacher(duty: string, index: number): FakeTeacher {
  const gender = Math.random() > 0.5 ? 'male' : 'female';
  const name = generateName(gender);

  return {
    id: `head-${index}`,
    email: `head${index}@school.edu`,
    name,
    role: 'TEACHER',
    gender,
    workplace: '교무실',
    jobTitle: '부장교사',
    adminDuties: duty,
    subjects: [randomPick(subjects)],
    extensionNumber: generateExtensionNumber(),
    phoneNumber: generatePhoneNumber(),
    profileCompleted: true,
    isOnline: Math.random() > 0.3,
    lastSeen: new Date(Date.now() - randomRange(0, 86400000)).toISOString(),
    createdAt: new Date(Date.now() - randomRange(86400000, 365 * 86400000)).toISOString()
  };
}

// 전체 학교 데이터 생성
export interface SchoolData {
  teachers: FakeTeacher[];
  admins: FakeTeacher[];
  total: number;
  stats: {
    homeRoomTeachers: number;
    subjectTeachers: number;
    specialists: number;
    headTeachers: number;
    admins: number;
  };
}

export function generateSchoolData(options: {
  grades?: number;
  classesPerGrade?: number;
  subjectTeachers?: number;
  includeSpecialists?: boolean;
} = {}): SchoolData {
  const {
    grades = 6,
    classesPerGrade = 4,
    subjectTeachers = 10,
    includeSpecialists = true
  } = options;

  const teachers: FakeTeacher[] = [];
  const admins: FakeTeacher[] = [];

  // 1. 관리자 (교장, 교감, 행정실장)
  admins.push(generateAdmin('principal', 1));
  admins.push(generateAdmin('vicePrincipal', 1));
  admins.push(generateAdmin('adminHead', 1));

  // 행정직원 2명
  for (let i = 1; i <= 2; i++) {
    admins.push(generateAdmin('admin', i));
  }

  // 2. 담임교사
  for (let grade = 1; grade <= grades; grade++) {
    for (let classNum = 1; classNum <= classesPerGrade; classNum++) {
      teachers.push(generateHomeRoomTeacher(grade, classNum, (grade - 1) * classesPerGrade + classNum));
    }
  }

  // 3. 교과 전담교사
  for (let i = 1; i <= subjectTeachers; i++) {
    teachers.push(generateSubjectTeacher(i));
  }

  // 4. 부장교사
  adminDuties.slice(0, 6).forEach((duty, index) => {
    teachers.push(generateHeadTeacher(duty, index + 1));
  });

  // 5. 전문 교사 (보건, 영양, 상담, 사서, 특수)
  if (includeSpecialists) {
    teachers.push(generateSpecialistTeacher('health', 1));
    teachers.push(generateSpecialistTeacher('nutrition', 1));
    teachers.push(generateSpecialistTeacher('counselor', 1));
    teachers.push(generateSpecialistTeacher('librarian', 1));
    teachers.push(generateSpecialistTeacher('special', 1));
  }

  return {
    teachers,
    admins,
    total: teachers.length + admins.length,
    stats: {
      homeRoomTeachers: grades * classesPerGrade,
      subjectTeachers,
      specialists: includeSpecialists ? 5 : 0,
      headTeachers: 6,
      admins: admins.length
    }
  };
}

// 간편 생성 함수
export function generateFakeTeachers(count: number = 50): FakeTeacher[] {
  const data = generateSchoolData({
    grades: 6,
    classesPerGrade: Math.ceil(count / 10),
    subjectTeachers: Math.floor(count / 5),
    includeSpecialists: true
  });

  return [...data.admins, ...data.teachers].slice(0, count);
}

// 메시지용 테스트 데이터 생성
export interface FakeMessage {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  content: string;
  type: 'text' | 'file' | 'image';
  timestamp: string;
  isRead: boolean;
  delivered: boolean;
}

const messageTemplates = [
  '내일 회의 참석 가능하신가요?',
  '학부모 상담 일정 조정이 필요합니다.',
  '오늘 체육대회 준비물 확인 부탁드립니다.',
  '방과후 수업 관련 문의드립니다.',
  '다음 주 출장 일정 공유드립니다.',
  '학급 운영 관련 자료 보내드립니다.',
  '급식 메뉴 변경 안내드립니다.',
  '교직원 연수 신청 마감일입니다.',
  '학생 상담 결과 공유드립니다.',
  '교내 행사 일정 확인 부탁드립니다.'
];

export function generateFakeMessages(
  senderId: string,
  senderName: string,
  recipientId: string,
  count: number = 10
): FakeMessage[] {
  const messages: FakeMessage[] = [];

  for (let i = 0; i < count; i++) {
    // 보낸 메시지와 받은 메시지 번갈아 생성
    const isOutgoing = i % 2 === 0;

    messages.push({
      id: `msg-${Date.now()}-${i}`,
      senderId: isOutgoing ? senderId : recipientId,
      senderName: isOutgoing ? senderName : '상대방',
      recipientId: isOutgoing ? recipientId : senderId,
      content: randomPick(messageTemplates),
      type: 'text',
      timestamp: new Date(Date.now() - (count - i) * 60000 * randomRange(5, 30)).toISOString(),
      isRead: i < count - 2,
      delivered: true
    });
  }

  return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
