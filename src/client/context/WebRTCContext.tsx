import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { ParticipantState } from '../../shared/types';

interface AuthenticatedParticipant {
  userId: string;
  name: string;
  registrationNumber: string;
  role: string;
  avatarUrl: string | null;
}

interface WebRTCContextType {
  inCall: boolean;
  roomId: string | null;
  participants: ParticipantState[];
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isCamOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  canShareScreen: boolean;
  activeReactions: Array<{ id: string; reaction: string; userName: string }>;
  handRaises: Array<{ socketId: string; userId: string; userName: string; raisedAt: number }>;
  // Dados verificados do usuário autenticado na sala (vêm do banco de dados via servidor)
  authenticatedParticipant: AuthenticatedParticipant | null;
  joinClassroom: (roomId: string) => Promise<void>;
  leaveClassroom: () => void;
  toggleCamera: () => Promise<void>;
  toggleMicrophone: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  toggleRaiseHand: () => void;
  sendReaction: (emoji: string) => void;
  muteParticipant: (socketId: string) => void;
  muteAllStudents: () => void;
  toggleScreenPermission: (socketId: string, allowed: boolean) => void;
  kickParticipant: (socketId: string, reason?: string) => void;
  endClassroom: () => void;
}

const WebRTCContext = createContext<WebRTCContextType | undefined>(undefined);

