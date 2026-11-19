import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Coffee, Loader2, GraduationCap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Aula {
  id: string;
  startTime: string;
  endTime: string;
  subject: string;
  subjectId: number;
  isRecess: boolean;
}

interface DiaGrade {
  key: string;
  label: string;
  value: number;
  itens: Aula[];
}

interface Props {
  classId: string;
  className?: string;
}

const DIAS_ORDEM = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

export const ClassTimetable: React.FC<Props> = ({ classId, className }) => {
  const { token } = useAuth();
  const [days, setDays] = useState<DiaGrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');
    fetch(`/api/v1/classes/${classId}/timetable`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar a grade');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        let dias = Array.isArray(data.days) ? data.days : [];
        dias = [...dias].sort((a, b) => DIAS_ORDEM.indexOf(a.key) - DIAS_ORDEM.indexOf(b.key));
        setDays(dias);
        setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível carregar a grade horária.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [classId, token]);

  const temAula = days.some((d) => d.itens.some((i) => !i.isRecess));

  return (
    <div className="flex-1 overflow-y-auto px-3 md:px-5 py-4">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-[#5865F2]" />
          Horário de Aulas
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {className ? `${className} — ` : ''}grade sincronizada com a Sala do Futuro
          {lastSync ? ` · atualizado às ${lastSync}` : ''}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-slate-500 text-xs">
          <Loader2 className="w-4 h-4 animate-spin mr-2 text-[#5865F2]" />
          Carregando grade horária...
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-48 text-center py-12 text-slate-500">
          <Calendar className="w-12 h-12 text-[#404249] mb-3" />
          <p className="text-sm text-red-400">{error}</p>
          <p className="text-xs text-slate-600 mt-1">
            Entre com seu RA de aluno real para sincronizar a grade automática.
          </p>
        </div>
      ) : !temAula ? (
        <div className="flex flex-col items-center justify-center h-48 text-center py-12 text-slate-500">
          <Calendar className="w-12 h-12 text-[#404249] mb-3" />
          <p className="text-sm font-bold text-white">Nenhuma aula encontrada ainda</p>
          <p className="text-xs text-slate-500 mt-1">
            A grade é buscada automaticamente na Sala do Futuro quando um aluno da turma faz login.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
          {days.map((dia) => {
            const aulas = dia.itens.filter((i) => !i.isRecess);
            const recesso = dia.itens.filter((i) => i.isRecess);
            return (
              <div
                key={dia.key}
                className={`rounded-xl border p-3 flex flex-col min-h-[140px] transition-colors ${
                  aulas.length > 0 ? 'bg-[#2b2d31] border-[#3f4147]' : 'bg-[#26282c]/60 border-[#2f3136] opacity-70'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#949BA4]">
                    {dia.label}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#5865F2]/15 text-[#949CF7]">
                    {aulas.length} {aulas.length === 1 ? 'aula' : 'aulas'}
                  </span>
                </div>

                {aulas.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-[11px] text-slate-600">
                    Sem aula
                  </div>
                ) : (
                  <div className="space-y-1.5 flex-1">
                    {aulas.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg px-2 py-1.5 bg-[#383a40] border-l-[3px] border-[#5865F2] hover:bg-[#404249] transition-colors"
                      >
                        <p className="text-[12px] font-semibold text-white leading-tight capitalize">
                          {a.subject.toLowerCase()}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {a.startTime} – {a.endTime}
                        </p>
                      </div>
                    ))}
                    {recesso.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-lg px-2 py-1 bg-[#2f3136] border border-dashed border-[#3f4147] text-slate-500"
                        title={`Intervalo ${r.startTime} – ${r.endTime}`}
                      >
                        <p className="text-[11px] flex items-center gap-1">
                          <Coffee className="w-3 h-3" />
                          Intervalo · {r.startTime} – {r.endTime}
                        </p>
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
  );
};
