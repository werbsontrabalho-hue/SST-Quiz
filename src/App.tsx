import React, { useState, useEffect } from 'react';
import { SSTProvider, useSST } from './context/SSTContext';
import { HeaderNavbar } from './components/HeaderNavbar';
import { CollaboratorDashboardView } from './components/views/CollaboratorDashboardView';
import { QuizPlayerView } from './components/views/QuizPlayerView';
import { ChallengeDisputeView } from './components/views/ChallengeDisputeView';
import { RankingsView } from './components/views/RankingsView';
import { QuestionBankView } from './components/views/QuestionBankView';
import { AdminManagementView } from './components/views/AdminManagementView';
import { PrizesView } from './components/views/PrizesView';
import { SuperAdminView } from './components/views/SuperAdminView';
import { QuizGuiadoView } from './components/views/QuizGuiadoView';
import { LoginView } from './components/views/LoginView';
import { UserProfileModal } from './components/UserProfileModal';
import { NotificationDrawer } from './components/NotificationDrawer';
import { SupabaseModal } from './components/SupabaseModal';
import { initOfflineSyncEngine } from './lib/offlineSyncEngine';
import { initPushNotifications } from './lib/pushNotifications';

// ====================================================================
// AppContent: componente raiz da aplicação SST.
// Decide qual tela renderizar com base no perfil do usuário logado
// (super_admin, admin ou colaborador), gerencia a aba ativa, o quiz e o
// desafio em andamento, além dos modais globais (perfil, notificações e
// configuração do Supabase).
// ====================================================================
function AppContent() {
  // Consome o contexto global SST: usuário logado, estado de login e
  // controles dos modais globais.
  const { 
    currentUser, 
    isLoggedIn, 
    login,
    showProfileModal, 
    setShowProfileModal,
    showNotificationDrawer,
    setShowNotificationDrawer,
    showSupabaseModal,
    setShowSupabaseModal,
    dispararNotificacaoLembrete,
  } = useSST();

  // Aba inicial definida pelo perfil: super_admin abre a administração
  // global, admin abre a gestão da empresa e colaborador o dashboard.
  const getInitialTab = () => {
    if (currentUser?.perfil === 'super_admin') return 'super_admin';
    if (currentUser?.perfil === 'admin') return 'admin_gestao';
    return 'dashboard';
  };

  // Estado de navegação: aba ativa e IDs do quiz/desafio selecionados.
  const [activeTab, setActiveTab] = useState<string>(getInitialTab());
  const [activeQuizId, setActiveQuizId] = useState<string | undefined>(undefined);
  const [activeDesafioId, setActiveDesafioId] = useState<string | undefined>(undefined);

  // Janela bonita de aviso no padrão do app (substitui o alert branco feio do navegador).
  // Todo alert() do sistema cai aqui automaticamente.
  const [avisosApp, setAvisosApp] = useState<string[]>([]);
  useEffect(() => {
    const mostrarAvisoBonito = (msg: any) => {
      const texto = String(msg ?? '').trim() || 'Atenção.';
      setAvisosApp(prev => [...prev, texto]);
    };
    try {
      (window as any).alert = mostrarAvisoBonito;
    } catch { /* mantém o original */ }
  }, []);
  const fecharAvisoApp = () => setAvisosApp(prev => prev.slice(1));
  const avisoAtual = avisosApp[0];

  // Inicializa o motor de sincronização offline e ouvinte de rede
  useEffect(() => {
    const cleanup = initOfflineSyncEngine();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Liga os avisos no celular (estilo WhatsApp): mostra faixa + som quando
  // chega desafio, campanha, prêmio ou resultado — mesmo em 2º plano.
  // Com o app fechado, exige o Firebase configurado (passo a passo com o dono).
  useEffect(() => {
    if (!currentUser?.id || currentUser.id.startsWith('visitante_')) return;
    const cleanup = initPushNotifications(currentUser.id, (msg) => {
      try {
        dispararNotificacaoLembrete({
          titulo: msg.titulo || 'SST Quiz',
          mensagem: msg.mensagem || 'Você tem uma novidade!',
          tipo: 'alerta_sst',
          canal: 'push',
        });
      } catch {
        // Nunca quebra o app por causa de um aviso.
      }
    }, currentUser.email);
    return cleanup;
  }, [currentUser?.id, currentUser?.email]);

  // Autenticação instantânea de visitante para acesso direto via QR Code / PIN (modo Kahoot)
  const loginComoVisitanteQuiz = () => {
    const tempId = `visitante_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const guestUser = {
      id: tempId,
      nome: 'Participante Visitante',
      email: `${tempId}@quiz.sst`,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150',
      cargo: 'Visitante SST',
      setor_id: 'setor_visitante',
      empresa_id: 'empresa_visitante',
      perfil: 'colaborador' as const,
      pontos: 0,
      nivel: 1,
      conquistas: [],
      is_instrutor: false,
      ativo: true,
      estatisticas: {
        pontos_quizzes: 0,
        pontos_desafios: 0,
        pontos_totais: 0,
        pontos_resgataveis: 0,
        streak_dias: 0,
        quizzes_respondidos: 0,
        acertos_totais: 0,
        erros_totais: 0,
        tempo_medio_resposta_seg: 0,
        desafios_vencidos: 0,
        desafios_jogados: 0,
        trofeus_conquistados: []
      }
    };
    login(guestUser);
    setActiveTab('quiz_guiado');
  };

  // Detecta parâmetro ?pin= na URL (escanear QR Code) para liberar o quiz imediatamente sem login
  // CORREÇÃO (auditoria Problema 2): antes o useEffect só rodava no MOUNT ([]),
  // então se o participante já estivesse com o app aberto na sessão 1 e escaneasse
  // o QR da sessão 2, o novo ?pin= não era reprocessado — ele ficava preso na tela
  // antiga. Agora reage a mudanças do parâmetro (popstate/pushState) também.
  useEffect(() => {
    const processarPin = () => {
      const params = new URLSearchParams(window.location.search);
      const pinParam = params.get('pin');
      if (pinParam) {
        if (!isLoggedIn || !currentUser) {
          loginComoVisitanteQuiz();
        } else {
          setActiveTab('quiz_guiado');
        }
      }
    };

    processarPin();

    // Observa mudanças de histórico (o QR pode navegar sem recarregar a página).
    window.addEventListener('popstate', processarPin);
    return () => window.removeEventListener('popstate', processarPin);
  }, [isLoggedIn, currentUser?.id]);

  // Sincroniza a aba ativa quando o usuário troca de perfil,
  // evitando que ele acesse telas de outro perfil.
  useEffect(() => {
    if (!currentUser || !currentUser.id) return;
    const isTemp = currentUser.id?.startsWith?.('visitante_') || currentUser.cargo === 'Visitante SST' || currentUser.email?.endsWith?.('@quiz.sst');
    if (isTemp) {
      if (activeTab !== 'quiz_guiado') {
        setActiveTab('quiz_guiado');
      }
      return;
    }

    if (currentUser.perfil === 'super_admin' && activeTab !== 'super_admin' && activeTab !== 'perguntas' && activeTab !== 'quiz_guiado') {
      setActiveTab('super_admin');
    } else if (currentUser.perfil === 'admin' && (activeTab === 'dashboard' || activeTab === 'quizzes' || activeTab === 'desafios' || activeTab === 'super_admin')) {
      setActiveTab('admin_gestao');
    } else if (currentUser.perfil === 'colaborador' && (activeTab === 'admin_gestao' || activeTab === 'super_admin' || activeTab === 'perguntas')) {
      if (activeTab !== 'quiz_guiado') {
        setActiveTab('dashboard');
      }
    }
  }, [currentUser?.id, currentUser?.perfil, activeTab]);

  // Abre o player de quiz com o quiz selecionado pelo dashboard.
  const handleIniciarQuiz = (quizId: string) => {
    setActiveQuizId(quizId);
    setActiveTab('quizzes');
  };

  // Abre a tela de desafio 1x1 com o desafio selecionado pelo dashboard.
  const handleIniciarDesafio = (desafioId: string) => {
    setActiveDesafioId(desafioId);
    setActiveTab('desafios');
  };

  // Ao trocar de aba, limpa seleções antigas de quiz/desafio
  // para não reaproveitar dados de navegação anterior.
  const handleTabChange = (tab: string) => {
    if (currentUser && currentUser.id) {
      const isTemp = currentUser.id?.startsWith?.('visitante_') || currentUser.cargo === 'Visitante SST' || currentUser.email?.endsWith?.('@quiz.sst');
      if (isTemp) {
        setActiveTab('quiz_guiado');
        return;
      }
    }
    setActiveTab(tab);
    if (tab !== 'quizzes') setActiveQuizId(undefined);
    if (tab !== 'desafios') setActiveDesafioId(undefined);
  };

  // Usuário deslogado: renderiza apenas a tela de login e
  // define a aba inicial conforme o perfil de quem entrar.
  if (!isLoggedIn) {
    return (
      <LoginView 
        onLoginSuccess={(u) => {
          if (u.perfil === 'super_admin') setActiveTab('super_admin');
          else if (u.perfil === 'admin') setActiveTab('admin_gestao');
          else setActiveTab('dashboard');
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-purple-500 selection:text-white antialiased relative overflow-x-hidden">
      {/* Orbes de fundo com efeito de vidro fosco (decorativo, não interativo) */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-40 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] bg-purple-600/50 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] bg-blue-600/50 rounded-full blur-[120px]" />
        <div className="absolute top-[30%] right-[10%] w-[35vw] h-[35vw] max-w-[500px] max-h-[500px] bg-indigo-500/40 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] left-[5%] w-[30vw] h-[30vw] max-w-[400px] max-h-[400px] bg-emerald-500/30 rounded-full blur-[100px]" />
      </div>

      {/* Barra superior com troca de perfil e navegação principal */}
      <div className="relative z-10">
        <HeaderNavbar activeTab={activeTab} setActiveTab={handleTabChange} />
      </div>

      {/* Área de conteúdo principal: cada aba renderiza a view correspondente */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10">
        {/* Painel exclusivo do Super Admin (gestão global) */}
        {activeTab === 'super_admin' && <SuperAdminView />}

        {/* Dashboard do colaborador: dispara quiz/desafio via callbacks */}
        {activeTab === 'dashboard' && (
          <CollaboratorDashboardView 
            setActiveTab={setActiveTab}
            onIniciarQuiz={handleIniciarQuiz}
            onIniciarDesafio={handleIniciarDesafio}
          />
        )}

        {/* Player de quiz: recebe o quiz selecionado e callback de voltar */}
        {activeTab === 'quizzes' && (
          <QuizPlayerView 
            quizId={activeQuizId}
            onVoltar={() => {
              setActiveQuizId(undefined);
              setActiveTab('dashboard');
            }}
          />
        )}

        {/* Desafios 1x1: recebe o desafio ativo e callback de voltar */}
        {activeTab === 'desafios' && (
          <ChallengeDisputeView 
            activeDesafioId={activeDesafioId}
            onVoltar={() => {
              setActiveDesafioId(undefined);
              setActiveTab('dashboard');
            }}
          />
        )}

        {/* Rankings e média setorial */}
        {activeTab === 'rankings' && <RankingsView />}

        {/* Banco de perguntas (admin e super admin) */}
        {activeTab === 'perguntas' && <QuestionBankView />}

        {/* Gestão da empresa e setores (admin) */}
        {activeTab === 'admin_gestao' && <AdminManagementView />}

        {/* Premiações e resgates (admin e colaborador) */}
        {activeTab === 'premiacoes' && <PrizesView />}

        {/* Quiz Guiado SST (Interativo em Tempo Real / Avaliação Formal) */}
        {activeTab === 'quiz_guiado' && <QuizGuiadoView />}
      </main>

      {/* Modal global de edição do perfil do usuário */}
      <UserProfileModal 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)} 
      />

      {/* Gaveta de notificações: navega até a aba/registro alvo da notificação clicada */}
      <NotificationDrawer
        isOpen={showNotificationDrawer}
        onClose={() => setShowNotificationDrawer(false)}
        onNavigate={(tab, itemTargetId) => {
          if (tab === 'quizzes' && itemTargetId) {
            setActiveQuizId(itemTargetId);
          } else if (tab === 'desafios' && itemTargetId) {
            setActiveDesafioId(itemTargetId);
          }
          setActiveTab(tab);
        }}
      />

      {/* Modal de configuração/status da conexão Supabase (super admin) */}
      <SupabaseModal
        isOpen={showSupabaseModal}
        onClose={() => setShowSupabaseModal(false)}
      />

      {/* Aviso bonito no padrão do app (troca o alert branco do navegador) */}
      {avisoAtual && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-white">
            <div className="flex items-center space-x-3 text-amber-400">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-lg font-black">!</div>
              <h3 className="text-lg font-black">Aviso do SST Quiz</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{avisoAtual}</p>
            <div className="flex items-center justify-end pt-2">
              <button
                onClick={fecharAvisoApp}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black shadow-lg"
                autoFocus
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente raiz da aplicação: envolve todo o AppContent no
// SSTProvider, disponibilizando o contexto global de SST à árvore.
export default function App() {
  return (
    <SSTProvider>
      <AppContent />
    </SSTProvider>
  );
}
