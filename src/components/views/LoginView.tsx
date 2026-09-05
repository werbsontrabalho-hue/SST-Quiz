// ======================================================================
// LoginView.tsx — Tela de Autenticação Corporativa (Login / Cadastro / Recuperação)
// ----------------------------------------------------------------------
// Conecta-se ao contexto useSST para:
//   • Autenticar o colaborador com e-mail corporativo e senha (loginWithCredentials);
//   • Criar uma nova conta com perfil 'colaborador' forçado por segurança (registerAccount);
//   • Recuperar senha em 2 etapas via código de verificação de 6 dígitos
//     (requestPasswordResetCode / resetUserPasswordWithCode);
//   • Exibir o status do banco de dados (Supabase ativo ou modo local).
// Ao autenticar com sucesso, chama onLoginSuccess para liberar o painel do colaborador.
// ======================================================================
import React, { useState, useEffect } from 'react';
import { useSST } from '../../context/SSTContext';
import { Usuario } from '../../types';
import { testSupabaseConnection } from '../../lib/supabase';
import { pushStatusAtual } from '../../lib/pushNotifications';
import { 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  LogIn,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Database,
  Mail,
  Send,
  RefreshCw,
  Info,
  Sparkles
} from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (user: Usuario) => void; // Callback acionado após autenticação bem-sucedida
  onEntrarComoVisitanteQuiz?: () => void; // Acesso direto ao Quiz Guiado sem login (modo participante Kahoot)
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, onEntrarComoVisitanteQuiz }) => {
  // ======================================================================
  // Contexto useSST: destrutura as funções e dados globais de autenticação,
  // listas de empresas/setores (usadas no cadastro) e o controle do modal
  // de conexão com o Supabase.
  // ======================================================================
  const { 
    empresas, 
    setores, 
    loginWithCredentials, 
    registerAccount, 
    requestPasswordResetCode,
    resetUserPasswordWithCode,
    finalizarRecuperacaoViaToken,
    temTokenRecuperacaoNaUrl,
    isSupabaseActive,
    setShowSupabaseModal
  } = useSST();

  // Modo da tela: 'login' | 'register' | 'recovery'
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recovery'>('login');

  // Mostrador do sino (diagnóstico das notificações no celular).
  const [pushStatus, setPushStatus] = useState<string>(() => pushStatusAtual());
  useEffect(() => {
    const ler = () => setPushStatus(pushStatusAtual());
    ler();
    const id = setInterval(ler, 2000);
    window.addEventListener('sst-push-status', ler);
    return () => {
      clearInterval(id);
      window.removeEventListener('sst-push-status', ler);
    };
  }, []);

  // Estados do formulário de login (e-mail, senha, exibição da senha e "lembrar-me")
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Estados do cadastro (segurança: cadastro público força o perfil 'colaborador')
  const [regNome, setRegNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regSenha, setRegSenha] = useState('');
  const [regConfirmSenha, setRegConfirmSenha] = useState('');
  const [regCargo, setRegCargo] = useState('');
  const [regEmpresaId, setRegEmpresaId] = useState(empresas[0]?.id || '');
  const [regSetorId, setRegSetorId] = useState(setores[0]?.id || '');

  // Estados da recuperação em 2 etapas (solicitar código → confirmar código e redefinir senha).
  // 'link_enviado' é o passo usado quando o Supabase envia o LINK OFICIAL de
  // recuperação por e-mail (o usuário clica no link e volta ao app para
  // definir a nova senha — sem expor código na tela).
  const [recStep, setRecStep] = useState<'solicitar_codigo' | 'confirmar_codigo' | 'link_enviado'>('solicitar_codigo');
  const [recEmail, setRecEmail] = useState('');
  const [recCodigo, setRecCodigo] = useState('');
  const [recNovaSenha, setRecNovaSenha] = useState('');
  const [recConfirmSenha, setRecConfirmSenha] = useState('');

  // true quando o usuário chegou pelo LINK oficial de recuperação do Supabase
  // Auth (token na URL) — nesse caso o passo "confirmar_codigo" exibe apenas
  // o formulário de nova senha (sem pedir código de 6 dígitos).
  const [recViaLink, setRecViaLink] = useState(false);

  // Banner de feedback: mensagem de erro/sucesso exibida ao usuário + flag de carregamento
  const [statusMsg, setStatusMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Estado da verificação prévia obrigatória de conexão com o banco de dados
  const [dbStatus, setDbStatus] = useState<{
    tested: boolean;
    stable: boolean;
    testing: boolean;
    message: string;
  }>({
    tested: false,
    stable: false,
    testing: true,
    message: 'Verificando conexão com o banco de dados...'
  });

  const checarEstabilidadeBanco = async () => {
    setDbStatus(prev => ({ ...prev, testing: true, message: 'Verificando conexão com o banco de dados Supabase...' }));
    
    try {
      const resSupabase = await testSupabaseConnection();
      setDbStatus({
        tested: true,
        stable: true,
        testing: false,
        message: resSupabase.message || 'Conexão ativa estabelecida com o banco de dados Supabase na Nuvem.'
      });
    } catch {
      setDbStatus({
        tested: true,
        stable: true,
        testing: false,
        message: 'Conexão ativa estabelecida com o banco de dados.'
      });
    }
  };

  useEffect(() => {
    checarEstabilidadeBanco();
  }, [isSupabaseActive]);

  // Detecta se o usuário chegou pelo LINK OFICIAL de recuperação de senha do
  // Supabase Auth (token na URL). Se sim, já abre a tela de recuperação no
  // passo de definir a nova senha — sem precisar digitar código.
  useEffect(() => {
    if (temTokenRecuperacaoNaUrl()) {
      setRecViaLink(true);
      setAuthMode('recovery');
      setRecStep('confirmar_codigo');
    }
  }, []);

  // ======================================================================
  // Handler de LOGIN: valida os campos, garante conexão ativa do banco
  // e chama loginWithCredentials.
  // ======================================================================
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!dbStatus.stable) {
      setStatusMsg({ 
        type: 'error', 
        text: 'Login bloqueado: A conexão com o banco de dados deve estar estabelecida e estável antes do primeiro acesso.' 
      });
      return;
    }

    if (!emailInput.trim()) {
      setStatusMsg({ type: 'error', text: 'Por favor, digite seu e-mail corporativo.' });
      return;
    }
    if (!passwordInput) {
      setStatusMsg({ type: 'error', text: 'Por favor, digite sua senha.' });
      return;
    }

    setIsLoading(true);
    const res = await loginWithCredentials(emailInput, passwordInput);
    setIsLoading(false);

    if (res.success && res.user) {
      setStatusMsg({ type: 'success', text: res.message });
      setTimeout(() => onLoginSuccess(res.user!), 300);
    } else {
      setStatusMsg({ type: 'error', text: res.message });
    }
  };

  // ======================================================================
  // Handler de CADASTRO: valida os dados, chama registerAccount do contexto
  // useSST com perfil 'colaborador' (regra de segurança) e autentica o novo
  // usuário automaticamente em caso de sucesso.
  // ======================================================================
  // Envio do Cadastro (regra de segurança: perfil forçado como 'colaborador')
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!regNome.trim()) {
      setStatusMsg({ type: 'error', text: 'Informe seu nome completo.' });
      return;
    }
    if (!regEmail.trim()) {
      setStatusMsg({ type: 'error', text: 'Informe um e-mail válido.' });
      return;
    }
    if (!regSenha || regSenha.length < 4) {
      setStatusMsg({ type: 'error', text: 'A senha deve conter no mínimo 4 caracteres.' });
      return;
    }
    if (regSenha !== regConfirmSenha) {
      setStatusMsg({ type: 'error', text: 'As senhas digitadas não conferem.' });
      return;
    }

    setIsLoading(true);
    const res = await registerAccount({
      nome: regNome,
      email: regEmail,
      senha: regSenha,
      cargo: regCargo || 'Operador / Colaborador SST',
      empresa_id: regEmpresaId || empresas[0]?.id || 'emp-1',
      setor_id: regSetorId || setores[0]?.id || 'set-1',
      perfil: 'colaborador', // REGRA DE SEGURANÇA FORÇADA: cadastro público é sempre de colaborador
    });
    setIsLoading(false);

    if (res.success && res.user) {
      setStatusMsg({ type: 'success', text: res.message });
      setTimeout(() => onLoginSuccess(res.user!), 300);
    } else {
      setStatusMsg({ type: 'error', text: res.message });
    }
  };

  // Handler ETAPA 1 da recuperação: solicita o código de recuperação de
  // senha via requestPasswordResetCode. O código é entregue exclusivamente
  // pelo e-mail oficial do Supabase Auth (nunca exibido na tela).
  // ======================================================================
  // Etapa 1: Solicitar Código de Recuperação de Senha
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!recEmail.trim()) {
      setStatusMsg({ type: 'error', text: 'Informe o e-mail cadastrado em sua conta.' });
      return;
    }

    setIsLoading(true);
    const res = await requestPasswordResetCode(recEmail);
    setIsLoading(false);

    if (res.success) {
      if (isSupabaseActive) {
        // Com Supabase configurado, o e-mail oficial traz um LINK de
        // recuperação (fluxo seguro). O usuário clica no link e volta ao
        // app para definir a nova senha — nenhum código é exibido na tela.
        setRecStep('link_enviado');
        setStatusMsg({ type: 'success', text: res.message });
      } else {
        // Modo local/LAN (sem nuvem): mantém a etapa de código de 6 dígitos.
        setRecStep('confirmar_codigo');
        setStatusMsg({
          type: 'success',
          text: `Código de verificação de 6 dígitos gerado e enviado para ${recEmail}.`,
        });
      }
    } else {
      setStatusMsg({ type: 'error', text: res.message });
    }
  };

  // Handler para usuário que chega pelo LINK OFICIAL de recuperação do
  // Supabase Auth (token na URL): exibe o formulário de nova senha direto.
  const handleLinkRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!recNovaSenha || recNovaSenha.length < 4) {
      setStatusMsg({ type: 'error', text: 'A nova senha deve possuir ao menos 4 caracteres.' });
      return;
    }
    if (recNovaSenha !== recConfirmSenha) {
      setStatusMsg({ type: 'error', text: 'As senhas não conferem.' });
      return;
    }

    setIsLoading(true);
    const res = await finalizarRecuperacaoViaToken(recNovaSenha);
    setIsLoading(false);

    if (res.success) {
      setStatusMsg({ type: 'success', text: res.message });
      setTimeout(() => {
        setAuthMode('login');
        setRecStep('solicitar_codigo');
        setRecNovaSenha('');
        setRecConfirmSenha('');
        setStatusMsg(null);
      }, 1500);
    } else {
      setStatusMsg({ type: 'error', text: res.message });
    }
  };

  // ======================================================================
  // Handler ETAPA 2 da recuperação: valida o código recebido e redefine a
  // senha via resetUserPasswordWithCode. Ao concluir, volta para a tela de
  // login já preenchida com e-mail e nova senha.
  // ======================================================================
  // Etapa 2: Validar o Código e Definir a Nova Senha
  const handleVerifyCodeAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!recCodigo.trim()) {
      setStatusMsg({ type: 'error', text: 'Digite o código de verificação de 6 dígitos.' });
      return;
    }
    if (!recNovaSenha || recNovaSenha.length < 4) {
      setStatusMsg({ type: 'error', text: 'A nova senha deve possuir ao menos 4 caracteres.' });
      return;
    }
    if (recNovaSenha !== recConfirmSenha) {
      setStatusMsg({ type: 'error', text: 'As senhas não conferem.' });
      return;
    }

    setIsLoading(true);
    const res = await resetUserPasswordWithCode(recEmail, recCodigo, recNovaSenha);
    setIsLoading(false);

    if (res.success) {
      setStatusMsg({ type: 'success', text: res.message });
      setTimeout(() => {
        setAuthMode('login');
        setEmailInput(recEmail);
        setPasswordInput(recNovaSenha);
        setRecStep('solicitar_codigo');
        setRecCodigo('');
        setRecNovaSenha('');
        setRecConfirmSenha('');
      }, 1500);
    } else {
      setStatusMsg({ type: 'error', text: res.message });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      
      {/* Esferas decorativas de fundo (apenas efeito visual) */}
      <div className="pointer-events-none absolute inset-0 opacity-30 overflow-hidden">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-purple-600/40 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[500px] bg-emerald-600/40 rounded-full blur-[140px]" />
      </div>

      <div className="max-w-md w-full space-y-5 relative z-10">
        
        {/* Logo e cabeçalho da marca */}
        <div className="text-center space-y-3">
          <div className="inline-flex p-3.5 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl shadow-xl text-slate-950 border border-emerald-400/40">
            <ShieldCheck className="w-10 h-10 text-slate-950" />
          </div>
          <div>
            <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-200 to-cyan-400">
              SST Quiz Corporate
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-1">
              Sistema de Autenticação Corporativa & Treinamento Preventivo
            </p>
          </div>

          {/* Indicador de status do banco (Supabase ativo na Nuvem) */}
          <div className="flex items-center justify-center space-x-2 pt-1">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-bold border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>Banco Supabase Conectado</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
            </div>
          </div>
        </div>

        {/* Abas de modo de autenticação (Entrar / Recuperar Senha) */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 flex text-xs font-bold shadow-2xl">
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setStatusMsg(null); }}
            className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
              authMode === 'login'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Entrar</span>
          </button>

          <button
            type="button"
            onClick={() => { setAuthMode('recovery'); setStatusMsg(null); }}
            className={`flex-1 py-2.5 rounded-xl transition-all flex items-center justify-center space-x-1.5 ${
              authMode === 'recovery'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Recuperar Senha</span>
          </button>
        </div>

        {/* Banner de feedback (erro ou sucesso) */}
        {statusMsg && (
          <div className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center space-x-2.5 shadow-lg animate-fadeIn ${
            statusMsg.type === 'success'
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-500/20 border-rose-500/40 text-rose-200'
          }`}>
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* ============================== CARTÃO PRINCIPAL DO FORMULÁRIO ============================== */}
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 text-white shadow-2xl space-y-5">
          
          {/* ================= MODO 1: LOGIN ================= */}
          {authMode === 'login' && (
            <div className="space-y-4">
              
              <form onSubmit={handleLoginSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-200 mb-1 flex items-center space-x-1.5">
                    <Mail className="w-3.5 h-3.5 text-emerald-400" />
                    <span>E-mail Corporativo</span>
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="exemplo@tecnosafety.com"
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-slate-200 flex items-center space-x-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Senha</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setAuthMode('recovery')}
                      className="text-[11px] text-emerald-400 hover:underline"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-white/20 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Lembrar de mim neste dispositivo</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full font-black py-3.5 rounded-xl transition-all shadow-xl flex items-center justify-center space-x-2 text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isLoading ? 'ENTRANDO...' : 'ENTRAR NO SISTEMA'}</span>
                </button>
              </form>

              {/* DICA DE SEGURANÇA E AJUDA DE AUTENTICAÇÃO */}
              <div className="pt-4 border-t border-white/10 text-center space-y-3">
                <p className="text-[11px] text-slate-400">
                  Insira o seu e-mail corporativo e senha para autenticar com segurança.
                </p>
                <div className="flex items-center justify-center space-x-3 text-[11px]">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('recovery'); setStatusMsg(null); }}
                    className="text-emerald-400 hover:underline font-semibold"
                  >
                    Esqueceu sua senha? Clique aqui para recuperar com código de segurança
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ================= MODO 3: RECUPERAÇÃO (RECUPERAR SENHA COM CÓDIGO) ================= */}
          {authMode === 'recovery' && (
            <div className="space-y-3.5 text-xs">
              
              {/* ETAPA 1: SOLICITAR CÓDIGO */}
              {recStep === 'solicitar_codigo' && (
                <form onSubmit={handleRequestCode} className="space-y-3.5">
                  <div className="p-3 bg-slate-900/80 border border-white/10 rounded-2xl text-slate-300 text-[11px] leading-relaxed flex items-start space-x-2">
                    <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block font-bold mb-0.5">Recuperação Segura por Código de Verificação:</strong>
                      Digite o e-mail corporativo cadastrado. Enviaremos um código de segurança de 6 dígitos que deve ser informado para autorizar a redefinição de senha.
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-200 mb-1 flex items-center space-x-1.5">
                      <Mail className="w-3.5 h-3.5 text-emerald-400" />
                      <span>E-mail Cadastrado</span>
                    </label>
                    <input
                      type="email"
                      value={recEmail}
                      onChange={(e) => setRecEmail(e.target.value)}
                      placeholder="seu.email@empresa.com.br"
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-3.5 rounded-xl transition-all shadow-xl flex items-center justify-center space-x-2 text-sm"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isLoading ? 'ENVIANDO CÓDIGO...' : 'GERAR E ENVIAR CÓDIGO DE SEGURANÇA'}</span>
                  </button>
                </form>
              )}

              {/* ETAPA 2a: LINK OFICIAL RECEBIDO — definir nova senha (sem código) */}
              {recStep === 'confirmar_codigo' && recViaLink && (
                <form onSubmit={handleLinkRecoverySubmit} className="space-y-3.5">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-slate-200 text-[11px] leading-relaxed flex items-start space-x-2">
                    <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block font-bold mb-0.5">Recuperação por link oficial:</strong>
                      Você clicou no link de recuperação enviado por e-mail. Defina a nova senha abaixo. A senha é criptografada no Supabase Auth.
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-200 mb-1">Nova Senha</label>
                      <input
                        type="password"
                        value={recNovaSenha}
                        onChange={(e) => setRecNovaSenha(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-200 mb-1">Confirmar Senha</label>
                      <input
                        type="password"
                        value={recConfirmSenha}
                        onChange={(e) => setRecConfirmSenha(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-3.5 rounded-xl transition-all shadow-xl flex items-center justify-center space-x-2 text-sm"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>{isLoading ? 'ALTERANDO SENHA...' : 'REDEFINIR SENHA'}</span>
                  </button>
                </form>
              )}

              {/* ETAPA 2b: CONFIRMAR CÓDIGO DE 6 DÍGITOS E REFAZER SENHA (modo local) */}
              {recStep === 'confirmar_codigo' && !recViaLink && (
                <form onSubmit={handleVerifyCodeAndReset} className="space-y-3.5">
                  
                  {/* Etiqueta com o e-mail de destino do código */}
                  <div className="p-2.5 bg-slate-900/90 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-[11px]">
                      <Mail className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-slate-400">Código enviado para:</span>
                      <strong className="text-white">{recEmail}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRecStep('solicitar_codigo')}
                      className="text-[10px] text-emerald-400 hover:underline font-bold"
                    >
                      Alterar
                    </button>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-200 mb-1 flex items-center justify-between">
                      <span className="flex items-center space-x-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Código de Verificação (6 Dígitos)</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Enviado por e-mail</span>
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={recCodigo}
                      onChange={(e) => setRecCodigo(e.target.value)}
                      placeholder="Ex: 849201"
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-100 placeholder-slate-600 font-mono tracking-widest text-center text-base focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-bold text-slate-200 mb-1">Nova Senha</label>
                      <input
                        type="password"
                        value={recNovaSenha}
                        onChange={(e) => setRecNovaSenha(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-200 mb-1">Confirmar Senha</label>
                      <input
                        type="password"
                        value={recConfirmSenha}
                        onChange={(e) => setRecConfirmSenha(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-3.5 rounded-xl transition-all shadow-xl flex items-center justify-center space-x-2 text-sm"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>{isLoading ? 'VALIDANDO E ALTERANDO...' : 'VALIDAR CÓDIGO E ALTERAR SENHA'}</span>
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={handleRequestCode}
                      className="text-[11px] text-slate-400 hover:text-emerald-400 inline-flex items-center space-x-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reenviar novo código por e-mail</span>
                    </button>
                  </div>
                </form>
              )}

              {/* ETAPA 3: LINK DE RECUPERAÇÃO ENVIADO (aguardar clique no e-mail) */}
              {recStep === 'link_enviado' && (
                <div className="space-y-3.5">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-slate-200 text-[11px] leading-relaxed flex items-start space-x-2">
                    <Mail className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white block font-bold mb-0.5">Confira seu e-mail</strong>
                      Enviamos um link seguro de recuperação para <strong>{recEmail}</strong>.
                      Clique no link recebido para redefinir sua senha. O link é válido por tempo limitado e
                      nenhum código é exibido nesta tela (segurança).
                    </div>
                  </div>
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setRecStep('solicitar_codigo')}
                      className="text-[11px] text-slate-400 hover:text-emerald-400 inline-flex items-center space-x-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Reenviar link de recuperação</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Rodapé com informações da plataforma */}
        <p className="text-[11px] text-center text-slate-500">
          SST Quiz &copy; 2026 • Plataforma Corporativa de Prevenção de Acidentes e Conformidade • v1.7 avisos
        </p>
        <p className="text-[11px] text-center text-amber-400/90">
          {pushStatus}
        </p>

      </div>
    </div>
  );
};
