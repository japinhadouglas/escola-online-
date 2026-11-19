import { Server, Socket } from 'socket.io';
import { whiteboardHistory } from './webrtcSignaling.js';

export function setupWhiteboardHandler(io: Server, socket: Socket) {
  // Cliente pede o histórico do quadro (usado quando o quadro é aberto DEPOIS de
  // entrar na sala — o whiteboard-init do join chega antes do componente montar).
  socket.on('whiteboard-init-request', ({ roomId }: { roomId: string }) => {
    socket.emit('whiteboard-init', whiteboardHistory.get(roomId) || []);
  });

  // Receber e transmitir traço do quadro branco
  socket.on('whiteboard-draw', ({ roomId, drawData }: { roomId: string; drawData: any }) => {
    if (!whiteboardHistory.has(roomId)) {
      whiteboardHistory.set(roomId, []);
    }

    const history = whiteboardHistory.get(roomId)!;
    history.push(drawData);

    // Manter histórico em limite saudável para evitar memory leak
    if (history.length > 2000) {
      history.shift();
    }

    // Transmitir para todos os outros participantes da sala
    socket.to(roomId).emit('whiteboard-draw', drawData);
  });

  // Limpar quadro branco
  socket.on('whiteboard-clear', ({ roomId }: { roomId: string }) => {
    whiteboardHistory.set(roomId, []);
    io.to(roomId).emit('whiteboard-clear');
  });
}
