import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BookOpen, Loader2, RefreshCcw, ExternalLink, Video, FileText, Library, GraduationCap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Materia {
  nome: string;
  turma: string;
}

interface ArquivoConteudo {
  arquivoId: number;
  descricao: string;
  tipoArquivo: string;
  link: string;
  duracao: number | null;
}

interface ConteudoSed {
  id: number;
  titulo: string;
  observacao: string | null;
  subcategoria: string;
  arquivos: ArquivoConteudo[];
}

/**
 * Materiais — apostilas por matéria + conteúdos digitais da conta SED SP.
 *
 * Cada matéria do aluno tem atalho para a apostila oficial (Materiais Digitais
 * da Sala do Futuro, abertos no navegador do próprio aluno), e os conteúdos
 * digitais da conta SED (vídeos/arquivos) são listados direto do site.
 */
export const MateriaisView: React.FC = () => {
  const { token } = useAuth();
  const [materias, setMaterias] = useState<Materia[] | null>(null);
  const [conteudos, setConteudos] = useState<ConteudoSed[]>([]);
  const [sessaoSedValida, setSessaoSedValida] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const carregar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch('/api/v1/materiais', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error || 'Erro ao carregar materiais.');
        return;
      }
      setMaterias(Array.isArray(data.materias) ? data.materias : []);
      setConteudos(Array.isArray(data.conteudos) ? data.conteudos : []);
      setSessaoSedValida(data.sessaoSedValida === true);
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

  const formatarDuracao = (dur: number | null): string => {
    if (!dur || dur <= 0) return '';
    const min = Math.floor(dur / 60);
    const seg = Math.floor(dur % 60);
    return `${min}:${String(seg).padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#1e1f22]">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#26272b] bg-[#232428]/95 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#FAA61A] flex items-center justify-center flex-shrink-0">
            <BookOpen className="text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white leading-tight truncate">Apostilas e Materiais</h2>
            <p className="text-[11px] text-[#949BA4] leading-tight truncate">
              {materias ? `${materias.length} matéria(s)` : 'Por matéria'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href="https://saladofuturo.educacao.sp.gov.br/plataformas"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3BA55C] hover:bg-[#2d8049] rounded text-xs font-medium text-white transition-colors"
            title="Abrir os Materiais Digitais oficiais da Sala do Futuro"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Oficial</span>
          </a>
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
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
        {loading && !materias ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="w-7 h-7 text-[#5865F2] animate-spin" />
            <p className="text-sm text-[#949BA4]">Carregando seus materiais...</p>
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
            <p className="text-sm text-[#dcddde]">{erro}</p>
            <button onClick={carregar} className="px-4 py-2 bg-[#5865F2] hover:bg-[#4752c4] rounded text-xs font-medium text-white">
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            {/* ===== MINHAS MATÉRIAS ===== */}
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#949BA4] mb-2 px-1 flex items-center gap-1.5">
                <Library className="w-3.5 h-3.5" /> Minhas matérias
              </h3>
              {materias && materias.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {materias.map((m) => (
                    <div
                      key={m.nome}
                      className="bg-[#2b2d31] border border-[#3f4147] rounded-xl p-4 hover:border-[#5865F2]/60 transition-all duration-200 shadow-lg shadow-black/10"
                    >
                      <div className="flex items-start justify-between mb-2.5">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FAA61A] to-[#f57d00] flex items-center justify-center text-sm font-bold text-white shadow-md">
                          {m.nome.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <GraduationCap className="w-4 h-4 text-[#949BA4]" />
                      </div>
                      <p className="text-sm font-bold text-white truncate">{m.nome}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{m.turma}</p>
                      <a
                        href="https://saladofuturo.educacao.sp.gov.br/plataformas"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 bg-[#5865F2]/15 hover:bg-[#5865F2] text-[#949CF7] hover:text-white rounded-lg text-[11px] font-bold transition-colors"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Abrir apostila oficial
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#949BA4] px-1">Nenhuma matéria encontrada. Entre com seu RA da SED SP para sincronizar.</p>
              )}
              <p className="text-[10px] text-[#949BA4] mt-2 px-1 leading-relaxed">
                A apostila interativa de cada matéria fica na plataforma Materiais Digitais da Sala do Futuro —
                o botão abre direto no seu navegador, já com sua conta.
              </p>
            </section>

            {/* ===== CONTEÚDOS DA SED ===== */}
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#949BA4] mb-2 px-1 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" /> Conteúdos da SED SP
              </h3>
              {conteudos.length > 0 ? (
                <div className="space-y-3">
                  {conteudos.map((c) => (
                    <div key={c.id} className="bg-[#2b2d31] border border-[#3f4147] rounded-xl p-4">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-bold text-white truncate">{c.titulo}</p>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FAA61A]/15 text-[#FAA61A] flex-shrink-0">
                          {c.subcategoria}
                        </span>
                      </div>
                      {c.observacao && <p className="text-[11px] text-slate-400 mb-2">{c.observacao}</p>}
                      <div className="flex flex-wrap gap-2">
                        {c.arquivos.map((a) => (
                          <a
                            key={a.arquivoId}
                            href={a.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5865F2]/15 hover:bg-[#5865F2] text-[#949CF7] hover:text-white rounded-lg text-[11px] font-semibold transition-colors"
                          >
                            {a.tipoArquivo === 'Vídeo' ? <Video className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                            <span className="truncate max-w-[160px]">{a.descricao}</span>
                            {a.duracao ? <span className="opacity-60">{formatarDuracao(a.duracao)}</span> : null}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-[#2b2d31] border border-[#3f4147] rounded-xl p-4 text-center">
                  <p className="text-xs text-[#949BA4]">
                    {sessaoSedValida
                      ? 'Nenhum conteúdo publicado pela SED no momento.'
                      : 'Entre novamente com seu RA da SED SP para carregar os conteúdos da sua conta (vídeos e dicas).'}
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Rodapé */}
      <div className="flex items-center gap-2 px-5 py-2 border-t border-[#26272b] bg-[#232428] flex-shrink-0">
        <span className="text-[10px] text-[#949BA4]">
          Apostilas oficiais: Sala do Futuro (SED SP) · Conteúdos sincronizados da sua conta
        </span>
      </div>
    </div>
  );
};
