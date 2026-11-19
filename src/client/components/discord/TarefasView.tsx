import React, { useEffect, useRef, useState } from 'react';
import { ClipboardList, Loader2, RefreshCcw, TriangleAlert, CheckCircle2, Clock, CalendarDays, User as UserIcon, BookOpen, WifiOff, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface TarefaItem {
  id: string;
  taskId: string;
  subject: string | null;
  title: string;
  description: string | null;
  author: string | null;
  status: string;
  style: string | null;
  publishAt: string | null;
  dueAt: string | null;
  turma: string | null;
}

/** Percentuais de presença/faltas do bimestre, vindos de /api/v1/tarefas. */
interface FrequenciaResumo {
  bimestre: number;
  bimestreAtual: boolean;
  porcentagemPresenca: number;
  porcentagemFaltas: number;
  numeroFaltasBimestre: number;
  totalAulasBimestre: number;
}

/**
 * Tarefas SED SP — lista REAL puxada do servidor.
 *
 * O servidor troca o token do aluno pela sessão da CMSP (que fica atrás de
 * Cloudflare) e sincroniza as tarefas no banco via GET /api/v1/tarefas. Aqui
 * apenas renderizamos o que veio da API, sem depender de iframe/webview.
 */
export const TarefasView: React.FC = () => {
  const { token } = useAuth();
  const [tarefas, setTarefas] = useState<TarefaItem[] | null>(null);
  const [frequencia, setFrequencia] = useState<FrequenciaResumo | null>(null);
  const [sincronizadoEm, setSincronizadoEm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sugerirReLogin, setSugerirReLogin] = useState(false);
  const [offline, setOffline] = useState(false);
  const mountedRef = useRef(true);

  const carregar = async () => {
    if (!token) return;
    setLoading(true);
    setErro(null);
    setOffline(false);
    try {
      // 1) Busca rápida: tarefas do banco (resposta imediata)
      const res = await fetch('/api/v1/tarefas', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.tarefas)) {
        setTarefas(data.tarefas);
        setSincronizadoEm(data.sincronizadoEm || null);
        setOffline(false);
      }
    } catch {
      // continua para o sync mesmo se o cache falhar
    } finally {
      if (mountedRef.current) setLoading(false);
    }

    // 2) Sync em segundo plano com a CMSP (pode demorar ~60s)
    try {
      const res2 = await fetch('/api/v1/tarefas/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data2 = await res2.json().catch(() => ({}));
      if (res2.ok && Array.isArray(data2.tarefas)) {
        setTarefas(data2.tarefas);
        setSincronizadoEm(data2.sincronizadoEm || null);
        setFrequencia(data2.frequencia || null);
        setSugerirReLogin(false);
        setOffline(data2.offline === true);
      } else if (!res2.ok) {
        setSugerirReLogin(data2.code === 'SESSAO_CMSP_INVALIDA' || res2.status === 401);
        // Se não tem tarefas nem do cache, mostra o erro
        setTarefas((atual) => {
          if (!atual || atual.length === 0) {
            setErro(data2.error || 'Não foi possível sincronizar suas tarefas agora.');
          }
          return atual;
        });
      }
    } catch {
      setTarefas((atual) => {
        if (!atual || atual.length === 0) {
          setErro('Falha de conexão com o servidor. Verifique sua internet e tente novamente.');
        }
        return atual;
      });
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    carregar();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatarData = (iso: string | null): string => {
    if (!iso) return 'Não informado';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Não informado';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const estaAtrasada = (t: TarefaItem): boolean => {
    if (t.status === 'finished') return false;
    return !!t.dueAt && new Date(t.dueAt) < new Date();
  };

  /** Converte qualquer valor recebido da API em número seguro para render (JSON não serializa NaN → null). */
  const numero = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#1e1f22]">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#26272b] bg-[#232428]/95 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#5865F2] flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white leading-tight truncate">Tarefas SED SP</h2>
            <p className="text-[11px] text-[#949BA4] leading-tight truncate">
              {tarefas ? `${tarefas.length} tarefa(s) sincronizada(s)` : 'Sala do Futuro · CMSP'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sincronizadoEm && (
            <span className="hidden md:inline-flex text-[11px] text-[#949BA4] bg-[#2b2d31] rounded-full px-2.5 py-1">
              Atualizado {new Date(sincronizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {offline && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#EDA64A] bg-[#EDA64A]/15 rounded-full px-2.5 py-1">
              <WifiOff className="w-3.5 h-3.5" />
              Offline
            </span>
          )}
          <a
            href="https://saladofuturo.educacao.sp.gov.br/tarefas"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3BA55C] hover:bg-[#2d8049] rounded text-xs font-medium text-white transition-colors"
            title="Abrir a Tarefa SP oficial da Sala do Futuro em nova aba"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tarefa SP oficial</span>
            <span className="sm:hidden">Oficial</span>
          </a>
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-50 rounded text-xs font-medium text-white transition-colors"
            title="Sincronizar tarefas com a CMSP"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
        {frequencia && !erro && (() => {
          const presenca = numero(frequencia.porcentagemPresenca);
          const faltas = numero(frequencia.numeroFaltasBimestre);
          const aulas = numero(frequencia.totalAulasBimestre);
          return (
            <div className="bg-[#2b2d31] rounded-lg border border-[#26272b] px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#5865F2]/15 flex items-center justify-center flex-shrink-0">
                  <CalendarDays className="w-4 h-4 text-[#5865F2]" style={{ width: 16, height: 16 }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white leading-tight">
                    Frequência {numero(frequencia.bimestre)}º bimestre
                  </p>
                  <p className="text-[11px] text-[#949BA4] leading-tight">
                    {presenca.toFixed(0)}% de presença
                    {aulas > 0 &&
                      ` · ${faltas} falta(s) em ${aulas} aulas`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {presenca >= 75 ? (
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-[#3BA55C]/15 text-[#3BA55C] flex-shrink-0">
                    Em dia
                  </span>
                ) : presenca >= 60 ? (
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-[#EDA64A]/15 text-[#EDA64A] flex-shrink-0">
                    Atenção
                  </span>
                ) : (
                  <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-[#ED4245]/15 text-[#ED4245] flex-shrink-0">
                    Risco
                  </span>
                )}
              </div>
            </div>
          );
        })()}
        {loading && !tarefas ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="w-7 h-7 text-[#5865F2] animate-spin" />
            <p className="text-sm text-[#949BA4]">Sincronizando suas tarefas com a Sala do Futuro...</p>
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <div className="w-14 h-14 rounded-full bg-[#EDA64A]/15 flex items-center justify-center">
              <TriangleAlert className="w-7 h-7 text-[#EDA64A]" />
            </div>
            <p className="text-sm text-[#dcddde] max-w-md">{erro}</p>
            {sugerirReLogin && (
              <p className="text-xs text-[#949BA4] max-w-md">
                Saia e entre novamente na sua conta (com RA e senha da Sala do Futuro) para renovar o acesso.
              </p>
            )}
            <button
              onClick={carregar}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#5865F2] hover:bg-[#4752c4] rounded text-xs font-medium text-white transition-colors mt-2"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              Tentar novamente
            </button>
          </div>
        ) : tarefas && tarefas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
            <div className="w-14 h-14 rounded-full bg-[#2b2d31] flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-[#3BA55C]" />
            </div>
            <p className="text-sm font-semibold text-white">Nenhuma tarefa sincronizada</p>
            <p className="text-xs text-[#949BA4] max-w-md">
              A sincronização automática com a Tarefa SP pode estar temporariamente indisponível.
              Você pode ver suas tarefas reais a qualquer momento no site oficial da Sala do Futuro.
            </p>
            <a
              href="https://saladofuturo.educacao.sp.gov.br/tarefas"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 bg-[#3BA55C] hover:bg-[#2d8049] rounded text-xs font-medium text-white transition-colors mt-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Abrir Tarefa SP oficial
            </a>
            <button
              onClick={carregar}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2b2d31] hover:bg-[#35373c] disabled:opacity-50 rounded text-xs font-medium text-white transition-colors mt-1"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Verificar novamente
            </button>
          </div>
        ) : (
          tarefas?.map((t) => {
            const atrasada = estaAtrasada(t);
            return (
              <div
                key={t.id}
                className={`bg-[#2b2d31] rounded-lg border border-[#26272b] p-4 hover:bg-[#313338] transition-colors ${
                  atrasada ? 'border-[#ED4245]/40' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      t.status === 'finished'
                        ? 'bg-[#3BA55C]/15 text-[#3BA55C]'
                        : atrasada
                          ? 'bg-[#ED4245]/15 text-[#ED4245]'
                          : 'bg-[#5865F2]/15 text-[#5865F2]'
                    }`}
                  >
                    {t.status === 'finished' ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <BookOpen className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-white truncate">{t.title}</h3>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ${
                          t.status === 'finished'
                            ? 'bg-[#3BA55C]/15 text-[#3BA55C]'
                            : atrasada
                              ? 'bg-[#ED4245]/15 text-[#ED4245]'
                              : 'bg-[#5865F2]/15 text-[#5865F2]'
                        }`}
                      >
                        {t.status === 'finished' ? 'Concluída' : atrasada ? 'Atrasada' : 'Pendente'}
                      </span>
                    </div>

                    {t.description && (
                      <p className="text-xs text-[#949BA4] mt-0.5 line-clamp-2">{t.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-[#949BA4]">
                      {t.subject && (
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5" />
                          {t.subject}
                        </span>
                      )}
                      {t.author && (
                        <span className="flex items-center gap-1">
                          <UserIcon className="w-3.5 h-3.5" />
                          {t.author}
                        </span>
                      )}
                      {t.dueAt && (
                        <span className={`flex items-center gap-1 ${atrasada ? 'text-[#ED4245]' : ''}`}>
                          {atrasada ? <TriangleAlert className="w-3.5 h-3.5" /> : <CalendarDays className="w-3.5 h-3.5" />}
                          Entrega: {formatarData(t.dueAt)}
                        </span>
                      )}
                      {t.publishAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Publicada em {formatarData(t.publishAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Rodapé */}
      <div className="flex items-center gap-2 px-5 py-2 border-t border-[#26272b] bg-[#232428] flex-shrink-0">
        <TriangleAlert className="w-3.5 h-3.5 text-[#EDA64A] flex-shrink-0" />
        <p className="text-[11px] text-[#949BA4]">
          Lista sincronizada com a Sala do Futuro (CMSP/SED SP). As tarefas podem levar alguns
          instantes para aparecer depois de publicadas pelo professor.
        </p>
      </div>
    </div>
  );
};