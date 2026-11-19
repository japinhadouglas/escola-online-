import React, { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../../context/WebRTCContext';
import { useAuth } from '../../context/AuthContext';
import { Whiteboard } from '../whiteboard/Whiteboard';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  ScreenShare,
  Hand,
  Users,
  PenTool,
  Phone,
  Smile,
  VolumeX,
  MoreVertical,
  X,
  Loader2,
  ShieldCheck,
  PhoneIncoming,
} from 'lucide-react';

interface LiveClassroomRoomProps {
  roomId: string;
  className: string;
  onLeave: () => void;
}

/* Botão redondo estilo Discord */
const DButton: React.FC<{
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ active, danger, disabled, onClick, title, children, className }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all select-none ${
      danger
        ? 'bg-[#ed4245] hover:bg-[#c03538] text-white'
        : active
        ? 'bg-[#5865F2] text-white shadow-lg shadow-[#5865F2]/30'
        : 'bg-[#2b2d31] hover:bg-[#3f4248] text-[#dbdee1]'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className || ''}`}
  >
    {children}
  </button>
);

/* Avatar circular pequeno estilo Discord (para chamada só de voz) */
const DiscordAvatar: React.FC<{
  name: string;
  avatarUrl?: string | null;
  isMicOn: boolean;
  isSpeaking?: boolean;
  isSelf?: boolean;
}> = ({ name, avatarUrl, isMicOn, isSpeaking, isSelf }) => (
  <div className="flex flex-col items-center gap-2 w-[88px] select-none">
    <div className="relative">
      <div
        className={`relative w-16 h-16 rounded-full overflow-hidden bg-[#2b2d31] ${
          isSpeaking && isMicOn ? 'discord-speaking' : ''
        }`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg font-bold text-[#dbdee1]">
            {name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
        )}
        {!isMicOn && (
          <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-[#1e1f22] flex items-center justify-center border border-[#313338]">
            <MicOff className="w-3.5 h-3.5 text-[#f23f43]" />
          </div>
        )}
      </div>
    </div>
    <div className="flex flex-col items-center gap-1">
      <span className={`block text-xs truncate text-center max-w-full ${isSelf ? 'text-[#23A559]' : 'text-[#dbdee1]'}`}>
        {name}
      </span>
      {isSelf && !isMicOn && (
        <span className="px-2 py-px rounded-full bg-[#5865F2] text-[9px] text-white font-semibold leading-tight">
          Áudio desligado
        </span>
      )}
    </div>
  </div>
);

/* Tile de vídeo retangular estilo Discord (grade) */
const VideoTile: React.FC<{
  name: string;
  role: string;
  avatarUrl?: string | null;
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing?: boolean;
  isSpeaking?: boolean;
  isHandRaised?: boolean;
  isSelf?: boolean;
  stream?: MediaStream | null;
}> = ({ name, role, avatarUrl, isMicOn, isCamOn, isScreenSharing, isSpeaking, isHandRaised, isSelf, stream }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, isCamOn, isScreenSharing]);

  const hasVideo = (isCamOn || isScreenSharing) && stream;

  return (
    <div
      className={`relative rounded-xl overflow-hidden aspect-video bg-[#2b2d31] ${
        isSpeaking && isMicOn ? 'ring-2 ring-[#3BA55C]' : 'ring-1 ring-[#1f2023]'
      }`}
    >
      {hasVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={isSelf} className="w-full h-full object-cover" />
      ) : avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover opacity-40" />
      ) : null}

      {/* Iniciais/câmera desligada */}
      {!hasVideo && !avatarUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-[#1e1f22] flex items-center justify-center text-2xl font-bold text-[#dbdee1]">
            {name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
        </div>
      )}

      {/* Overlay de nome + estado no rodapé (estilo Discord) */}
      <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent flex items-center gap-1.5">
        {isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
        {isMicOn ? (
          <Mic className={`w-3.5 h-3.5 flex-shrink-0 ${isSpeaking ? 'text-[#23A559]' : 'text-[#dbdee1]'}`} />
        ) : (
          <MicOff className="w-3.5 h-3.5 text-[#f23f43] flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-white truncate">
          {name}
          {isSelf ? ' (Você)' : ''}
        </span>
      </div>
    </div>
  );
};

export const LiveClassroomRoom: React.FC<LiveClassroomRoomProps> = ({ roomId, className, onLeave }) => {
  const { user } = useAuth();
  const {
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
    leaveClassroom,
  } = useWebRTC();

  const displayName = authenticatedParticipant?.name || user?.name || 'Carregando...';
  const displayRole = authenticatedParticipant?.role || user?.role || 'STUDENT';
  const displayAvatar = authenticatedParticipant?.avatarUrl || user?.avatarUrl;

  const isTeacherOrAdmin =
    displayRole === 'TEACHER' || displayRole === 'ADMIN' || displayRole === 'COORDINATOR';

  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [showParticipantsSidebar, setShowParticipantsSidebar] = useState(false);
  const [showReactionsMenu, setShowReactionsMenu] = useState(false);
  const [selectedUserForMenu, setSelectedUserForMenu] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream, isScreenSharing]);

  useEffect(() => {
    const t = setTimeout(() => setConnecting(false), 1200);
    return () => clearTimeout(t);
  }, []);

  const handleExit = () => {
    leaveClassroom();
    onLeave();
  };

  const handleEndClass = () => {
    setShowEndConfirm(true);
  };

  const confirmEndClass = () => {
    setShowEndConfirm(false);
    endClassroom();
    onLeave();
  };

  const cancelEndClass = () => {
    setShowEndConfirm(false);
  };

  const reactionsList = ['👏', '👍', '💡', '❤️', '😊', '🙋‍♂️'];

  /* Monta a lista total de tiles (self + remotos) */
  const remoteStreamFor = (socketId: string) => remoteStreams.get(socketId) || null;
  const selfTile = {
    id: 'me',
    socketId: 'me',
    name: user?.name || 'Você',
    role: displayRole,
    avatarUrl: displayAvatar,
    isMicOn,
    isCamOn,
    isScreenSharing,
    isHandRaised,
    stream: localStream,
    isSelf: true,
    isSpeaking: isMicOn,
  };
  const remoteTiles = participants.map((p) => ({
    ...p,
    stream: remoteStreamFor(p.socketId) || null,
    isSelf: false,
    isSpeaking: p.isMicOn,
  }));
  const allTiles = [selfTile, ...remoteTiles] as Array<{
    id: string;
    socketId: string;
    name: string;
    role: string;
    avatarUrl?: string | null;
    isMicOn: boolean;
    isCamOn: boolean;
    isScreenSharing?: boolean;
    isHandRaised?: boolean;
    isSelf?: boolean;
    isSpeaking?: boolean;
    stream: MediaStream | null;
    canShareScreen?: boolean;
  }>;

  const videoCount = allTiles.filter((t) => (t.isCamOn || t.isScreenSharing) && t.stream).length;
  const isVideoCall = videoCount > 0 && !showWhiteboard;

  /* Grid responsivo de vídeo melhor quanto mais tiles */
  const gridCols =
    allTiles.length <= 1
      ? 'grid-cols-1'
      : allTiles.length === 2
      ? 'grid-cols-2'
      : allTiles.length <= 4
      ? 'grid-cols-2'
      : allTiles.length <= 6
      ? 'grid-cols-2 lg:grid-cols-3'
      : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <div className="relative flex flex-col h-full bg-[#1e1f22] text-white select-none overflow-hidden">
      {/* Reações flutuantes */}
      <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden flex items-center justify-center gap-4">
        {activeReactions.map((r) => (
          <div
            key={r.id}
            className="reaction-bubble px-3.5 py-1.5 bg-[#2b2d31]/90 border border-[#3f4147]/70 rounded-full shadow-xl flex items-center gap-2 text-sm"
          >
            <span className="text-2xl">{r.reaction}</span>
            <span className="text-xs font-semibold text-[#949CF7]">{r.userName}</span>
          </div>
        ))}
      </div>

      {/* Top Bar estilo Discord */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-[#1e1f22] border-b border-[#2b2d31] z-20 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#23A559]/15 flex items-center justify-center flex-shrink-0">
            <PhoneIncoming className="w-4 h-4 text-[#23A559]" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm sm:text-base text-white truncate">{className}</h2>
            <p className="text-[11px] text-[#949BA4] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#23A559]" />
              {handRaises.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <Hand className="w-3 h-3" /> {handRaises.length} mão{handRaises.length > 1 ? 's' : ''} levantada{handRaises.length > 1 ? 's' : ''}
                </span>
              ) : connecting ? (
                'Conectando...'
              ) : (
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-[#23A559]" /> Chamada segura • Sala {roomId}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isTeacherOrAdmin && (
            <button
              onClick={muteAllStudents}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2b2d31] hover:bg-[#3f4248] text-[#f23f43] text-xs font-semibold transition-colors"
              title="Silenciar todos os alunos"
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Silenciar todos</span>
            </button>
          )}

          <button
            onClick={() => setShowParticipantsSidebar(!showParticipantsSidebar)}
            className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-colors ${
              showParticipantsSidebar
                ? 'bg-[#5865F2] text-white'
                : 'bg-[#2b2d31] hover:bg-[#3f4248] text-[#dbdee1]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Participantes</span>
            <span className="px-1.5 py-0.5 bg-black/20 rounded-full text-[10px]">{allTiles.length}</span>
          </button>
        </div>
      </div>

      {/* Área Central */}
      <div className="flex-1 flex relative overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col overflow-y-auto">
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 h-full min-h-0">
            {showWhiteboard ? (
              <div className="w-full h-full min-h-[400px]">
                <Whiteboard roomId={roomId} onClose={() => setShowWhiteboard(false)} />
              </div>
            ) : isScreenSharing ? (
              <div className="flex flex-col lg:flex-row gap-4 w-full h-full">
                <div className="flex-1 bg-[#1e1f22] rounded-2xl overflow-hidden border border-[#3f4147] relative min-h-[300px] flex items-center justify-center screen-share-ring">
                  <video ref={screenVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
                  <div className="absolute top-3 left-3 px-3 py-1 bg-[#5865F2]/90 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow flex-shrink-0">
                    <ScreenShare className="w-3.5 h-3.5" />
                    <span>Você está compartilhando a tela</span>
                  </div>
                </div>
                <div className="lg:w-52 grid grid-cols-3 lg:grid-cols-1 gap-3 overflow-y-auto flex-shrink-0 content-start">
                  <VideoTile
                    name={selfTile.name}
                    role={displayRole}
                    avatarUrl={displayAvatar}
                    isMicOn={isMicOn}
                    isCamOn={isCamOn}
                    isScreenSharing={isScreenSharing}
                    isHandRaised={isHandRaised}
                    isSelf
                    isSpeaking={isMicOn}
                    stream={localStream}
                  />
                  {remoteTiles.map((p) => (
                    <VideoTile
                      key={p.socketId}
                      name={p.name}
                      role={p.role}
                      avatarUrl={p.avatarUrl}
                      isMicOn={p.isMicOn}
                      isCamOn={p.isCamOn}
                      isScreenSharing={p.isScreenSharing}
                      isHandRaised={p.isHandRaised}
                      isSpeaking={p.isSpeaking}
                      stream={p.stream}
                    />
                  ))}
                </div>
              </div>
            ) : isVideoCall ? (
              /* ===== Chamada de VÍDEO: grade de tiles retangulares estilo Discord ===== */
              <div className={`grid gap-3 sm:gap-4 w-full h-full items-stretch content-center ${gridCols}`}>
                {allTiles.map((t) => (
                  <VideoTile
                    key={t.id}
                    name={t.name}
                    role={t.role}
                    avatarUrl={t.avatarUrl}
                    isMicOn={t.isMicOn}
                    isCamOn={t.isCamOn}
                    isScreenSharing={t.isScreenSharing}
                    isHandRaised={t.isHandRaised}
                    isSelf={t.isSelf}
                    isSpeaking={t.isSpeaking}
                    stream={t.stream}
                  />
                ))}
              </div>
            ) : (
              /* ===== Chamada só de VOZ: layout compacto estilo Discord ===== */
              <div className="flex flex-col items-center gap-8 text-center">
                <div className="w-16 h-16 rounded-full bg-[#23A559]/15 flex items-center justify-center">
                  <Phone className="w-7 h-7 text-[#23A559]" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white">{className}</h2>
                  <p className="text-[#949BA4] text-sm">
                    {connecting
                      ? 'Conectando...'
                      : allTiles.length <= 1
                      ? 'Aguardando outros participantes entrarem na chamada...'
                      : `${allTiles.length} participante${allTiles.length > 1 ? 's' : ''} na chamada de voz`}
                  </p>
                </div>
                <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-5">
                  {allTiles.map((t) => (
                    <DiscordAvatar
                      key={t.id}
                      name={t.isSelf ? `${t.name} (Você)` : t.name}
                      avatarUrl={t.avatarUrl}
                      isMicOn={t.isMicOn}
                      isSpeaking={t.isSpeaking}
                      isSelf={t.isSelf}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar de Participantes / Moderação */}
        {showParticipantsSidebar && (
          <div className="w-72 sm:w-80 bg-[#2b2d31] border-l border-[#1f2023] flex flex-col z-30 flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f2023]">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-[#5865F2]" />
                <span>Participantes ({allTiles.length})</span>
              </h3>
              <button
                onClick={() => setShowParticipantsSidebar(false)}
                className="p-1 text-[#949BA4] hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isTeacherOrAdmin && (
              <div className="p-3 border-b border-[#1f2023] bg-[#1e1f22]/60">
                <button
                  onClick={muteAllStudents}
                  className="w-full py-2 px-3 bg-[#f23f43]/15 hover:bg-[#f23f43]/25 border border-[#f23f43]/30 text-[#f23f43] rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <VolumeX className="w-4 h-4" />
                  <span>Silenciar Todos os Alunos</span>
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="p-2.5 bg-[#242529] rounded-xl flex items-center justify-between border border-[#1f2023]">
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded-full bg-[#5865F2] text-white font-bold flex items-center justify-center text-xs flex-shrink-0">
                    {displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-semibold text-white truncate">
                      {user?.name}
                      {!isMicOn && <span className="text-[#f23f43]"> (mudo)</span>}
                    </p>
                    <p className="text-[10px] text-[#949BA4]">{displayRole}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isCamOn ? <Video className="w-3.5 h-3.5 text-[#3BA55C]" /> : <VideoOff className="w-3.5 h-3.5 text-[#949BA4]" />}
                  {isMicOn ? <Mic className="w-3.5 h-3.5 text-[#3BA55C]" /> : <MicOff className="w-3.5 h-3.5 text-[#f23f43]" />}
                </div>
              </div>

              {participants.map((p) => (
                <div
                  key={p.socketId}
                  className="p-2.5 bg-[#242529]/70 hover:bg-[#2e3035] rounded-xl flex items-center justify-between border border-[#1f2023] transition-colors"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#5865F2] text-white font-bold flex items-center justify-center text-xs flex-shrink-0">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        p.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-white truncate">{p.name}</p>
                      <p className="text-[10px] text-[#949BA4]">{p.role}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {p.isHandRaised && (
                      <span className="p-1 bg-amber-500 text-[#1e1f22] rounded-full" title="Mão levantada">
                        <Hand className="w-3 h-3" />
                      </span>
                    )}
                    {p.isMicOn ? (
                      <Mic className="w-3.5 h-3.5 text-[#3BA55C]" />
                    ) : (
                      <MicOff className="w-3.5 h-3.5 text-[#f23f43]" />
                    )}

                    {isTeacherOrAdmin && (
                      <div className="relative">
                        <button
                          onClick={() => setSelectedUserForMenu(selectedUserForMenu === p.socketId ? null : p.socketId)}
                          className="p-1 text-[#949BA4] hover:text-white rounded"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {selectedUserForMenu === p.socketId && (
                          <div className="absolute right-0 top-6 w-44 bg-[#1e1f22] border border-[#3f4147] rounded-xl shadow-2xl p-1.5 z-50 text-xs space-y-1">
                            <button
                              onClick={() => { muteParticipant(p.socketId); setSelectedUserForMenu(null); }}
                              className="w-full text-left px-2.5 py-1.5 text-[#dbdee1] hover:bg-[#2b2d31] rounded-lg flex items-center gap-2"
                            >
                              <VolumeX className="w-3.5 h-3.5 text-[#f23f43]" />
                              <span>Silenciar microfone</span>
                            </button>
                            <button
                              onClick={() => { toggleScreenPermission(p.socketId, !p.canShareScreen); setSelectedUserForMenu(null); }}
                              className="w-full text-left px-2.5 py-1.5 text-[#dbdee1] hover:bg-[#2b2d31] rounded-lg flex items-center gap-2"
                            >
                              <ScreenShare className="w-3.5 h-3.5 text-[#3ba4f2]" />
                              <span>{p.canShareScreen ? 'Bloquear tela' : 'Permitir tela'}</span>
                            </button>
                            <button
                              onClick={() => { kickParticipant(p.socketId); setSelectedUserForMenu(null); }}
                              className="w-full text-left px-2.5 py-1.5 text-[#f23f43] hover:bg-[#f23f43]/15 rounded-lg flex items-center gap-2"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Remover da sala</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Barra de Controles Inferior estilo Discord */}
      <div className="px-4 py-3 bg-[#1e1f22] border-t border-[#2b2d31] flex items-center justify-between gap-3 z-20 flex-shrink-0">
        {/* Esquerda: mídia */}
        <div className="flex items-center gap-2">
          <DButton
            onClick={toggleMicrophone}
            active={isMicOn}
            title={isMicOn ? 'Silenciar microfone' : 'Ativar microfone'}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-[#ed4245]" />}
          </DButton>
          <DButton
            onClick={toggleCamera}
            active={isCamOn}
            title={isCamOn ? 'Desativar câmera' : 'Ativar câmera'}
          >
            {isCamOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5 text-[#ed4245]" />}
          </DButton>
        </div>

        {/* Centro: recursos */}
        <div className="flex items-center gap-2">
          <DButton
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            disabled={!canShareScreen}
            active={isScreenSharing}
            title={
              !canShareScreen
                ? 'Compartilhamento de tela não autorizado pelo professor'
                : isScreenSharing
                ? 'Parar compartilhamento'
                : 'Compartilhar tela'
            }
          >
            <ScreenShare className="w-5 h-5" />
          </DButton>

          <DButton
            onClick={() => setShowWhiteboard(!showWhiteboard)}
            active={showWhiteboard}
            title="Quadro Branco Digital"
          >
            <PenTool className="w-5 h-5" />
          </DButton>

          <DButton
            onClick={toggleRaiseHand}
            active={isHandRaised}
            className={isHandRaised ? '!bg-amber-500 !text-[#1e1f22]' : ''}
            title={isHandRaised ? 'Abaixar a mão' : 'Levantar a mão'}
          >
            <Hand className="w-5 h-5" />
          </DButton>

          <div className="relative">
            <DButton onClick={() => setShowReactionsMenu(!showReactionsMenu)} title="Reações Rápidas">
              <Smile className="w-5 h-5" />
            </DButton>
            {showReactionsMenu && (
              <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-[#2b2d31] border border-[#3f4147] rounded-2xl p-2 shadow-2xl flex items-center gap-1.5 z-50">
                {reactionsList.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { sendReaction(emoji); setShowReactionsMenu(false); }}
                    className="text-xl p-2 hover:bg-[#3f4248] rounded-xl hover:scale-125 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Direita: sair */}
        <div className="flex items-center gap-2">
          {isTeacherOrAdmin ? (
            <button
              onClick={handleEndClass}
              className="h-11 px-4 bg-[#ed4245] hover:bg-[#c03538] text-white text-sm font-semibold rounded-full shadow-lg shadow-[#ed4245]/30 flex items-center gap-2 transition-all active:scale-95"
            >
              <Phone className="w-4 h-4" />
              <span className="hidden sm:inline">Encerrar Aula</span>
              {connecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            </button>
          ) : (
            <button
              onClick={handleExit}
              className="h-11 px-4 bg-[#ed4245] hover:bg-[#c03538] text-white text-sm font-semibold rounded-full shadow-lg shadow-[#ed4245]/30 flex items-center gap-2 transition-all active:scale-95"
            >
              <Phone className="w-4 h-4" />
              <span className="hidden sm:inline">Sair da Sala</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal de confirmação de encerramento da aula (estilo Discord) */}
      {showEndConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#313338] rounded-xl shadow-2xl w-full max-w-sm p-5 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#ed4245]/15 flex items-center justify-center">
              <Phone className="w-6 h-6 text-[#ed4245]" />
            </div>
            <h3 className="font-bold text-white text-base mb-1">Encerrar a aula?</h3>
            <p className="text-sm text-[#949BA4] mb-5">
              Todos os alunos serão desconectados da chamada. Esta ação não pode ser desfeita.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={cancelEndClass}
                className="px-4 py-2 rounded-full bg-[#2b2d31] hover:bg-[#3f4248] text-[#dbdee1] text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmEndClass}
                className="px-4 py-2 rounded-full bg-[#ed4245] hover:bg-[#c03538] text-white text-sm font-semibold transition-colors"
              >
                Encerrar aula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
