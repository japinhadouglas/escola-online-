import { Server, Socket } from 'socket.io';
import { prisma } from '../db.js';

interface SocketUser {
  id: string;
  schoolId: string;
  role: string;
}

// Resolve o ID do usuário autenticado presente no socket (definido no handshake JWT).
function getSocketUser(socket: Socket): SocketUser | null {
  const user = (socket as any).user;
  return user && user.id ? { id: user.id, schoolId: user.schoolId, role: user.role } : null;
}

// Verifica se o usuário está matriculado na turma dona do canal (ou é moderador
// da escola). Impede que um aluno autenticado espione/broadcast em canais de
// turmas das quais não participa, ou forje mensagens em nome de outrem.
async function canAccessChannel(user: SocketUser, channelId: string): Promise<boolean> {
  try {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        class: { schoolId: user.schoolId },
      },
      include: { class: { include: { enrollments: true } } },
    });

    if (!channel) return false;

    const isModerator =
      user.role === 'TEACHER' ||
      user.role === 'COORDINATOR' ||
      user.role === 'ADMIN' ||
      user.role === 'SUPERADMIN';

    if (isModerator) return true;

    return channel.class.enrollments.some((e) => e.userId === user.id);
  } catch {
    return false;
  }
}

export function setupChatHandler(io: Server, socket: Socket) {
  const user = getSocketUser(socket);

  // Entrar em um canal de texto de turma (após validar matrícula)
  socket.on('join-channel', async ({ channelId }: { channelId: string }) => {
    if (!user || !channelId || !(await canAccessChannel(user, channelId))) return;
    socket.join(`channel:${channelId}`);
  });

  // Sair de um canal de texto
  socket.on('leave-channel', ({ channelId }: { channelId: string }) => {
    if (channelId) socket.leave(`channel:${channelId}`);
  });

  // Notificar nova mensagem no canal em tempo real (valida matrícula antes de
  // retransmitir, para impedir spoofing de mensagens por aluno de fora).
  socket.on('send-channel-message', async ({ channelId, message }: { channelId: string; message: any }) => {
    if (!user || !channelId || !(await canAccessChannel(user, channelId))) return;
    // Limita o tamanho do payload retransmitido como medida anti-DoS.
    if (message && typeof message === 'object' && JSON.stringify(message).length > 20000) return;
    socket.to(`channel:${channelId}`).emit('new-channel-message', message);
  });

  // Indicador de digitação
  socket.on('user-typing', ({ channelId, userId, userName }: { channelId: string; userId: string; userName: string }) => {
    if (!channelId) return;
    socket.to(`channel:${channelId}`).emit('user-typing', { userId, userName, channelId });
  });
}
