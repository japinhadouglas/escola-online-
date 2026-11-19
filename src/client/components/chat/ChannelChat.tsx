import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { MessageData, ChannelData } from '../../../shared/types';
import { Send, Hash, Lock, Pin, Paperclip, AlertCircle, Smile } from 'lucide-react';

interface ChannelChatProps {
  classId: string;
  channel: ChannelData;
}

export const ChannelChat: React.FC<ChannelChatProps> = ({ classId, channel }) => {
  const { user, token } = useAuth();
  const { socket } = useSocket();

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isLockedForUser = channel.isLocked && user?.role === 'STUDENT';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Carregar mensagens do canal
  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/v1/classes/${classId}/channels/${channel.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages(data);
        } else {
          setErrorMsg(data.error || 'Erro ao carregar mensagens.');
        }
      })
      .catch(() => setErrorMsg('Erro de conexão.'))
      .finally(() => {
        setIsLoading(false);
        setTimeout(scrollToBottom, 100);
      });

    // Conectar ao room do canal no socket
    socket?.emit('join-channel', { channelId: channel.id });

    // Ouvir novas mensagens em tempo real
    const handleNewMessage = (newMsg: MessageData) => {
      if (newMsg.channelId === channel.id) {
        setMessages((prev) => [...prev, newMsg]);
        setTimeout(scrollToBottom, 50);
      }
    };

    socket?.on('new-channel-message', handleNewMessage);

    return () => {
      socket?.emit('leave-channel', { channelId: channel.id });
      socket?.off('new-channel-message', handleNewMessage);
    };
  }, [classId, channel.id, socket, token]);

  // Enviar mensagem
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLockedForUser) return;

    const messageText = inputText.trim();
    setInputText('');

    try {
      const res = await fetch(`/api/v1/classes/${classId}/channels/${channel.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: messageText }),
      });

      const data = await res.json();
      if (res.ok) {
        // Emitir via socket para sincronizar imediatamente
        socket?.emit('send-channel-message', { channelId: channel.id, message: data });
      } else {
        alert(data.error || 'Erro ao enviar mensagem.');
      }
    } catch (err) {
      console.error('[Send Message Error]', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Header do Canal */}
      <div className="px-4 py-3 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {channel.isLocked ? (
            <Lock className="w-4 h-4 text-amber-400" />
          ) : (
            <Hash className="w-4 h-4 text-brand-400" />
          )}
          <span className="font-bold text-white text-sm sm:text-base">#{channel.name}</span>
          {channel.isLocked && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-semibold">
              Avisos Oficiais
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}
        </span>
      </div>

      {/* Lista de Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mr-2" />
            Carregando mensagens...
          </div>
        ) : errorMsg ? (
          <div className="flex items-center justify-center h-full text-red-400 text-sm gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{errorMsg}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center p-6">
            <Hash className="w-12 h-12 text-slate-700 mb-2" />
            <p className="text-sm font-semibold text-slate-400">Bem-vindo ao canal #{channel.name}!</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Este é o início da conversa. Envie uma mensagem para seus colegas e professores.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 p-2.5 rounded-xl transition-colors ${
                msg.isPinned ? 'bg-amber-500/10 border border-amber-500/30' : 'hover:bg-slate-800/40'
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-white flex-shrink-0">
                {msg.senderAvatar ? (
                  <img src={msg.senderAvatar} alt={msg.senderName} className="w-full h-full rounded-full object-cover" />
                ) : (
                  msg.senderName.slice(0, 2).toUpperCase()
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-xs sm:text-sm text-white truncate">{msg.senderName}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                      msg.senderRole === 'TEACHER'
                        ? 'bg-blue-500/20 text-blue-300'
                        : msg.senderRole === 'COORDINATOR' || msg.senderRole === 'ADMIN'
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {msg.senderRole === 'TEACHER'
                      ? 'Professor'
                      : msg.senderRole === 'COORDINATOR'
                      ? 'Coordenação'
                      : msg.senderRole === 'ADMIN'
                      ? 'Direção'
                      : 'Aluno'}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.isPinned && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold ml-auto">
                      <Pin className="w-3 h-3" />
                      Fixado
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-200 break-words leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input de Mensagem */}
      <div className="p-3 bg-slate-950/80 border-t border-slate-800">
        {isLockedForUser ? (
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-amber-400 font-medium flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" />
            <span>Este canal é reservado para avisos oficiais da coordenação e professores.</span>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Conversar em #${channel.name}...`}
                className="w-full pl-4 pr-10 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 bg-brand-500 hover:bg-brand-600 active:scale-95 text-slate-950 font-bold rounded-xl shadow-md shadow-brand-500/20 flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
