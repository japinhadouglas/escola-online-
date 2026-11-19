import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CalendarCheck, Loader2, RefreshCcw, ExternalLink, ShieldAlert, CheckCircle2, TrendingDown, Activity, CalendarDays } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface FrequenciaOficial {
  bimestre: number;
  bimestreAtual: boolean;
  porcentagemPresenca: number;
  porcentagemFaltas: number;
  numeroFaltasBimestre: number;
  totalAulasBimestre: number;
  sincronizadoEm?: string;
}

/**
 * Presença — faltas oficiais da Sala do Futuro (SED SP).
 *
 * Mostra as porcentagens oficiais de presença/faltas quando há sincronização
 * disponível e sempre oferece o atalho para a tela de Presença oficial,
 * onde a SED registra as faltas reais da escola.
 */
export const PresencaView: React.FC = () => {
  const { token } = useAuth();
  const [oficial, setOficial] = useState<FrequenciaOficial | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const carregar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch('/api/v1/presenca', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error || 'Erro ao carregar sua presença.');
        return;
      }
      setOficial(data.oficial || null);
    } catch {
      setErro('Falha de conexão com o servidor.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    mountedRef.current = true;
    carregar();
    return () => { mountedRef.current = false; };
  }, [carregar]);

  const numero = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const corPresenca = oficial
    ? numero(oficial.porcentagemPresenca) >= 75
      ? { texto: 'text-[#3BA55C]', fundo: 'bg-[#3BA55C]/15', label: 'Em dia' }
      : numero(oficial.porcentagemPresenca) >= 60
        ? { texto: 'text-[#EDA64A]', fundo: 'bg-[#EDA64A]/15', label: 'Atenção' }
        : { texto: 'text-[#ED4245]', fundo: 'bg-[#ED4245]/15', label: 'Risco' }
    : null;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#1e1f22]">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#26272b] bg-[#232428]/95 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#3BA55C] flex items-center justify-center flex-shrink-0">
            <CalendarCheck className="text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white leading-tight truncate">Presença e Faltas</h2>
            <p className="text-[11px] text-[#949BA4] leading-tight truncate">
              Faltas oficiais da Sala do Futuro (SED SP)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-50 rounded text-xs font-medium text-white transition-colors"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="w-7 h-7 text-[#5865F2] animate-spin" />
            <p className="text-sm text-[#949BA4]">Carregando sua presença...</p>
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <p className="text-sm text-[#dcddde]">{erro}</p>
            <button onClick={carregar} className="px-4 py-2 bg-[#5865F2] hover:bg-[#4752c4] rounded text-xs font-medium text-white">
              Tentar novamente
            </button>
          </div>
        ) : oficial && corPresenca ? (
          <>
            {/* Cards com os dados OFICIAIS da SED */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-[#2b2d31] rounded-xl border border-[#26272b] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-[#3BA55C]" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#949BA4]">Presença</p>
                </div>
                <p className={`text-3xl font-extrabold ${corPresenca.texto}`}>
                  {numero(oficial.porcentagemPresenca)}%
                </p>
                <span className={`inline-block mt-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${corPresenca.fundo} ${corPresenca.texto}`}>
                  {corPresenca.label}
                </span>
              </div>

              <div className="bg-[#2b2d31] rounded-xl border border-[#26272b] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="w-4 h-4 text-[#ED4245]" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#949BA4]">Faltas</p>
                </div>
                <p className="text-3xl font-extrabold text-[#ED4245]">{numero(oficial.porcentagemFaltas)}%</p>
                <span className="inline-block mt-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#ED4245]/15 text-[#ED4245]">
                  {numero(oficial.numeroFaltasBimestre)} falta(s)
                </span>
              </div>

              <div className="bg-[#2b2d31] rounded-xl border border-[#26272b] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays className="w-4 h-4 text-[#5865F2]" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#949BA4]">Bimestre</p>
                </div>
                <p className="text-3xl font-extrabold text-white">{numero(oficial.bimestre)}º</p>
                <span className="inline-block mt-2 text-[10px] text-[#949BA4]">
                  {oficial.bimestreAtual ? 'bimestre atual' : ''}
                </span>
              </div>

              <div className="bg-[#2b2d31] rounded-xl border border-[#26272b] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-[#5865F2]" />
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#949BA4]">Aulas no bimestre</p>
                </div>
                <p className="text-3xl font-extrabold text-white">{numero(oficial.totalAulasBimestre)}</p>
                <span className="inline-block mt-2 text-[10px] text-[#949BA4]">aulas registradas</span>
              </div>
            </div>

            <a
              href="https://saladofuturo.educacao.sp.gov.br/presenca"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#3BA55C] hover:bg-[#2d8049] rounded-lg text-sm font-bold text-white transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Ver detalhes das faltas na Sala do Futuro
            </a>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 py-14 text-center px-6">
            {/* Sem sincronização disponível — explica e leva para a oficial */}
            <div className="w-16 h-16 rounded-full bg-[#5865F2]/15 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-[#5865F2]" />
            </div>
            <div className="max-w-md space-y-2">
              <h3 className="text-base font-bold text-white">Suas faltas reais estão na Sala do Futuro</h3>
              <p className="text-xs text-[#949BA4] leading-relaxed">
                A SED SP registra suas faltas oficiais na plataforma Sala do Futuro. Por
                segurança, esses dados só podem ser lidos diretamente por você, no seu
                navegador. Clique no botão abaixo para ver suas faltas, a porcentagem de
                presença e o histórico completo do bimestre.
              </p>
            </div>
            <a
              href="https://saladofuturo.educacao.sp.gov.br/presenca"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-8 py-3.5 bg-[#3BA55C] hover:bg-[#2d8049] rounded-lg text-sm font-bold text-white transition-colors shadow-lg shadow-[#3BA55C]/20"
            >
              <ExternalLink className="w-5 h-5" />
              Ver minhas faltas oficiais
            </a>
            <p className="text-[10px] text-[#949BA4]">
              Abre a tela de Presença da Sala do Futuro (SED SP) em nova aba
            </p>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="flex items-center gap-2 px-5 py-2 border-t border-[#26272b] bg-[#232428] flex-shrink-0">
        <span className="text-[10px] text-[#949BA4]">
          Frequência oficial registrada pela sua escola · Sala do Futuro (SED SP)
        </span>
      </div>
    </div>
  );
};
