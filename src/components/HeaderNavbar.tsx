import React, { useState } from 'react';
import { useSST } from '../context/SSTContext';
import { getSupabaseConfig, isSecretKey } from '../lib/supabase';
import { SupabaseModal } from './SupabaseModal';
import { 
  ShieldCheck, 
  Flame, 
  Award, 
  Wifi, 
  WifiOff, 
  Swords,
  BookOpen,
  LayoutDashboard,
  Target,
  Gift,
  LogOut,
  Globe,
  Database,
  Bell,
  Sparkles
} from 'lucide-react';

// ====================================================================
// HeaderNavbar: barra superior da aplicação.
// Mostra identidade da marca, controle de modo offline, badge de
// streak/pontos (colaborador), status do Supabase (super admin),
// sino de notificações, perfil do usuário e botão de logout.
// A navegação principal é renderizada separadamente por perfil.
// ====================================================================

// Props do componente: aba ativa e função para trocar de aba.
interface HeaderNavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const HeaderNavbar: React.FC<HeaderNavbarProps> = ({ activeTab, setActiveTab }) => {
  // Consome o contexto global SST: usuário, modo offline, desafios,
  // notificações e ações de logout/abertura de modais.
  const { 
    currentUser, 
    isOfflineMode, 
    setIsOfflineMode, 
    desafios,
    logout,
    setShowProfileModal,
    showSupabaseModal,
    setShowSupabaseModal,
    isSupabaseActive,
    notificacoes,
    setShowNotificationDrawer,
    sincronizarDadosPendentes,
  } = useSST();

  // True se o usuário atual é um colaborador (participante).
  const isParticipant = currentUser.perfil === 'colaborador';
  const isTempParticipante = currentUser.id.startsWith('visitante_') || currentUser.cargo === 'Visitante SST' || currentUser.email?.endsWith('@quiz.sst');

  // Conta as notificações não lidas visíveis ao usuário atual
  // (exclui avisos de quiz/desafio/certificado para quem não participa).
  const naoLidas = notificacoes.filter(
    n => (!n.lida) && 
         (n.usuario_id === currentUser.id || n.usuario_id === 'todos') &&
         !(n.usuario_id === 'todos' && !isParticipant && (n.tipo === 'quiz_diario' || n.tipo === 'desafio_1v1' || n.tipo === 'certificado'))
  ).length;

  // Desafios 1x1 pendentes de resposta do usuário atual (badge na aba "Desafios").
  const desafiosPendentes = desafios.filter(
    d => d.desafiado_id === currentUser.id && d.status === 'pendente'
  );

