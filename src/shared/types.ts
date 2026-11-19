export type UserRole = 'STUDENT' | 'TEACHER' | 'COORDINATOR' | 'ADMIN' | 'SUPERADMIN';

export interface UserSession {
  id: string;
  schoolId: string;
  schoolName?: string;
  registrationNumber: string;
  name: string;
  email?: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  sedToken?: string | null;
  isMonitor?: boolean; // Aluno monitor (mentoria Sala do Futuro)
}

export interface SchoolData {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  type: string;
}

export interface ClassData {
  id: string;
  schoolId: string;
  name: string;
  grade: string;
  shift: string;
  year: number;
  code: string;
  channels?: ChannelData[];
  teacherNames?: string[];
  studentCount?: number;
}

export interface ChannelData {
  id: string;
  classId: string;
  name: string;
  type: 'TEXT' | 'ANNOUNCEMENT' | 'VOICE';
  isLocked: boolean;
}

export interface MessageData {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  senderAvatar?: string | null;
  content: string;
  attachments?: Array<{ name: string; url: string; type: string; size?: string }>;
  isPinned: boolean;
  createdAt: string;
}

export interface ClassroomSessionState {
  id: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  title: string;
  subject?: string;
  status: 'ACTIVE' | 'ENDED';
  allowStudentCam: boolean;
  allowStudentMic: boolean;
  allowStudentScreen: boolean;
  activeScreenSharerId?: string | null;
  startedAt: string;
  participants: ParticipantState[];
  handRaises: Array<{ userId: string; userName: string; raisedAt: number }>;
}

export interface ParticipantState {
  socketId: string;
  userId: string;
  name: string;
  role: UserRole;
  avatarUrl?: string | null;
  isCamOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  canShareScreen: boolean;
}

export interface WhiteboardAction {
  type: 'draw' | 'clear' | 'undo';
  stroke?: {
    tool: 'pen' | 'eraser' | 'rect' | 'circle' | 'line' | 'text';
    color: string;
    size: number;
    points: Array<{ x: number; y: number }>;
    text?: string;
  };
}
