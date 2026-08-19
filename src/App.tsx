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
    setShowSupabaseModal
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

  // Inicializa o motor de sincronização offline e ouvinte de rede
  useEffect(() => {
    const cleanup = initOfflineSyncEngine();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

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
