import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Users,
  GraduationCap,
  Video,
  BookOpen,
  Calendar,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Bell,
} from 'lucide-react';

interface SchoolDashboardProps {
  onSelectClass: (classId: string) => void;
}

export const SchoolDashboard: React.FC<SchoolDashboardProps> = ({ onSelectClass }) => {
  const { user, token } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [classes, setClasses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);

    Promise.all([
      fetch('/api/v1/schools/dashboard-stats', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
      fetch('/api/v1/classes', {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
    ])
      .then(([statsData, classesData]) => {
        setStats(statsData);
        if (Array.isArray(classesData)) {
          setClasses(classesData);
        }
      })
      .catch((err) => console.error('[Dashboard Load Error]', err))
      .finally(() => setIsLoading(false));
  }, [token]);

  return (
    <div className="space-y-6">
      {/* Boas-Vindas Institucionais */}
      <div className="bg-gradient-to-r from-brand-900/40 via-slate-900 to-slate-900 border border-brand-500/20 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 bg-brand-500/20 text-brand-300 border border-brand-500/30 rounded-full text-xs font-bold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                Ano Letivo 2026 • Ambiente Nacional
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Olá, {user?.name}!
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Bem-vindo ao <strong>{user?.schoolName || 'Escola Online'}</strong>. Conecte-se com suas turmas, participe da Sala do Futuro e acesse seus materiais pedagógicos.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 p-3 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold text-white uppercase">{user?.role}</div>
              <div className="text-[11px] text-slate-400">RA/Matrícula: {user?.registrationNumber}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Cards de Métricas e Estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Estudantes</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {stats?.totalStudents ?? 0}
            </div>
            <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
              <TrendingUp className="w-3 h-3" />
              <span>Matriculados e Ativos</span>
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Professores</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {stats?.totalTeachers ?? 0}
            </div>
            <p className="text-[11px] text-blue-400 font-medium mt-0.5">
              Corpo Docente Titular
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Salas Ao Vivo</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Video className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {stats?.activeSessions ?? 0}
            </div>
            <p className="text-[11px] text-purple-400 font-medium mt-0.5">
              Salas do Futuro Abertas
            </p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">Atividades</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {stats?.totalAssignments ?? 0}
            </div>
            <p className="text-[11px] text-amber-400 font-medium mt-0.5">
              Trabalhos Cadastrados
            </p>
          </div>
        </div>
      </div>

      {/* Seção das Minhas Turmas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white">Minhas Turmas Digitais</h2>
            <p className="text-xs text-slate-400">Selecione uma turma para acessar a Sala do Futuro, chat e atividades</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((c) => (
            <div
              key={c.id}
              onClick={() => onSelectClass(c.id)}
              className="group bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-brand-500/50 rounded-2xl p-5 cursor-pointer transition-all duration-200 shadow hover:shadow-xl hover:shadow-brand-500/5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-2">
                  <span className="px-2.5 py-0.5 bg-brand-500/20 text-brand-400 rounded-full text-xs font-bold">
                    {c.grade}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">{c.shift}</span>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-brand-400 transition-colors">
                  {c.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Professores:{' '}
                  {c.teacherNames && c.teacherNames.length > 0
                    ? c.teacherNames.join(', ')
                    : 'Corpo docente'}
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>{c.studentCount || 0} alunos</span>
                </span>
                <span className="text-brand-400 font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  <span>Entrar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Atividades Recentes e Auditoria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mural de Avisos da Escola */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <span>Comunicados da Direção & Secretaria</span>
          </h3>
          <div className="space-y-3">
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                <span>📢 Implantação da Plataforma Nacional Escola Online</span>
                <span className="text-[10px] text-slate-500">Hoje</span>
              </div>
              <p className="text-xs text-slate-300">
                Todas as aulas ao vivo agora ocorrem com tecnologia WebRTC na Sala do Futuro, garantindo estabilidade no computador e no celular.
              </p>
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
              <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                <span>🔒 Conformidade com a LGPD e Segurança de Dados</span>
                <span className="text-[10px] text-slate-500">2026</span>
              </div>
              <p className="text-xs text-slate-300">
                Os dados dos estudantes são tratados com isolamento multi-tenant e trilha de auditoria completa para máxima proteção.
              </p>
            </div>
          </div>
        </div>

        {/* Trilha de Atividades Recentes */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-400" />
            <span>Trilha de Eventos e Segurança (Audit Trail)</span>
          </h3>
          <div className="space-y-2">
            {stats?.recentActivity?.length > 0 ? (
              stats.recentActivity.slice(0, 4).map((act: any) => (
                <div
                  key={act.id}
                  className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-white">{act.userName}</span>
                    <span className="text-slate-400"> executou {act.action}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 text-center py-4">Nenhum evento registrado recentemente.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
