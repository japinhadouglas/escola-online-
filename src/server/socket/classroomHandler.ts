import { Server, Socket } from 'socket.io';
import { classroomSessions } from './webrtcSignaling.js';

export function setupClassroomHandler(io: Server, socket: Socket) {
  // Somente moderadores (professor, coordenação, admin, superadmin) podem executar
  // ações administrativas (mutar, expulsar, encerrar, gerenciar permissões).
  // O papel é verificado a partir do estado real do participante na sessão, e nunca
  // a partir do frontend, para impedir escalonamento de privilégio por aluno.
  const isModeratorInRoom = (roomId: string): boolean => {
    const roomParticipants = classroomSessions.get(roomId);
    if (!roomParticipants) return false;
    const participant = roomParticipants.get(socket.id);
    if (!participant) return false;
    return (
      participant.role === 'TEACHER' ||
      participant.role === 'COORDINATOR' ||
      participant.role === 'ADMIN' ||
      participant.role === 'SUPERADMIN'
    );
  };

  // Levantar a mão
  socket.on('raise-hand', ({ roomId, user }: { roomId: string; user: any }) => {
    const roomParticipants = classroomSessions.get(roomId);
    if (roomParticipants && roomParticipants.has(socket.id)) {
      const p = roomParticipants.get(socket.id)!;
      p.isHandRaised = true;

      io.to(roomId).emit('hand-raised', {
        socketId: socket.id,
        userId: user.id,
        userName: user.name,
        raisedAt: Date.now(),
      });
    }
  });

  // Abaixar a mão
  socket.on('lower-hand', ({ roomId }: { roomId: string }) => {
    const roomParticipants = classroomSessions.get(roomId);
    if (roomParticipants && roomParticipants.has(socket.id)) {
      const p = roomParticipants.get(socket.id)!;
      p.isHandRaised = false;

      io.to(roomId).emit('hand-lowered', {
        socketId: socket.id,
      });
    }
  });

  // Enviar reação (palmas, coração, joinha, dúvida, ideia)
  socket.on('send-reaction', ({ roomId, reaction, userName }: { roomId: string; reaction: string; userName: string }) => {
    io.to(roomId).emit('reaction-received', {
      socketId: socket.id,
      reaction,
      userName,
      id: Math.random().toString(36).substring(7),
    });
  });

  // Professor silencia um participante remotamente
  socket.on('mute-participant', ({ roomId, targetSocketId }: { roomId: string; targetSocketId: string }) => {
    if (!isModeratorInRoom(roomId)) return;
    io.to(targetSocketId).emit('force-mute');
    io.to(roomId).emit('participant-muted', { socketId: targetSocketId });
  });

  // Professor silencia todos os alunos
  socket.on('mute-all-students', ({ roomId }: { roomId: string }) => {
    if (!isModeratorInRoom(roomId)) return;
    const roomParticipants = classroomSessions.get(roomId);
    if (roomParticipants) {
      for (const [sId, p] of roomParticipants.entries()) {
        if (p.role === 'STUDENT' && sId !== socket.id) {
          io.to(sId).emit('force-mute');
        }
      }
    }
    io.to(roomId).emit('all-students-muted');
  });

  // Professor concede ou revoga permissão de compartilhamento de tela para um aluno
  socket.on('toggle-student-screen-permission', ({ roomId, targetSocketId, allowed }: { roomId: string; targetSocketId: string; allowed: boolean }) => {
    if (!isModeratorInRoom(roomId)) return;
    const roomParticipants = classroomSessions.get(roomId);
    if (roomParticipants && roomParticipants.has(targetSocketId)) {
      const p = roomParticipants.get(targetSocketId)!;
      p.canShareScreen = allowed;

      io.to(targetSocketId).emit('screen-permission-updated', { allowed });
      io.to(roomId).emit('participant-permission-changed', {
        socketId: targetSocketId,
        canShareScreen: allowed,
      });
    }
  });

  // Professor remove um participante da sala (expulsar)
  socket.on('kick-participant', ({ roomId, targetSocketId, reason }: { roomId: string; targetSocketId: string; reason?: string }) => {
    if (!isModeratorInRoom(roomId)) return;
    io.to(targetSocketId).emit('kicked-from-classroom', { reason: reason || 'Removido pelo professor.' });
    io.to(roomId).emit('participant-kicked', { socketId: targetSocketId });
  });

  // Professor encerra a aula para todos
  socket.on('end-classroom', ({ roomId }: { roomId: string }) => {
    if (!isModeratorInRoom(roomId)) return;
    io.to(roomId).emit('classroom-ended');
    classroomSessions.delete(roomId);
  });
}
