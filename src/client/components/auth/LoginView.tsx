import React, { useState, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GraduationCap, Lock, User, Landmark, HelpCircle, ArrowRight, AlertTriangle, X, Eye, EyeOff, Check } from 'lucide-react';

type LoginRole = 'student' | 'teacher';

const viceCityArtUrl = new URL('../../../../videoframe_22023-1024x576.webp', import.meta.url).href;

export const LoginView: React.FC = () => {
  const { login } = useAuth();

  const [role, setRole] = useState<LoginRole>('student');
  const [identifier, setIdentifier] = useState('');
  const [digit, setDigit] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Chave que muda a cada novo erro (re-dispara a animação de tremor).
  const [errorKey, setErrorKey] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const identifierRef = useRef<HTMLInputElement>(null);
  const digitRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const selectRole = (r: LoginRole) => {
    setRole(r);
    setIdentifier('');
    setDigit('');
    setPassword('');
    setErrorMsg(null);
    setCapsLock(false);
    setJustLoggedIn(false);
    setWelcomeName('');
    setShowPassword(false);
  };

  // Monta o identifier enviado ao servidor.
  // - Aluno: RA numérico da SED SP -> "NAO_SP" (o servidor normaliza e adiciona
  //   o sufixo SP). Se o usuário já digitar o RA completo (com dígito e SP),
  //   não duplica o dígito.
  // - RA alfanumérico (ex.: contas locais de teste) e e-mail: passa como está.
  const buildIdentifier = (): string => {
    const raw = identifier.trim();
    if (role !== 'student' || !raw) return raw;
    if (raw.includes('@')) return raw.toLowerCase();

    let base = raw.toUpperCase().replace(/\s+/g, '');
    let isNumericRA = /^\d+$/.test(base);
    if (base.endsWith('SP')) {
      const semSP = base.slice(0, -2);
      if (/^\d+$/.test(semSP)) {
        base = semSP;
        isNumericRA = true;
      }
    }
    if (!isNumericRA) return raw;

    const digitOnly = digit.trim().replace(/[^0-9]/g, '');
    if (digitOnly && !base.endsWith(digitOnly)) base += digitOnly;
    return base + 'SP';
  };

  // Campo do RA: aceita letras/números, mas se o aluno colar o RA completo
  // (ex.: "1135791089SP" ou "1135791089"), separa sozinho o dígito verificador.
  const handleIdentifierChange = (raw: string) => {
    setErrorMsg(null);
    if (role !== 'student') {
      setIdentifier(raw);
      return;
    }
    let value = raw.toUpperCase().replace(/\s+/g, '');
    value = value.replace(/^SP/i, ''); // evita colar "SP..." na frente
    const endsWithSP = value.endsWith('SP');
    const digits = (endsWithSP ? value.slice(0, -2) : value).replace(/[^0-9]/g, '');

    // RA colado completo (RA base + dígito, com ou sem "SP"): separa sozinho.
    // Ex.: "1135791089SP" -> campo RA "113579108", caixa dígito "9".
    if (digits.length > 9) {
      const last = digits.slice(-1);
      const rest = digits.slice(0, -1);
      setIdentifier(rest);
      setDigit(last);
    } else if (digits.length === 9 && endsWithSP && digit) {
      // Colou "113579108SP"? Reconstrói com o dígito já digitado.
      setIdentifier(digits);
      requestAnimationFrame(() => digitRef.current?.focus());
    } else {
      setIdentifier(digits);
      if (digits.length !== 9 && !endsWithSP) setDigit('');
    }

    // Avança o foco automaticamente para a caixa do dígito.
    if (digits.length >= 9 || endsWithSP) {
      requestAnimationFrame(() => digitRef.current?.focus());
    }
  };

  const handleDigitChange = (raw: string) => {
    const v = raw.replace(/[^0-9]/g, '').slice(0, 1);
    setDigit(v);
    setErrorMsg(null);
    if (v) requestAnimationFrame(() => passwordRef.current?.focus());
  };

  const handlePasswordKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const caps = typeof e.getModifierState === 'function' && e.getModifierState('CapsLock');
    setCapsLock(!!caps);
  };

  // Mensagens amigáveis e bonitas para os erros mais comuns.
  const friendlyError = (raw: string | null): string => {
    if (!raw) return '';
    const msg = raw.toLowerCase();
    if (msg.includes('senha incorreta') || msg.includes('senha')) return 'Senha incorreta. Confira e tente novamente.';
    if (msg.includes('não encontrado') || msg.includes('não existe')) return 'Não encontramos essa conta. Verifique o RA/CPF digitado.';
    if (msg.includes('bloqueada')) return 'Conta temporariamente bloqueada por muitas tentativas. Aguarde alguns minutos.';
    if (msg.includes('gov.br') || msg.includes('cpf')) return 'Não encontramos esse professor. Use o botão "Entrar com Gov.br".';
    return raw;
  };

  const showError = (raw: string | null) => {
    setErrorMsg(raw);
    setErrorKey((k) => k + 1);
    setShaking(false);
    requestAnimationFrame(() => setShaking(true));
  };

  const handleOpenGovBr = async () => {
    try {
      setErrorMsg(null);
      const response = await fetch('/api/v1/auth/govbr/authorize');
      const data = await response.json();
      if (data.authorizationUrl) {
        window.open(data.authorizationUrl, '_blank', 'noopener,noreferrer');
        showError('Você será autenticado pelo gov.br em uma nova aba. Após concluir, volte aqui.');
      } else {
        showError(data.error || 'Não foi possível gerar o acesso ao gov.br.');
      }
    } catch {
      showError('Erro de conexão ao gerar o acesso ao gov.br.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const identifierFinal = buildIdentifier();
    if (!identifierFinal || !password) {
      if (role === 'student') showError('Informe seu RA, o dígito e a senha para acessar.');
      else showError('Informe seu CPF ou matrícula e senha para acessar.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setLoadingMsg(role === 'teacher' ? 'Verificando credenciais do professor...' : 'Verificando credenciais...');

    let loadingSteps: { msg: string; delay: number }[];
    if (role === 'teacher') {
      loadingSteps = [
        { msg: 'Acessando Sala do Futuro...', delay: 1500 },
        { msg: 'Autenticando CPF do professor...', delay: 3000 },
        { msg: 'Buscando dados na base SED SP...', delay: 4500 },
      ];
    } else {
      loadingSteps = [
        { msg: 'Acessando Sala do Futuro SED SP...', delay: 2000 },
        { msg: 'Gerando token de autenticação...', delay: 4000 },
        { msg: 'Buscando dados do aluno na base SED SP...', delay: 6000 },
      ];
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    let stepIdx = 0;

    const advanceStep = () => {
      if (stepIdx < loadingSteps.length) {
        setLoadingMsg(loadingSteps[stepIdx].msg);
        stepIdx++;
      }
    };

    loadingSteps.forEach((step, i) => {
      timers.push(setTimeout(advanceStep, step.delay));
    });

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifierFinal, password, role }),
      });

      timers.forEach(clearTimeout);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao autenticar.');
      }

      const loggedUserName = data.user?.name || (role === 'teacher' ? 'Professor' : 'Aluno');
      setWelcomeName(loggedUserName);
      setLoadingMsg(`Bem-vindo(a), ${loggedUserName}, em Vice City.`);
      setJustLoggedIn(true);
      await new Promise(r => setTimeout(r, role === 'student' ? 10000 : 650));
      login(data.token, data.user);
    } catch (err: any) {
      timers.forEach(clearTimeout);
      setJustLoggedIn(false);
      showError(friendlyError(err.message || 'Erro de conexão com o servidor.'));
    } finally {
      setIsLoading(false);
      setLoadingMsg('');
    }
  };

  const formHint = useMemo(
    () =>
      role === 'student'
        ? 'Informe o RA fornecido pela secretaria, com o dígito verificador e a senha da Sala do Futuro (SED SP).'
        : 'Informe o CPF/matrícula e a senha do gov.br / SED SP.',
    [role]
  );

  const raPreview = useMemo(() => {
    if (role !== 'student') return null;
    const base = buildIdentifier();
    return base;
  }, [identifier, digit, role]);

  return (
    <div className="sunset-shell relative min-h-screen w-full overflow-hidden text-[#fff2d4] flex flex-col">
      {/* Fundo com blobs suaves (igual ao Discord) */}
      <div className="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-[#ff4f70] opacity-[0.2] blur-[90px]" />
        <div className="absolute top-1/4 -right-20 h-80 w-80 rounded-full bg-[#35d8e8] opacity-[0.12] blur-[100px]" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-[#6c4cff] opacity-[0.12] blur-[110px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
      {/* Topo mínimo */}
      <header className="border-b border-[#fff2d4]/10 bg-[#101326]/75 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="sunset-coral-glow w-8 h-8 rounded-[11px] bg-[#ff4f70] flex items-center justify-center">
              <GraduationCap className="text-[#101326]" style={{ width: 18, height: 18 }} />
            </div>
            <span className="sunset-display text-sm font-semibold text-[#fff2d4]">Escola Online</span>
          </div>
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-1 text-sm text-[#35d8e8] hover:text-[#fff2d4] transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            Ajuda
          </button>
        </div>
      </header>

      {/* Card de login centralizado */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div
          onAnimationEnd={() => setShaking(false)}
          className={`login-card-in w-full max-w-md bg-[#313338] rounded-lg shadow-xl shadow-black/40 px-7 py-8 sm:px-9 transition-shadow ${
            shaking ? 'login-shake' : ''
          } ${errorMsg ? 'ring-2 ring-[#ED4245]/40' : ''}`}
        >
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#5865F2] shadow-lg shadow-[#5865F2]/25">
              <GraduationCap className="text-white" style={{ width: 26, height: 26 }} />
            </div>
            <h2 className="sunset-display text-2xl font-bold text-[#fff2d4]">
              {justLoggedIn ? `Bem-vindo(a), ${welcomeName}` : 'Bem-vindo de volta!'}
            </h2>
            <p className="text-sm text-[#35d8e8] mt-1.5">
              {justLoggedIn ? 'Você está em Vice City.' : 'Estamos muito animados em te ver novamente!'}
            </p>
          </div>

          {/* Seletor Aluno/Professor */}
          <div className="grid grid-cols-2 gap-1 bg-[#1e1f22] rounded-md p-1">
            <button
              type="button"
              onClick={() => selectRole('student')}
              className={`py-2 rounded text-sm font-medium transition-colors ${
                role === 'student' ? 'bg-[#5865F2] text-white' : 'text-[#b5bac1] hover:text-white'
              }`}
            >
              Aluno
            </button>
            <button
              type="button"
              onClick={() => selectRole('teacher')}
              className={`py-2 rounded text-sm font-medium transition-colors ${
                role === 'teacher' ? 'bg-[#5865F2] text-white' : 'text-[#b5bac1] hover:text-white'
              }`}
            >
              Professor
            </button>
          </div>

          {errorMsg && (
            <div
              key={errorKey}
              className="login-error-in mt-4 flex items-start gap-3 rounded-lg border border-[#ED4245]/30 bg-[#ED4245]/10 p-3"
            >
              <div className="mt-px flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#ED4245] text-white">
                <AlertTriangle className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#ff7d7d]">Não foi possível entrar</p>
                <p className="text-xs text-[#f09898] mt-0.5 leading-relaxed">{errorMsg}</p>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                aria-label="Fechar aviso"
                className="flex-shrink-0 text-[#f09898] hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-[#b5bac1] mb-2">
                {role === 'teacher' ? 'CPF ou matrícula' : 'RA e dígito'}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#6d6f78]">
                    {role === 'teacher' ? <Landmark className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <input
                    type="text"
                    ref={identifierRef}
                    value={identifier}
                    onChange={(e) => handleIdentifierChange(e.target.value)}
                    placeholder={role === 'teacher' ? 'Digite seu CPF ou matrícula' : 'Digite seu RA'}
                    required
                    inputMode={role === 'student' ? 'numeric' : undefined}
                    autoComplete="off"
                    className="w-full pl-10 pr-3 py-2.5 bg-[#1e1f22] border-transparent focus:border-[#5865F2] rounded text-sm text-[#f2f3f5] placeholder-[#6d6f78] focus:outline-none transition-all focus:ring-2 focus:ring-[#5865F2]/30"
                  />
                </div>
                {role === 'student' && (
                  <>
                    <div className="flex items-center gap-1.5 select-none">
                      <span className="text-lg leading-none text-[#b5bac1] font-semibold">-</span>
                      <div className="relative">
                        <input
                          ref={digitRef}
                          type="text"
                          value={digit}
                          onChange={(e) => handleDigitChange(e.target.value)}
                          aria-label="Dígito verificador do RA"
                          inputMode="numeric"
                          maxLength={1}
                          autoComplete="off"
                          className={`w-12 h-[42px] bg-[#1e1f22] border rounded-lg text-center text-xl font-bold transition-all focus:outline-none ${
                            digit
                              ? 'border-[#5865F2] text-white focus:ring-2 focus:ring-[#5865F2]/40'
                              : 'border-dashed border-[#3f4147] text-[#f2f3f5] focus:border-[#5865F2] focus:ring-2 focus:ring-[#5865F2]/40'
                          }`}
                        />
                        {!digit && (
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-[#4e5058]">
                            ?
                          </span>
                        )}
                      </div>
                      <div className="flex h-[42px] items-center rounded-lg bg-[#2b2d31] px-2.5 border border-transparent">
                        <span className="text-xs font-bold tracking-[0.2em] text-[#9499a2]">SP</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {role === 'student' && identifier && (
                <p className="mt-2 text-xs font-medium text-[#00AFF4] font-mono tracking-wide">
                  {raPreview}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-[#b5bac1] mb-2">
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#6d6f78]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
                  onKeyUp={handlePasswordKeyUp}
                  placeholder="Digite sua senha"
                  required
                  className={`w-full pl-10 pr-11 py-2.5 bg-[#1e1f22] border rounded text-sm text-[#f2f3f5] placeholder-[#6d6f78] transition-all focus:outline-none ${
                    errorMsg
                      ? 'border-[#ED4245] focus:border-[#ED4245]'
                      : 'border-transparent focus:border-[#5865F2] focus:ring-2 focus:ring-[#5865F2]/30'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#6d6f78] hover:text-[#b5bac1] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {capsLock && (
                <p className="mt-1.5 text-xs font-medium text-[#EDA64A] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  Caps Lock está ativado — a senha diferencia maiúsculas de minúsculas.
                </p>
              )}
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-xs text-[#00AFF4] hover:underline"
                >
                  Esqueceu sua senha?
                </button>
              </div>
            </div>

            <p className="text-xs text-[#b5bac1]">{formHint}</p>

            <button
              type="submit"
              disabled={isLoading || justLoggedIn}
              className="w-full py-2.5 bg-[#5865F2] hover:bg-[#707BFB] text-white text-sm font-medium rounded flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-[#5865F2]/25 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none"
            >
              {justLoggedIn ? (
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  {welcomeName ? `Bem-vindo(a), ${welcomeName}` : 'Bem-vindo(a)!'}
                </span>
              ) : isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {loadingMsg || 'Entrando...'}
                </span>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {role === 'teacher' && (
              <button
                type="button"
                onClick={handleOpenGovBr}
                disabled={isLoading}
                className="w-full py-2.5 bg-[#2b2d31] hover:bg-[#35373c] text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
              >
                Entrar com Gov.br
              </button>
            )}
          </form>
        </div>
      </main>

      {/* Rodapé mínimo */}
      <footer className="border-t border-[#26272b]">
        <div className="max-w-3xl mx-auto px-6 py-3 text-center text-xs text-[#6d6f78]">
          Escola Online © {new Date().getFullYear()}
        </div>
      </footer>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-md rounded-lg bg-[#313338] p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Central de Ajuda</h3>
            <p className="text-sm text-[#b5bac1]">
              {role === 'teacher' ? (
                <>
                  Utilize o seu <strong className="text-white">CPF</strong> e a <strong className="text-white">senha do gov.br</strong> para acessar como professor.
                </>
              ) : (
                <>
                  Utilize o <strong className="text-white">RA (Registro do Aluno)</strong> fornecido pela secretaria da sua escola, junto com o <strong className="text-white">dígito verificador</strong> e a senha da Sala do Futuro SED SP.
                </>
              )}
            </p>
            <button
              onClick={() => setShowHelpModal(false)}
              className="w-full py-2.5 bg-[#5865F2] hover:bg-[#707BFB] text-white text-sm font-medium rounded transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-md rounded-lg bg-[#313338] p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Recuperação de Senha</h3>
            <p className="text-sm text-[#b5bac1]">
              Sua senha é a mesma utilizada na <strong className="text-white">Sala do Futuro SED SP</strong>. Para redefinir, acesse o portal oficial ou procure a secretaria da sua escola.
            </p>
            <button
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2.5 bg-[#5865F2] hover:bg-[#707BFB] text-white text-sm font-medium rounded transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {justLoggedIn && role === 'student' && (
        <div className="vice-city-screen fixed inset-0 z-[100] flex items-center justify-end overflow-hidden text-center">
          <img
            src={viceCityArtUrl}
            alt="Arte de abertura da experiência Vice City"
            className="vice-city-art absolute inset-0 h-full w-full object-cover opacity-35"
          />
          <div className="vice-city-vignette absolute inset-0" />
          <div className="vice-city-scan pointer-events-none absolute inset-y-0 left-0 w-1/3" />
          <div className="pointer-events-none absolute inset-x-0 bottom-[13%] h-32 opacity-80">
            <div className="vice-city-wave absolute inset-x-[-8%] bottom-0 h-24" />
            <div className="vice-city-wave absolute inset-x-[-12%] bottom-8 h-20 opacity-60" />
            <div className="vice-city-wave absolute inset-x-[-16%] bottom-16 h-16 opacity-40" />
          </div>
          <div className="relative z-10 flex w-full max-w-xl flex-col items-center px-6 pb-16 sm:px-8 sm:pb-20">
            <div className="vice-city-copy w-full rounded-[28px] border border-[#fff2d4]/20 bg-[#101326]/62 px-6 py-7 shadow-[0_24px_80px_rgba(5,5,18,.45)] backdrop-blur-md sm:px-10 sm:py-9">
              <p className="sunset-display text-[10px] font-bold tracking-[0.42em] text-[#35d8e8]">Escola Online presents</p>
              <h1 className="sunset-display mt-3 text-4xl font-black tracking-[0.16em] text-[#fff2d4] drop-shadow-[0_5px_20px_rgba(16,19,38,.55)] sm:text-6xl">
                Vice City
              </h1>
              <p className="mt-5 text-base font-medium text-[#fff2d4]/90 sm:text-lg">
                Bem-vindo(a), <span className="font-bold text-white">{welcomeName}</span>
              </p>
              <div className="mt-7 h-px w-full bg-gradient-to-r from-transparent via-[#ff4f70] to-transparent" />
              <p className="mt-4 text-[10px] uppercase tracking-[0.34em] text-[#fff2d4]/60">Sua jornada começa agora</p>
              <div className="mx-auto mt-7 h-1 w-full max-w-xs overflow-hidden rounded-full bg-[#fff2d4]/15">
                <div className="vice-city-progress h-full rounded-full bg-gradient-to-r from-[#ff4f70] via-[#ffb27f] to-[#35d8e8]" />
              </div>
              <p className="mt-3 text-[9px] uppercase tracking-[0.28em] text-[#fff2d4]/40">Preparando sua sala online</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
