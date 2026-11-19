import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWebRTC } from '../../context/WebRTCContext';
import { ChannelChat } from '../chat/ChannelChat';
import { LiveClassroomRoom } from './LiveClassroomRoom';
import {
  Video,
  MessageSquare,
  FileText,
  BookOpen,
  Users,
  Plus,
  Calendar,
  Clock,
  Download,
  CheckCircle,
  AlertCircle,
  Hash,
  Lock,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface ClassroomViewProps {
  classId: string;
}

export const ClassroomView: React.FC<ClassroomViewProps> = ({ classId }) => {
  const { user, token } = useAuth();
  const { inCall, joinClassroom } = useWebRTC();

  const [classData, setClassData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'classroom' | 'chat' | 'materials' | 'assignments' | 'members'>('classroom');
  const [selectedChannel, setSelectedChannel] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modais de Criação
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [showAddAssignmentModal, setShowAddAssignmentModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState<any>(null);

  // Form states
  const [matTitle, setMatTitle] = useState('');
  const [matUrl, setMatUrl] = useState('');
  const [matDesc, setMatDesc] = useState('');

  const [assTitle, setAssTitle] = useState('');
  const [assDesc, setAssDesc] = useState('');
  const [assSubject, setAssSubject] = useState('Geral');
  const [assDueDate, setAssDueDate] = useState('');

  const [submissionText, setSubmissionText] = useState('');

  const isTeacherOrAdmin = user?.role === 'TEACHER' || user?.role === 'ADMIN' || user?.role === 'COORDINATOR';

  const loadClassData = () => {
    setIsLoading(true);
    fetch(`/api/v1/classes/${classId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setClassData(data);
        if (data.channels && data.channels.length > 0 && !selectedChannel) {
          setSelectedChannel(data.channels[0]);
        }
      })
      .catch((err) => console.error('[Load Class Error]', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadClassData();
  }, [classId]);

  const handleStartLiveClass = async () => {
    await joinClassroom(`class-${classId}`);
  };

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matTitle || !matUrl) return;

    try {
      const res = await fetch('/api/v1/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          classId,
          title: matTitle,
          fileUrl: matUrl,
          description: matDesc,
          fileType: 'PDF',
          fileSize: '2.5 MB',
        }),
      });
      if (res.ok) {
        setShowAddMaterialModal(false);
        setMatTitle('');
        setMatUrl('');
        setMatDesc('');
        loadClassData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assTitle || !assDesc) return;

    try {
      const res = await fetch('/api/v1/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          classId,
          title: assTitle,
          description: assDesc,
          subject: assSubject,
          dueDate: assDueDate ? new Date(assDueDate).toISOString() : null,
          maxScore: 10,
        }),
      });
      if (res.ok) {
        setShowAddAssignmentModal(false);
        setAssTitle('');
        setAssDesc('');
        setAssDueDate('');
        loadClassData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showSubmitModal) return;

    try {
      const res = await fetch(`/api/v1/assignments/${showSubmitModal.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: submissionText }),
      });
      if (res.ok) {
        setShowSubmitModal(null);
        setSubmissionText('');
        loadClassData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading && !classData) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mr-2" />
        Carregando ambiente da turma...
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="p-8 text-center text-red-400 bg-slate-900 border border-slate-800 rounded-2xl">
        Turma não encontrada ou acesso restrito.
      </div>
    );
  }

  // Se estiver em chamada na Sala do Futuro, renderiza tela cheia da aula
  if (inCall) {
    return (
      <div className="h-[calc(100vh-5rem)]">
        <LiveClassroomRoom
          roomId={`class-${classId}`}
          className={classData.name}
          onLeave={() => {}}
        />
      </div>
    );
  }

  const enrolledTeachers = classData.enrollments?.filter((e: any) => e.role === 'TEACHER') || [];
  const enrolledStudents = classData.enrollments?.filter((e: any) => e.role === 'STUDENT') || [];

  return (
    <div className="space-y-6">
      {/* Banner Principal da Turma */}
      <div className="relative bg-gradient-to-r from-slate-900 via-slate-900 to-brand-950/40 border border-slate-800 rounded-2xl p-6 sm:p-8 overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 bg-brand-500/20 text-brand-400 border border-brand-500/30 rounded-full text-xs font-bold">
                {classData.grade}
              </span>
              <span className="text-xs text-slate-400">Turno: {classData.shift} • Ano Letivo {classData.year}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {classData.name}
            </h1>
            <p className="text-sm text-slate-300 mt-1">
              Professores:{' '}
              {enrolledTeachers.length > 0
                ? enrolledTeachers.map((t: any) => t.user.name).join(', ')
                : 'Corpo docente em atribuição'}
            </p>
          </div>

          {/* Botão de Destaque: Entrar na Aula Ao Vivo */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleStartLiveClass}
              className="py-3 px-6 bg-gradient-to-r from-brand-500 to-emerald-400 hover:from-brand-600 hover:to-emerald-500 active:scale-95 text-slate-950 font-extrabold rounded-2xl shadow-xl shadow-brand-500/20 flex items-center gap-2.5 transition-all"
            >
              <Video className="w-5 h-5 fill-slate-950" />
              <span>Entrar na Aula (Sala do Futuro)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Navegação por Abas */}
      <div className="flex border-b border-slate-800 gap-2 sm:gap-4 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('classroom')}
          className={`py-3 px-4 font-semibold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'classroom'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Visão Geral & Aula</span>
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`py-3 px-4 font-semibold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'chat'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Canais de Chat ({classData.channels?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('assignments')}
          className={`py-3 px-4 font-semibold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'assignments'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Atividades ({classData.assignments?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('materials')}
          className={`py-3 px-4 font-semibold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'materials'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Materiais de Apoio ({classData.materials?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`py-3 px-4 font-semibold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'members'
              ? 'border-brand-500 text-brand-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Alunos & Professores ({enrolledStudents.length + enrolledTeachers.length})</span>
        </button>
      </div>

      {/* Conteúdo das Abas */}
      {activeTab === 'classroom' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Card Principal da Sala do Futuro */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-brand-400" />
                <span>Sala de Aula Virtual em Tempo Real</span>
              </h3>
              <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Sala Pronta
              </span>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              A <strong>Sala do Futuro</strong> integra videoconferência WebRTC de alta fidelidade, compartilhamento de tela nativo, quadro branco digital colaborativo e controle pedagógico de áudio e vídeo pelo professor.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-center">
                <div className="text-lg font-bold text-brand-400">WebRTC</div>
                <div className="text-[11px] text-slate-400">Vídeo & Áudio Real</div>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-center">
                <div className="text-lg font-bold text-blue-400">Tela / Aba</div>
                <div className="text-[11px] text-slate-400">Compartilhamento</div>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-center">
                <div className="text-lg font-bold text-purple-400">Lousa Digital</div>
                <div className="text-[11px] text-slate-400">Quadro Branco</div>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-center">
                <div className="text-lg font-bold text-amber-400">Pedagogia</div>
                <div className="text-[11px] text-slate-400">Mão & Moderação</div>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={handleStartLiveClass}
                className="w-full py-3.5 bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-slate-950 font-bold rounded-xl shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 transition-all"
              >
                <Video className="w-5 h-5 fill-slate-950" />
                <span>Entrar na Sala do Futuro Agora</span>
              </button>
            </div>
          </div>

          {/* Avisos Rápidos da Turma */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>Últimos Avisos da Turma</span>
              </h3>
              <div className="space-y-3">
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs space-y-1">
                  <p className="font-semibold text-white">📢 Plantão de Dúvidas Semanal</p>
                  <p className="text-slate-400">
                    O professor estará ao vivo toda terça e quinta para esclarecer dúvidas de matemática e ciências.
                  </p>
                </div>
                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs space-y-1">
                  <p className="font-semibold text-white">📅 Entrega de Redação</p>
                  <p className="text-slate-400">
                    Não esqueçam de enviar o arquivo dissertativo na aba "Atividades" antes do prazo final.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('chat')}
              className="mt-4 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors"
            >
              Ver Canais de Mensagens
            </button>
          </div>
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[550px]">
          {/* Seletor de Canais da Turma */}
          <div className="md:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col overflow-y-auto">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-3 py-2">
              Canais da Turma
            </h4>
            <div className="space-y-1">
              {classData.channels?.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedChannel(c)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                    selectedChannel?.id === c.id
                      ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {c.isLocked ? (
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Hash className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span className="truncate">{c.name}</span>
                  </div>
                  {c.isLocked && (
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                      Avisos
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Área do Chat */}
          <div className="md:col-span-3 h-full">
            {selectedChannel ? (
              <ChannelChat classId={classId} channel={selectedChannel} />
            ) : (
              <div className="h-full flex items-center justify-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-500 text-sm">
                Selecione um canal ao lado para conversar.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Atividades e Trabalhos Avaliativos</h3>
            {isTeacherOrAdmin && (
              <button
                onClick={() => setShowAddAssignmentModal(true)}
                className="py-2 px-3 bg-brand-500 hover:bg-brand-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Atividade</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classData.assignments?.length === 0 ? (
              <div className="col-span-2 p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-sm">
                Nenhuma atividade cadastrada no momento.
              </div>
            ) : (
              classData.assignments?.map((ass: any) => {
                const mySubmission = ass.submissions?.[0];
                return (
                  <div key={ass.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">
                          {ass.subject || 'Geral'}
                        </span>
                        <h4 className="text-base font-bold text-white mt-1">{ass.title}</h4>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-amber-400">Nota Max: {ass.maxScore}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{ass.description}</p>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {ass.dueDate
                            ? `Entrega: ${new Date(ass.dueDate).toLocaleDateString()}`
                            : 'Sem data limite'}
                        </span>
                      </div>

                      {user?.role === 'STUDENT' && (
                        <div>
                          {mySubmission ? (
                            <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full font-semibold flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>{mySubmission.score !== null ? `Nota: ${mySubmission.score}` : 'Enviado'}</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => setShowSubmitModal(ass)}
                              className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                            >
                              Entregar Trabalho
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'materials' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Materiais Didáticos e Arquivos</h3>
            {isTeacherOrAdmin && (
              <button
                onClick={() => setShowAddMaterialModal(true)}
                className="py-2 px-3 bg-brand-500 hover:bg-brand-600 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Material</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {classData.materials?.length === 0 ? (
              <div className="col-span-3 p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-sm">
                Nenhum material didático anexado para esta turma.
              </div>
            ) : (
              classData.materials?.map((mat: any) => (
                <div key={mat.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded-full font-bold">
                        {mat.fileType}
                      </span>
                      <span className="text-[10px] text-slate-500">{mat.fileSize || 'Arquivo'}</span>
                    </div>
                    <h4 className="text-sm font-bold text-white leading-snug">{mat.title}</h4>
                    {mat.description && (
                      <p className="text-xs text-slate-400 mt-1">{mat.description}</p>
                    )}
                  </div>

                  <a
                    href={mat.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Acessar Material</span>
                  </a>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'members' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Professores */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>Corpo Docente ({enrolledTeachers.length})</span>
            </h4>
            <div className="space-y-2">
              {enrolledTeachers.map((t: any) => (
                <div key={t.user.id} className="p-2.5 bg-slate-800/50 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-xs">
                      {t.user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">{t.user.name}</p>
                      <p className="text-[10px] text-slate-400">{t.subject || 'Professor Titular'}</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded font-medium">
                    Docente
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Alunos */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Estudantes Matriculados ({enrolledStudents.length})</span>
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {enrolledStudents.map((s: any) => (
                <div key={s.user.id} className="p-2.5 bg-slate-800/50 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                      {s.user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">{s.user.name}</p>
                      <p className="text-[10px] text-slate-500">RA: {s.user.registrationNumber}</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded font-medium">
                    Estudante
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Material */}
      {showAddMaterialModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Disponibilizar Material Didático</h3>
            <form onSubmit={handleCreateMaterial} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Título do Documento</label>
                <input
                  type="text"
                  value={matTitle}
                  onChange={(e) => setMatTitle(e.target.value)}
                  placeholder="Ex: Livro Digital de Geometria Cap 4.pdf"
                  required
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Link ou URL do Arquivo</label>
                <input
                  type="text"
                  value={matUrl}
                  onChange={(e) => setMatUrl(e.target.value)}
                  placeholder="https://exemplo.com/material.pdf"
                  required
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Descrição</label>
                <textarea
                  value={matDesc}
                  onChange={(e) => setMatDesc(e.target.value)}
                  placeholder="Instruções para os alunos..."
                  rows={2}
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddMaterialModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-slate-950 font-bold rounded-xl text-xs"
                >
                  Salvar Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adicionar Atividade */}
      {showAddAssignmentModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Criar Nova Atividade Avaliativa</h3>
            <form onSubmit={handleCreateAssignment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Título da Atividade</label>
                <input
                  type="text"
                  value={assTitle}
                  onChange={(e) => setAssTitle(e.target.value)}
                  placeholder="Ex: Trabalho de Física Quântica"
                  required
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Disciplina</label>
                <input
                  type="text"
                  value={assSubject}
                  onChange={(e) => setAssSubject(e.target.value)}
                  placeholder="Ex: Matemática"
                  required
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Data Limite de Entrega</label>
                <input
                  type="date"
                  value={assDueDate}
                  onChange={(e) => setAssDueDate(e.target.value)}
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Orientações e Enunciado</label>
                <textarea
                  value={assDesc}
                  onChange={(e) => setAssDesc(e.target.value)}
                  placeholder="Descreva as instruções de resolução..."
                  rows={3}
                  required
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAssignmentModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-slate-950 font-bold rounded-xl text-xs"
                >
                  Publicar Atividade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Entregar Trabalho (Aluno) */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Entregar Atividade: {showSubmitModal.title}</h3>
            <p className="text-xs text-slate-300">{showSubmitModal.description}</p>
            <form onSubmit={handleSubmitAssignment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Sua Resposta ou Link do Trabalho</label>
                <textarea
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  placeholder="Escreva sua resolução ou cole o link do seu documento/drive..."
                  rows={4}
                  required
                  className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(null)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-slate-950 font-bold rounded-xl text-xs"
                >
                  Confirmar Entrega
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
