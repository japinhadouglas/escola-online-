import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ParticipantState } from '../../shared/types.js';
import { prisma } from '../db.js';
import { config } from '../config.js';

// Mapa de salas ativas: roomId -> Map<socketId, ParticipantState>
export const classroomSessions = new Map<string, Map<string, ParticipantState>>();

// Mapa de histórico do quadro branco: roomId -> Array<any>
export const whiteboardHistory = new Map<string, any[]>();

// Configuração de presença fora da chamada: quando um usuário entra em uma sala
// de voz (Sala Online), todos que estão visualizando aquela turma recebem um
// evento informando quem está dentro — assim dá para ver quem está na chamada
// mesmo sem ter entrado.
interface ClassPresenceEntry {
  socketId: string;
  userId: string;
  name: string;
  role: string;
  avatarUrl: string | null | undefined;
  inCall: boolean;
  roomId: string | null;
}

// Emite para todos os sockets da turma (sala `presence-{classId}`) a lista de
// quem está dentro de alguma Sala Online daquela turma.
function broadcastClassPresence(io: Server, classId: string) {
  const presenceEntries: ClassPresenceEntry[] = [];

  classroomSessions.forEach((participants, roomId) => {
    const targetClassId = roomId.replace('class-', '');
    if (targetClassId === classId) {
      participants.forEach((p) => {
        presenceEntries.push({
          socketId: p.socketId,
          userId: p.userId,
          name: p.name,
          role: p.role,
          avatarUrl: p.avatarUrl,
          inCall: true,
          roomId,
        });
      });
    }
  });

  io.to(`presence-${classId}`).emit('class-presence-updated', {
    classId,
    participants: presenceEntries,
  });
}

// Autenticar o socket via token JWT e retornar dados reais do banco de dados
async function authenticateSocket(socket: Socket): Promise<{
  id: string;
  name: string;
  registrationNumber: string;
  role: any;
  schoolId: string;
  avatarUrl: string | null;
} | null> {
  try {
    // Aceitar token via handshake auth ou query string
    const rawToken =
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.query?.token as string);

    if (!rawToken) return null;

    const payload = jwt.verify(rawToken, config.jwtSecret) as any;
    if (!payload?.id) return null;

    // Buscar dados frescos e reais do banco de dados pelo ID do usuário
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        name: true,
        registrationNumber: true,
        role: true,
        schoolId: true,
        avatarUrl: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) return null;

    return user;
  } catch {
    return null;
  }
}

