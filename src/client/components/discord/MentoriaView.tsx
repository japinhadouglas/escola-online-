import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { Send, Users, MessageSquare, Shield, Loader2, ChevronDown, X, MoreVertical, Trash2, Edit2 } from 'lucide-react';

interface MentorUser {
  id: string;
  name: string;
  registrationNumber: string;
  avatarUrl: string | null;
  role: string;
  isMonitor: boolean;
  inClass?: boolean;
  subject?: string | null;
}

interface MentoriaMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderAvatar: string | null;
  senderIsMonitor: boolean;
  content: string;
  attachments: any[];
  isPinned: boolean;
  createdAt: string;
  _isOptimistic?: boolean;
}

interface Props {
  classId: string;
}

export const MentoriaView: React.FC<Props> = ({ classId }) => {
  const { user, token } = useAuth();
  const { socket } = useSocket();

  const [channel, setChannel] = useState<any>(null);
  const [messages, setMessages] = useState<MentoriaMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [classMonitors, setClassMonitors] = useState<MentorUser[]>([]);
  const [otherMonitors, setOtherMonitors] = useState<MentorUser[]>([]);
  const [showMonitorsList, setShowMonitorsList] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selectedChannelRef = useRef<any>(null);
  const messagesRef = useRef<MentoriaMessage[]>([]);

  // Manter ref sincronizada
  useEffect(() => {
    selectedChannelRef.current = channel;
  }, [channel]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Carregar canal de mentoria e monitores
  const carregarMentoria = useCallback(async () => {
    if (!token || !user?.isMonitor) return;
    setIsLoading(true);
    try {
      // Canal e mensagens
      const res = await fetch(`/api/v1/mentoria/channel/${classId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.channel) {
        setChannel(data.channel);
        if (Array.isArray(data.messages)) setMessages(data.messages);
      }

      // Monitores
      const resMon = await fetch(`/api/v1/mentoria/monitors/${classId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dataMon = await resMon.json().catch(() => ({}));
      if (resMon.ok) {
        setClassMonitors(dataMon.classMonitors || []);
        setOtherMonitors(dataMon.otherMonitors || []);
      }
    } catch (err) {
      console.error('[Mentoria] Erro ao carregar:', err);
    } finally {
      setIsLoading(false);
    }
  }, [classId, token, user?.isMonitor]);

  useEffect(() => {
    if (user?.isMonitor) {
      carregarMentoria();
    }
  }, [carregarMentoria, user?.isMonitor]);

  // Socket: join/leave canal, listeners
  useEffect(() => {
    if (!channel || !token || !socket || !user?.isMonitor) return;

    setIsLoadingMessages(true);
    setMessages([]);
    setTypingUsers([]);

    const channelIdAtRequest = channel.id;
    let cancelled = false;

    // Buscar mensagens históricas (já carregadas no carregarMentoria, mas garante sincronismo)
    fetch(`/api/v1/mentoria/channel/${classId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.messages)) setMessages(data.messages);
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setIsLoadingMessages(false);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      });

    // Entrar na sala do canal
    socket.emit('join-channel', { channelId: channel.id });

    const onMsg = (msg: any) => {
      const currentChannel = selectedChannelRef.current;
      if (!currentChannel) return;
      if (msg.channelId !== currentChannel.id) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    };

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
  }, [channel?.id, socket, token, user?.id, classId, user?.isMonitor]);

  // Enviar mensagem
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !channel || !user?.isMonitor) return;
    const msg = inputText.trim();
    setInputText('');

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMsg: MentoriaMessage = {
      id: tempId,
      channelId: channel.id,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      senderAvatar: user.avatarUrl ?? null,
      senderIsMonitor: user.isMonitor,
      content: msg,
      attachments: [],
      isPinned: false,
      createdAt: new Date().toISOString(),
      _isOptimistic: true,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);

    try {
      const res = await fetch(`/api/v1/mentoria/channel/${classId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: msg }),
      });
      const data = await res.json();

      if (res.ok && data.id) {
        setMessages((prev) =>
          prev.map((m) => m.id === tempId ? { ...data, _isOptimistic: false } : m)
        );
        if (socket) {
          socket.emit('send-channel-message', { channelId: channel.id, message: data });
        }
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInputText(msg);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(msg);
    }
  };

  const handleInput = (val: string) => {
    setInputText(val);
    if (socket && channel) {
      socket.emit('user-typing', {
        channelId: channel.id,
        userId: user?.id,
        userName: user?.name,
      });
    }
  };

  // Excluir mensagem (própria ou se for admin)
  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm('Excluir esta mensagem?')) return;
    try {
      // Não há endpoint de delete ainda, mas podemos implementar se necessário
      // Por enquanto apenas remove localmente se for própria
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err) {
      console.error('[Mentoria] Erro ao excluir:', err);
    }
  };

  if (!user?.isMonitor) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-[#1e1f22]">
        <div className="w-20 h-20 bg-[#5865F2]/15 rounded-full flex items-center justify-center mb-4">
          <Shield className="w-10 h-10 text-[#5865F2]" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Área de Mentoria</h2>
        <p className="text-sm text-slate-400 max-w-md">
          Esta área é exclusiva para alunos monitores da Sala do Futuro.
          Se você é monitor, faça login com seu RA da SED SP para acessar.
        </p>
        <p className="text-xs text-slate-500 mt-4">
          Monitores ajudam colegas com dúvidas, orientam o uso da plataforma
          e apoiam a gestão das turmas na Sala do Futuro.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="w-6 h-6 border-2 border-[#5865F2] border-t-transparent rounded-full animate-spin mr-2" />
        Carregando mentoria...
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        Não foi possível carregar o canal de mentoria.
        <button onClick={carregarMentoria} className="ml-2 text-[#5865F2] hover:underline text-sm">
          Tentar novamente
        </button>
      </div>
    );
  }

  // Barreira final: mesmo que este componente seja montado por engano,
  // nenhum conteúdo de Mentoria aparece sem o booleano true confirmado.
  if (user?.isMonitor !== true) return null;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-[#1e1f22]">
      {/* Channel header */}
      <div className="h-12 px-3 md:px-4 flex items-center justify-between border-b border-[#1f2023] bg-[#313338] flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setShowMobileNav(!showMobileNav)}
            className="md:hidden p-1 text-slate-400 hover:text-white mr-1"
          >
            {showMobileNav ? <X className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          <div className="w-8 h-8 rounded-lg bg-[#ED4245]/20 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-4.5 h-4.5 text-[#ED4245]" />
          </div>
          <span className="font-bold text-sm text-white truncate">Mentoria #{channel.name}</span>
          <span className="hidden sm:block w-px h-5 bg-[#3f4147] mx-1" />
          <span className="hidden sm:block text-xs text-slate-500 truncate">
            Chat exclusivo entre monitores da turma
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowMonitorsList(!showMonitorsList)}
            className={`p-1.5 rounded transition-colors ${showMonitorsList ? 'bg-[#404249] text-white' : 'text-slate-400 hover:text-slate-200'}`}
            title="Monitores"
          >
            <Users className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile channel nav overlay (not really needed for single channel, but keeps pattern) */}
      {showMobileNav && (
        <div className="md:hidden absolute inset-0 z-40 flex">
          <div className="w-[280px] bg-[#2b2d31] flex flex-col shadow-xl">
            <div className="p-4 border-b border-[#1f2023]">
              <h3 className="font-bold text-white">Mentoria</h3>
            </div>
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setShowMobileNav(false)} />
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 md:px-4 py-2">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-xs">
            <div className="w-4 h-4 border-2 border-[#5865F2] border-t-transparent rounded-full animate-spin mr-2" />
            Carregando mensagens...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 bg-[#ED4245]/15 rounded-full flex items-center justify-center mb-3">
              <MessageSquare className="w-8 h-8 text-[#ED4245]" />
            </div>
            <p className="text-lg font-bold text-white">Bem-vindo à Mentoria!</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Aqui os monitores da turma se comunicam, trocam dicas e se organizam para ajudar os colegas.
            </p>
          </div>
        ) : (
          messages.map((msg: MentoriaMessage) => (
            <div
              key={msg.id}
              className={`flex items-start gap-4 px-2 py-1.5 rounded hover:bg-[#2e3035] group ${msg._isOptimistic ? 'opacity-60' : ''}`}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden bg-[#ED4245]">
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
                    msg.senderIsMonitor ? 'bg-[#ED4245]/20 text-[#ED4245]' :
                    'bg-[#23A559]/20 text-[#57F287]'
                  }`}>
                    {msg.senderRole === 'TEACHER' ? 'Professor' :
                     msg.senderRole === 'COORDINATOR' ? 'Coord' :
                     msg.senderRole === 'ADMIN' ? 'Direção' :
                     msg.senderIsMonitor ? 'Monitor' : 'Aluno'}
                  </span>
                  <span className="text-[10px] text-[#949BA4]">
                    {new Date(msg.createdAt).toLocaleDateString('pt-BR')}{' '}
                    {new Date(msg.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-[15px] text-[#dbdee1] leading-relaxed break-words">{msg.content}</p>
              </div>
              {(msg.senderId === user?.id || ['ADMIN', 'COORDINATOR'].includes(user?.role || '')) && (
                <button
                  onClick={() => handleDeleteMessage(msg.id)}
                  className="p-1 text-slate-500 hover:text-[#ED4245] transition-colors opacity-0 group-hover:opacity-100"
                  title="Excluir mensagem"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-[11px] text-slate-400 flex-shrink-0">
          <strong>{typingUsers.join(', ')}</strong> {typingUsers.length === 1 ? 'está' : 'estão'} digitando...
        </div>
      )}

      {/* Message input */}
      <div className="px-3 md:px-4 pb-3 md:pb-4 pt-1 flex-shrink-0">
        <form onSubmit={handleSend} className="relative">
          <input
            type="text"
            value={inputText}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Mensagem para os monitores..."
            className="w-full pl-4 pr-12 py-3 bg-[#383a40] rounded-lg text-[15px] text-[#dbdee1] placeholder-[#6d6f78] focus:outline-none border-none"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b5bac1] hover:text-[#ED4245] disabled:opacity-30 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* Monitors sidebar */}
      {showMonitorsList && (
        <div className="w-64 md:w-60 flex flex-col bg-[#2b2d31] border-l border-[#1f2023] overflow-y-auto">
          {(classMonitors.length > 0 || otherMonitors.length > 0) && (
            <>
              {classMonitors.length > 0 && (
                <div className="p-4">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#949BA4] px-1 mb-2 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#ED4245]" /> Monitores da turma ({classMonitors.length})
                  </h3>
                  {classMonitors.map((m) => (
                    <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-[#ED4245] ring-2 ring-[#ED4245]">
                          {m.avatarUrl ? (
                            <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">
                              {m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#ED4245] rounded-full border-[2.5px] border-[#2b2d31]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#dbdee1] group-hover:text-white transition-colors truncate">
                          {m.name}
                        </p>
                        <p className="text-[10px] text-[#ED4245] font-medium truncate">Monitor</p>
                        {m.subject && (
                          <p className="text-[10px] text-[#5865F2] font-medium truncate">{m.subject}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {otherMonitors.length > 0 && (
                <div className="p-4 border-t border-[#1f2023]">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#949BA4] px-1 mb-2 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Outros monitores da escola ({otherMonitors.length})
                  </h3>
                  {otherMonitors.map((m) => (
                    <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-[#35373c] cursor-pointer group">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-[#5865F2]">
                          {m.avatarUrl ? (
                            <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">
                              {m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                            </div>
                          )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#23A559] rounded-full border-[2.5px] border-[#2b2d31]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#949BA4] group-hover:text-[#dbdee1] transition-colors truncate">{m.name}</p>
                        <p className="text-[10px] text-[#ED4245] font-medium truncate">Monitor</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {(classMonitors.length === 0 && otherMonitors.length === 0) && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
              <Shield className="w-12 h-12 text-[#404249] mb-3" />
              <p className="text-sm text-slate-500">Nenhum monitor cadastrado ainda.</p>
              <p className="text-xs text-slate-600 mt-1">Admins/Coordenadores podem definir monitores.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