  return (
    // Cabeçalho fixo no topo com efeito de vidro fosco.
    <header className="bg-slate-950/70 backdrop-blur-xl text-white border-b border-white/10 sticky top-0 z-50 shadow-2xl">
      {/* Barra superior utilitária: marca, status e controles do usuário */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 text-xs sm:text-sm">
        
        {/* Identificação da marca SST Quiz */}

        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 p-2 rounded-xl shadow-inner text-slate-950 font-black flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-200 to-cyan-400">
                SST Quiz
              </span>
              <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                Corporate
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Saúde, Segurança do Trabalho e Meio Ambiente
            </p>
          </div>
        </div>

        {/* Controles de simulação offline e status do usuário */}
        <div className="flex items-center space-x-3">
          
          {/* Botão que alterna o modo offline/online (visível para admin e super admin) */}
          {currentUser.perfil !== 'colaborador' && (
            <button
              onClick={() => {
                // Ao voltar para o modo online, tenta drenar imediatamente a
                // fila de ações offline pendentes (antes isso só acontecia no
                // evento 'online' real do navegador ou no próximo boot).
                const voltouOnline = isOfflineMode;
                setIsOfflineMode(!isOfflineMode);
                if (voltouOnline && navigator.onLine) {
                  sincronizarDadosPendentes();
                }
              }}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors backdrop-blur-md ${
                isOfflineMode 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
              }`}
              title="Alternar simulação de estado offline/online"
            >
              {isOfflineMode ? <WifiOff className="w-3.5 h-3.5 text-amber-400" /> : <Wifi className="w-3.5 h-3.5 text-emerald-400" />}
              <span className="hidden md:inline">{isOfflineMode ? 'Modo Offline' : 'Online'}</span>
            </button>
          )}

          {/* Badge de streak diário e pontos acumulados - EXCLUSIVO do colaborador! */}
          {currentUser?.perfil === 'colaborador' && (
            <div className="flex items-center space-x-2 bg-white/5 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
              <div className="flex items-center space-x-1 text-orange-400 font-bold text-xs" title="Sequência diária de respostas">
                <Flame className="w-4 h-4 fill-orange-500/20 text-orange-500" />
                <span>{currentUser.estatisticas?.streak_dias ?? 0}d</span>
              </div>
              <div className="w-px h-3.5 bg-white/20" />
              <div className="flex items-center space-x-1 text-emerald-400 font-bold text-xs" title="Saldo e Pontuação Acumulada do Colaborador">
                <Award className="w-4 h-4 text-emerald-400" />
                <span>{currentUser.estatisticas?.pontos_resgataveis ?? currentUser.estatisticas?.pontos_totais ?? 0} pts</span>
              </div>
            </div>
          )}

          {/* Status da conexão em tempo real com o banco Supabase - VISÍVEL APENAS PARA SUPER ADMIN */}
          {currentUser.perfil === 'super_admin' && (() => {
            const { key } = getSupabaseConfig();
            const hasSecretKeyError = isSecretKey(key);

            if (hasSecretKeyError) {
              return (
                <button
                  onClick={() => setShowSupabaseModal(true)}
                  className="flex items-center space-x-1.5 border border-rose-500/50 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all backdrop-blur-md animate-pulse"
                  title="Atenção: Chave secreta detectada! Clique para trocar pela chave pública anon."
                >
                  <Database className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">Chave Secreta!</span>
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                </button>
              );
            }

            return (
              <button
                onClick={() => setShowSupabaseModal(true)}
                className={`flex items-center space-x-1.5 border px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all backdrop-blur-md ${
                  isSupabaseActive 
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                }`}
                title="Status de Conexão com o Banco Supabase em Tempo Real"
              >
                <Database className={`w-3.5 h-3.5 ${isSupabaseActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className="hidden sm:inline">Supabase (Tempo Real)</span>
                <span className={`w-2 h-2 rounded-full ${isSupabaseActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              </button>
            );
          })()}

          {/* Gatilho da gaveta de notificações em tempo real (push e e-mail SST) */}
          <button
            onClick={() => setShowNotificationDrawer(true)}
            className="relative p-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-lg transition-all backdrop-blur-md"
            title="Central de Notificações e Lembretes SST"
          >
            <Bell className="w-4 h-4 text-emerald-400" />
            {naoLidas > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-slate-950 animate-bounce">
                {naoLidas}
              </span>
            )}
          </button>

          {/* Área de perfil do usuário */}
          <div className="flex items-center space-x-2">
            {/* Pílula com avatar, nome e perfil - abre o modal de perfil */}
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 text-slate-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
              title="Meu Perfil e Configurações"
            >
              <img 
                src={currentUser.avatar} 
                alt={currentUser.nome} 
                className="w-6 h-6 rounded-full object-cover border border-emerald-500/50"
              />
              <div className="text-left hidden lg:block">
                <div className="text-xs font-medium text-slate-200 line-clamp-1">{currentUser.nome}</div>
                <div className="text-[10px] text-emerald-400 capitalize font-semibold">
                  {currentUser.perfil.replace('_', ' ')}
                </div>
              </div>
            </button>
          </div>

          {/* Botão de logout: encerra a sessão do usuário */}
          <button
            onClick={logout}
            className="flex items-center space-x-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 px-3 py-1.5 rounded-lg text-xs font-bold transition-all backdrop-blur-md"
            title="Encerrar sessão"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Sair</span>
          </button>

        </div>
      </div>

      {/* Abas de navegação principal - estritamente separadas por perfil */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-1 sm:space-x-3 overflow-x-auto py-2 text-xs sm:text-sm font-medium scrollbar-none">
          
          {isTempParticipante ? (
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold my-1">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Participante Temporário SST • Acesso Restrito ao Quiz Guiado</span>
            </div>
          ) : (
            <>
          {/* PERFIL: SUPER ADMIN - administração global e banco de perguntas */}
          {currentUser.perfil === 'super_admin' && (
            <>
              <button
                onClick={() => setActiveTab('super_admin')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'super_admin'
                    ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Globe className="w-4 h-4 text-purple-400" />
                <span>Administração Global (Super Admin)</span>
              </button>

              <button
                onClick={() => setActiveTab('perguntas')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'perguntas'
                    ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <BookOpen className="w-4 h-4 text-purple-400" />
                <span>Banco de Perguntas</span>
              </button>

              <button
                onClick={() => setActiveTab('quiz_guiado')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'quiz_guiado'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Quiz Guiado SST</span>
              </button>
            </>
          )}

          {/* PERFIL: ADMIN - gestão da empresa, perguntas, quiz guiado e premiações */}
          {currentUser.perfil === 'admin' && (
            <>
              <button
                onClick={() => setActiveTab('admin_gestao')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'admin_gestao'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <LayoutDashboard className="w-4 h-4 text-blue-400" />
                <span>Gestão da Empresa & Setores</span>
              </button>

              <button
                onClick={() => setActiveTab('perguntas')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'perguntas'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <BookOpen className="w-4 h-4 text-blue-400" />
                <span>Banco de Perguntas</span>
              </button>

              <button
                onClick={() => setActiveTab('quiz_guiado')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'quiz_guiado'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Quiz Guiado SST</span>
              </button>

              <button
                onClick={() => setActiveTab('premiacoes')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'premiacoes'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Gift className="w-4 h-4 text-pink-400" />
                <span>Premiações</span>
              </button>
            </>
          )}

          {/* PERFIL: COLABORADOR - painel, quizzes, desafios, quiz guiado, rankings e premiações */}
          {currentUser.perfil === 'colaborador' && (
            <>
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Meu Painel</span>
              </button>

              <button
                onClick={() => setActiveTab('quizzes')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'quizzes'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Target className="w-4 h-4" />
                <span>Responder Quizzes</span>
              </button>

              <button
                onClick={() => setActiveTab('desafios')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all relative ${
                  activeTab === 'desafios'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Swords className="w-4 h-4 text-purple-400" />
                <span>Desafios 1x1</span>
                {desafiosPendentes.length > 0 && (
                  <span className="bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full animate-bounce">
                    {desafiosPendentes.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('quiz_guiado')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'quiz_guiado'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Quiz Guiado SST</span>
              </button>

              <button
                onClick={() => setActiveTab('rankings')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'rankings'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Award className="w-4 h-4 text-amber-400" />
                <span>Rankings & Média Setorial</span>
              </button>

              <button
                onClick={() => setActiveTab('premiacoes')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'premiacoes'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Gift className="w-4 h-4 text-pink-400" />
                <span>Premiações</span>
              </button>
            </>
          )}
            </>
          )}

        </nav>
      </div>

      {/* Modal de configuração/gerenciamento da conexão Supabase */}
      <SupabaseModal 
        isOpen={showSupabaseModal} 
        onClose={() => setShowSupabaseModal(false)} 
      />
    </header>
  );
};
