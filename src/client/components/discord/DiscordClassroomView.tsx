import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { LiveClassroomRoom } from '../classroom/LiveClassroomRoom';
import { ClassTimetable } from './ClassTimetable';
import { MentoriaView } from './MentoriaView';
import { Hash, Lock, Send, Users, ChevronDown, Menu, X, Volume2, Loader2, CalendarDays, MessageSquare, Shield } from 'lucide-react';

interface Props {
  classId: string;
}

function isMentoriaChannel(channel: any): boolean {
  return String(channel?.name || '').trim().toLowerCase() === 'mentoria';
}

export const DiscordClassroomView: React.FC<Props> = ({ classId }) => {
  const { user, token } = useAuth();
  const { socket } = useSocket();
  const { inCall, joinClassroom, leaveClassroom } = useWebRTC();

  const [classData, setClassData] = useState<any>(null);
  const [selectedChannel, setSelectedChannel] = useState<any>(null);
  const [showTimetable, setShowTimetable] = useState(false);
  const [showMentoria, setShowMentoria] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<any[]>([]);
  const [enrolledTeachers, setEnrolledTeachers] = useState<any[]>([]);
  const [joiningVoice, setJoiningVoice] = useState<string | null>(null);

  // Controle LOCAL da chamada de voz (desmonta com garantia ao sair)
  const [voiceOpen, setVoiceOpen] = useState(false);
  const voiceOpenRef = useRef(false);
  useEffect(() => { voiceOpenRef.current = voiceOpen; }, [voiceOpen]);

  // Ao trocar de turma OU desmontar a view (voltar pra home), encerrar a chamada
  // WebRTC — senão mic/tracks continuam transmitindo e o socket fica na sala.
  useEffect(() => {
    if (voiceOpenRef.current) {
      setVoiceOpen(false);
      try { leaveClassroom(); } catch (err) { console.error('[Voice] Erro ao sair da chamada:', err); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  useEffect(() => {
    return () => {
      if (voiceOpenRef.current) {
        try { leaveClassroom(); } catch (err) { console.error('[Voice] Erro ao sair da chamada:', err); }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha a call quando a sessão WebRTC é encerrada externamente (ex.: professor
  // encerrou a aula, ou o participante foi removido) — sincroniza o estado local.
  useEffect(() => {
    if (!inCall && voiceOpenRef.current) {
      setVoiceOpen(false);
    }
  }, [inCall]);

  // Se o status for removido durante a sessão, fecha a mentoria imediatamente.
  useEffect(() => {
    if (user?.isMonitor !== true) {
      setShowMentoria(false);
    }
  }, [user?.isMonitor]);

  // Presença: quem está dentro de alguma Sala Online desta turma (fora da chamada)
  const [classPresence, setClassPresence] = useState<any[]>([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selectedChannelRef = useRef<any>(null);
  const messagesRef = useRef<any[]>([]);

  const isLocked = selectedChannel?.isLocked && user?.role === 'STUDENT';

  // Manter ref sincronizada com state
  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Carregar turma
  useEffect(() => {
    setIsLoading(true);
    setSelectedChannel(null);
    setMessages([]);
    fetch(`/api/v1/classes/${classId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.error) return;
        setClassData(data);
        setEnrolledStudents(data.enrollments?.filter((e: any) => e.role === 'STUDENT') || []);
        setEnrolledTeachers(data.enrollments?.filter((e: any) => e.role === 'TEACHER') || []);
        // O canal técnico da Mentoria não é um canal comum. Ele só é acessado
        // pela aba exclusiva, exibida apenas para monitores confirmados.
        const first = data.channels?.find(
          (c: any) => (c.type === 'TEXT' || c.type === 'ANNOUNCEMENT') && !isMentoriaChannel(c),
        );
        if (first) setSelectedChannel(first);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [classId, token]);

  // Presença das chamadas: observar quem está dentro das Salas Online da turma
  useEffect(() => {
    if (!socket || !classId) return;

    socket.emit('join-presence', { classId });

    const onPresence = (data: any) => {
      if (data && Array.isArray(data.participants)) {
        setClassPresence(data.participants);
      }
    };

    socket.on('class-presence-updated', onPresence);

    return () => {
      socket.emit('leave-presence', { classId });
      socket.off('class-presence-updated', onPresence);
    };
  }, [socket, classId]);

  // Socket: join/leave canal, listeners de mensagens e digitação
  useEffect(() => {
    if (!selectedChannel || !token || !socket) return;

    setIsLoadingMessages(true);
    setMessages([]);
    setTypingUsers([]);

    // Guard: ignora resposta de um fetch que já não corresponde ao canal atual
    // (troca rápida de canal fazia o pedido antigo SOBRESCREVER o novo).
    const channelIdAtRequest = selectedChannel.id;
    let cancelled = false;

    // Buscar mensagens históricas
    fetch(`/api/v1/classes/${classId}/channels/${selectedChannel.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => { if (!cancelled && Array.isArray(data)) setMessages(data); })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setIsLoadingMessages(false);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      });

    // Entrar na sala do canal
    socket.emit('join-channel', { channelId: selectedChannel.id });

    // Handler de nova mensagem — usa ref para sempre ter selectedChannel atualizado
    const onMsg = (msg: any) => {
      const currentChannel = selectedChannelRef.current;
      if (!currentChannel) return;
      if (msg.channelId !== currentChannel.id) return;

      // Deduplicar: não adicionar se já existe
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

    // Handler de digitação
    const onTyping = (data: { userId: string; userName: string; channelId: string }) => {
      const currentChannel = selectedChannelRef.current;
      if (!currentChannel) return;
      if (data.channelId !== currentChannel.id) return;
      if (data.userId === user?.id) return;

      setTypingUsers((prev) => prev.includes(data.userName) ? prev : [...prev, data.userName]);
      setTimeout(() => setTypingUsers((prev) => prev.filter((n) => n !== data.userName)), 3000);
    };

    socket.on('new-channel-message', onMsg);
    socket.on('user-typing', onTyping);

    return () => {
      cancelled = true;
      socket.emit('leave-channel', { channelId: channelIdAtRequest });
      socket.off('new-channel-message', onMsg);
      socket.off('user-typing', onTyping);
    };
  }, [selectedChannel?.id, socket, token, user?.id, classId]);

  // Enviar mensagem — optimistic update + broadcast
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedChannel || isLocked) return;
    const msg = inputText.trim();
    setInputText('');

    // Criar mensagem temporária com ID único para optimistic update
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMsg = {
      id: tempId,
      channelId: selectedChannel.id,
      senderId: user?.id,
      senderName: user?.name,
      senderRole: user?.role,
      senderAvatar: user?.avatarUrl,
      content: msg,
      isPinned: false,
      createdAt: new Date().toISOString(),
      _isOptimistic: true,
    };

    // Mostrar mensagem imediatamente
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);

    try {
      const res = await fetch(`/api/v1/classes/${classId}/channels/${selectedChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: msg }),
      });
      const data = await res.json();

      if (res.ok && data.id) {
        // Substituir mensagem temporária pela real
        setMessages((prev) =>
          prev.map((m) => m.id === tempId ? { ...data, _isOptimistic: false } : m)
        );
        // Emitir para outros via socket (broadcast)
        if (socket) {
          socket.emit('send-channel-message', { channelId: selectedChannel.id, message: data });
        }
      } else {
        // Erro: remover mensagem temporária e restaurar input
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInputText(msg);
      }
    } catch (err) {
      // Erro de rede: remover mensagem temporária e restaurar input
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(msg);
    }
  };

  const handleInput = (val: string) => {
    setInputText(val);
    if (socket && selectedChannel) {
      socket.emit('user-typing', {
        channelId: selectedChannel.id,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  const selectChannel = (ch: any) => {
    setSelectedChannel(ch);
    setShowTimetable(false);
    setShowMentoria(false);
    setShowMobileNav(false);
  };

  const openTimetable = () => {
    setShowTimetable(true);
    setShowMentoria(false);
    setShowMobileNav(false);
  };

  const openMentoria = () => {
    if (user?.isMonitor !== true) return;
    setShowMentoria(true);
    setShowTimetable(false);
    setShowMobileNav(false);
    setSelectedChannel(null);
  };

  // Entrar em uma chamada de voz (Sala Online)
  const handleJoinVoice = async (e: React.MouseEvent, ch: any) => {
    e.stopPropagation();
    if (joiningVoice) return;
    try {
      setJoiningVoice(ch.id);
      await joinClassroom(`class-${classId}`);
      setVoiceOpen(true);
    } catch (err) {
      console.error('[Voice] Erro ao entrar na chamada:', err);
    } finally {
      setJoiningVoice(null);
    }
  };

  // Sair da chamada — desmonta a call com garantia e limpa a sessão WebRTC
  const handleLeaveVoice = () => {
    setVoiceOpen(false);
    try { leaveClassroom(); } catch (err) { console.error('[Voice] Erro ao sair da chamada:', err); }
  };

  // Se estiver em chamada, renderiza a sala ao vivo em tela cheia
  if (voiceOpen) {
    return (
      <div className="flex-1 flex flex-col min-w-0 h-full bg-[#1e1f22]">
        <div className="flex items-center justify-between px-4 h-12 bg-[#313338] border-b border-[#1f2023] flex-shrink-0">
          <span className="text-sm font-bold text-white truncate">{classData?.name || 'Sala do Futuro'}</span>
          <button
            onClick={handleLeaveVoice}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            Sair da chamada
          </button>
        </div>
        <div className="flex-1 min-h-0 p-2 sm:p-4">
          <LiveClassroomRoom
            roomId={`class-${classId}`}
            className={classData?.name || 'Sala do Futuro'}
            onLeave={handleLeaveVoice}
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="w-6 h-6 border-2 border-[#5865F2] border-t-transparent rounded-full animate-spin mr-2" />
        Carregando turma...
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
        Turma não encontrada.
      </div>
    );
  }

  const textChannels = classData.channels?.filter(
    (c: any) => (c.type === 'TEXT' || c.type === 'ANNOUNCEMENT') && !isMentoriaChannel(c),
  ) || [];
  const voiceChannels = classData.channels?.filter((c: any) => c.type === 'VOICE') || [];

  const ChannelList = () => (
    <>
      <div className="h-12 px-4 flex items-center border-b border-[#1f2023] flex-shrink-0 shadow-sm">
        <span className="font-bold text-sm text-white truncate">{classData.name}</span>
      </div>
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {/* Mentoria - só para monitores */}
        {user?.isMonitor === true && (
          <div>
            <div className="flex items-center gap-0.5 px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <ChevronDown className="w-3 h-3" /> Mentoria
            </div>
            <button
              onClick={openMentoria}
              className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[13px] transition-colors ${
                showMentoria
                  ? 'bg-[#ED4245]/20 text-[#ED4245] ring-1 ring-[#ED4245]/30'
                  : 'text-slate-500 hover:text-[#ED4245] hover:bg-[#ED4245]/10'
              }`}
            >
              <MessageSquare className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Mentoria (Monitores)</span>
              <Shield className="w-3.5 h-3.5 text-[#ED4245] ml-auto flex-shrink-0" />
            </button>
          </div>
        )}
        <div>
          <div className="flex items-center gap-0.5 px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <ChevronDown className="w-3 h-3" /> Turma
          </div>
          <button
            onClick={openTimetable}
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[13px] transition-colors ${
              showTimetable
                ? 'bg-[#404249] text-white'
                : 'text-slate-500 hover:text-slate-300 hover:bg-[#35373c]'
            }`}
          >
            <CalendarDays className="w-4 h-4 text-[#5865F2] flex-shrink-0" />
            <span className="truncate">Horário de Aulas</span>
          </button>
        </div>
        {textChannels.length > 0 && <div>
          <div className="flex items-center gap-0.5 px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <ChevronDown className="w-3 h-3" /> Texto
          </div>
          {textChannels.map((ch: any) => (
            <button
              key={ch.id}
              onClick={() => selectChannel(ch)}
              className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[13px] transition-colors ${
                selectedChannel?.id === ch.id
                  ? 'bg-[#404249] text-white'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-[#35373c]'
              }`}
            >
              {ch.isLocked ? <Lock className="w-4 h-4 text-slate-600 flex-shrink-0" /> : <Hash className="w-4 h-4 text-slate-600 flex-shrink-0" />}
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
        </div>}
        {voiceChannels.length > 0 && (
          <div>
            <div className="flex items-center gap-0.5 px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <ChevronDown className="w-3 h-3" /> Voz
            </div>
            {voiceChannels.map((ch: any) => {
              const inThisRoom = classPresence.filter((p) => p.roomId === `class-${classId}`);
              return (
                <div key={ch.id} className="mb-1">
                  <button
                    onClick={(e) => handleJoinVoice(e, ch)}
                    disabled={!!joiningVoice}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[13px] text-slate-500 hover:text-slate-300 hover:bg-[#35373c] transition-colors disabled:opacity-60"
                  >
                    {joiningVoice === ch.id ? (
                      <Loader2 className="w-4 h-4 text-slate-600 flex-shrink-0 animate-spin" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-slate-600 flex-shrink-0" />
                    )}
                    <span className="truncate">{ch.name}</span>
                    {inThisRoom.length > 0 && (
                      <span className="ml-auto text-[10px] font-bold text-[#57F287] flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#3BA55C] animate-pulse" />
                        {inThisRoom.length} na chamada
                      </span>
                    )}
                  </button>
                  {inThisRoom.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 mt-0.5">
                      {inThisRoom.map((p) => (
                        <div key={p.socketId} className="flex items-center gap-1.5 group/presence">
                          <div className="relative">
                            <div className="w-7 h-7 rounded-full overflow-hidden bg-[#5865F2] ring-2 ring-[#3BA55C]">
                              {p.avatarUrl ? (
                                <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white">
                                  {p.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#23A559] rounded-full border-2 border-[#2b2d31]" />
                          </div>
                          <span className="text-[11px] text-[#949BA4] truncate max-w-[90px]">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="sunset-shell flex-1 flex min-w-0 h-full">
      {/* Channel nav — desktop only */}
      <div className="hidden md:flex w-[240px] bg-[#101326]/90 border-r border-[#fff2d4]/10 flex-col flex-shrink-0">
        <ChannelList />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#19172b]/80">
        {/* Channel header */}
        <div className="h-14 px-3 md:px-4 flex items-center justify-between border-b border-[#fff2d4]/10 bg-[#101326]/75 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setShowMobileNav(!showMobileNav)}
              className="md:hidden p-1 text-slate-400 hover:text-white mr-1"
            >
              {showMobileNav ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            {showMentoria && user?.isMonitor === true ? (
              <>
                <MessageSquare className="w-5 h-5 text-[#ff4f70] flex-shrink-0" />
                <Shield className="w-4 h-4 text-[#ff4f70] ml-1 flex-shrink-0" />
              </>
            ) : showTimetable ? (
              <CalendarDays className="w-5 h-5 text-[#35d8e8] flex-shrink-0" />
            ) : selectedChannel?.isLocked ? (
              <Lock className="w-5 h-5 text-amber-400 flex-shrink-0" />
            ) : (
              <Hash className="w-5 h-5 text-slate-500 flex-shrink-0" />
            )}
            <span className="sunset-display font-bold text-sm text-[#fff2d4] truncate">
              {showMentoria && user?.isMonitor === true ? 'Mentoria (Monitores)' : showTimetable ? 'Horário de Aulas' : selectedChannel?.name || 'Selecione um canal'}
            </span>
            <span className="hidden sm:block w-px h-5 bg-[#fff2d4]/15 mx-1" />
            <span className="hidden sm:block text-xs text-[#35d8e8]/70 truncate">
              {showMentoria && user?.isMonitor === true
                ? 'Chat exclusivo entre monitores da turma'
                : showTimetable
                ? 'Sua grade semanal de aulas'
                : selectedChannel?.isLocked ? 'Somente professores podem postar' : `Conversando em #${selectedChannel?.name || '...'}`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowMembers(!showMembers)}
              className={`p-1.5 rounded transition-colors ${showMembers ? 'bg-[#404249] text-white' : 'text-slate-400 hover:text-slate-200'}`}
              title="Membros"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile channel nav overlay */}
        {showMobileNav && (
          <div className="md:hidden absolute inset-0 z-40 flex">
            <div className="w-[280px] bg-[#2b2d31] flex flex-col shadow-xl">
              <ChannelList />
            </div>
            <div className="flex-1 bg-black/50" onClick={() => setShowMobileNav(false)} />
          </div>
        )}

        {/* Timetable area */}
        {showMentoria && user?.isMonitor === true ? (
          <MentoriaView classId={classId} />
        ) : showTimetable ? (
          <ClassTimetable classId={classId} className={classData?.name} />
        ) : (
        <div className="flex-1 overflow-y-auto px-3 md:px-4 py-2">
          {!selectedChannel ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Hash className="w-16 h-16 text-[#404249] mb-3" />
              <p className="text-lg font-bold text-white">Selecione um canal</p>
              <p className="text-xs text-slate-500 mt-1">Escolha um canal de texto no menu lateral</p>
            </div>
          ) : isLoadingMessages ? (
            <div className="flex items-center justify-center h-full text-slate-500 text-xs">
              <div className="w-4 h-4 border-2 border-[#5865F2] border-t-transparent rounded-full animate-spin mr-2" />
              Carregando mensagens...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Hash className="w-16 h-16 text-[#404249] mb-3" />
              <p className="text-lg font-bold text-white">Bem-vindo ao #{selectedChannel?.name}!</p>
              <p className="text-xs text-slate-500 mt-1">Início do canal. Envie a primeira mensagem!</p>
            </div>
          ) : (
            messages.map((msg: any) => (
              <div key={msg.id} className={`flex items-start gap-4 px-2 py-1.5 rounded hover:bg-[#2e3035] group ${msg._isOptimistic ? 'opacity-60' : ''}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden bg-[#5865F2]">
                  {msg.senderAvatar ? (
                    <img src={msg.senderAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    msg.senderName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-white hover:underline cursor-pointer">{msg.senderName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      msg.senderRole === 'TEACHER' ? 'bg-[#5865F2]/20 text-[#949CF7]' :
                      msg.senderRole === 'COORDINATOR' ? 'bg-[#ED4245]/20 text-[#F47B67]' :
                      msg.senderRole === 'ADMIN' ? 'bg-[#FEE75C]/20 text-[#F0B232]' :
                      'bg-[#23A559]/20 text-[#57F287]'
                    }`}>
                      {msg.senderRole === 'TEACHER' ? 'Professor' :
                       msg.senderRole === 'COORDINATOR' ? 'Coord' :
                       msg.senderRole === 'ADMIN' ? 'Direção' : 'Aluno'}
                    </span>
                    <span className="text-[10px] text-[#949BA4]">
                      {new Date(msg.createdAt).toLocaleDateString('pt-BR')}{' '}
                      {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[15px] text-[#dbdee1] leading-relaxed break-words">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        )}

        {/* Typing indicator */}
        {!showTimetable && typingUsers.length > 0 && (
          <div className="px-4 py-1 text-[11px] text-slate-400 flex-shrink-0">
            <strong>{typingUsers.join(', ')}</strong> {typingUsers.length === 1 ? 'está' : 'estão'} digitando...
          </div>
        )}

        {/* Message input */}
        {!showTimetable && (
        <div className="px-3 md:px-4 pb-3 md:pb-4 pt-1 flex-shrink-0">
          {!selectedChannel ? null : isLocked ? (
            <div className="p-3 bg-[#2b2d31] border border-[#1f2023] rounded-lg text-center text-xs text-amber-400">
              <Lock className="w-3.5 h-3.5 inline mr-1" />
              Somente professores podem enviar mensagens neste canal.
            </div>
          ) : (
            <form onSubmit={handleSend} className="relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => handleInput(e.target.value)}
                placeholder={`Enviar mensagem em #${selectedChannel?.name || '...'}`}
                className="w-full pl-4 pr-12 py-3 bg-[#101326]/90 border border-[#fff2d4]/10 rounded-[14px] text-[15px] text-[#fff2d4] placeholder-[#fff2d4]/30 focus:outline-none focus:border-[#35d8e8]/70 focus:shadow-[0_0_22px_rgba(53,216,232,.14)]"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#fff2d4]/50 hover:text-[#35d8e8] disabled:opacity-30 transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          )}
        </div>
        )}
      </div>

      {/* Members sidebar */}
      {showMembers && (
        <div className="w-64 md:w-60 flex flex-col bg-[#2b2d31] border-l border-[#1f2023] overflow-y-auto">
          {enrolledTeachers.length > 0 && (
            <div className="p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#949BA4] px-1 mb-2">
                Professores — {enrolledTeachers.length}
              </h3>
              {enrolledTeachers.map((t: any) => (
                <div key={t.user.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#5865F2]">
                      {t.user.avatarUrl ? (
                        <img src={t.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">
                          {t.user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#23A559] rounded-full border-[2.5px] border-[#2b2d31]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#dbdee1] group-hover:text-white transition-colors truncate">
                      {t.user.name}
                    </p>
                    {t.subject && (
                      <p className="text-[10px] text-[#5865F2] font-medium truncate">
                        {t.subject}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#949BA4] px-1 mb-2">
              Alunos — {enrolledStudents.length}
            </h3>
            {enrolledStudents.map((s: any) => (
              <div key={s.user.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full overflow-hidden bg-[#5865F2]">
                    {s.user.avatarUrl ? (
                      <img src={s.user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">
                        {s.user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#23A559] rounded-full border-[2.5px] border-[#2b2d31]" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#949BA4] group-hover:text-[#dbdee1] transition-colors truncate">{s.user.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