// Configuração STUN + TURN para NAT Traversal (necessário para chamadas reais
// entre redes diferentes — celular, casa, escola). Sem TURN, chamadas podem falhar.
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.1und1.de:3478' },
    { urls: 'stun:stun.nextcloud.com:443' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export const WebRTCProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  const { user } = useAuth();

  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantState[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const [isCamOn, setIsCamOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [canShareScreen, setCanShareScreen] = useState(false);
  const [activeReactions, setActiveReactions] = useState<Array<{ id: string; reaction: string; userName: string }>>([]);
  const [handRaises, setHandRaises] = useState<Array<{ socketId: string; userId: string; userName: string; raisedAt: number }>>([]);

  // Dados reais do participante verificado pelo servidor (banco de dados)
  const [authenticatedParticipant, setAuthenticatedParticipant] = useState<AuthenticatedParticipant | null>(null);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const endingClassRef = useRef(false);
  const joinedRoomIdRef = useRef<string | null>(null);
  const participantsRef = useRef<ParticipantState[]>([]);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  // Estado de negociação POR PAR (Perfect Negotiation). Ter um objeto por par é
  // obrigatório para que a 3ª/4ª conexão não corrompa a negociação das outras.
  const negotiationStatesRef = useRef<Map<string, { makingOffer: boolean; ignoreOffer: boolean; polite: boolean }>>(new Map());
  const socketRef = useRef(socket);

  const getNegState = useCallback((targetSocketId: string) => {
    let st = negotiationStatesRef.current.get(targetSocketId);
    if (!st) {
      st = {
        makingOffer: false,
        ignoreOffer: false,
        polite: socket?.id != null && targetSocketId != null ? socket.id < targetSocketId : true,
      };
      negotiationStatesRef.current.set(targetSocketId, st);
    }
    return st;
  }, [socket]);

  // Manter o socket mais recente acessível dentro de callbacks estáveis.
  socketRef.current = socket;

  // Sincronizar participantes/streams em refs para uso dentro de event listeners sem
  // depender de closures desatualizadas (evita "depende de quem entra primeiro").
  const setParticipantsBoth = useCallback((updater: (prev: ParticipantState[]) => ParticipantState[]) => {
    setParticipants((prev) => {
      const next = updater(prev);
      participantsRef.current = next;
      return next;
    });
  }, []);

  const upsertParticipant = useCallback(
    (p: ParticipantState) => {
      setParticipantsBoth((prev) => {
        // Compatibilidade por socketId E por userId: se o mesmo usuário reconectar
        // com um socket novo, a entrada antiga é atualizada para o socket atual em
        // vez de ser descartada (dava "participante some na lista ao reconectar").
        const exists = prev.some((x) => x.socketId === p.socketId || (x.userId && x.userId === p.userId));
        if (!exists) return [...prev, p];
        return prev.map((x) =>
          x.socketId === p.socketId || (x.userId && x.userId === p.userId) ? { ...x, ...p } : x
        );
      });
    },
    [setParticipantsBoth]
  );

  const setRemoteStreamsBoth = useCallback(
    (updater: (prev: Map<string, MediaStream>) => Map<string, MediaStream>) => {
      setRemoteStreams((prev) => {
        const next = updater(prev);
        remoteStreamsRef.current = next;
        return next;
      });
    },
    []
  );

  // Limpar toda a sessão WebRTC quando o usuário sai da plataforma (logout)
  useEffect(() => {
    if (!user) {
      leaveClassroom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Obter ou criar stream local de áudio/vídeo
  const getOrCreateLocalStream = async (video = true, audio = true): Promise<MediaStream> => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 30 } } : false,
        audio: audio,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.warn('[WebRTC] Câmera/microfone não disponível:', err);
      const dummyCanvas = document.createElement('canvas');
      dummyCanvas.width = 640;
      dummyCanvas.height = 480;
      const ctx = dummyCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 640, 480);
      }
      const dummyStream = dummyCanvas.captureStream();
      if (localStreamRef.current) {
        // Reaproveitar o fluxo existente (pode já ter áudio)
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) dummyStream.addTrack(audioTrack);
      }
      localStreamRef.current = dummyStream;
      setLocalStream(dummyStream);
      return dummyStream;
    }
  };

  // Enviar SDP (offer/answer) por socket
  const sendSdp = useCallback(
    (targetSocketId: string, description: RTCSessionDescriptionInit, polite: boolean) => {
      socketRef.current?.emit(description.type === 'offer' ? 'webrtc-offer' : 'webrtc-answer', {
        targetSocketId,
        offer: description,
        answer: description,
        polite,
        callerInfo: {
          id: authenticatedParticipant?.userId,
          name: authenticatedParticipant?.name,
          role: authenticatedParticipant?.role,
        },
      });
    },
    [authenticatedParticipant]
  );

  // Sinalização firme e serializada (Perfect Negotiation) para evitar "glare"
  // (duas pessoas oferecendo ao mesmo tempo) e renegociação concorrente.
  const negotiate = useCallback(
    async (targetSocketId: string, pc: RTCPeerConnection) => {
      const st = getNegState(targetSocketId);
      try {
        st.makingOffer = true;
        await pc.setLocalDescription();
        sendSdp(targetSocketId, pc.localDescription!, st.polite);
      } catch (err) {
        console.warn('[WebRTC] Erro ao negociar com', targetSocketId, err);
      } finally {
        st.makingOffer = false;
      }
    },
    [getNegState, sendSdp]
  );

  // Adiciona os tracks locais (câmera/mic/tela) ao peer. Só deve ser chamado
  // quando a negociação está "stable" para não disparar um offer concorrente
  // durante o processamento de uma oferta recebida (evita glare/ping-pong).
  const attachLocalTracks = useCallback((pc: RTCPeerConnection) => {
    const tracksToSend: Array<{ track: MediaStreamTrack; stream: MediaStream }> = [];
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        tracksToSend.push({ track, stream: screenStreamRef.current! });
      });
    }
    if (localStreamRef.current) {
      // Evitar duplicar o mesmo track de vídeo quando a tela já é enviada.
      const alreadySent = new Set(tracksToSend.map((t) => t.track.id));
      localStreamRef.current.getTracks().forEach((track) => {
        if (!alreadySent.has(track.id)) tracksToSend.push({ track, stream: localStreamRef.current! });
      });
    }
    tracksToSend.forEach(({ track, stream }) => {
      if (pc.getSenders().every((s) => s.track?.id !== track.id)) {
        pc.addTrack(track, stream);
      }
    });
  }, []);

  // Criar (ou obter) a conexão RTCPeerConnection para um par remoto, com
  // renegociação automática quando tracks são adicionados/removidos.
  // `attachLocalTracksOnCreate` adiciona as tracks já na criação — usado apenas
  // quando SOMOS nós que iniciamos (não devemos anexar tracks ao receber uma
  // oferta, para não gerar um offer/glare concorrente antes do answer).
  const createPeerConnection = useCallback(
    (targetSocketId: string, attachLocalTracksOnCreate = true): RTCPeerConnection | null => {
      const existing = peerConnections.current.get(targetSocketId);
      if (existing) return existing;

      const socketIdLocal = socket?.id;
      if (!socketIdLocal) return null;

      // "Polite" cria ofertas sob demanda; "impolite" (o primeiro que entrou)
      // resolve conflito de glare jogando fora a oferta recebida. Usamos
      // comparação determinística: quem tem socketId menor é o "polite".
      const polite = (socketIdLocal < targetSocketId);

      const pc = new RTCPeerConnection(rtcConfig);

      if (attachLocalTracksOnCreate) {
        attachLocalTracks(pc);
      }

      const st = getNegState(targetSocketId);

      pc.onnegotiationneeded = async () => {
        try {
          // Só negociamos a partir do estado "stable"; evita ofertas concorrentes
          // (glare) quando uma oferta/answer ainda está em andamento.
          if (pc.signalingState !== 'stable') return;
          if (st.makingOffer) return;
          st.makingOffer = true;
          await pc.setLocalDescription();
          sendSdp(targetSocketId, pc.localDescription!, st.polite);
        } catch (err) {
          console.warn('[WebRTC] onnegotiationneeded falhou com', targetSocketId, err);
        } finally {
          st.makingOffer = false;
        }
      };

      pc.ontrack = (event) => {
        const incomingTrack = event.track;
        setRemoteStreamsBoth((prev) => {
          const updated = new Map(prev);
          let remoteStr = updated.get(targetSocketId);
          if (!remoteStr) {
            remoteStr = new MediaStream();
            updated.set(targetSocketId, remoteStr);
          }
          if (!remoteStr.getTracks().some((t) => t.id === incomingTrack.id)) {
            remoteStr.addTrack(incomingTrack);
          }
          return updated;
        });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('webrtc-ice-candidate', {
            targetSocketId,
            candidate: event.candidate,
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        if (st === 'failed' || st === 'disconnected') {
          // Tentar recuperar: reiniciar a conexão com ICE restart em vez de desistir.
          if (st === 'failed' && socketRef.current) {
            console.warn('[WebRTC] ICE falhou com', targetSocketId, '- reiniciando negociação');
            pc.restartIce();
            negotiate(targetSocketId, pc).catch(() => {});
          }
        }
        if (st === 'closed') {
          peerConnections.current.delete(targetSocketId);
          setRemoteStreamsBoth((prev) => {
            const updated = new Map(prev);
            updated.delete(targetSocketId);
            return updated;
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' && socketRef.current) {
          // Recuperação robusta: fechar e recriar a conexão com o mesmo par.
          console.warn('[WebRTC] Conexão falhou com', targetSocketId, '- recriando');
          peerConnections.current.delete(targetSocketId);
          pc.close();
          setRemoteStreamsBoth((prev) => {
            const updated = new Map(prev);
            updated.delete(targetSocketId);
            return updated;
          });
          ensurePeerConnection(targetSocketId);
        }
        if (pc.connectionState === 'closed') {
          peerConnections.current.delete(targetSocketId);
        }
      };

      peerConnections.current.set(targetSocketId, pc);
      return pc;
    },
    [socket, sendSdp, negotiate, setRemoteStreamsBoth, attachLocalTracks]
  );

  // Garantir que existe peer para um socket alvo. A criação registra o handler
  // `onnegotiationneeded` (que dispara ao adicionar tracks) e o fluxo normal de
  // Perfect Negotiation cuida da oferta inicial e das renegociações.
  const ensurePeerConnection = useCallback(
    (targetSocketId: string) => {
      return createPeerConnection(targetSocketId);
    },
    [createPeerConnection]
  );

  // Entrar na Sala do Futuro — o servidor autentica pelo token enviado no handshake do socket
  const joinClassroom = async (targetRoomId: string) => {
    if (!socket) return;

    try {
      // Sempre começa com microfone LIGADO (áudio habilitado) — igual Discord.
      await getOrCreateLocalStream(false, true);

      setRoomId(targetRoomId);
      currentRoomIdRef.current = targetRoomId;
      setParticipants([]);
      setRemoteStreamsBoth(() => new Map());
      setInCall(true);

      // Sincronizar o estado real do mic com o servidor (senão a UI mostra
      // "mudo" e o primeiro toque no botão muda a semântica invertida).
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      const micActuallyOn = !!audioTrack && audioTrack.enabled;
      setIsMicOn(micActuallyOn);
      if (micActuallyOn) {
        socket.emit('media-state-changed', {
          roomId: targetRoomId,
          isCamOn: false,
          isMicOn: true,
          isScreenSharing: false,
        });
      }

      // Emitir join-classroom SEM dados do usuário — o servidor busca do banco via token JWT
      socket.emit('join-classroom', { roomId: targetRoomId });
    } catch (err) {
      console.error('[WebRTC] Erro ao entrar na sala:', err);
    }
  };

  // Sair da Sala (limpeza completa e confiável de todos os estados)
  const leaveClassroom = useCallback(() => {
    const roomToLeave = currentRoomIdRef.current;

    if (socketRef.current && roomToLeave) {
      socketRef.current.emit('leave-classroom', { roomId: roomToLeave });
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
    }

    peerConnections.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        /* já fechada */
      }
    });
    peerConnections.current.clear();
    setRemoteStreamsBoth(() => new Map());

    setInCall(false);
    setRoomId(null);
    currentRoomIdRef.current = null;
    setParticipantsBoth(() => []);
    setIsCamOn(false);
    setIsMicOn(false);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setHandRaises([]);
    setAuthenticatedParticipant(null);
    setCanShareScreen(false);
    negotiationStatesRef.current.clear();
  }, [setParticipantsBoth, setRemoteStreamsBoth]);

  // Alternar Câmera
  const toggleCamera = async () => {
    try {
      if (!localStreamRef.current) {
        await getOrCreateLocalStream(true, isMicOn);
      }

      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack && videoTrack.readyState === 'live') {
        // Track já existe: apenas alternar e propagar para todos os peers
        const newState = !videoTrack.enabled;
        videoTrack.enabled = newState;
        setIsCamOn(newState);
        socketRef.current?.emit('media-state-changed', {
          roomId: currentRoomIdRef.current,
          isCamOn: newState,
          isMicOn,
        });
      } else {
        // Track de vídeo não existe → obter a câmera ADICIONANDO o track à
        // stream local já existente (não trocamos a stream inteira, o que
        // quebraria as referências dos peers e causaria congelamento).
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        const newVideoTrack = await navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((s) => s.getVideoTracks()[0]);

        if (!newVideoTrack) {
          setIsCamOn(false);
          return;
        }

        const stream = localStreamRef.current!;
        if (audioTrack && !stream.getVideoTracks().length) {
          stream.addTrack(newVideoTrack);
        }
        stream.getVideoTracks().forEach((t) => {
          if (t !== newVideoTrack) {
            t.stop();
            stream.removeTrack(t);
          }
        });
        if (!stream.getVideoTracks().includes(newVideoTrack)) {
          stream.addTrack(newVideoTrack);
        }
        setLocalStream(stream);
        setIsCamOn(true);

        // Propagação: cada peer precisa saber que há um track de vídeo novo.
        peerConnections.current.forEach((pc, targetSocketId) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack).catch(() => {
              negotiate(targetSocketId, pc).catch(() => {});
            });
          } else {
            // Não havia sender de vídeo → adicionar track e renegociar
            pc.addTrack(newVideoTrack, stream);
            negotiate(targetSocketId, pc).catch(() => {});
          }
        });

        socketRef.current?.emit('media-state-changed', {
          roomId: currentRoomIdRef.current,
          isCamOn: true,
          isMicOn,
        });
      }
    } catch (err) {
      console.warn('[WebRTC] Erro ao alternar câmera:', err);
    }
  };

  // Alternar Microfone
  const toggleMicrophone = async () => {
    try {
      if (!localStreamRef.current) {
        await getOrCreateLocalStream(isCamOn, true);
      }

      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) {
        const newState = !audioTrack.enabled;
        audioTrack.enabled = newState;
        setIsMicOn(newState);
        socketRef.current?.emit('media-state-changed', {
          roomId: currentRoomIdRef.current,
          isCamOn,
          isMicOn: newState,
        });
      }
    } catch (err) {
      console.warn('[WebRTC] Erro ao alternar microfone:', err);
    }
  };

  // Iniciar Compartilhamento de Tela Real
  const startScreenShare = async () => {
    if (!canShareScreen) {
      alert('Você não tem permissão para compartilhar tela nesta aula.');
      return;
    }

    if (screenStreamRef.current) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false,
      });
    } catch (err) {
      console.warn('[WebRTC] Compartilhamento cancelado:', err);
      return;
    }

    screenStreamRef.current = stream;
    setScreenStream(stream);
    setIsScreenSharing(true);

    const screenTrack = stream.getVideoTracks()[0];
    if (!screenTrack) return;

    screenTrack.onended = () => {
      stopScreenShare();
    };

    // Para cada peer: dar prioridade ao track da tela como track de vídeo enviado.
    peerConnections.current.forEach((pc, targetSocketId) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(screenTrack).catch(() => {
          pc.addTrack(screenTrack, stream);
          negotiate(targetSocketId, pc).catch(() => {});
        });
      } else {
        pc.addTrack(screenTrack, stream);
        negotiate(targetSocketId, pc).catch(() => {});
      }
    });

    socketRef.current?.emit('media-state-changed', {
      roomId: currentRoomIdRef.current,
      isCamOn,
      isMicOn,
      isScreenSharing: true,
    });
  };

  // Parar Compartilhamento de Tela
  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
    }
    setIsScreenSharing(false);

    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    peerConnections.current.forEach((pc, targetSocketId) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && camTrack) {
        sender.replaceTrack(camTrack).catch(() => {
          negotiate(targetSocketId, pc).catch(() => {});
        });
      } else if (sender) {
        try {
          pc.removeTrack(sender);
          negotiate(targetSocketId, pc).catch(() => {});
        } catch {
          /* sem sender de vídeo */
        }
      }
    });

    socketRef.current?.emit('media-state-changed', {
      roomId: currentRoomIdRef.current,
      isCamOn,
      isMicOn,
      isScreenSharing: false,
    });
  }, [isCamOn, isMicOn]);

  // Levantar / Abaixar a Mão (com nome autenticado do banco)
  const toggleRaiseHand = () => {
    if (!socketRef.current || !currentRoomIdRef.current) return;
    const newState = !isHandRaised;
    setIsHandRaised(newState);

    if (newState) {
      socketRef.current.emit('raise-hand', {
        roomId: currentRoomIdRef.current,
        // Enviar o nome verificado pelo servidor, não do frontend
        user: {
          id: authenticatedParticipant?.userId || user?.id,
          name: authenticatedParticipant?.name || user?.name,
        },
      });
    } else {
      socketRef.current.emit('lower-hand', { roomId: currentRoomIdRef.current });
    }
  };

  // Enviar Reação em Tempo Real (com nome autenticado)
  const sendReaction = (reaction: string) => {
    if (!socketRef.current || !currentRoomIdRef.current) return;
    socketRef.current.emit('send-reaction', {
      roomId: currentRoomIdRef.current,
      reaction,
      userName: authenticatedParticipant?.name || user?.name || 'Participante',
    });
  };

  // Ações de Moderação do Professor
  const muteParticipant = (socketId: string) => {
    socketRef.current?.emit('mute-participant', {
      roomId: currentRoomIdRef.current,
      targetSocketId: socketId,
    });
  };

  const muteAllStudents = () => {
    socketRef.current?.emit('mute-all-students', { roomId: currentRoomIdRef.current });
  };

  const toggleScreenPermission = (socketId: string, allowed: boolean) => {
    socketRef.current?.emit('toggle-student-screen-permission', {
      roomId: currentRoomIdRef.current,
      targetSocketId: socketId,
      allowed,
    });
  };

  const kickParticipant = (socketId: string, reason?: string) => {
    socketRef.current?.emit('kick-participant', {
      roomId: currentRoomIdRef.current,
      targetSocketId: socketId,
      reason,
    });
  };

  const endClassroom = () => {
    endingClassRef.current = true;
    socketRef.current?.emit('end-classroom', { roomId: currentRoomIdRef.current });
    leaveClassroom();
    setTimeout(() => {
      endingClassRef.current = false;
    }, 2000);
  };

  // Processar offer recebido com Perfect Negotiation (resolve glare e concorrência)
  const handleOffer = useCallback(
    async (callerSocketId: string, offer: RTCSessionDescriptionInit, polite?: boolean) => {
      // IMPORTANTE: criar a peer SEM anexar tracks de imediato. Se anexássemos,
      // o onnegotiationneeded dispararia um offer nosso concorrente enquanto
      // ainda estamos processando a oferta recebida → glare/ping-pong que quebra
      // a chamada (sintomas: "não conecta", "vídeo dos outros não liga").
      const pc = createPeerConnection(callerSocketId, false);
      if (!pc) return;

      const st = getNegState(callerSocketId);
      // O remetente informa sua "politeness"; se não vier, calculamos pela ordem
      // determinística dos socketIds (quem tem id menor é o "polite").
      if (typeof polite === 'boolean') st.polite = polite;
      else st.polite = socket?.id != null && callerSocketId != null ? socket.id < callerSocketId : true;

      // Glare: se formos "impolite" e houver colisão (fazendo oferta ou com
      // estado não-stable), descartamos a oferta recebida — a outra ponta reinicia.
      const collision = st.makingOffer || pc.signalingState !== 'stable';
      st.ignoreOffer = !st.polite && collision;
      if (st.ignoreOffer) {
        console.warn('[WebRTC] Oferta de', callerSocketId, 'descartada (glare / impolite)');
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await pc.setLocalDescription();
        sendSdp(callerSocketId, pc.localDescription!, st.polite);
        // Após responder, a negociação volta a "stable"; agora sim anexamos
        // nossos tracks locais (dispara um onnegotiationneeded legítimo que
        // negocia o envio das nossas mídias, resolvido pelo Perfect Negotiation).
        if (pc.signalingState === 'stable') {
          attachLocalTracks(pc);
        }
      } catch (err) {
        console.warn('[WebRTC] Erro ao processar oferta de', callerSocketId, err);
      } finally {
        st.ignoreOffer = false;
      }
    },
    [createPeerConnection, getNegState, sendSdp, socket, attachLocalTracks]
  );

  // Processar answer recebido
  const handleAnswer = useCallback(
    async (responderSocketId: string, answer: RTCSessionDescriptionInit) => {
      const pc = peerConnections.current.get(responderSocketId);
      if (!pc) return;
      const st = getNegState(responderSocketId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.warn('[WebRTC] Erro ao setar resposta de', responderSocketId, err);
      }
    },
    [getNegState]
  );

  // Receber ICE candidate
  const handleIceCandidate = useCallback(
    async (senderSocketId: string, candidate: RTCIceCandidateInit) => {
      const pc = peerConnections.current.get(senderSocketId);
      if (!pc) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[WebRTC] Erro ao adicionar ICE de', senderSocketId, err);
      }
    },
    []
  );

  // Registrar todos os listeners de Socket.io
  useEffect(() => {
    if (!socket) return;

    // Dados autenticados do próprio usuário retornados pelo servidor (banco de dados)
    socket.on('classroom-authenticated', (data: AuthenticatedParticipant) => {
      setAuthenticatedParticipant(data);
      // Definir permissão de tela com base no perfil real do banco
      setCanShareScreen(
        data.role === 'TEACHER' || data.role === 'ADMIN' || data.role === 'COORDINATOR'
      );
    });

    // Erro de autenticação na sala
    socket.on('classroom-auth-error', ({ error }: { error: string }) => {
      alert(`Erro de acesso à Sala do Futuro: ${error}`);
      leaveClassroom();
    });

    // Lista de participantes recebida ao entrar — cria peers com TODOS e negocia
    socket.on('classroom-participants-list', async (existingParticipants: ParticipantState[]) => {
      const others = existingParticipants.filter((p) => p.socketId !== socket.id);
      const uniqueOthers = Array.from(new Map(others.map((p) => [p.socketId, p])).values());
      setParticipantsBoth(() => uniqueOthers);

      for (const p of uniqueOthers) {
        ensurePeerConnection(p.socketId);
      }
    });

    // Novo usuário entrou — criar peer de volta para o recém-chegado
    // (corrige "depende de quem entra primeiro" e "3º/4º participante").
    socket.on('user-joined-classroom', (newParticipant: ParticipantState) => {
      if (newParticipant.socketId === socket.id) return;
      upsertParticipant(newParticipant);
      ensurePeerConnection(newParticipant.socketId);
    });

    // Recebeu WebRTC Offer
    socket.on('webrtc-offer', ({ callerSocketId, offer, polite }) => {
      handleOffer(callerSocketId, offer, polite);
    });

    // Recebeu WebRTC Answer
    socket.on('webrtc-answer', ({ responderSocketId, answer }) => {
      handleAnswer(responderSocketId, answer);
    });

    // Recebeu ICE Candidate
    socket.on('webrtc-ice-candidate', ({ senderSocketId, candidate }) => {
      handleIceCandidate(senderSocketId, candidate);
    });

    // Atualização de mídia de outro participante
    socket.on('participant-media-updated', ({ socketId, isCamOn, isMicOn, isScreenSharing }) => {
      setParticipantsBoth((prev) =>
        prev.map((p) => (p.socketId === socketId ? { ...p, isCamOn, isMicOn, isScreenSharing } : p))
      );
    });

    // Usuário saiu — remover participante, fechar peer e limpar stream remoto
    socket.on('user-left-classroom', ({ socketId }) => {
      setParticipantsBoth((prev) => prev.filter((p) => p.socketId !== socketId));
      setHandRaises((prev) => prev.filter((h) => h.socketId !== socketId));
      const pc = peerConnections.current.get(socketId);
      if (pc) {
        try {
          pc.close();
        } catch {
          /* já fechada */
        }
        peerConnections.current.delete(socketId);
      }
      setRemoteStreamsBoth((prev) => {
        const updated = new Map(prev);
        updated.delete(socketId);
        return updated;
      });
    });

    // Reações
    socket.on('reaction-received', (reactionData) => {
      setActiveReactions((prev) => [...prev, reactionData]);
      setTimeout(() => {
        setActiveReactions((prev) => prev.filter((r) => r.id !== reactionData.id));
      }, 2500);
    });

    // Mão levantada / abaixada
    socket.on('hand-raised', (data) => {
      setHandRaises((prev) => [...prev.filter((h) => h.socketId !== data.socketId), data]);
    });

    socket.on('hand-lowered', ({ socketId }) => {
      setHandRaises((prev) => prev.filter((h) => h.socketId !== socketId));
    });

    // Comandos de Moderação do Professor
    socket.on('force-mute', () => {
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
          setIsMicOn(false);
          // Propagar o estado real para os outros participantes (senão eles não
          // atualizam o ícone de mic do participante silenciado remotamente).
          socketRef.current?.emit('media-state-changed', {
            roomId: currentRoomIdRef.current,
            isCamOn,
            isMicOn: false,
          });
        }
      }
    });

    // Estado de moderação ecoado para TODOS os participantes da sala:
    socket.on('participant-muted', ({ socketId }: { socketId: string }) => {
      setParticipantsBoth((prev) =>
        prev.map((p) => (p.socketId === socketId ? { ...p, isMicOn: false } : p))
      );
    });

    socket.on('all-students-muted', () => {
      setParticipantsBoth((prev) =>
        prev.map((p) => (p.role === 'STUDENT' ? { ...p, isMicOn: false } : p))
      );
    });

    socket.on('participant-permission-changed', ({ socketId, canShareScreen }: { socketId: string; canShareScreen: boolean }) => {
      setParticipantsBoth((prev) =>
        prev.map((p) => (p.socketId === socketId ? { ...p, canShareScreen } : p))
      );
    });

    socket.on('participant-kicked', ({ socketId }: { socketId: string }) => {
      setParticipantsBoth((prev) => prev.filter((p) => p.socketId !== socketId));
      setHandRaises((prev) => prev.filter((h) => h.socketId !== socketId));
      peerConnections.current.delete(socketId);
      setRemoteStreamsBoth((prev) => {
        const updated = new Map(prev);
        updated.delete(socketId);
        return updated;
      });
    });

    socket.on('screen-permission-updated', ({ allowed }) => {
      setCanShareScreen(allowed);
      if (!allowed && isScreenSharing) {
        stopScreenShare();
      }
    });

    socket.on('kicked-from-classroom', ({ reason }) => {
      alert(`Você foi desconectado da aula: ${reason}`);
      leaveClassroom();
    });

    socket.on('classroom-ended', () => {
      if (!endingClassRef.current) {
        alert('A aula foi encerrada pelo professor.');
        leaveClassroom();
      }
    });

    return () => {
      socket.off('classroom-authenticated');
      socket.off('classroom-auth-error');
      socket.off('classroom-participants-list');
      socket.off('user-joined-classroom');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
      socket.off('participant-media-updated');
      socket.off('user-left-classroom');
      socket.off('reaction-received');
      socket.off('hand-raised');
      socket.off('hand-lowered');
      socket.off('force-mute');
      socket.off('participant-muted');
      socket.off('all-students-muted');
      socket.off('participant-permission-changed');
      socket.off('participant-kicked');
      socket.off('screen-permission-updated');
      socket.off('kicked-from-classroom');
      socket.off('classroom-ended');
    };
  }, [
    socket,
    createPeerConnection,
    ensurePeerConnection,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    upsertParticipant,
    leaveClassroom,
    stopScreenShare,
    setParticipantsBoth,
    setRemoteStreamsBoth,
    isMicOn,
    isCamOn,
    isScreenSharing,
  ]);

  return (
    <WebRTCContext.Provider
      value={{
        inCall,
        roomId,
        participants,
        localStream,
        screenStream,
        remoteStreams,
        isCamOn,
        isMicOn,
        isScreenSharing,
        isHandRaised,
        canShareScreen,
        activeReactions,
        handRaises,
        authenticatedParticipant,
        joinClassroom,
        leaveClassroom,
        toggleCamera,
        toggleMicrophone,
        startScreenShare,
        stopScreenShare,
        toggleRaiseHand,
        sendReaction,
        muteParticipant,
        muteAllStudents,
        toggleScreenPermission,
        kickParticipant,
        endClassroom,
      }}
    >
      {children}
    </WebRTCContext.Provider>
  );
};

export function useWebRTC() {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC deve ser usado dentro de um WebRTCProvider');
  }
  return context;
}