export function setupWebRTCSignaling(io: Server, socket: Socket) {
  // Entrar na Sala do Futuro — autenticação obrigatória via token JWT
  socket.on('join-classroom', async ({ roomId }: { roomId: string }) => {
    // Autenticar usando dados reais do banco de dados
    const authenticatedUser = await authenticateSocket(socket);

    if (!authenticatedUser) {
      socket.emit('classroom-auth-error', {
        error: 'Autenticação necessária. Faça login novamente para entrar na sala.',
      });
      return;
    }

    // Garantir que a sala pertence à mesma escola do usuário (isolamento multi-tenant)
    // roomId deve ter formato: class-{classId}
    // Verificar se o aluno/professor está matriculado na turma
    const classId = roomId.replace('class-', '');
    if (classId && classId !== roomId) {
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          userId: authenticatedUser.id,
          classId,
          class: { schoolId: authenticatedUser.schoolId },
        },
      });

      // Professores, admin e coordenadores podem entrar em qualquer sala da escola
      const canBypass =
        authenticatedUser.role === 'ADMIN' ||
        authenticatedUser.role === 'COORDINATOR' ||
        authenticatedUser.role === 'SUPERADMIN' ||
        authenticatedUser.role === 'TEACHER';

      if (!enrollment && !canBypass) {
        socket.emit('classroom-auth-error', {
          error: 'Você não está matriculado nesta turma.',
        });
        return;
      }
    }

    socket.join(roomId);

    if (!classroomSessions.has(roomId)) {
      classroomSessions.set(roomId, new Map());
    }

    const roomParticipants = classroomSessions.get(roomId)!;

    // Construir o estado do participante com dados verificados e reais do banco
    const participant: ParticipantState = {
      socketId: socket.id,
      userId: authenticatedUser.id,
      name: authenticatedUser.name,                       // Nome real do banco de dados
      role: authenticatedUser.role,                       // Perfil real verificado
      avatarUrl: authenticatedUser.avatarUrl,
      isCamOn: false,
      isMicOn: false,
      isScreenSharing: false,
      isHandRaised: false,
      canShareScreen:
        authenticatedUser.role === 'TEACHER' ||
        authenticatedUser.role === 'ADMIN' ||
        authenticatedUser.role === 'COORDINATOR',
    };

    roomParticipants.set(socket.id, participant);

    // Notificar os outros participantes na sala que um novo par conectou
    socket.to(roomId).emit('user-joined-classroom', participant);

    // Enviar para o usuário recém-conectado a lista de participantes atuais E seus próprios dados
    const existingParticipants = Array.from(roomParticipants.values());
    socket.emit('classroom-participants-list', existingParticipants);

    // Enviar dados autenticados do próprio usuário de volta ao frontend
    socket.emit('classroom-authenticated', {
      userId: authenticatedUser.id,
      name: authenticatedUser.name,
      registrationNumber: authenticatedUser.registrationNumber,
      role: authenticatedUser.role,
      avatarUrl: authenticatedUser.avatarUrl,
    });

    // Enviar o histórico do quadro branco atual para o usuário
    const currentWhiteboard = whiteboardHistory.get(roomId) || [];
    socket.emit('whiteboard-init', currentWhiteboard);

    // Atualizar a presença da turma (quem está dentro da chamada) para todos
    // que estão visualizando a turma mas não entraram na chamada.
    broadcastClassPresence(io, classId);
  });

  // Sinalização WebRTC: Troca de SDP Offer
  socket.on('webrtc-offer', ({ targetSocketId, offer, polite, callerInfo }) => {
    io.to(targetSocketId).emit('webrtc-offer', {
      callerSocketId: socket.id,
      offer,
      polite,
      callerInfo,
    });
  });

  // Sinalização WebRTC: Troca de SDP Answer
  socket.on('webrtc-answer', ({ targetSocketId, answer, polite }) => {
    io.to(targetSocketId).emit('webrtc-answer', {
      responderSocketId: socket.id,
      answer,
      polite,
    });
  });

  // Sinalização WebRTC: Troca de ICE Candidates (NAT Traversal / STUN)
  socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('webrtc-ice-candidate', {
      senderSocketId: socket.id,
      candidate,
    });
  });

  // Atualização de status de mídia (Câmera / Microfone / Tela)
  socket.on('media-state-changed', ({ roomId, isCamOn, isMicOn, isScreenSharing }) => {
    const roomParticipants = classroomSessions.get(roomId);
    if (roomParticipants && roomParticipants.has(socket.id)) {
      const p = roomParticipants.get(socket.id)!;
      if (typeof isCamOn === 'boolean') p.isCamOn = isCamOn;
      if (typeof isMicOn === 'boolean') p.isMicOn = isMicOn;
      if (typeof isScreenSharing === 'boolean') p.isScreenSharing = isScreenSharing;

      io.to(roomId).emit('participant-media-updated', {
        socketId: socket.id,
        isCamOn: p.isCamOn,
        isMicOn: p.isMicOn,
        isScreenSharing: p.isScreenSharing,
      });
    }
  });

  // Sair da Sala do Futuro
  socket.on('leave-classroom', ({ roomId }: { roomId: string }) => {
    handleUserLeaveClassroom(io, socket, roomId);
  });

  // Observar presença das chamadas de uma turma (quem está dentro)
  socket.on('join-presence', ({ classId }: { classId: string }) => {
    socket.join(`presence-${classId}`);
    broadcastClassPresence(io, classId);
  });

  socket.on('leave-presence', ({ classId }: { classId: string }) => {
    socket.leave(`presence-${classId}`);
  });
}

export function handleUserLeaveClassroom(io: Server, socket: Socket, roomId?: string) {
  const roomsToClean = roomId ? [roomId] : Array.from(classroomSessions.keys());
  const affectedClasses = new Set<string>();

  for (const rId of roomsToClean) {
    const roomParticipants = classroomSessions.get(rId);
    if (roomParticipants && roomParticipants.has(socket.id)) {
      const participant = roomParticipants.get(socket.id);
      roomParticipants.delete(socket.id);

      socket.to(rId).emit('user-left-classroom', {
        socketId: socket.id,
        userId: participant?.userId,
      });

      if (roomParticipants.size === 0) {
        classroomSessions.delete(rId);
        whiteboardHistory.delete(rId);
      }

      affectedClasses.add(rId.replace('class-', ''));
    }
  }

  affectedClasses.forEach((classId) => {
    if (classId && classId !== '') broadcastClassPresence(io, classId);
  });
}
