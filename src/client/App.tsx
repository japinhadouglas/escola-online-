import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { LoginView } from './components/auth/LoginView';
import { DiscordClassroomView } from './components/discord/DiscordClassroomView';
import { GraduationCap, LogOut } from 'lucide-react';

function gradeColor(grade: string): string {
  const g = (grade || '').toLowerCase();
  if (g.includes('6º')) return 'bg-[#ED4245]';
  if (g.includes('7º')) return 'bg-[#FAA61A]';
  if (g.includes('8º')) return 'bg-[#3BA55C]';
  if (g.includes('9º')) return 'bg-[#00AFF4]';
  if (g.includes('1ª')) return 'bg-[#5865F2]';
  if (g.includes('2ª')) return 'bg-[#a45de2]';
  if (g.includes('3ª')) return 'bg-[#eb459e]';
  return 'bg-[#5865F2]';
}

export const App: React.FC = () => {
  const { user, token, isLoading, logout, updateUser } = useAuth();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classes, setClasses] = useState<any[]>([]);

  useEffect(() => {
    if (token) {
      fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.id) updateUser(data);
        })
        .catch(() => {
          // Falhar fechado: sem confirmação atual do servidor, não liberar Mentoria.
          updateUser({ isMonitor: false });
        });
      fetch('/api/v1/classes', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setClasses(data);
            if (data.length > 0 && !selectedClassId) {
              setSelectedClassId(data[0].id);
            }
          }
        })
        .catch(() => {});
    }
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#313338] flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 bg-[#5865F2] rounded-[24px] flex items-center justify-center mb-4 animate-pulse">
          <GraduationCap className="w-9 h-9 text-white" />
        </div>
        <div className="w-8 h-8 border-[3px] border-[#5865F2] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-400 font-medium">Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <div className="flex h-screen bg-[#313338] text-slate-100 overflow-hidden font-sans">
      {/* Far-left server/class list bar — like Discord server icons */}
      <div className="w-[56px] md:w-[72px] bg-[#1e1f22] flex flex-col items-center py-2 md:py-3 gap-1.5 md:gap-2 flex-shrink-0 h-full overflow-y-auto">
        {/* Home button / Logo */}
        <button
          onClick={() => { setSelectedClassId(null); }}
          className="w-11 h-11 md:w-12 md:h-12 rounded-[22px] md:rounded-[24px] bg-[#5865F2] hover:rounded-[14px] md:hover:rounded-[16px] transition-all duration-200 flex items-center justify-center flex-shrink-0 group relative"
          title="Escola Online"
        >
          <GraduationCap className="w-6 h-6 md:w-7 md:h-7 text-white" />
        </button>

        <div className="w-7 md:w-8 h-[2px] bg-[#35363c] rounded-full my-0.5 md:my-1 flex-shrink-0" />

        {/* Class servers */}
        {classes.map((c: any) => (
          <div key={c.id} className="relative group flex-shrink-0">
            {/* Pill indicator */}
            <div
              className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-white transition-all duration-200 ${
                selectedClassId === c.id ? 'h-9 md:h-10' : 'h-0 group-hover:h-5'
              }`}
            />
            <button
              onClick={() => { setSelectedClassId(c.id); }}
              title={c.name}
              className={`w-11 h-11 md:w-12 md:h-12 flex items-center justify-center text-xs md:text-sm font-bold transition-all duration-200 flex-shrink-0 ${
                selectedClassId === c.id
                  ? 'rounded-[14px] md:rounded-[16px] bg-[#4847f0] text-white ring-2 ring-white/20'
                  : 'rounded-[22px] md:rounded-[24px] hover:rounded-[14px] md:hover:rounded-[16px] text-white hover:bg-[#5865F2]'
              } ${gradeColor(c.grade)}`}
            >
              {c.name.split(' ').map((w: string) => w[0]).join('').slice(0, 3)}
            </button>
          </div>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User avatar at bottom */}
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-[10px] md:text-[11px] font-bold text-white overflow-hidden cursor-pointer hover:opacity-80 transition-opacity">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)
            )}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 md:w-3.5 h-3 md:h-3.5 bg-[#23A559] rounded-full border-[2.5px] border-[#1e1f22]" />
        </div>

        <button
          onClick={logout}
          className="w-9 h-9 md:w-10 md:h-10 rounded-[22px] md:rounded-[24px] bg-[#313338] hover:bg-[#ED4245] text-slate-500 hover:text-white transition-all duration-200 flex items-center justify-center flex-shrink-0"
          title="Sair"
        >
          <LogOut className="w-4 h-4 md:w-5 md:h-5" />
        </button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {selectedClassId ? (
          <DiscordClassroomView classId={selectedClassId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4 px-4 overflow-y-auto">
            <div className="w-20 h-20 bg-[#5865F2]/20 rounded-full flex items-center justify-center">
              <GraduationCap className="w-10 h-10 text-[#5865F2]" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-white mb-1">{user.role === 'TEACHER' ? 'Visão do Professor' : 'Escola Online'}</h2>
              <p className="text-sm text-slate-400">
                {user.role === 'TEACHER' ? 'Selecione uma turma para acompanhar ou abrir uma Sala Online' : 'Selecione uma turma para começar'}
              </p>
            </div>
            <div className="w-full max-w-3xl space-y-6 mb-8">
              {(['Ensino Fundamental', 'Ensino Médio'] as const).map((level) => {
                // Cobre grades da seed ("8º Ano - Ensino Fundamental", "1ª Série - Ensino
                // Médio") E grades reais da SED SP ("1ª SERIE A TARDE ANUAL", "NOVO ENSINO
                // MEDIO"), que não contêm as palavras "fundamental"/"médio".
                const isFundamental = level === 'Ensino Fundamental';
                const gradeLevelOf = (grade: string): 'F' | 'M' => {
                  const g = (grade || '').toLowerCase();
                  const fundamental = /(6|7|8|9)º|fundamental/.test(g);
                  const medio = /(1|2|3)ª|\b(1|2|3)a\b|s[eé]rie|m[eé]dio|ensino médio/.test(g);
                  if (fundamental && !medio) return 'F';
                  if (medio && !fundamental) return 'M';
                  // Ambíguo ou sem marcador: usa o texto bonito do nome.
                  return /\d?\s*(ano|fase)\b|fundamental/.test(g) ? 'F' : 'M';
                };
                const levelClasses = classes.filter((c: any) => gradeLevelOf(c.grade || c.name) === (isFundamental ? 'F' : 'M'));
                if (levelClasses.length === 0) return null;
                return (
                  <div key={level}>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#949BA4] mb-2 px-1">{level}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {levelClasses.map((c: any) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedClassId(c.id)}
                          className="bg-[#2b2d31] hover:bg-[#383a40] border border-[#3f4147] hover:border-[#5865F2] rounded-xl p-4 text-left transition-all duration-200 group shadow-lg shadow-black/10"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#5865F2] to-[#8b5cf6] flex items-center justify-center text-sm font-bold text-white group-hover:scale-110 transition-transform shadow-md">
                              {c.name.split(' ').map((w: string) => w[0]).join('').slice(0, 3)}
                            </div>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#5865F2]/15 text-[#949CF7]">
                              {c.studentCount} alunos
                            </span>
                          </div>
                          <p className="text-sm font-bold text-white truncate">{c.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{c.grade}</p>
                          {c.teacherNames?.length > 0 && (
                            <div className="flex items-center gap-1 mt-2.5">
                              <div className="flex -space-x-1.5">
                                {c.teacherNames.slice(0, 3).map((n: string, i: number) => (
                                  <div key={i} className="w-5 h-5 rounded-full bg-[#5865F2] border-2 border-[#2b2d31] flex items-center justify-center text-[7px] font-bold text-white overflow-hidden">
                                    {n.split(' ').map((x: string) => x[0]).join('').slice(0, 2)}
                                  </div>
                                ))}
                              </div>
                              <span className="text-[10px] text-slate-500 truncate">{c.teacherNames.slice(0, 2).join(', ')}</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {classes.length === 0 && (
                <p className="text-center text-slate-500 text-sm py-8">
                  Nenhuma turma encontrada.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
